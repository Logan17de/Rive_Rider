import {
  VEYRA_REFERENCE_KINDS,
  createPaintRef,
  createReference,
  paintOwnerReference,
  referencesEqual,
} from './references.js';
import { dataEntityByReference } from './dataGraph.js';

export const VEYRA_SEMANTIC_STATUSES = Object.freeze(['confirmed', 'inferred', 'rejected', 'stale']);
export const VEYRA_SEMANTIC_SOURCES = Object.freeze(['user', 'ai', 'import', 'system']);
export const VEYRA_SEMANTIC_TARGET_KINDS = Object.freeze(
  VEYRA_REFERENCE_KINDS.filter((kind) => kind !== 'semanticRecord'),
);
export const VEYRA_SEMANTIC_COMMAND_ACTIONS = Object.freeze([
  'addSemantic',
  'updateSemantic',
  'removeSemantic',
  'addSemanticRelation',
  'removeSemanticRelation',
]);

let semanticFallbackId = 0;

function semanticId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `semantic_${uuid}`;
  semanticFallbackId += 1;
  return `semantic_${Date.now().toString(36)}_${semanticFallbackId.toString(36)}`;
}

function deterministicId(key) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `semantic_legacy_${hash.toString(16).padStart(8, '0')}`;
}

function cleanString(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string.`);
  const result = value.trim();
  if (!allowEmpty && result.length === 0) throw new TypeError(`${path} must be a non-empty string.`);
  return result;
}

function normalizeSemanticReference(value, path = 'semantic reference') {
  if (typeof value === 'string') return createReference('node', value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a typed reference.`);
  }
  return createReference(String(value.kind || ''), value.id);
}

function qualifyPaintReference(reference, document, path) {
  if (reference.kind !== 'paint') return reference;
  try {
    const owner = paintOwnerReference(reference);
    return createPaintRef(owner);
  } catch {
    // Unqualified paint refs are accepted only as legacy/transient input.
    // Once a document context exists they are deterministically migrated.
  }
  if (!document) return reference;
  const ownerId = reference.id;
  const owners = [];
  if ((document.nodes || []).some((node) => node.id === ownerId)) owners.push({ kind: 'node', id: ownerId });
  if ((document.meshes || []).some((mesh) => mesh.id === ownerId)) owners.push({ kind: 'mesh', id: ownerId });
  if (owners.length > 1) {
    throw new TypeError(`${path} paint owner id ${ownerId} is ambiguous between node and mesh; use an owner-qualified paint reference.`);
  }
  return owners.length === 1 ? createPaintRef(owners[0]) : reference;
}

export function normalizeSemanticTarget(value, path = 'semantic target', document = null) {
  const reference = qualifyPaintReference(normalizeSemanticReference(value, path), document, path);
  if (reference.kind === 'semanticRecord') {
    throw new TypeError(`${path} cannot target semanticRecord; semantic records may only be relation targets.`);
  }
  return reference;
}

function normalizeSemanticRelationTarget(value, path, document = null) {
  return qualifyPaintReference(normalizeSemanticReference(value, path), document, path);
}

function normalizeTags(tags = [], path = 'semantic tags') {
  if (!Array.isArray(tags)) throw new TypeError(`${path} must be an array.`);
  return [...new Set(tags.map((tag, index) => cleanString(tag, `${path}[${index}]`)))].sort();
}

function normalizeAliases(aliases = [], path = 'semantic aliases') {
  if (!Array.isArray(aliases)) throw new TypeError(`${path} must be an array.`);
  const normalized = aliases.map((alias, index) => {
    if (!alias || typeof alias !== 'object' || Array.isArray(alias)) {
      throw new TypeError(`${path}[${index}] must be an alias record.`);
    }
    return {
      namespace: cleanString(alias.namespace, `${path}[${index}].namespace`),
      owner: cleanString(alias.owner, `${path}[${index}].owner`),
      value: cleanString(alias.value, `${path}[${index}].value`),
    };
  });
  const keys = new Set();
  return normalized.filter((alias) => {
    const key = `${alias.namespace}\u0000${alias.owner}\u0000${alias.value}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }).sort((left, right) =>
    left.namespace.localeCompare(right.namespace)
    || left.owner.localeCompare(right.owner)
    || left.value.localeCompare(right.value));
}

function normalizeEvidence(evidence = [], path = 'semantic provenance.evidence') {
  if (!Array.isArray(evidence)) throw new TypeError(`${path} must be an array.`);
  return [...new Set(evidence.map((item, index) => cleanString(item, `${path}[${index}]`)))].sort();
}

function normalizeProvenance(value = {}, path = 'semantic provenance') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const source = value.source ?? 'user';
  if (!VEYRA_SEMANTIC_SOURCES.includes(source)) {
    throw new TypeError(`${path}.source must be one of ${VEYRA_SEMANTIC_SOURCES.join(', ')}.`);
  }
  const result = { source };
  if (value.agentId !== undefined && value.agentId !== null) {
    result.agentId = cleanString(value.agentId, `${path}.agentId`);
  }
  if (value.confidence !== undefined && value.confidence !== null) {
    if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
      throw new TypeError(`${path}.confidence must be a finite number between 0 and 1.`);
    }
    result.confidence = value.confidence;
  }
  if (value.evidence !== undefined) result.evidence = normalizeEvidence(value.evidence, `${path}.evidence`);
  return result;
}

function normalizePredicate(value, path) {
  const predicate = cleanString(value, path).toLowerCase().replace(/[\s-]+/g, '_');
  if (!/^[a-z][a-z0-9_:.]*$/.test(predicate)) {
    throw new TypeError(`${path} contains unsupported characters.`);
  }
  return predicate;
}

function normalizeRelations(relations = [], path = 'semantic relations', document = null) {
  if (!Array.isArray(relations)) throw new TypeError(`${path} must be an array.`);
  const normalized = relations.map((relation, index) => {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
      throw new TypeError(`${path}[${index}] must be a relation record.`);
    }
    return {
      predicate: normalizePredicate(relation.predicate, `${path}[${index}].predicate`),
      target: normalizeSemanticRelationTarget(relation.target, `${path}[${index}].target`, document),
    };
  });
  const seen = new Set();
  return normalized.filter((relation) => {
    const key = `${relation.predicate}\u0000${referenceKey(relation.target)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) =>
    left.predicate.localeCompare(right.predicate)
    || referenceKey(left.target).localeCompare(referenceKey(right.target)));
}

export function referenceKey(reference) {
  return `${reference.kind}:${reference.id}`;
}

function sourceFromLegacy(record) {
  if (record?.provenance !== undefined) return record.provenance;
  const provenance = {};
  if (record?.source !== undefined) provenance.source = record.source;
  if (record?.agentId !== undefined) provenance.agentId = record.agentId;
  if (record?.confidence !== undefined) provenance.confidence = record.confidence;
  if (record?.evidence !== undefined) provenance.evidence = record.evidence;
  return provenance;
}

export function createSemanticRecord(targetOrNodeId, overrides = {}, document = null) {
  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target', document);
  const provenance = normalizeProvenance(sourceFromLegacy(overrides));
  const status = overrides.status ?? (provenance.source === 'ai' ? 'inferred' : 'confirmed');
  if (!VEYRA_SEMANTIC_STATUSES.includes(status)) {
    throw new TypeError(`semantic status must be one of ${VEYRA_SEMANTIC_STATUSES.join(', ')}.`);
  }
  return {
    id: overrides.id || semanticId(),
    target,
    namespace: String(overrides.namespace ?? 'default').trim() || 'default',
    canonicalRole: String(overrides.canonicalRole ?? overrides.role ?? '').trim(),
    description: String(overrides.description ?? ''),
    tags: normalizeTags(overrides.tags || []),
    aliases: normalizeAliases(overrides.aliases || []),
    relations: normalizeRelations(overrides.relations || [], 'semantic relations', document),
    provenance,
    status,
  };
}

export function normalizeSemanticRecords(records = [], document = null) {
  if (!Array.isArray(records)) throw new TypeError('semantics must be an array.');
  const normalized = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`semantics[${index}] must be a semantic record.`);
    }
    const target = normalizeSemanticTarget(record.target ?? record.nodeId, `semantics[${index}].target`, document);
    const id = record.id || deterministicId(`${referenceKey(target)}\u0000${String(record.namespace ?? 'default')}\u0000${index}`);
    return createSemanticRecord(target, { ...record, id }, document);
  });
  const ids = new Set();
  normalized.forEach((record, index) => {
    if (ids.has(record.id)) throw new TypeError(`Duplicate semantic record id ${record.id} at semantics[${index}].`);
    ids.add(record.id);
  });
  return normalized;
}

export function entityByReference(document, reference) {
  const ref = qualifyPaintReference(normalizeSemanticReference(reference), document, 'reference');
  const dataEntity = dataEntityByReference(document, ref);
  if (dataEntity) return dataEntity;
  const find = (items) => (items || []).find((item) => item.id === ref.id) || null;
  switch (ref.kind) {
    case 'document': return document.id === ref.id ? document : null;
    case 'artboard': return find(document.artboards);
    case 'component': return find(document.components);
    case 'componentInstance': return find(document.componentInstances);
    case 'componentOverride':
      for (const instance of document.componentInstances || []) {
        const override = find(instance.overrides);
        if (override) return override;
      }
      return null;
    case 'node': return find(document.nodes);
    case 'pathVertex':
      for (const node of document.nodes || []) {
        if (node.type === 'path') {
          const vertex = find(node.geometry?.vertices);
          if (vertex) return vertex;
        }
      }
      return null;
    case 'paint': {
      let owner;
      try {
        owner = paintOwnerReference(ref);
      } catch {
        return null;
      }
      const collection = owner.kind === 'node' ? document.nodes : document.meshes;
      return (collection || []).find((item) => item.id === owner.id)?.paint || null;
    }
    case 'gradientStop':
      for (const owner of [...(document.nodes || []), ...(document.meshes || [])]) {
        const stop = find(owner.paint?.fill?.stops);
        if (stop) return stop;
      }
      return null;
    case 'asset': return find(document.assets);
    case 'bone': return find(document.bones);
    case 'mesh': return find(document.meshes);
    case 'meshVertex':
      for (const mesh of document.meshes || []) {
        const vertex = find(mesh.vertices);
        if (vertex) return vertex;
      }
      return null;
    case 'control': return find(document.controls);
    case 'constraint': return find(document.constraints);
    case 'timeline': return find(document.timelines);
    case 'track':
      for (const timeline of document.timelines || []) {
        const track = find(timeline.tracks);
        if (track) return track;
      }
      return null;
    case 'keyframe':
      for (const timeline of document.timelines || []) {
        for (const track of timeline.tracks || []) {
          const keyframe = find(track.keyframes);
          if (keyframe) return keyframe;
        }
      }
      return null;
    case 'stateMachine': return find(document.stateMachines);
    case 'machineState':
    case 'machineInput':
    case 'machineTransition':
    case 'machineCondition':
      for (const machine of document.stateMachines || []) {
        const collection = {
          machineState: machine.states,
          machineInput: machine.inputs,
          machineTransition: machine.transitions,
        }[ref.kind];
        if (collection) {
          const item = find(collection);
          if (item) return item;
        } else {
          for (const transition of machine.transitions || []) {
            const condition = find(transition.conditions);
            if (condition) return condition;
          }
        }
      }
      return null;
    case 'listener': return find(document.listeners);
    case 'semanticRecord': return find(document.semantics);
    default: return null;
  }
}

export function validateSemanticRecords(document) {
  const ids = new Set();
  for (const [index, record] of (document.semantics || []).entries()) {
    normalizeSemanticTarget(record.target, `semantics[${index}].target`, document);
    if (ids.has(record.id)) throw new TypeError(`Duplicate semantic record id ${record.id}.`);
    ids.add(record.id);
    if (!entityByReference(document, record.target)) {
      throw new TypeError(`semantics[${index}] targets missing ${record.target.kind} ${record.target.id}.`);
    }
    for (const [relationIndex, relation] of record.relations.entries()) {
      if (!entityByReference(document, relation.target)) {
        throw new TypeError(`semantics[${index}].relations[${relationIndex}] targets missing ${relation.target.kind} ${relation.target.id}.`);
      }
    }
  }
  return document;
}

export function semanticRecordById(document, semanticId) {
  return (document.semantics || []).find((record) => record.id === semanticId) || null;
}

export function semanticsForTarget(document, targetOrNodeId) {
  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target', document);
  return (document.semantics || []).filter((record) => referencesEqual(record.target, target));
}

export function semanticForTarget(document, targetOrNodeId) {
  return semanticsForTarget(document, targetOrNodeId)[0] || null;
}

export function updateSemanticRecordInDocument(document, semanticId, patch) {
  const index = (document.semantics || []).findIndex((record) => record.id === semanticId);
  if (index < 0) throw new TypeError(`Unknown semantic record ${semanticId}.`);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('semantic patch must be an object.');
  if (patch.id !== undefined && patch.id !== semanticId) throw new TypeError('semantic record id is immutable.');
  const current = document.semantics[index];
  const target = patch.target ?? current.target;
  document.semantics[index] = createSemanticRecord(target, { ...current, ...patch, id: semanticId }, document);
  return document.semantics[index];
}

export function deleteSemanticRecordInDocument(document, semanticId) {
  const before = document.semantics.length;
  document.semantics = document.semantics.filter((record) => record.id !== semanticId);
  if (before === document.semantics.length) return false;
  const target = createReference('semanticRecord', semanticId);
  document.semantics = document.semantics.map((record) => ({
    ...record,
    relations: record.relations.filter((relation) => !referencesEqual(relation.target, target)),
  }));
  return true;
}

export function addSemanticRelationInDocument(document, semanticId, relation) {
  const current = semanticRecordById(document, semanticId);
  if (!current) throw new TypeError(`Unknown semantic record ${semanticId}.`);
  return updateSemanticRecordInDocument(document, semanticId, { relations: [...current.relations, relation] });
}

export function removeSemanticRelationInDocument(document, semanticId, relation) {
  const current = semanticRecordById(document, semanticId);
  if (!current) throw new TypeError(`Unknown semantic record ${semanticId}.`);
  const normalized = normalizeRelations([relation], 'semantic relations', document)[0];
  return updateSemanticRecordInDocument(document, semanticId, {
    relations: current.relations.filter((candidate) =>
      candidate.predicate !== normalized.predicate || !referencesEqual(candidate.target, normalized.target)),
  });
}

export function allEntityReferenceKeys(document) {
  const keys = new Set();
  const add = (kind, id) => { if (id) keys.add(`${kind}:${id}`); };
  add('document', document.id);
  for (const node of document.nodes || []) {
    add('node', node.id);
    add('paint', createPaintRef('node', node.id).id);
    for (const vertex of node.type === 'path' ? node.geometry?.vertices || [] : []) add('pathVertex', vertex.id);
    for (const stop of node.paint?.fill?.stops || []) add('gradientStop', stop.id);
  }
  for (const asset of document.assets || []) add('asset', asset.id);
  for (const bone of document.bones || []) add('bone', bone.id);
  for (const mesh of document.meshes || []) {
    add('mesh', mesh.id); add('paint', createPaintRef('mesh', mesh.id).id);
    for (const vertex of mesh.vertices || []) add('meshVertex', vertex.id);
    for (const stop of mesh.paint?.fill?.stops || []) add('gradientStop', stop.id);
  }
  for (const control of document.controls || []) add('control', control.id);
  for (const constraint of document.constraints || []) add('constraint', constraint.id);
  for (const timeline of document.timelines || []) {
    add('timeline', timeline.id);
    for (const track of timeline.tracks || []) {
      add('track', track.id);
      for (const keyframe of track.keyframes || []) add('keyframe', keyframe.id);
    }
  }
  for (const machine of document.stateMachines || []) {
    add('stateMachine', machine.id);
    for (const input of machine.inputs || []) add('machineInput', input.id);
    for (const state of machine.states || []) add('machineState', state.id);
    for (const transition of machine.transitions || []) {
      add('machineTransition', transition.id);
      for (const condition of transition.conditions || []) add('machineCondition', condition.id);
    }
  }
  for (const listener of document.listeners || []) add('listener', listener.id);
  for (const semantic of document.semantics || []) add('semanticRecord', semantic.id);
  return keys;
}

/** Explicit deletion cascade used by the canonical Store before validation. */
export function cascadeDeletedSemanticRefs(before, after) {
  const beforeKeys = allEntityReferenceKeys(before);
  const afterKeys = allEntityReferenceKeys(after);
  const deleted = new Set([...beforeKeys].filter((key) => !afterKeys.has(key)));
  if (!deleted.size) return;
  after.semantics = (after.semantics || []).filter((record) => !deleted.has(referenceKey(record.target)));
  const survivingSemanticIds = new Set(after.semantics.map((record) => record.id));
  after.semantics = after.semantics.map((record) => ({
    ...record,
    relations: record.relations.filter((relation) => {
      if (deleted.has(referenceKey(relation.target))) return false;
      return relation.target.kind !== 'semanticRecord' || survivingSemanticIds.has(relation.target.id);
    }),
  }));
}
