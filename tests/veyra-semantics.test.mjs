import assert from 'node:assert/strict';
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
