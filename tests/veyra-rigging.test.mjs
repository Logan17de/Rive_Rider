import assert from 'node:assert/strict';
import {
  cloneValue,
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createMesh,
  createNode,
  normalizeDocument,
} from '../src/veyra/model.js';
import { evaluateDocument, propertySource } from '../src/veyra/evaluation.js';
import { rigPropertyAddress, readProperty } from '../src/veyra/properties.js';
import {
  createBoneRef,
  createControlRef,
  createMeshVertexRef,
  createNodeRef,
  referenceId,
} from '../src/veyra/references.js';
import { mirrorMeshWeights, normalizeMeshWeights } from '../src/veyra/rigging.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { VeyraStore } from '../src/veyra/store.js';

const near = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

const upper = createBone({
  id: 'bone_upper',
  name: 'Upper Arm',
  length: 100,
  rest: { x: 100, y: 100 },
});
const forearm = createBone({
  id: 'bone_forearm',
  name: 'Forearm',
  parent: createBoneRef(upper.id),
  length: 80,
  rest: { x: 100, y: 0 },
});
const handTarget = createControl({
  id: 'control_hand',
  name: 'Hand Target',
  position: { x: 240, y: 170 },
});
const armMeshVertices = [
  { id: 'meshVertex_shoulder', x: 100, y: 96, weights: [{ bone: createBoneRef(upper.id), value: 1 }] },
  { id: 'meshVertex_elbow', x: 200, y: 96, weights: [{ bone: createBoneRef(upper.id), value: 0.5 }, { bone: createBoneRef(forearm.id), value: 0.5 }] },
  { id: 'meshVertex_hand', x: 280, y: 104, weights: [{ bone: createBoneRef(forearm.id), value: 1 }] },
];
const armMesh = createMesh({
  id: 'mesh_arm',
  name: 'Weighted Arm',
  vertices: armMeshVertices,
  triangles: [[0, 1, 2].map((index) => createMeshVertexRef(armMeshVertices[index].id))],
});
const ik = createConstraint('ik', {
  id: 'constraint_hand_ik',
  name: 'Hand IK',
  bones: [createBoneRef(upper.id), createBoneRef(forearm.id)],
  target: createControlRef(handTarget.id),
});
const arm = normalizeDocument(createDocument({
  id: 'document_arm',
  name: 'Golden IK Arm',
  bones: [upper, forearm],
  meshes: [armMesh],
  controls: [handTarget],
  constraints: [ik],
}));

const armScene = evaluateDocument(arm);
const evaluatedForearm = armScene.bones.find((bone) => bone.id === forearm.id);
near(evaluatedForearm.end.x, handTarget.position.x);
near(evaluatedForearm.end.y, handTarget.position.y);
assert.equal(armScene.diagnostics.constraints[0].status, 'solved');
near(armScene.diagnostics.constraints[0].error, 0);
assert.equal(arm.bones[0].pose.rotation, 0, 'IK evaluation must not bake into authored pose values.');
assert.equal(arm.bones[1].pose.rotation, 0, 'IK evaluation must preserve the authored child pose.');
assert.equal(armScene.diagnostics.unweightedVertices, 0);
assert.equal(armScene.diagnostics.nonNormalizedVertices, 0);
assert.equal(armScene.diagnostics.maxInfluences, 2);

const rotationBone = createBone({
  id: 'bone_skin',
  rest: { x: 100, y: 100 },
  pose: { rotation: Math.PI / 2 },
});
const skinVertices = [
  { id: 'meshVertex_a', x: 200, y: 100, weights: [{ bone: createBoneRef(rotationBone.id), value: 1 }] },
  { id: 'meshVertex_b', x: 200, y: 110, weights: [{ bone: createBoneRef(rotationBone.id), value: 1 }] },
  { id: 'meshVertex_c', x: 190, y: 100, weights: [{ bone: createBoneRef(rotationBone.id), value: 1 }] },
];
const skinMesh = createMesh({
  id: 'mesh_skin',
  vertices: skinVertices,
  triangles: [[0, 1, 2].map((index) => createMeshVertexRef(skinVertices[index].id))],
});
const skinScene = evaluateDocument(createDocument({ bones: [rotationBone], meshes: [skinMesh] }));
const rotatedVertex = skinScene.meshes[0].deformedVertices[0];
near(rotatedVertex.x, 100);
near(rotatedVertex.y, 200);

const weightDocument = createDocument({
  bones: [
    createBone({ id: 'bone_arm.L', name: 'Arm.L' }),
    createBone({ id: 'bone_arm.R', name: 'Arm.R', rest: { x: 20 } }),
  ],
  meshes: [createMesh({
    id: 'mesh_weights',
    vertices: [
      { id: 'meshVertex_left', x: -10, y: 0, weights: [{ bone: createBoneRef('bone_arm.L'), value: 0.25 }] },
      { id: 'meshVertex_right', x: 10, y: 0, weights: [{ bone: createBoneRef('bone_arm.R'), value: 0.8 }] },
      { id: 'meshVertex_center', x: 0, y: 10, weights: [] },
    ],
    triangles: [],
  })],
});
assert.equal(evaluateDocument(weightDocument).diagnostics.nonNormalizedVertices, 2);
assert.equal(normalizeMeshWeights(weightDocument, 'mesh_weights'), 2);
near(weightDocument.meshes[0].vertices[0].weights[0].value, 1);
assert.equal(mirrorMeshWeights(weightDocument, 'mesh_weights', [['bone_arm.L', 'bone_arm.R']]), 1);
const mirroredWeight = weightDocument.meshes[0].vertices[1].weights[0];
assert.equal(referenceId(mirroredWeight.bone, 'bone'), 'bone_arm.R');
near(mirroredWeight.value, 1);

const targetBone = createBone({
  id: 'bone_target',
  rest: { x: 250, y: 100 },
  pose: { rotation: 0.5, scaleX: 2, scaleY: 1.5 },
});
for (const type of ['rotation', 'scale', 'transform']) {
  const driven = createBone({ id: `bone_${type}`, rest: { x: 20, y: 30 } });
  const constraint = createConstraint(type, {
    id: `constraint_${type}`,
    bone: createBoneRef(driven.id),
    target: createBoneRef(targetBone.id),
  });
  const scene = evaluateDocument(createDocument({ bones: [targetBone, driven], constraints: [constraint] }));
  const evaluated = scene.bones.find((bone) => bone.id === driven.id);
  assert.equal(scene.diagnostics.constraints[0].status, 'solved');
  if (['rotation', 'transform'].includes(type)) near(evaluated.pose.rotation, 0.5);
  if (['scale', 'transform'].includes(type)) {
    near(evaluated.pose.scaleX, 2);
    near(evaluated.pose.scaleY, 1.5);
  }
  if (type === 'transform') {
    near(evaluated.start.x, 250);
    near(evaluated.start.y, 100);
  }
}

const distanceBone = createBone({ id: 'bone_distance' });
const distanceTarget = createControl({ id: 'control_distance', position: { x: 30, y: 40 } });
const distanceScene = evaluateDocument(createDocument({
  bones: [distanceBone],
  controls: [distanceTarget],
  constraints: [createConstraint('distance', {
    id: 'constraint_distance',
    bone: createBoneRef(distanceBone.id),
    target: createControlRef(distanceTarget.id),
    distance: 100,
  })],
}));
near(Math.hypot(distanceScene.bones[0].start.x - 30, distanceScene.bones[0].start.y - 40), 100);

const guide = createNode('path', {
  id: 'node_guide',
  transform: { x: 50, y: 60 },
  geometry: {
    closed: false,
    vertices: [
      { id: 'vertex_guide_a', x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
      { id: 'vertex_guide_b', x: 100, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
    ],
  },
});
const pathBone = createBone({ id: 'bone_path' });
const pathScene = evaluateDocument(createDocument({
  nodes: [guide],
  bones: [pathBone],
  constraints: [createConstraint('path', {
    id: 'constraint_path',
    bone: createBoneRef(pathBone.id),
    path: createNodeRef(guide.id),
    position: 0.5,
  })],
}));
near(pathScene.bones[0].start.x, 100);
near(pathScene.bones[0].start.y, 60);

const poseAddress = rigPropertyAddress('bone', upper.id, 'pose.rotation');
const layeredScene = evaluateDocument(arm, { interactive: { [poseAddress]: 0.25 } });
assert.equal(propertySource(layeredScene, poseAddress), 'interactive');
assert.equal(readProperty(arm, poseAddress), 0);

const summary = createSceneSummary(arm);
assert.deepEqual(summary.document.rig, { boneCount: 2, meshCount: 1, controlCount: 1, constraintCount: 1 });
assert.equal(summary.rig.meshes[0].vertices, undefined);
assert.equal(createSceneSummary(arm, { includeGeometry: true }).rig.meshes[0].vertices.length, 3);

const cycle = cloneValue(arm);
cycle.bones[0].parent = createBoneRef(cycle.bones[1].id);
assert.throws(() => normalizeDocument(cycle), /cycle/i);
const danglingWeight = cloneValue(arm);
danglingWeight.meshes[0].vertices[0].weights[0].bone = createBoneRef('bone_missing');
assert.throws(() => normalizeDocument(danglingWeight), /weight targets missing bone/);
const badIk = cloneValue(arm);
badIk.constraints[0].bones.reverse();
assert.throws(() => normalizeDocument(badIk), /parent-child chain/);

const rigStore = new VeyraStore(arm);
rigStore.select(createBoneRef(upper.id));
assert.equal(rigStore.selectedBone.id, upper.id);
rigStore.removeSelection();
assert.equal(rigStore.document.bones.length, 0, 'Deleting a parent bone must remove its subtree.');
assert.equal(rigStore.document.constraints.length, 0, 'Deleting a bone must remove dependent constraints.');
assert.equal(rigStore.document.meshes[0].vertices.every((vertex) => vertex.weights.length === 0), true);

console.log('veyra rigging tests passed');
