import assert from 'node:assert/strict';
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
