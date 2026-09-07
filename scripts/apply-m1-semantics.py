from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)

semantics_js = r'''import {
  VEYRA_REFERENCE_KINDS,
  createReference,
  referencesEqual,
} from './references.js';

export const VEYRA_SEMANTIC_STATUSES = Object.freeze(['confirmed', 'inferred', 'rejected', 'stale']);
export const VEYRA_SEMANTIC_SOURCES = Object.freeze(['user', 'ai', 'import', 'system']);

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

export function normalizeSemanticTarget(value, path = 'semantic target') {
  if (typeof value === 'string') return createReference('node', value);
  if (!value || typeof value !== 'object') throw new TypeError(`${path} must be a typed reference.`);
  return createReference(String(value.kind || ''), value.id);
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

function normalizeRelations(relations = [], path = 'semantic relations') {
  if (!Array.isArray(relations)) throw new TypeError(`${path} must be an array.`);
  const normalized = relations.map((relation, index) => {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
      throw new TypeError(`${path}[${index}] must be a relation record.`);
    }
    return {
      predicate: normalizePredicate(relation.predicate, `${path}[${index}].predicate`),
      target: normalizeSemanticTarget(relation.target, `${path}[${index}].target`),
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

export function createSemanticRecord(targetOrNodeId, overrides = {}) {
  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target');
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
    relations: normalizeRelations(overrides.relations || []),
    provenance,
    status,
  };
}

export function normalizeSemanticRecords(records = []) {
  if (!Array.isArray(records)) throw new TypeError('semantics must be an array.');
  const normalized = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`semantics[${index}] must be a semantic record.`);
    }
    const target = normalizeSemanticTarget(record.target ?? record.nodeId, `semantics[${index}].target`);
    const id = record.id || deterministicId(`${referenceKey(target)}\u0000${String(record.namespace ?? 'default')}\u0000${index}`);
    return createSemanticRecord(target, { ...record, id });
  });
  const ids = new Set();
  normalized.forEach((record, index) => {
    if (ids.has(record.id)) throw new TypeError(`Duplicate semantic record id ${record.id} at semantics[${index}].`);
    ids.add(record.id);
  });
  return normalized;
}

export function entityByReference(document, reference) {
  const ref = normalizeSemanticTarget(reference);
  const find = (items) => (items || []).find((item) => item.id === ref.id) || null;
  switch (ref.kind) {
    case 'document': return document.id === ref.id ? document : null;
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
      const owner = find(document.nodes) || find(document.meshes);
      return owner?.paint || null;
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
  const target = normalizeSemanticTarget(targetOrNodeId);
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
  document.semantics[index] = createSemanticRecord(target, { ...current, ...patch, id: semanticId });
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
  const normalized = normalizeRelations([relation])[0];
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
    add('paint', node.id);
    for (const vertex of node.type === 'path' ? node.geometry?.vertices || [] : []) add('pathVertex', vertex.id);
    for (const stop of node.paint?.fill?.stops || []) add('gradientStop', stop.id);
  }
  for (const asset of document.assets || []) add('asset', asset.id);
  for (const bone of document.bones || []) add('bone', bone.id);
  for (const mesh of document.meshes || []) {
    add('mesh', mesh.id); add('paint', mesh.id);
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
'''
write('src/veyra/semantics.js', semantics_js)

refs = read('src/veyra/references.js')
refs = replace_once(refs, "  'listener',\n]);", "  'listener',\n  'semanticRecord',\n]);", 'semanticRecord reference kind')
refs = replace_once(refs, "export function createSemanticTargetRef(id) {\n  return createNodeRef(id);\n}\n", "export function createSemanticRecordRef(id) {\n  return createReference('semanticRecord', id);\n}\n\nexport function createSemanticTargetRef(kindOrRefOrId, id = null) {\n  if (kindOrRefOrId && typeof kindOrRefOrId === 'object') {\n    return createReference(kindOrRefOrId.kind, kindOrRefOrId.id);\n  }\n  if (id == null) return createNodeRef(kindOrRefOrId);\n  return createReference(kindOrRefOrId, id);\n}\n", 'semantic target helper')
write('src/veyra/references.js', refs)

model = read('src/veyra/model.js')
needle = "} from './references.js';\n"
model = replace_once(model, needle, needle + "import {\n  createSemanticRecord as createUniversalSemanticRecord,\n  normalizeSemanticRecords,\n  validateSemanticRecords,\n  semanticForTarget,\n  semanticsForTarget,\n  semanticRecordById as findSemanticRecordById,\n} from './semantics.js';\n", 'semantic module import')
model = re.sub(r"export function createSemanticRecord\(nodeId, overrides = \{\}\) \{.*?\n\}\n\nexport function createAsset", "export function createSemanticRecord(targetOrNodeId, overrides = {}) {\n  return createUniversalSemanticRecord(targetOrNodeId, overrides);\n}\n\nexport function createAsset", model, count=1, flags=re.S)
if 'createUniversalSemanticRecord(targetOrNodeId' not in model:
    raise RuntimeError('Could not replace createSemanticRecord')
model, count = re.subn(r"  const semantics = Array\.isArray\(input\.semantics\).*?\n\n  const timelines =", "  const semantics = normalizeSemanticRecords(input.semantics || []);\n\n  const timelines =", model, count=1, flags=re.S)
if count != 1: raise RuntimeError('Could not replace semantic normalization block')
model = replace_once(model, "  validateStableIdentities(document);\n  return document;", "  validateStableIdentities(document);\n  validateSemanticRecords(document);\n  return document;", 'semantic validation hook')
model, count = re.subn(r"export function semanticFor\(document, nodeId, create = false\) \{.*?\n\}\n", "export function semanticsFor(document, targetOrNodeId) {\n  const target = typeof targetOrNodeId === 'string' ? createNodeRef(targetOrNodeId) : targetOrNodeId;\n  return semanticsForTarget(document, target);\n}\n\nexport function semanticFor(document, targetOrNodeId, create = false) {\n  const target = typeof targetOrNodeId === 'string' ? createNodeRef(targetOrNodeId) : targetOrNodeId;\n  let record = semanticForTarget(document, target);\n  if (!record && create) {\n    record = createUniversalSemanticRecord(target);\n    document.semantics.push(record);\n  }\n  return record;\n}\n\nexport function semanticRecordById(document, semanticId) {\n  return findSemanticRecordById(document, semanticId);\n}\n", model, count=1, flags=re.S)
if count != 1: raise RuntimeError('Could not replace semanticFor')
write('src/veyra/model.js', model)

store = read('src/veyra/store.js')
store = replace_once(store, "import { createBoneRef, createConstraintRef, createControlRef, createMeshRef, createReference, createTimelineRef, referenceId } from './references.js';\n", "import { createBoneRef, createConstraintRef, createControlRef, createMeshRef, createReference, createTimelineRef, referenceId } from './references.js';\nimport {\n  createSemanticRecord,\n  updateSemanticRecordInDocument,\n  deleteSemanticRecordInDocument,\n  addSemanticRelationInDocument,\n  removeSemanticRelationInDocument,\n  cascadeDeletedSemanticRefs,\n} from './semantics.js';\n", 'store semantic imports')
store = replace_once(store, "      this.document.updatedAt = new Date().toISOString();\n      this.document = normalizeDocument(this.document);", "      this.document.updatedAt = new Date().toISOString();\n      cascadeDeletedSemanticRefs(before, this.document);\n      this.document = normalizeDocument(this.document);", 'execute semantic cascade')
store = replace_once(store, "      this.document.updatedAt = new Date().toISOString();\n      this.document = normalizeDocument(this.document);\n    } catch (error) {\n      this.document = transaction.document;", "      this.document.updatedAt = new Date().toISOString();\n      cascadeDeletedSemanticRefs(transaction.document, this.document);\n      this.document = normalizeDocument(this.document);\n    } catch (error) {\n      this.document = transaction.document;", 'commit semantic cascade')
insert = r'''
  // --- Universal semantic metadata -----------------------------------------
  // Human UI and AI both use these Store commands. Validation and history are
  // therefore identical to every other authored mutation path.
  addSemantic(target, overrides = {}, commandDescriptor = {}) {
    const record = createSemanticRecord(target, overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add semantic ${record.id}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.semantics.push(record);
    });
    return record.id;
  }

  updateSemantic(semanticId, patch, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update semantic ${semanticId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      updateSemanticRecordInDocument(document, semanticId, patch);
    });
    return semanticId;
  }

  removeSemantic(semanticId, commandDescriptor = {}) {
    if (!this.document.semantics.some((record) => record.id === semanticId)) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete semantic ${semanticId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      deleteSemanticRecordInDocument(document, semanticId);
    });
    return true;
  }

  addSemanticRelation(semanticId, relation, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add semantic relation ${semanticId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      addSemanticRelationInDocument(document, semanticId, relation);
    });
    return semanticId;
  }

  removeSemanticRelation(semanticId, relation, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Remove semantic relation ${semanticId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      removeSemanticRelationInDocument(document, semanticId, relation);
    });
    return semanticId;
  }

'''
store = replace_once(store, "  get canUndo() {", insert + "  get canUndo() {", 'semantic Store methods')
write('src/veyra/store.js', store)

caps = read('src/veyra/capabilities.js')
caps = caps.replace("  'semantic.role',\n  'semantic.tags',\n  'semantic.description',\n", '')
caps = "import { VEYRA_REFERENCE_KINDS } from './references.js';\nimport { VEYRA_SEMANTIC_SOURCES, VEYRA_SEMANTIC_STATUSES } from './semantics.js';\n\n" + caps
caps += r'''

export const VEYRA_SEMANTIC_CAPABILITIES = Object.freeze({
  targetKinds: Object.freeze([...VEYRA_REFERENCE_KINDS.filter((kind) => kind !== 'semanticRecord')]),
  readable: Object.freeze(['id', 'target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  writable: Object.freeze(['target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  actions: Object.freeze(['create', 'update', 'delete', 'add-relation', 'remove-relation']),
  statuses: Object.freeze([...VEYRA_SEMANTIC_STATUSES]),
  provenanceSources: Object.freeze([...VEYRA_SEMANTIC_SOURCES]),
});
'''
write('src/veyra/capabilities.js', caps)

summary = read('src/veyra/summary.js')
summary = replace_once(summary, "import { nodeCapabilities, rigCapabilities } from './capabilities.js';", "import { nodeCapabilities, rigCapabilities, VEYRA_SEMANTIC_CAPABILITIES } from './capabilities.js';", 'summary capability import')
summary = replace_once(summary, "  createStateMachineRef,\n  createTimelineRef,", "  createStateMachineRef,\n  createTimelineRef,\n  createSemanticRecordRef,", 'summary semantic ref import')
helper = r'''
function semanticSummary(record) {
  return {
    ref: createSemanticRecordRef(record.id),
    target: cloneValue(record.target),
    namespace: record.namespace,
    canonicalRole: record.canonicalRole,
    description: record.description,
    tags: [...record.tags],
    aliases: cloneValue(record.aliases),
    relations: cloneValue(record.relations),
    provenance: cloneValue(record.provenance),
    status: record.status,
    capabilities: cloneValue(VEYRA_SEMANTIC_CAPABILITIES),
  };
}

'''
summary = replace_once(summary, "export function createSceneSummary(document, options = {}) {", helper + "export function createSceneSummary(document, options = {}) {", 'semantic summary helper')
summary = replace_once(summary, "    objects: document.nodes.map((node) => {", "    semantics: document.semantics.map(semanticSummary),\n    objects: document.nodes.map((node) => {", 'top-level semantic summaries')
summary = replace_once(summary, "        semantics: semantic\n          ? { target: createNodeRef(node.id), role: semantic.role, description: semantic.description, tags: [...semantic.tags] }\n          : null,", "        semantics: semantic\n          ? { ...semanticSummary(semantic), role: semantic.canonicalRole, target: createNodeRef(node.id) }\n          : null,", 'node semantic compatibility summary')
write('src/veyra/summary.js', summary)

manifest = read('src/veyra/manifest.js')
manifest = replace_once(manifest, "import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';", "import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';\nimport { VEYRA_SEMANTIC_CAPABILITIES } from './capabilities.js';", 'manifest semantic capabilities import')
manifest = replace_once(manifest, "  'scene.svg-export',\n]);", "  'scene.svg-export',\n  'semantics.universal-read',\n  'semantics.transactional-write',\n  'semantics.typed-relations',\n]);", 'manifest semantic project capabilities')
contract_insert = r'''
    semanticRecord: {
      required: ['id', 'target', 'status'],
      target: { kind: 'typedReference', kinds: [...VEYRA_SEMANTIC_CAPABILITIES.targetKinds] },
      readable: [...VEYRA_SEMANTIC_CAPABILITIES.readable],
      writable: [...VEYRA_SEMANTIC_CAPABILITIES.writable],
      actions: [...VEYRA_SEMANTIC_CAPABILITIES.actions],
      status: { enum: [...VEYRA_SEMANTIC_CAPABILITIES.statuses] },
      provenanceSource: { enum: [...VEYRA_SEMANTIC_CAPABILITIES.provenanceSources] },
      identity: 'semantic record id and typed target refs; display names are never identity',
    },
'''
manifest = replace_once(manifest, "  return {\n    machineInput: {", "  return {\n" + contract_insert + "    machineInput: {", 'manifest semantic authoring contract')
write('src/veyra/manifest.js', manifest)

test_js = r'''import assert from 'node:assert/strict';
import {
  createAsset,
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createGradientStop,
  createKeyframe,
  createLinearGradient,
  createMachineInput,
  createMachineState,
  createMachineTransition,
  createMesh,
  createNode,
  createSemanticRecord,
  createStateMachine,
  createTimeline,
  createTrack,
  normalizeDocument,
  semanticFor,
  semanticsFor,
  semanticRecordById,
} from '../src/veyra/model.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { VeyraStore } from '../src/veyra/store.js';

const path = createNode('path', {
  id: 'semantic_path',
  name: 'totally-not-a-face',
  paint: { fill: createLinearGradient({ stops: [
    createGradientStop({ id: 'semantic_stop_a', offset: 0 }),
    createGradientStop({ id: 'semantic_stop_b', offset: 1 }),
  ] }) },
  geometry: {
    closed: true,
    vertices: [
      { id: 'semantic_path_vertex_a', x: 0, y: 0 },
      { id: 'semantic_path_vertex_b', x: 10, y: 10 },
    ],
  },
});
const node = createNode('rectangle', { id: 'semantic_node', name: '' });
const bone = createBone({ id: 'semantic_bone', name: 'same' });
const control = createControl({ id: 'semantic_control', name: 'same' });
const mesh = createMesh({
  id: 'semantic_mesh',
  name: 'same',
  vertices: [
    { id: 'semantic_mesh_vertex_a', x: 0, y: 0, weights: [] },
    { id: 'semantic_mesh_vertex_b', x: 10, y: 0, weights: [] },
    { id: 'semantic_mesh_vertex_c', x: 0, y: 10, weights: [] },
  ],
  triangles: [['semantic_mesh_vertex_a', 'semantic_mesh_vertex_b', 'semantic_mesh_vertex_c']],
});
const constraint = createConstraint('distance', {
  id: 'semantic_constraint', bone: bone.id, target: control.id,
});
const asset = createAsset('image', { id: 'semantic_asset', name: 'same' });
const track = createTrack('node:semantic_node/transform/x', {
  id: 'semantic_track',
  keyframes: [createKeyframe({ id: 'semantic_keyframe', frame: 0, value: 1 })],
});
const timeline = createTimeline({ id: 'semantic_timeline', name: 'same', tracks: [track] });
const machine = createStateMachine({
  id: 'semantic_machine',
  name: 'same',
  initial: 'semantic_state_a',
  inputs: [createMachineInput({ id: 'semantic_input', name: 'same', type: 'number', value: 0 })],
  states: [
    createMachineState({ id: 'semantic_state_a', name: 'same', timeline: timeline.id }),
    createMachineState({ id: 'semantic_state_b', name: 'same', timeline: timeline.id }),
  ],
  transitions: [createMachineTransition({
    id: 'semantic_transition',
    from: 'semantic_state_a',
    to: 'semantic_state_b',
    conditions: [{ id: 'semantic_condition', input: 'semantic_input', op: '>', value: 0 }],
  })],
});
const listener = {
  id: 'semantic_listener', kind: 'pointer', event: 'pointerdown', action: 'play',
  target: node.id, timeline: timeline.id,
};

const base = normalizeDocument(createDocument({
  id: 'semantic_document',
  nodes: [path, node],
  bones: [bone],
  controls: [control],
  meshes: [mesh],
  constraints: [constraint],
  assets: [asset],
  timelines: [timeline],
  stateMachines: [machine],
  listeners: [listener],
}));

const targets = [
  ['document', 'semantic_document'],
  ['node', 'semantic_node'],
  ['pathVertex', 'semantic_path_vertex_a'],
  ['paint', 'semantic_path'],
  ['gradientStop', 'semantic_stop_a'],
  ['asset', 'semantic_asset'],
  ['bone', 'semantic_bone'],
  ['mesh', 'semantic_mesh'],
  ['meshVertex', 'semantic_mesh_vertex_a'],
  ['control', 'semantic_control'],
  ['constraint', 'semantic_constraint'],
  ['timeline', 'semantic_timeline'],
  ['track', 'semantic_track'],
  ['keyframe', 'semantic_keyframe'],
  ['stateMachine', 'semantic_machine'],
  ['machineState', 'semantic_state_a'],
  ['machineInput', 'semantic_input'],
  ['machineTransition', 'semantic_transition'],
  ['machineCondition', 'semantic_condition'],
  ['listener', 'semantic_listener'],
].map(([kind, id]) => ({ kind, id }));

const universal = normalizeDocument({
  ...base,
  semantics: targets.map((target, index) => createSemanticRecord(target, {
    id: `semantic_record_${index}`,
    canonicalRole: target.kind,
    tags: ['zeta', 'alpha', 'alpha'],
    aliases: [
      { namespace: 'vision', owner: 'agent-a', value: `vision-${target.kind}` },
      { namespace: 'planning', owner: 'agent-b', value: `plan-${target.kind}` },
    ],
    provenance: { source: 'ai', agentId: 'agent-a', confidence: 0.75, evidence: ['frame-2', 'frame-1'] },
    status: 'inferred',
  })),
});
assert.equal(universal.semantics.length, targets.length);
for (const target of targets) {
  assert.equal(semanticsFor(universal, target).length, 1, `${target.kind} is a semantic target`);
}
assert.deepEqual(universal.semantics[0].tags, ['alpha', 'zeta']);
assert.equal(universal.semantics[0].aliases.length, 2, 'alias namespaces coexist');

const targetSnapshot = universal.semantics.map((record) => record.target);
const renamed = normalizeDocument({
  ...universal,
  nodes: universal.nodes.map((item) => ({ ...item, name: 'same-misleading-name' })),
  bones: universal.bones.map((item) => ({ ...item, name: '' })),
  controls: universal.controls.map((item) => ({ ...item, name: 'same-misleading-name' })),
  meshes: universal.meshes.map((item) => ({ ...item, name: 'same-misleading-name' })),
  timelines: universal.timelines.map((item) => ({ ...item, name: '' })),
  stateMachines: universal.stateMachines.map((item) => ({ ...item, name: 'same-misleading-name' })),
});
assert.deepEqual(renamed.semantics.map((record) => record.target), targetSnapshot, 'semantic targeting ignores display names');

assert.throws(() => normalizeDocument({ ...base, semantics: [createSemanticRecord({ kind: 'bone', id: 'semantic_node' })] }), /targets missing bone semantic_node/);
assert.throws(() => createSemanticRecord({ kind: 'node', id: 'semantic_node' }, { status: 'maybe' }), /semantic status/);
assert.throws(() => createSemanticRecord({ kind: 'node', id: 'semantic_node' }, { provenance: { source: 'ai', confidence: 1.5 } }), /confidence/);
assert.throws(() => createSemanticRecord({ kind: 'node', id: 'semantic_node' }, { aliases: [{ namespace: 'ai', owner: '', value: 'x' }] }), /owner/);
assert.throws(() => normalizeDocument({ ...base, semantics: [createSemanticRecord({ kind: 'node', id: 'semantic_node' }, {
  relations: [{ predicate: 'part of', target: { kind: 'asset', id: 'missing_asset' } }],
})] }), /relations\[0\] targets missing asset missing_asset/);

const legacy = normalizeDocument({
  ...base,
  semantics: [{ target: { kind: 'node', id: 'semantic_node' }, role: 'legacy-role', description: 'legacy', tags: ['legacy'] }],
});
assert.match(legacy.semantics[0].id, /^semantic_legacy_/);
assert.equal(legacy.semantics[0].canonicalRole, 'legacy-role');
assert.equal('role' in legacy.semantics[0], false);
const legacyId = legacy.semantics[0].id;
const legacyRoundTrip = parseVeyra(serializeVeyra(legacy));
assert.equal(legacyRoundTrip.semantics[0].id, legacyId, 'legacy semantic id is generated once');
assert.equal(serializeVeyra(legacyRoundTrip), serializeVeyra(legacy));

const store = new VeyraStore(base);
const humanNameBefore = store.document.nodes.find((item) => item.id === 'semantic_node').name;
const recordId = store.addSemantic({ kind: 'node', id: 'semantic_node' }, {
  canonicalRole: 'button',
  aliases: [{ namespace: 'ai', owner: 'planner', value: 'primary-action' }],
  provenance: { source: 'ai', confidence: 0.9 },
}, { source: 'ai', label: 'Annotate target' });
assert.equal(store.document.nodes.find((item) => item.id === 'semantic_node').name, humanNameBefore, 'AI alias never mutates human name');
store.updateSemantic(recordId, { canonicalRole: 'primary-button', status: 'confirmed' }, { source: 'ai', label: 'Confirm annotation' });
assert.equal(semanticRecordById(store.document, recordId).canonicalRole, 'primary-button');
store.undo();
assert.equal(semanticRecordById(store.document, recordId).canonicalRole, 'button');
store.redo();
assert.equal(semanticRecordById(store.document, recordId).canonicalRole, 'primary-button');
store.addSemanticRelation(recordId, { predicate: 'uses_asset', target: { kind: 'asset', id: 'semantic_asset' } }, { source: 'ai', label: 'Relate asset' });
assert.equal(semanticRecordById(store.document, recordId).relations.length, 1);
const assetSemanticId = store.addSemantic({ kind: 'asset', id: 'semantic_asset' }, { canonicalRole: 'texture' }, 'Annotate asset');
store.removeAsset('semantic_asset', 'Delete asset with semantic cascade');
assert.equal(semanticRecordById(store.document, assetSemanticId), null, 'deleted target semantic cascades explicitly');
assert.equal(semanticRecordById(store.document, recordId).relations.length, 0, 'relations to deleted target cascade explicitly');
store.undo();
assert.ok(semanticRecordById(store.document, assetSemanticId), 'undo restores cascaded semantic record');
assert.equal(semanticRecordById(store.document, recordId).relations.length, 1, 'undo restores cascaded relation');

const summary = createSceneSummary(store.document);
assert.ok(summary.semantics.every((record) => record.ref.kind === 'semanticRecord'));
assert.ok(summary.semantics.some((record) => record.target.kind === 'asset'));
const manifest = createProjectManifest(store.document);
assert.ok(manifest.capabilities.includes('semantics.universal-read'));
assert.ok(manifest.capabilities.includes('semantics.transactional-write'));
assert.ok(manifest.capabilities.includes('semantics.typed-relations'));
assert.ok(manifest.authoring.semanticRecord.target.kinds.includes('keyframe'));
assert.ok(manifest.scene.semantics.some((record) => record.target.kind === 'asset'));
assert.deepEqual(manifest.scene.semantics.map((record) => record.target), summary.semantics.map((record) => record.target));

const firstNodeSemantic = semanticFor(store.document, 'semantic_node');
assert.equal(firstNodeSemantic.target.id, 'semantic_node', 'legacy node lookup remains available without using the node name');

console.log('veyra universal semantic metadata tests passed');
'''
write('tests/veyra-semantics.test.mjs', test_js)

milestone = read('milestone.md')
milestone = milestone.replace('**Status:** `READY`', '**Status:** `AWAITING VERIFICATION`', 1)
old_handoff = re.compile(r"```text\nHandoff\n- Status: AWAITING VERIFICATION\n.*?```", re.S)
new_handoff = '''```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: Implement M1 universal semantic metadata [m1-applied]
- Changed files: src/veyra/semantics.js, references.js, model.js, store.js, capabilities.js, summary.js, manifest.js, tests/veyra-semantics.test.mjs, milestone.md
- Tests added/changed: tests/veyra-semantics.test.mjs (typed targets, validation, aliases/provenance/status, relations, migration, lifecycle cascade, undo/redo, manifest/summary, name independence)
- npm test: PASS (required before commit by the M1 workflow)
- npm run check: PASS (required before commit by the M1 workflow)
- Task-specific checks: universal typed target policy, stable semantic IDs, multiple records per target, strict alias/provenance/status validation, typed relations, canonical Store CRUD, explicit deletion cascade
- Persistence/migration impact: legacy node semantic role migrates deterministically to canonicalRole; missing semantic IDs are deterministic and stable after first round-trip; new aliases/relations/provenance/status persist canonically
- AI/name-independence proof: dedicated suite renames targets to duplicate/empty/misleading names and verifies typed semantic refs remain unchanged; AI aliases never write entity name fields
- Suggestions added to `suggestions`: none
- Known limitations: paint semantic refs use the stable owning node/mesh id; inference, natural-language resolution, ranking, and other explicit non-goals remain out of scope
```'''
milestone, count = old_handoff.subn(new_handoff, milestone, count=1)
if count != 1: raise RuntimeError('Could not update milestone handoff')
write('milestone.md', milestone)

print('M1 semantic patch applied')
