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

# ---------------------------------------------------------------------------
# references.js — canonical owner-qualified paint identity
# ---------------------------------------------------------------------------
path = 'src/veyra/references.js'
text = read(path)
text = replace_once(
    text,
    "export function createPaintRef(id) {\n  return createReference('paint', id);\n}\n",
    """export function createPaintRef(ownerKindOrRef, ownerId = null) {
  let ownerKind;
  let id;
  if (ownerKindOrRef && typeof ownerKindOrRef === 'object') {
    ownerKind = String(ownerKindOrRef.kind || '');
    id = String(ownerKindOrRef.id || '');
  } else if (ownerId == null) {
    const encoded = String(ownerKindOrRef || '');
    const separator = encoded.indexOf(':');
    if (separator <= 0) {
      throw new TypeError('paint references must be owner-qualified as node:<id> or mesh:<id>.');
    }
    ownerKind = encoded.slice(0, separator);
    id = encoded.slice(separator + 1);
  } else {
    ownerKind = String(ownerKindOrRef || '');
    id = String(ownerId || '');
  }
  if (!['node', 'mesh'].includes(ownerKind)) {
    throw new TypeError(`paint owner kind must be node or mesh, not ${ownerKind || 'empty'}.`);
  }
  if (!id) throw new TypeError('paint owner id is required.');
  return createReference('paint', `${ownerKind}:${id}`);
}

export function paintOwnerReference(value) {
  const ref = value && typeof value === 'object'
    ? createReference('paint', value.id)
    : createReference('paint', value);
  const separator = ref.id.indexOf(':');
  if (separator <= 0) throw new TypeError('paint reference is not owner-qualified.');
  const ownerKind = ref.id.slice(0, separator);
  const ownerId = ref.id.slice(separator + 1);
  if (!['node', 'mesh'].includes(ownerKind) || !ownerId) {
    throw new TypeError('paint reference must encode a node or mesh owner.');
  }
  return createReference(ownerKind, ownerId);
}
""",
    'createPaintRef',
)
write(path, text)

# ---------------------------------------------------------------------------
# semantics.js — explicit target policy + paint qualification + command names
# ---------------------------------------------------------------------------
path = 'src/veyra/semantics.js'
text = read(path)
text = replace_once(
    text,
    "  createReference,\n  referencesEqual,\n} from './references.js';",
    "  createPaintRef,\n  createReference,\n  paintOwnerReference,\n  referencesEqual,\n} from './references.js';",
    'semantics reference imports',
)
text = replace_once(
    text,
    "export const VEYRA_SEMANTIC_SOURCES = Object.freeze(['user', 'ai', 'import', 'system']);\n",
    """export const VEYRA_SEMANTIC_SOURCES = Object.freeze(['user', 'ai', 'import', 'system']);
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
""",
    'semantic constants',
)
text = replace_once(
    text,
    """export function normalizeSemanticTarget(value, path = 'semantic target') {
  if (typeof value === 'string') return createReference('node', value);
  if (!value || typeof value !== 'object') throw new TypeError(`${path} must be a typed reference.`);
  return createReference(String(value.kind || ''), value.id);
}
""",
    """function normalizeSemanticReference(value, path = 'semantic reference') {
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
""",
    'normalizeSemanticTarget',
)
text = replace_once(
    text,
    "function normalizeRelations(relations = [], path = 'semantic relations') {",
    "function normalizeRelations(relations = [], path = 'semantic relations', document = null) {",
    'normalizeRelations signature',
)
text = replace_once(
    text,
    "      target: normalizeSemanticTarget(relation.target, `${path}[${index}].target`),",
    "      target: normalizeSemanticRelationTarget(relation.target, `${path}[${index}].target`, document),",
    'relation target normalization',
)
text = replace_once(
    text,
    "export function createSemanticRecord(targetOrNodeId, overrides = {}) {\n  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target');",
    "export function createSemanticRecord(targetOrNodeId, overrides = {}, document = null) {\n  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target', document);",
    'createSemanticRecord signature',
)
text = replace_once(
    text,
    "    relations: normalizeRelations(overrides.relations || []),",
    "    relations: normalizeRelations(overrides.relations || [], 'semantic relations', document),",
    'createSemanticRecord relations',
)
text = replace_once(
    text,
    "export function normalizeSemanticRecords(records = []) {",
    "export function normalizeSemanticRecords(records = [], document = null) {",
    'normalizeSemanticRecords signature',
)
text = replace_once(
    text,
    "    const target = normalizeSemanticTarget(record.target ?? record.nodeId, `semantics[${index}].target`);",
    "    const target = normalizeSemanticTarget(record.target ?? record.nodeId, `semantics[${index}].target`, document);",
    'normalize semantic record target',
)
text = replace_once(
    text,
    "    return createSemanticRecord(target, { ...record, id });",
    "    return createSemanticRecord(target, { ...record, id }, document);",
    'normalize semantic create',
)
text = replace_once(
    text,
    "export function entityByReference(document, reference) {\n  const ref = normalizeSemanticTarget(reference);",
    "export function entityByReference(document, reference) {\n  const ref = qualifyPaintReference(normalizeSemanticReference(reference), document, 'reference');",
    'entityByReference normalization',
)
text = replace_once(
    text,
    """    case 'paint': {
      const owner = find(document.nodes) || find(document.meshes);
      return owner?.paint || null;
    }
""",
    """    case 'paint': {
      let owner;
      try {
        owner = paintOwnerReference(ref);
      } catch {
        return null;
      }
      const collection = owner.kind === 'node' ? document.nodes : document.meshes;
      return (collection || []).find((item) => item.id === owner.id)?.paint || null;
    }
""",
    'paint entity lookup',
)
text = replace_once(
    text,
    "  for (const [index, record] of (document.semantics || []).entries()) {\n    if (ids.has(record.id))",
    "  for (const [index, record] of (document.semantics || []).entries()) {\n    normalizeSemanticTarget(record.target, `semantics[${index}].target`, document);\n    if (ids.has(record.id))",
    'semantic target policy validation',
)
text = replace_once(
    text,
    "export function semanticsForTarget(document, targetOrNodeId) {\n  const target = normalizeSemanticTarget(targetOrNodeId);",
    "export function semanticsForTarget(document, targetOrNodeId) {\n  const target = normalizeSemanticTarget(targetOrNodeId, 'semantic target', document);",
    'semantic target lookup',
)
text = replace_once(
    text,
    "  document.semantics[index] = createSemanticRecord(target, { ...current, ...patch, id: semanticId });",
    "  document.semantics[index] = createSemanticRecord(target, { ...current, ...patch, id: semanticId }, document);",
    'semantic update context',
)
text = replace_once(
    text,
    "  const normalized = normalizeRelations([relation])[0];",
    "  const normalized = normalizeRelations([relation], 'semantic relations', document)[0];",
    'remove relation context',
)
text = replace_once(
    text,
    "    add('node', node.id);\n    add('paint', node.id);",
    "    add('node', node.id);\n    add('paint', createPaintRef('node', node.id).id);",
    'node paint entity key',
)
text = replace_once(
    text,
    "    add('mesh', mesh.id); add('paint', mesh.id);",
    "    add('mesh', mesh.id); add('paint', createPaintRef('mesh', mesh.id).id);",
    'mesh paint entity key',
)
write(path, text)

# ---------------------------------------------------------------------------
# model.js — provide owner context during semantic migration
# ---------------------------------------------------------------------------
path = 'src/veyra/model.js'
text = read(path)
text = replace_once(
    text,
    "  const semantics = normalizeSemanticRecords(input.semantics || []);",
    "  const semantics = normalizeSemanticRecords(input.semantics || [], { nodes, meshes });",
    'semantic normalization context',
)
write(path, text)

# ---------------------------------------------------------------------------
# capabilities.js — same target policy and exact dispatcher action names
# ---------------------------------------------------------------------------
path = 'src/veyra/capabilities.js'
text = read(path)
text = replace_once(
    text,
    "import { VEYRA_REFERENCE_KINDS } from './references.js';\nimport { VEYRA_SEMANTIC_SOURCES, VEYRA_SEMANTIC_STATUSES } from './semantics.js';",
    "import {\n  VEYRA_SEMANTIC_COMMAND_ACTIONS,\n  VEYRA_SEMANTIC_SOURCES,\n  VEYRA_SEMANTIC_STATUSES,\n  VEYRA_SEMANTIC_TARGET_KINDS,\n} from './semantics.js';",
    'semantic capability imports',
)
text = replace_once(
    text,
    "  targetKinds: Object.freeze([...VEYRA_REFERENCE_KINDS.filter((kind) => kind !== 'semanticRecord')]),",
    "  targetKinds: Object.freeze([...VEYRA_SEMANTIC_TARGET_KINDS]),",
    'semantic target capabilities',
)
text = replace_once(
    text,
    "  actions: Object.freeze(['create', 'update', 'delete', 'add-relation', 'remove-relation']),",
    "  actions: Object.freeze([...VEYRA_SEMANTIC_COMMAND_ACTIONS]),",
    'semantic action capabilities',
)
write(path, text)

# ---------------------------------------------------------------------------
# summary.js — expose owner-qualified paint refs
# ---------------------------------------------------------------------------
path = 'src/veyra/summary.js'
text = read(path)
text = replace_once(
    text,
    "  createPathVertexRef,\n  createStateMachineRef,",
    "  createPathVertexRef,\n  createPaintRef,\n  createStateMachineRef,",
    'summary paint import',
)
text = replace_once(
    text,
    "function paintSummary(paint) {\n  const stops = paint?.fill?.stops || [];\n  return {",
    "function paintSummary(paint, ownerKind, ownerId) {\n  const stops = paint?.fill?.stops || [];\n  return {\n    ref: createPaintRef(ownerKind, ownerId),",
    'paintSummary signature',
)
text = text.replace("paint: paintSummary(node.paint),", "paint: paintSummary(node.paint, 'node', node.id),")
text = text.replace("paint: paintSummary(mesh.paint),", "paint: paintSummary(mesh.paint, 'mesh', mesh.id),")
write(path, text)

# ---------------------------------------------------------------------------
# commands.js — five 1:1 JSON-safe semantic commands + drift invariant
# ---------------------------------------------------------------------------
path = 'src/veyra/commands.js'
text = read(path)
text = replace_once(
    text,
    "} from './model.js';\n",
    "} from './model.js';\nimport { VEYRA_SEMANTIC_COMMAND_ACTIONS } from './semantics.js';\n",
    'command semantic import',
)
text = replace_once(
    text,
    """  removeSelection: {
    summary: 'Remove the current selection through the shared cascade cleanup.',
    params: [],
    run: (store) => store.removeSelection(),
  },
  setProperty: {
""",
    """  removeSelection: {
    summary: 'Remove the current selection through the shared cascade cleanup.',
    params: [],
    run: (store) => store.removeSelection(),
  },
  addSemantic: {
    summary: 'Add a semantic record for a typed target reference.',
    params: [param('target', 'reference', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addSemantic(args.target, args.overrides ?? {}, command ?? {}),
  },
  updateSemantic: {
    summary: 'Update an existing semantic record by stable semantic-record id.',
    params: [param('semanticId', 'string', true), param('patch', 'object', true)],
    run: (store, args, command) => store.updateSemantic(args.semanticId, args.patch, command ?? {}),
  },
  removeSemantic: {
    summary: 'Remove a semantic record by stable semantic-record id.',
    params: [param('semanticId', 'string', true)],
    run: (store, args, command) => store.removeSemantic(args.semanticId, command ?? {}),
  },
  addSemanticRelation: {
    summary: 'Add one typed semantic relation to a semantic record.',
    params: [param('semanticId', 'string', true), param('relation', 'object', true)],
    run: (store, args, command) => store.addSemanticRelation(args.semanticId, args.relation, command ?? {}),
  },
  removeSemanticRelation: {
    summary: 'Remove one typed semantic relation from a semantic record.',
    params: [param('semanticId', 'string', true), param('relation', 'object', true)],
    run: (store, args, command) => store.removeSemanticRelation(args.semanticId, args.relation, command ?? {}),
  },
  setProperty: {
""",
    'semantic command entries',
)
text = replace_once(
    text,
    """  removeSelection: {
    targetKind: 'selection',
    capabilities: ['selection', 'transactional', 'undoable'],
  },
  setProperty: {
""",
    """  removeSelection: {
    targetKind: 'selection',
    capabilities: ['selection', 'transactional', 'undoable'],
  },
  addSemantic: {
    manifestId: 'add-semantic',
    name: 'Add semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable', 'returns-id'],
  },
  updateSemantic: {
    manifestId: 'update-semantic',
    name: 'Update semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable'],
  },
  removeSemantic: {
    manifestId: 'remove-semantic',
    name: 'Remove semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable'],
  },
  addSemanticRelation: {
    manifestId: 'add-semantic-relation',
    name: 'Add semantic relation',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'typed-relation', 'transactional', 'undoable'],
  },
  removeSemanticRelation: {
    manifestId: 'remove-semantic-relation',
    name: 'Remove semantic relation',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'typed-relation', 'transactional', 'undoable'],
  },
  setProperty: {
""",
    'semantic command manifest overrides',
)
text = replace_once(
    text,
    "export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);",
    """for (const action of VEYRA_SEMANTIC_COMMAND_ACTIONS) {
  if (!COMMAND_TABLE[action]) throw new TypeError(`Missing semantic command-bus action: ${action}`);
}

export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);""",
    'semantic command invariant',
)
write(path, text)

# ---------------------------------------------------------------------------
# manifest.js — mechanically resolve semantic capability actions to catalog refs
# ---------------------------------------------------------------------------
path = 'src/veyra/manifest.js'
text = read(path)
text = replace_once(
    text,
    "function authoringContract() {\n  return {",
    """function semanticActionRefs() {
  return VEYRA_SEMANTIC_CAPABILITIES.actions.map((commandName) => {
    const command = VEYRA_COMMAND_TABLE[commandName];
    if (!command || !command.capabilities.includes('semantic-write')) {
      throw new TypeError(`Semantic capability action ${commandName} is not dispatchable as a semantic write.`);
    }
    return command.manifestId;
  });
}

function authoringContract() {
  return {""",
    'semantic manifest action resolver',
)
text = replace_once(
    text,
    "      actions: [...VEYRA_SEMANTIC_CAPABILITIES.actions],",
    "      actions: [...VEYRA_SEMANTIC_CAPABILITIES.actions],\n      actionRefs: semanticActionRefs(),",
    'semantic action refs',
)
write(path, text)

# ---------------------------------------------------------------------------
# Manifest action-count contract grows additively by five semantic commands.
# ---------------------------------------------------------------------------
path = 'tests/veyra-manifest.test.mjs'
text = read(path)
text = replace_once(
    text,
    "assert.equal(actions.length, 45, 'Action catalog grows additively from 27 published entries to 45 total affordances.');",
    "assert.equal(actions.length, 50, 'Action catalog grows additively from 45 entries to 50 with canonical semantic CRUD.');",
    'manifest action count',
)
write(path, text)

# ---------------------------------------------------------------------------
# Dedicated correction-pass tests.
# ---------------------------------------------------------------------------
correction_test = r'''import assert from 'node:assert/strict';
import {
  createAsset,
  createDocument,
  createMesh,
  createNode,
  createSemanticRecord,
  normalizeDocument,
  semanticRecordById,
  semanticsFor,
} from '../src/veyra/model.js';
import { VEYRA_SEMANTIC_CAPABILITIES } from '../src/veyra/capabilities.js';
import { dispatchVeyraCommand, VEYRA_COMMAND_TABLE } from '../src/veyra/commands.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { createPaintRef, createSemanticRecordRef } from '../src/veyra/references.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { VeyraStore } from '../src/veyra/store.js';

function collisionDocument() {
  const node = createNode('rectangle', { id: 'shared_owner', name: 'Node Human Name' });
  const mesh = createMesh({ id: 'shared_owner', name: 'Mesh Human Name' });
  const asset = createAsset('image', { id: 'semantic_asset_bus', name: 'Human Asset Name' });
  const nodePaint = createPaintRef('node', 'shared_owner');
  const meshPaint = createPaintRef('mesh', 'shared_owner');
  return normalizeDocument(createDocument({
    id: 'semantic_correction_document',
    nodes: [node],
    meshes: [mesh],
    assets: [asset],
    semantics: [
      createSemanticRecord(nodePaint, {
        id: 'semantic_node_paint',
        canonicalRole: 'node-paint',
      }),
      createSemanticRecord(meshPaint, {
        id: 'semantic_mesh_paint',
        canonicalRole: 'mesh-paint',
        relations: [{ predicate: 'paired_with', target: nodePaint }],
      }),
      createSemanticRecord({ kind: 'asset', id: asset.id }, {
        id: 'semantic_relation_source',
        canonicalRole: 'asset-semantic',
        relations: [{ predicate: 'explained_by', target: createSemanticRecordRef('semantic_node_paint') }],
      }),
    ],
  }));
}

// --- Correction 2: paint identity is owner-qualified and collision-safe. -----
{
  const document = collisionDocument();
  const nodePaint = createPaintRef('node', 'shared_owner');
  const meshPaint = createPaintRef('mesh', 'shared_owner');
  assert.notDeepEqual(nodePaint, meshPaint);
  assert.equal(nodePaint.id, 'node:shared_owner');
  assert.equal(meshPaint.id, 'mesh:shared_owner');
  assert.equal(semanticsFor(document, nodePaint)[0].id, 'semantic_node_paint');
  assert.equal(semanticsFor(document, meshPaint)[0].id, 'semantic_mesh_paint');

  const roundTrip = parseVeyra(serializeVeyra(document));
  assert.equal(semanticsFor(roundTrip, nodePaint)[0].id, 'semantic_node_paint');
  assert.equal(semanticsFor(roundTrip, meshPaint)[0].id, 'semantic_mesh_paint');

  const renamed = normalizeDocument({
    ...roundTrip,
    nodes: roundTrip.nodes.map((item) => ({ ...item, name: 'renamed node' })),
    meshes: roundTrip.meshes.map((item) => ({ ...item, name: 'renamed mesh' })),
  });
  assert.deepEqual(semanticsFor(renamed, nodePaint)[0].target, nodePaint);
  assert.deepEqual(semanticsFor(renamed, meshPaint)[0].target, meshPaint);

  const summary = createSceneSummary(renamed);
  assert.deepEqual(summary.objects[0].paint.ref, nodePaint);
  assert.deepEqual(summary.rig.meshes[0].paint.ref, meshPaint);
  const manifest = createProjectManifest(renamed);
  assert.deepEqual(manifest.scene.objects[0].paint.ref, nodePaint);
  assert.deepEqual(manifest.scene.rig.meshes[0].paint.ref, meshPaint);

  const store = new VeyraStore(renamed);
  assert.equal(store.remove('shared_owner'), true, 'node deletion is allowed despite same-id mesh');
  assert.equal(semanticRecordById(store.document, 'semantic_node_paint'), null, 'node paint semantic cascades');
  assert.ok(semanticRecordById(store.document, 'semantic_mesh_paint'), 'same-id mesh paint semantic survives');
  assert.equal(semanticRecordById(store.document, 'semantic_mesh_paint').relations.length, 0, 'relation to deleted node paint cascades only');
  assert.equal(store.document.meshes[0].id, 'shared_owner');
}

// Legacy unqualified paint refs migrate only when owner identity is unique.
{
  const legacy = normalizeDocument(createDocument({
    nodes: [createNode('rectangle', { id: 'legacy_paint_owner' })],
    semantics: [{
      target: { kind: 'paint', id: 'legacy_paint_owner' },
      role: 'legacy-paint',
      tags: [],
    }],
  }));
  assert.deepEqual(legacy.semantics[0].target, createPaintRef('node', 'legacy_paint_owner'));
  assert.throws(() => normalizeDocument(createDocument({
    nodes: [createNode('rectangle', { id: 'ambiguous_paint_owner' })],
    meshes: [createMesh({ id: 'ambiguous_paint_owner' })],
    semantics: [{ target: { kind: 'paint', id: 'ambiguous_paint_owner' }, role: 'legacy' }],
  })), /ambiguous between node and mesh/);
}

// --- Correction 3: semanticRecord cannot be a semantic target. ---------------
{
  assert.equal(VEYRA_SEMANTIC_CAPABILITIES.targetKinds.includes('semanticRecord'), false);
  assert.throws(
    () => createSemanticRecord({ kind: 'semanticRecord', id: 'semantic_other' }),
    /cannot target semanticRecord/,
  );
  const document = collisionDocument();
  assert.ok(
    semanticRecordById(document, 'semantic_relation_source').relations.some(
      (relation) => relation.target.kind === 'semanticRecord' && relation.target.id === 'semantic_node_paint',
    ),
    'semanticRecord remains legal as a typed relation target',
  );
}

// --- Correction 1: semantic CRUD runs through the JSON-safe command bus. ------
{
  const store = new VeyraStore(collisionDocument());
  const humanName = store.document.assets[0].name;

  const add = dispatchVeyraCommand(store, {
    action: 'addSemantic',
    args: {
      target: { kind: 'asset', id: 'semantic_asset_bus' },
      overrides: {
        canonicalRole: 'texture',
        provenance: { source: 'ai', agentId: 'correction-agent', confidence: 0.8 },
      },
    },
    command: { source: 'ai', label: 'AI annotate asset' },
  });
  assert.equal(add.ok, true, add.error);
  const semanticId = add.result;
  assert.equal(store.commandHistory.at(-1).source, 'ai');
  assert.equal(store.commandHistory.at(-1).label, 'AI annotate asset');
  assert.equal(store.document.assets[0].name, humanName);

  const update = dispatchVeyraCommand(store, {
    action: 'updateSemantic',
    args: {
      semanticId,
      patch: {
        canonicalRole: 'primary-texture',
        status: 'confirmed',
        aliases: [{ namespace: 'planner', owner: 'correction-agent', value: 'main-texture' }],
      },
    },
    command: { source: 'ai', label: 'AI refine asset semantic' },
  });
  assert.equal(update.ok, true, update.error);
  assert.equal(semanticRecordById(store.document, semanticId).canonicalRole, 'primary-texture');
  assert.equal(store.document.assets[0].name, humanName, 'AI alias never changes human name');
  assert.equal(store.undo(), true);
  assert.equal(semanticRecordById(store.document, semanticId).canonicalRole, 'texture');
  assert.equal(store.redo(), true);
  assert.equal(semanticRecordById(store.document, semanticId).canonicalRole, 'primary-texture');

  const relation = { predicate: 'uses_paint', target: createPaintRef('mesh', 'shared_owner') };
  const addRelation = dispatchVeyraCommand(store, {
    action: 'addSemanticRelation',
    args: { semanticId, relation },
    command: { source: 'ai', label: 'AI relate paint' },
  });
  assert.equal(addRelation.ok, true, addRelation.error);
  assert.equal(semanticRecordById(store.document, semanticId).relations.some((item) => item.predicate === 'uses_paint'), true);

  const removeRelation = dispatchVeyraCommand(store, {
    action: 'removeSemanticRelation',
    args: { semanticId, relation },
    command: { source: 'ai', label: 'AI unrelate paint' },
  });
  assert.equal(removeRelation.ok, true, removeRelation.error);
  assert.equal(semanticRecordById(store.document, semanticId).relations.some((item) => item.predicate === 'uses_paint'), false);

  const beforeInvalid = serializeVeyra(store.document);
  const revisionBeforeInvalid = store.revision;
  const historyBeforeInvalid = store.commandHistory.length;
  const invalidTarget = dispatchVeyraCommand(store, {
    action: 'addSemantic',
    args: { target: { kind: 'asset', id: 'missing_asset' }, overrides: { canonicalRole: 'bad' } },
    command: { source: 'ai', label: 'Invalid semantic target' },
  });
  assert.equal(invalidTarget.ok, false);
  assert.match(invalidTarget.error, /targets missing asset missing_asset/);
  assert.equal(serializeVeyra(store.document), beforeInvalid);
  assert.equal(store.revision, revisionBeforeInvalid);
  assert.equal(store.commandHistory.length, historyBeforeInvalid);

  const invalidPatch = dispatchVeyraCommand(store, {
    action: 'updateSemantic',
    args: { semanticId, patch: { provenance: { source: 'ai', confidence: 2 } } },
    command: { source: 'ai', label: 'Invalid semantic confidence' },
  });
  assert.equal(invalidPatch.ok, false);
  assert.match(invalidPatch.error, /confidence/);
  assert.equal(serializeVeyra(store.document), beforeInvalid);
  assert.equal(store.revision, revisionBeforeInvalid);
  assert.equal(store.commandHistory.length, historyBeforeInvalid);

  const remove = dispatchVeyraCommand(store, {
    action: 'removeSemantic',
    args: { semanticId },
    command: { source: 'ai', label: 'AI remove semantic' },
  });
  assert.equal(remove.ok, true, remove.error);
  assert.equal(remove.result, true);
  assert.equal(semanticRecordById(store.document, semanticId), null);
}

// Capability -> command table -> manifest action catalog is mechanically exact.
{
  const document = collisionDocument();
  const manifest = createProjectManifest(document);
  const expected = [...VEYRA_SEMANTIC_CAPABILITIES.actions].sort();
  const dispatchable = expected.filter((action) => Object.hasOwn(VEYRA_COMMAND_TABLE, action)).sort();
  assert.deepEqual(dispatchable, expected);
  assert.deepEqual([...manifest.authoring.semanticRecord.actions].sort(), expected);
  const actionRefs = expected.map((action) => VEYRA_COMMAND_TABLE[action].manifestId).sort();
  assert.deepEqual([...manifest.authoring.semanticRecord.actionRefs].sort(), actionRefs);
  const catalogCommands = manifest.actions
    .filter((action) => action.capabilities.includes('semantic-write'))
    .map((action) => action.command)
    .sort();
  assert.deepEqual(catalogCommands, expected);
}

console.log('veyra M1 correction-pass tests passed');
'''
write('tests/veyra-semantics-corrections.test.mjs', correction_test)

# ---------------------------------------------------------------------------
# milestone.md — handoff only after tests/checks pass in workflow.
# ---------------------------------------------------------------------------
path = 'milestone.md'
text = read(path)
text = replace_once(text, "**Status:** `CORRECTIONS REQUIRED`", "**Status:** `AWAITING VERIFICATION`", 'milestone status')
handoff = """```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: Implement M1 correction pass [m1-corrected]
- Changed files: src/veyra/references.js, semantics.js, model.js, capabilities.js, summary.js, commands.js, manifest.js, tests/veyra-semantics-corrections.test.mjs, tests/veyra-manifest.test.mjs, milestone.md
- Tests added/changed: dedicated correction suite covering command-bus CRUD/atomicity, owner-qualified paint collision identity/cascade/round-trip/summary-manifest refs, and semanticRecord target exclusion; manifest action count remains strict at 50
- npm test: PASS (required by correction workflow before commit)
- npm run check: PASS (required by correction workflow before commit)
- Command-bus semantic CRUD proof: all five VEYRA_SEMANTIC_COMMAND_ACTIONS dispatch 1:1 to Store methods; AI provenance is forwarded; invalid refs/patches return failure without document/revision/history mutation; capability actions resolve mechanically to generated manifest action refs
- Paint identity collision proof: paint refs are owner-qualified as paint id node:<owner-id> or mesh:<owner-id>; same node/mesh owner IDs remain legal and resolve/cascade independently; legacy unqualified paint refs migrate only when unique and fail precisely when ambiguous
- semanticRecord target policy: unsupported as a semantic-record target and rejected during creation/normalization/validation; still supported intentionally as a typed semantic relation target
- Persistence/migration impact: canonical paint semantic refs are owner-qualified; legacy unqualified paint refs deterministically qualify from owner kind when unique; semantic IDs remain unchanged; save/load preserves qualified identity
- AI/name-independence proof: dispatched AI alias/role/status edits leave human names untouched; owner renames do not alter paint semantic refs
- Suggestions added to `suggestions`: none
- Known limitations: legacy unqualified paint refs are inherently ambiguous when a node and mesh already share the owner ID, so normalization rejects them and requires an explicit owner-qualified ref
```"""
text = re.sub(r"```text\nHandoff\n- Status: AWAITING VERIFICATION\n(?:.|\n)*?```\s*$", handoff + "\n", text)
write(path, text)

print('M1 correction patch applied')
