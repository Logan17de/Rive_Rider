import {
  cloneValue,
  boneById,
  constraintById,
  controlById,
  createDocument,
  createId,
  createKeyframe,
  createNode,
  createTimeline,
  createTrack,
  descendantIds,
  nodeById,
  meshById,
  normalizeDocument,
  timelineById,
  trackByAddress,
} from './model.js';
import { isAnimatableProperty, readProperty, writeProperty } from './properties.js';
import { createReference, referenceId } from './references.js';

export const VEYRA_COMMAND_SOURCES = Object.freeze(['user', 'ai', 'script', 'import']);

function normalizeCommand(command) {
  const descriptor = typeof command === 'string' ? { label: command } : command || {};
  const source = descriptor.source || 'user';
  if (!VEYRA_COMMAND_SOURCES.includes(source)) throw new TypeError(`Unsupported command source: ${source}`);
  const label = String(descriptor.label || '').trim();
  if (!label) throw new TypeError('Command label is required.');
  return {
    id: descriptor.id || createId('command'),
    source,
    label,
    timestamp: descriptor.timestamp || new Date().toISOString(),
    propertyAddresses: [...new Set((descriptor.propertyAddresses || []).map(String))],
  };
}

function objectFor(document, kind, id) {
  return {
    node: nodeById,
    bone: boneById,
    mesh: meshById,
    control: controlById,
    constraint: constraintById,
  }[kind]?.(document, id) || null;
}

export class VeyraStore {
  #listeners = new Set();
  #past = [];
  #future = [];
  #transaction = null;
  #activity = [];

  constructor(document = createDocument()) {
    this.document = normalizeDocument(document);
    this.selectedId = this.document.nodes[0]?.id || null;
    this.selectedKind = this.selectedId ? 'node' : null;
    this.revision = 0;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(reason = 'change') {
    for (const listener of this.#listeners) listener(this, reason);
  }

  #record(command, action = 'commit') {
    this.#activity.push({ ...cloneValue(command), action });
    if (this.#activity.length > 200) this.#activity.shift();
  }

  replaceDocument(document, reason = 'load') {
    this.document = normalizeDocument(document);
    this.selectedId = this.document.nodes[0]?.id || null;
    this.selectedKind = this.selectedId ? 'node' : null;
    this.#past = [];
    this.#future = [];
    this.#transaction = null;
    this.#activity = [];
    this.revision += 1;
    this.#emit(reason);
  }

  select(referenceOrId, kind = 'node') {
    const reference = typeof referenceOrId === 'object' && referenceOrId
      ? referenceOrId
      : referenceOrId
        ? createReference(kind, referenceOrId)
        : null;
    const nextId = reference && objectFor(this.document, reference.kind, reference.id) ? reference.id : null;
    const nextKind = nextId ? reference.kind : null;
    if (nextId === this.selectedId && nextKind === this.selectedKind) return;
    this.selectedId = nextId;
    this.selectedKind = nextKind;
    this.#emit('selection');
  }

  execute(commandDescriptor, mutation) {
    if (this.#transaction) throw new Error('Cannot execute a command during an open transaction.');
    const command = normalizeCommand(commandDescriptor);
    const before = cloneValue(this.document);
    try {
      mutation(this.document);
      this.document.updatedAt = new Date().toISOString();
      this.document = normalizeDocument(this.document);
    } catch (error) {
      this.document = before;
      throw error;
    }
    this.#past.push({ command, document: before });
    if (this.#past.length > 100) this.#past.shift();
    this.#future = [];
    this.revision += 1;
    this.#record(command);
    this.#emit(command.label);
  }

  begin(commandDescriptor) {
    if (this.#transaction) return;
    this.#transaction = { command: normalizeCommand(commandDescriptor), document: cloneValue(this.document) };
  }

  mutate(mutation, reason = 'preview') {
    if (!this.#transaction) throw new Error('Preview mutation requires an open transaction.');
    mutation(this.document);
    this.#emit(reason);
  }

  commit() {
    if (!this.#transaction) return false;
    const transaction = this.#transaction;
    this.#transaction = null;
    try {
      this.document.updatedAt = new Date().toISOString();
      this.document = normalizeDocument(this.document);
    } catch (error) {
      this.document = transaction.document;
      this.#emit('cancel');
      throw error;
    }
    this.#past.push(transaction);
    if (this.#past.length > 100) this.#past.shift();
    this.#future = [];
    this.revision += 1;
    this.#record(transaction.command);
    this.#emit(transaction.command.label);
    return true;
  }

  cancel() {
    if (!this.#transaction) return false;
    this.document = this.#transaction.document;
    this.#transaction = null;
    this.#emit('cancel');
    return true;
  }

  undo() {
    const entry = this.#past.pop();
    if (!entry) return false;
    this.#future.push({ command: entry.command, document: cloneValue(this.document) });
    this.document = normalizeDocument(entry.document);
    if (this.selectedId && !objectFor(this.document, this.selectedKind, this.selectedId)) {
      this.selectedId = null;
      this.selectedKind = null;
    }
    this.revision += 1;
    this.#record(entry.command, 'undo');
    this.#emit(`undo:${entry.command.label}`);
    return true;
  }

  redo() {
    const entry = this.#future.pop();
    if (!entry) return false;
    this.#past.push({ command: entry.command, document: cloneValue(this.document) });
    this.document = normalizeDocument(entry.document);
    if (this.selectedId && !objectFor(this.document, this.selectedKind, this.selectedId)) {
      this.selectedId = null;
      this.selectedKind = null;
    }
    this.revision += 1;
    this.#record(entry.command, 'redo');
    this.#emit(`redo:${entry.command.label}`);
    return true;
  }

  add(type, options = {}) {
    const node = createNode(type, options);
    this.execute(`Add ${type}`, (document) => {
      document.nodes.push(node);
    });
    this.select(node.id);
    return node;
  }

  remove(nodeId) {
    const node = nodeById(this.document, nodeId);
    if (!node) return false;
    const removed = new Set([nodeId, ...descendantIds(this.document, nodeId)]);
    this.execute(`Delete ${node.name}`, (document) => {
      document.nodes = document.nodes.filter((candidate) => !removed.has(candidate.id));
      document.semantics = document.semantics.filter((record) => !removed.has(referenceId(record.target, 'node')));
      document.constraints = document.constraints.filter((constraint) => !removed.has(referenceId(constraint.path, 'node')));
    });
    this.selectedId = null;
    this.selectedKind = null;
    this.#emit('selection');
    return true;
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  get selectedNode() {
    return this.selectedKind === 'node' && this.selectedId ? nodeById(this.document, this.selectedId) : null;
  }

  get selectedRef() {
    return this.selectedId && this.selectedKind ? createReference(this.selectedKind, this.selectedId) : null;
  }

  get selectedObject() {
    return this.selectedId && this.selectedKind
      ? objectFor(this.document, this.selectedKind, this.selectedId)
      : null;
  }

  get selectedBone() { return this.selectedKind === 'bone' ? this.selectedObject : null; }
  get selectedMesh() { return this.selectedKind === 'mesh' ? this.selectedObject : null; }
  get selectedControl() { return this.selectedKind === 'control' ? this.selectedObject : null; }
  get selectedConstraint() { return this.selectedKind === 'constraint' ? this.selectedObject : null; }

  removeSelection() {
    const reference = this.selectedRef;
    const object = this.selectedObject;
    if (!reference || !object) return false;
    if (reference.kind === 'node') return this.remove(reference.id);
    this.execute(`Delete ${object.name}`, (document) => {
      if (reference.kind === 'mesh') {
        document.meshes = document.meshes.filter((item) => item.id !== reference.id);
      } else if (reference.kind === 'constraint') {
        document.constraints = document.constraints.filter((item) => item.id !== reference.id);
      } else if (reference.kind === 'control') {
        document.controls = document.controls.filter((item) => item.id !== reference.id);
        document.constraints = document.constraints.filter((item) => referenceId(item.target, 'control') !== reference.id);
      } else if (reference.kind === 'bone') {
        const removed = new Set([reference.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const bone of document.bones) {
            if (removed.has(referenceId(bone.parent, 'bone')) && !removed.has(bone.id)) {
              removed.add(bone.id);
              changed = true;
            }
          }
        }
        document.bones = document.bones.filter((bone) => !removed.has(bone.id));
        for (const mesh of document.meshes) {
          for (const vertex of mesh.vertices) {
            vertex.weights = vertex.weights.filter((weight) => !removed.has(referenceId(weight.bone, 'bone')));
          }
        }
        document.constraints = document.constraints.filter((constraint) => {
          if (removed.has(referenceId(constraint.bone, 'bone'))) return false;
          if (removed.has(referenceId(constraint.target, 'bone'))) return false;
          return !(constraint.bones || []).some((bone) => removed.has(referenceId(bone, 'bone')));
        });
      }
    });
    this.selectedId = null;
    this.selectedKind = null;
    this.#emit('selection');
    return true;
  }

  setProperty(commandDescriptor, address, value) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor, propertyAddresses: [address] }
      : { ...commandDescriptor, propertyAddresses: commandDescriptor.propertyAddresses || [address] };
    this.execute(descriptor, (document) => writeProperty(document, address, value));
  }

  addTimeline(overrides = {}, commandDescriptor = {}) {
    const timeline = createTimeline(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add timeline ${timeline.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.timelines.push(timeline);
    });
    return timeline.id;
  }

  removeTimeline(timelineId, commandDescriptor = {}) {
    const timeline = timelineById(this.document, timelineId);
    if (!timeline) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete timeline ${timeline.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.timelines = document.timelines.filter((candidate) => candidate.id !== timelineId);
    });
    return true;
  }

  updateTimeline(timelineId, changes = {}, commandDescriptor = {}) {
    const timeline = timelineById(this.document, timelineId);
    if (!timeline) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update timeline ${timeline.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = timelineById(document, timelineId);
      for (const key of ['name', 'duration', 'fps', 'loop', 'workStart', 'workEnd']) {
        if (changes[key] !== undefined) target[key] = changes[key];
      }
    });
    return true;
  }

  setKeyframe({ timelineId, address, frame, value, easing = 'linear', easingParams }, commandDescriptor = {}) {
    if (!timelineById(this.document, timelineId)) throw new TypeError(`Timeline ${timelineId} does not exist.`);
    if (!isAnimatableProperty(this.document, address)) {
      throw new TypeError(`Property ${address} is not animatable.`);
    }
    const resolvedValue = value === undefined ? readProperty(this.document, address) : value;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor, propertyAddresses: [address] }
      : { label: `Set keyframe`, source: 'user', ...commandDescriptor, propertyAddresses: [address] };
    this.execute(descriptor, (document) => {
      const timeline = timelineById(document, timelineId);
      let track = trackByAddress(timeline, address);
      if (!track) {
        track = createTrack(address);
        timeline.tracks.push(track);
      }
      const keyframe = createKeyframe({ frame, value: resolvedValue, easing, easingParams });
      const existingIndex = track.keyframes.findIndex((candidate) => candidate.frame === keyframe.frame);
      if (existingIndex >= 0) track.keyframes[existingIndex] = keyframe;
      else track.keyframes.push(keyframe);
      track.keyframes.sort((a, b) => a.frame - b.frame);
    });
    return true;
  }

  removeKeyframe({ timelineId, address, frame }, commandDescriptor = {}) {
    const timeline = timelineById(this.document, timelineId);
    const track = timeline ? trackByAddress(timeline, address) : null;
    if (!track) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Remove keyframe`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const targetTimeline = timelineById(document, timelineId);
      const targetTrack = trackByAddress(targetTimeline, address);
      targetTrack.keyframes = targetTrack.keyframes.filter((candidate) => candidate.frame !== frame);
      if (targetTrack.keyframes.length === 0) {
        targetTimeline.tracks = targetTimeline.tracks.filter((candidate) => candidate.id !== targetTrack.id);
      }
    });
    return true;
  }

  moveKeyframe({ timelineId, address, fromFrame, toFrame }, commandDescriptor = {}) {
    const timeline = timelineById(this.document, timelineId);
    const track = timeline ? trackByAddress(timeline, address) : null;
    const keyframe = track ? track.keyframes.find((candidate) => candidate.frame === fromFrame) : null;
    if (!keyframe) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Move keyframe`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const targetTrack = trackByAddress(timelineById(document, timelineId), address);
      const moved = targetTrack.keyframes.find((candidate) => candidate.frame === fromFrame);
      targetTrack.keyframes = targetTrack.keyframes.filter((candidate) => candidate.frame !== toFrame || candidate === moved);
      moved.frame = toFrame;
      targetTrack.keyframes.sort((a, b) => a.frame - b.frame);
    });
    return true;
  }

  get commandHistory() {
    return cloneValue(this.#activity);
  }
}
