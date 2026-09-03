import assert from 'node:assert/strict';
import {
  createAsset,
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createMesh,
  createNode,
  normalizeDocument,
} from '../src/veyra/model.js';
import { createBoneRef, createControlRef, createMeshVertexRef, referenceId } from '../src/veyra/references.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';

function buildRigDocument() {
  return normalizeDocument(createDocument({
    id: 'document_rig_store',
    name: 'Rig Store Fixture',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [
      createAsset('image', {
        id: 'asset_bg',
        name: 'Background',
        mimeType: 'image/png',
        source: { kind: 'external', uri: 'https://example.com/bg.png' },
      }),
    ],
    nodes: [
      createNode('path', {
        id: 'node_curve',
        geometry: {
          closed: true,
          vertices: [
            { id: 'v1', x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
            { id: 'v2', x: 10, y: 10, inX: 0, inY: 0, outX: 0, outY: 0 },
          ],
        },
      }),
    ],
    bones: [
      createBone({ id: 'bone_root', name: 'Root', length: 100, rest: { x: 100, y: 100 } }),
      createBone({ id: 'bone_child', name: 'Child', parent: createBoneRef('bone_root'), length: 80, rest: { x: 100, y: 0 } }),
    ],
    controls: [
      createControl({ id: 'ctrl_hand', name: 'Hand', position: { x: 300, y: 200 } }),
    ],
    meshes: [
      createMesh({
        id: 'mesh_skin',
        name: 'Skin',
        vertices: [
          { id: 'mv1', x: 0, y: 0, weights: [{ bone: createBoneRef('bone_root'), value: 1 }] },
          { id: 'mv2', x: 10, y: 0, weights: [{ bone: createBoneRef('bone_root'), value: 0.5 }, { bone: createBoneRef('bone_child'), value: 0.5 }] },
          { id: 'mv3', x: 10, y: 10, weights: [{ bone: createBoneRef('bone_child'), value: 1 }] },
        ],
        triangles: [[createMeshVertexRef('mv1'), createMeshVertexRef('mv2'), createMeshVertexRef('mv3')]],
      }),
    ],
    constraints: [
      createConstraint('ik', { id: 'cst_ik', name: 'Arm IK', bones: [createBoneRef('bone_root'), createBoneRef('bone_child')], target: createControlRef('ctrl_hand') }),
      createConstraint('distance', { id: 'cst_dist', name: 'Hold', bone: createBoneRef('bone_child'), target: createControlRef('ctrl_hand'), distance: 80 }),
      createConstraint('rotation', { id: 'cst_rot', name: 'Follow', bone: createBoneRef('bone_root'), target: createBoneRef('bone_child') }),
    ],
  }));
}

// --- Creation through the store ---------------------------------------------
{
  const store = new VeyraStore(buildRigDocument());
  assert.equal(store.document.bones.length, 2);
  assert.equal(store.document.meshes.length, 1);
  assert.equal(store.document.controls.length, 1);
  assert.equal(store.document.constraints.length, 3);
  assert.equal(store.document.assets.length, 1);

  const boneId = store.addBone(
    { name: 'Finger', parent: createBoneRef('bone_child'), rest: { x: 80, y: 0 }, length: 40 },
    { source: 'ai', label: 'Grow a finger' },
  );
  assert.equal(store.document.bones.length, 3);
  assert.equal(store.selectedId, boneId);
  assert.equal(store.selectedKind, 'bone');
  assert.equal(store.commandHistory.at(-1).label, 'Grow a finger');
  assert.equal(store.commandHistory.at(-1).source, 'ai');

  const controlId = store.addControl({ name: 'Eye', position: { x: 10, y: 10 } }, 'Add control');
  assert.equal(store.selectedKind, 'control');
  assert.equal(store.selectedId, controlId);

  const meshId = store.addMesh({ name: 'Wing' }, 'Add mesh');
  assert.equal(store.selectedKind, 'mesh');
  assert.equal(store.selectedId, meshId);

  const constraintId = store.addConstraint(
    'distance',
    { name: 'Tether', bone: createBoneRef('bone_root'), target: createControlRef(controlId), distance: 50 },
    'Add tether',
  );
  assert.equal(store.selectedKind, 'constraint');
  assert.equal(store.selectedId, constraintId);
  assert.equal(store.commandHistory.at(-1).label, 'Add tether');

  const assetId = store.addAsset(
    'audio',
    { name: 'Chime', mimeType: 'audio/mpeg', source: { kind: 'embedded', data: 'abcd' } },
    'Add chime',
  );
  assert.equal(store.document.assets.length, 2);
  assert.equal(store.document.assets.find((asset) => asset.id === assetId).type, 'audio');
  assert.equal(store.commandHistory.at(-1).label, 'Add chime');

  const plain = new VeyraStore(buildRigDocument());
  plain.addBone({ name: 'Plain' });
  assert.equal(plain.commandHistory.at(-1).label, 'Add bone Plain');
  assert.equal(plain.commandHistory.at(-1).source, 'user');

  console.log('✓ rig and asset creation through the store');
}

// --- Invalid input atomicity ---------------------------------------------------
{
  const store = new VeyraStore(buildRigDocument());
  const before = serializeVeyra(store.document);
  assert.throws(
    () => store.addConstraint('ik', { bones: [createBoneRef('bone_root'), createBoneRef('bone_root')], target: createControlRef('ctrl_hand') }),
    /parent-child/,
  );
  assert.throws(
    () => store.addConstraint('distance', { bone: createBoneRef('bone_root'), target: createControlRef('missing_control'), distance: 5 }),
    /missing control/,
  );
  assert.throws(() => store.addControl({ kind: 'vector' }), /Unsupported control kind/);
  assert.throws(() => store.addAsset('video', {}), /Unsupported Veyra asset type/);
  assert.equal(serializeVeyra(store.document), before, 'Rejected creations must leave the document byte-identical.');
  assert.equal(store.canUndo, false, 'Rejected creations must not record commands.');

  store.addBone({ name: 'Kept' });
  const beforeKept = serializeVeyra(store.document);
  assert.throws(
    () => store.addConstraint('ik', { bones: [createBoneRef('bone_root'), createBoneRef('bone_root')], target: createControlRef('ctrl_hand') }),
    /parent-child/,
  );
  assert.equal(serializeVeyra(store.document), beforeKept, 'A failed add after a committed add must not roll back the committed add.');
  assert.equal(store.commandHistory.length, 1);

  console.log('✓ invalid-input atomicity for rig and asset creation');
}

// --- Undo / redo -----------------------------------------------------------------
{
  const store = new VeyraStore(buildRigDocument());
  const newBone = store.addBone({ name: 'Undoable', length: 60 });
  assert.equal(store.document.bones.length, 3);
  assert.equal(store.undo(), true);
  assert.equal(store.document.bones.length, 2);
  assert.equal(store.selectedId, null);
  assert.equal(store.redo(), true);
  assert.equal(store.document.bones.length, 3);
  assert.equal(store.document.bones.at(-1).id, newBone, 'Redo must restore the same created object.');

  const assets = new VeyraStore(buildRigDocument());
  const assetId = assets.addAsset('font', { name: 'Face', mimeType: 'font/woff2', source: { kind: 'external', uri: 'https://example.com/f.woff2' } });
  assert.equal(assets.removeAsset(assetId), true);
  assert.equal(assets.document.assets.length, 1);
  assert.equal(assets.undo(), true);
  assert.equal(assets.document.assets.length, 2, 'Undo must restore a removed asset.');
  assert.equal(assets.redo(), true);
  assert.equal(assets.document.assets.length, 1);

  assert.equal(assets.removeBone('missing_bone'), false);
  assert.equal(assets.removeMesh('missing_mesh'), false);
  assert.equal(assets.removeControl('missing_control'), false);
  assert.equal(assets.removeConstraint('missing_cst'), false);
  assert.equal(assets.removeAsset('missing_asset'), false);

  console.log('✓ undo/redo and missing-id safety for rig and asset commands');
}

// --- Cascade removal parity with removeSelection ----------------------------------
// Timestamps are stamped at execute time, so parity compares the canonical
// document with createdAt/updatedAt excluded.
function canonicalBody(store) {
  const value = JSON.parse(serializeVeyra(store.document));
  delete value.createdAt;
  delete value.updatedAt;
  return JSON.stringify(value);
}

function parityFor(kind, id) {
  const viaSelection = new VeyraStore(buildRigDocument());
  viaSelection.select({ kind, id });
  assert.equal(viaSelection.removeSelection(), true, `removeSelection must remove the selected ${kind}.`);

  const remover = { bone: 'removeBone', mesh: 'removeMesh', control: 'removeControl', constraint: 'removeConstraint' }[kind];
  const direct = new VeyraStore(buildRigDocument());
  assert.equal(direct[remover](id), true, `${remover} must remove the ${kind}.`);

  assert.equal(
    canonicalBody(viaSelection),
    canonicalBody(direct),
    `${kind} removal must match removeSelection exactly (modulo execution timestamps).`,
  );
  assert.equal(viaSelection.commandHistory.at(-1).label, direct.commandHistory.at(-1).label);
  return direct;
}

{
  const afterRoot = parityFor('bone', 'bone_root');
  assert.equal(afterRoot.document.bones.length, 0, 'Removing a root bone must cascade to descendant bones.');
  assert.ok(afterRoot.document.meshes[0].vertices.every((vertex) => vertex.weights.length === 0), 'All mesh weights on removed bones must be cleared.');
  assert.equal(afterRoot.document.constraints.length, 0, 'Every constraint referencing the removed chain must be removed.');
  assert.equal(afterRoot.document.controls.length, 1);
  assert.equal(afterRoot.document.nodes.length, 1);

  const afterChild = parityFor('bone', 'bone_child');
  assert.deepEqual(afterChild.document.bones.map((bone) => bone.id), ['bone_root']);
  assert.deepEqual(
    afterChild.document.meshes[0].vertices.map((vertex) => vertex.weights.map((weight) => referenceId(weight.bone, 'bone'))),
    [['bone_root'], ['bone_root'], []],
    'Weights on surviving bones must survive child-bone removal.',
  );
  assert.equal(afterChild.document.constraints.length, 0);

  const afterControl = parityFor('control', 'ctrl_hand');
  assert.equal(afterControl.document.controls.length, 0);
  assert.deepEqual(afterControl.document.constraints.map((constraint) => constraint.id), ['cst_rot'], 'Only constraints targeting the control must go.');
  assert.equal(afterControl.document.bones.length, 2);

  const afterMesh = parityFor('mesh', 'mesh_skin');
  assert.equal(afterMesh.document.meshes.length, 0);
  assert.equal(afterMesh.document.bones.length, 2);
  assert.equal(afterMesh.document.constraints.length, 3);

  const afterConstraint = parityFor('constraint', 'cst_ik');
  assert.deepEqual(afterConstraint.document.constraints.map((constraint) => constraint.id), ['cst_dist', 'cst_rot']);

  const selected = new VeyraStore(buildRigDocument());
  selected.select({ kind: 'control', id: 'ctrl_hand' });
  assert.equal(selected.removeBone('bone_root'), true);
  assert.equal(selected.selectedId, null, 'Direct removal must clear the selection like removeSelection.');
  assert.equal(selected.selectedKind, null);

  console.log('✓ cascade removal parity between remove* and removeSelection');
}

console.log('veyra store tests passed');
