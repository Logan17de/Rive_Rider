import {
  cloneValue,
  boneById,
  constraintById,
  controlById,
  createAsset,
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createId,
  createKeyframe,
  createMachineCondition,
  createMachineInput,
  createMachineState,
  createMachineTransition,
  createStateMachine,
  createMesh,
  createNode,
  createTimeline,
  createTrack,
  descendantIds,
  machineById,
  machineConditionViolation,
  meshById,
  nodeById,
  normalizeDocument,
  timelineById,
  trackByAddress,
  VEYRA_MACHINE_INPUT_TYPES,
} from './model.js';
import { isAnimatableProperty, readProperty, writeProperty } from './properties.js';
import { createBoneRef, createConstraintRef, createControlRef, createMeshRef, createReference, createTimelineRef, referenceId } from './references.js';

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
    if (this.#transaction) {
      // One transaction slot: a second begin() must never be silently
      // absorbed — that merges two unrelated edits into one undo entry
      // carrying the first command's label. Reject with the state of the
      // open transaction so the caller (UI drag, AI command, script) can
      // commit/cancel first or route through execute() instead.
      const open = this.#transaction.command;
      throw new TypeError(
        `A transaction is already open (${open.label}); commit or cancel it before beginning another.`,
      );
    }
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
    const descriptor = { label: `Delete ${object.name}` };
    if (reference.kind === 'bone') return this.removeBone(reference.id, descriptor);
    if (reference.kind === 'mesh') return this.removeMesh(reference.id, descriptor);
    if (reference.kind === 'control') return this.removeControl(reference.id, descriptor);
    if (reference.kind === 'constraint') return this.removeConstraint(reference.id, descriptor);
    return false;
  }

  // --- Rig and asset CRUD (UI/AI parity) --------------------------------------
  // The same transactional commands the editor tools use, so an AI can create
  // and delete rig objects through the exact same API surface.

  addBone(overrides = {}, commandDescriptor = {}) {
    const bone = createBone(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add bone ${bone.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.bones.push(bone);
    });
    this.select(createBoneRef(bone.id));
    return bone.id;
  }

  addMesh(overrides = {}, commandDescriptor = {}) {
    const mesh = createMesh(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add mesh ${mesh.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.meshes.push(mesh);
    });
    this.select(createMeshRef(mesh.id));
    return mesh.id;
  }

  addControl(overrides = {}, commandDescriptor = {}) {
    const control = createControl(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add control ${control.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.controls.push(control);
    });
    this.select(createControlRef(control.id));
    return control.id;
  }

  addConstraint(type, overrides = {}, commandDescriptor = {}) {
    const constraint = createConstraint(type, overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add ${constraint.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.constraints.push(constraint);
    });
    this.select(createConstraintRef(constraint.id));
    return constraint.id;
  }

  addAsset(type, overrides = {}, commandDescriptor = {}) {
    const asset = createAsset(type, overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add asset ${asset.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.assets.push(asset);
    });
    return asset.id;
  }

  removeBone(boneId, commandDescriptor = {}) {
    const bone = boneById(this.document, boneId);
    if (!bone) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete ${bone.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      this.#removeBoneCascade(document, boneId);
    });
    this.#clearSelection();
    return true;
  }

  removeMesh(meshId, commandDescriptor = {}) {
    const mesh = meshById(this.document, meshId);
    if (!mesh) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete ${mesh.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.meshes = document.meshes.filter((item) => item.id !== meshId);
    });
    this.#clearSelection();
    return true;
  }

  removeControl(controlId, commandDescriptor = {}) {
    const control = controlById(this.document, controlId);
    if (!control) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete ${control.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.controls = document.controls.filter((item) => item.id !== controlId);
      document.constraints = document.constraints.filter(
        (item) => referenceId(item.target, 'control') !== controlId
      );
    });
    this.#clearSelection();
    return true;
  }

  removeConstraint(constraintId, commandDescriptor = {}) {
    const constraint = constraintById(this.document, constraintId);
    if (!constraint) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete ${constraint.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.constraints = document.constraints.filter((item) => item.id !== constraintId);
    });
    this.#clearSelection();
    return true;
  }

  removeAsset(assetId, commandDescriptor = {}) {
    const asset = this.document.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete asset ${asset.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.assets = document.assets.filter((candidate) => candidate.id !== assetId);
    });
    this.#clearSelection();
    return true;
  }

  #removeBoneCascade(document, boneId) {
    const removed = new Set([boneId]);
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

  #clearSelection() {
    this.selectedId = null;
    this.selectedKind = null;
    this.#emit('selection');
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
    const stateUsers = (this.document.stateMachines || [])
      .flatMap((machine) => machine.states
        .filter((state) => referenceId(state.timeline, 'timeline') === timelineId)
        .map((state) => `${machine.name || machine.id}/${state.name || state.id}`));
    if (stateUsers.length) {
      throw new TypeError(
        `Timeline ${timeline.name} is used by state machine state(s): ${stateUsers.join(', ')}. ` +
        'Re-point or remove those states before deleting the timeline.'
      );
    }
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

  addStateMachine(overrides = {}, commandDescriptor = {}) {
    const machine = createStateMachine(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add state machine ${machine.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.stateMachines.push(machine);
    });
    return machine.id;
  }

  removeStateMachine(machineId, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    if (!machine) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete state machine ${machine.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.stateMachines = document.stateMachines.filter((candidate) => candidate.id !== machineId);
    });
    return true;
  }

  updateStateMachine(machineId, changes = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    if (!machine) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update state machine ${machine.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      for (const key of ['name', 'initial']) {
        if (changes[key] !== undefined) target[key] = changes[key];
      }
    });
    return true;
  }

  addMachineInput(machineId, overrides = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    if (!machine) return null;
    const input = createMachineInput(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add machine input ${input.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      machineById(document, machineId).inputs.push(input);
    });
    return input.id;
  }

  addMachineState(machineId, overrides = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    if (!machine) return null;
    const state = createMachineState(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add state ${state.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      machineById(document, machineId).states.push(state);
    });
    return state.id;
  }

  removeMachineState(machineId, stateId, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const state = machine?.states.find((candidate) => candidate.id === stateId);
    if (!state) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete state ${state.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      target.states = target.states.filter((candidate) => candidate.id !== stateId);
      target.transitions = target.transitions.filter((transition) =>
        referenceId(transition.from, 'machineState') !== stateId
        && referenceId(transition.to, 'machineState') !== stateId
      );
      if (target.initial && referenceId(target.initial, 'machineState') === stateId) {
        target.initial = null;
      }
    });
    return true;
  }

  addMachineTransition(machineId, overrides = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    if (!machine) return null;
    const transition = createMachineTransition(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: 'Add machine transition', source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      machineById(document, machineId).transitions.push(transition);
    });
    return transition.id;
  }

  removeMachineTransition(machineId, transitionId, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const transition = machine?.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: 'Delete machine transition', source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      target.transitions = target.transitions.filter((candidate) => candidate.id !== transitionId);
    });
    return true;
  }

  // In-place machine edit commands (Milestone 3B-1). All mutate by id and
  // never rewrite stable ids or endpoints, so a live `MachineRuntime` keeps
  // its position across cosmetic edits and reconciliation resets only on
  // genuinely structural change. Dependent-condition violations are refused
  // with a named blocker list in `removeTimeline`'s style — never silently
  // repaired. `execute()` guarantees rejected commands leave the document,
  // revision, and history untouched.

  updateMachineState(machineId, stateId, changes = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const state = machine?.states.find((candidate) => candidate.id === stateId);
    if (!state) return false;
    if (changes.timelineId !== undefined && !timelineById(this.document, changes.timelineId)) {
      throw new TypeError(`Timeline ${changes.timelineId} does not exist.`);
    }
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update state ${state.name || state.id}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId).states.find((candidate) => candidate.id === stateId);
      if (changes.name !== undefined) target.name = changes.name;
      if (changes.timelineId !== undefined) target.timeline = createTimelineRef(changes.timelineId);
    });
    return true;
  }

  updateMachineInput(machineId, inputId, changes = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const input = machine?.inputs.find((candidate) => candidate.id === inputId);
    if (!input) return false;
    if (changes.name !== undefined) {
      const name = String(changes.name);
      if (machine.inputs.some((candidate) => candidate.id !== inputId && candidate.name === name)) {
        throw new TypeError(`Machine input name "${name}" is already used in ${machine.name || machineId}.`);
      }
    }
    if (changes.type !== undefined) {
      if (!VEYRA_MACHINE_INPUT_TYPES.includes(changes.type)) {
        throw new TypeError(`Machine input type ${changes.type} is not supported.`);
      }
      const blockers = [];
      for (const transition of machine.transitions) {
        for (const condition of transition.conditions) {
          if (referenceId(condition.input, 'machineInput') !== inputId) continue;
          const violation = machineConditionViolation(condition.op, condition.value, changes.type);
          if (violation) {
            blockers.push(`condition ${condition.id} on transition ${transition.id} (op '${condition.op}' ${violation})`);
          }
        }
      }
      if (blockers.length) {
        throw new TypeError(
          `Machine input "${input.name || inputId}" cannot change type to ${changes.type}: `
          + `${blockers.join('; ')} would be illegal. `
          + 'Fix or remove the listed conditions first.',
        );
      }
    }
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update machine input ${input.name || input.id}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId).inputs.find((candidate) => candidate.id === inputId);
      for (const key of ['name', 'type', 'value']) {
        if (changes[key] !== undefined) target[key] = changes[key];
      }
    });
    return true;
  }

  removeMachineInput(machineId, inputId, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const input = machine?.inputs.find((candidate) => candidate.id === inputId);
    if (!input) return false;
    const blockers = [];
    for (const transition of machine.transitions) {
      for (const condition of transition.conditions) {
        if (referenceId(condition.input, 'machineInput') === inputId) {
          blockers.push(`condition ${condition.id} on transition ${transition.id} (op '${condition.op}')`);
        }
      }
    }
    if (blockers.length) {
      throw new TypeError(
        `Machine input "${input.name || inputId}" is still referenced by ${blockers.join('; ')}. `
        + 'Remove or re-point those conditions first — deleting the input would silently make those '
        + 'transitions fire more easily than authored.',
      );
    }
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete machine input ${input.name || input.id}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      target.inputs = target.inputs.filter((candidate) => candidate.id !== inputId);
    });
    return true;
  }

  updateMachineTransition(machineId, transitionId, changes = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId);
    const transition = machine?.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return false;
    if (changes.from !== undefined || changes.to !== undefined) {
      throw new TypeError(
        `Cannot change from/to on transition ${transitionId}; endpoints are immutable. `
        + 'Remove and re-add the transition to re-point it.',
      );
    }
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update machine transition ${transitionId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId).transitions.find((candidate) => candidate.id === transitionId);
      if (changes.duration !== undefined) target.duration = changes.duration;
      if (changes.after !== undefined) target.after = changes.after;
      if (changes.conditions !== undefined) {
        target.conditions = changes.conditions.map((condition) => createMachineCondition(condition));
      }
    });
    return true;
  }

  get commandHistory() {
    return cloneValue(this.#activity);
  }
}
