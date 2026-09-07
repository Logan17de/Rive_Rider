import assert from 'node:assert/strict';
import { createDocument, createGradientStop, createKeyframe, createMesh, createNode, createStateMachine, createTimeline, createTrack, normalizeDocument, gradientStopById, keyframeById, machineConditionById, meshVertexById } from '../src/veyra/model.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';

function documentWithTimeline(overrides = {}) {
  const node = createNode('rectangle', { id: 'identity_node', name: 'Human Name' });
  const timeline = createTimeline({
    id: 'identity_timeline',
    name: 'Timeline Name',
    tracks: [createTrack('node:identity_node/transform/x', {
      id: 'identity_track',
      keyframes: [
        createKeyframe({ id: 'identity_keyframe', frame: 0, value: 0 }),
        createKeyframe({ id: 'identity_keyframe_2', frame: 10, value: 10 }),
      ],
    })],
  });
  return normalizeDocument(createDocument({
    id: 'identity_document',
    name: 'Document Name',
    nodes: [node],
    timelines: [timeline],
    ...overrides,
  }));
}

const paintNode = createNode('rectangle', {
  id: 'paint_node',
  paint: {
    fill: {
      type: 'linearGradient',
      stops: [createGradientStop({ id: 'paint_stop_a', offset: 0 }), createGradientStop({ id: 'paint_stop_b', offset: 1 })],
    },
  },
});
const mesh = createMesh({ id: 'identity_mesh', vertices: [
  { id: 'identity_vertex_a', x: 0, y: 0, weights: [] },
  { id: 'identity_vertex_b', x: 10, y: 0, weights: [] },
  { id: 'identity_vertex_c', x: 0, y: 10, weights: [] },
], triangles: [['identity_vertex_a', 'identity_vertex_b', 'identity_vertex_c']] });
const identityDocument = normalizeDocument(createDocument({
  id: 'paint_document',
  nodes: [paintNode],
  meshes: [mesh],
}));
assert.equal(gradientStopById(identityDocument, 'paint_stop_a').id, 'paint_stop_a');
assert.equal(meshVertexById(identityDocument, 'identity_vertex_b').id, 'identity_vertex_b');

const document = documentWithTimeline();
const originalKeyframe = keyframeById(document, 'identity_keyframe');
assert.ok(originalKeyframe, 'keyframe lookup uses its persistent id');
originalKeyframe.frame = 42;
const moved = normalizeDocument(document);
assert.equal(keyframeById(moved, 'identity_keyframe').frame, 42);
assert.equal(keyframeById(moved, 'identity_keyframe').id, 'identity_keyframe', 'moving a keyframe preserves its id');
const editStore = new VeyraStore(moved);
editStore.setKeyframe({ timelineId: 'identity_timeline', address: 'node:identity_node/transform/x', frame: 42, value: 99 });
assert.equal(keyframeById(editStore.document, 'identity_keyframe').value, 99, 'editing a keyframe retains its id');

const roundTrip = parseVeyra(serializeVeyra(moved));
assert.equal(keyframeById(roundTrip, 'identity_keyframe').id, 'identity_keyframe', 'serialize/load preserves keyframe ids');
assert.equal(serializeVeyra(roundTrip), serializeVeyra(moved), 'identity round-trip is canonical and deterministic');

const legacy = createDocument({
  id: 'legacy_document',
  nodes: [createNode('rectangle', { id: 'legacy_node' })],
  timelines: [{
    id: 'legacy_timeline',
    name: 'Legacy',
    duration: 20,
    fps: 30,
    loop: 'none',
    workStart: 0,
    workEnd: 20,
    tracks: [{
      id: 'legacy_track',
      address: 'node:legacy_node/transform/x',
      keyframes: [{ frame: 2, value: 10, easing: 'linear' }],
    }],
  }],
});
const migrated = normalizeDocument(legacy);
const migratedId = migrated.timelines[0].tracks[0].keyframes[0].id;
assert.match(migratedId, /^keyframe_legacy_track_0$/);
const migratedAgain = parseVeyra(serializeVeyra(migrated));
assert.equal(migratedAgain.timelines[0].tracks[0].keyframes[0].id, migratedId, 'legacy id remains after first save/load');

const renamedTimeline = normalizeDocument({
  ...moved,
  timelines: moved.timelines.map((timeline) => ({ ...timeline, name: 'Renamed Timeline' })),
});
assert.equal(renamedTimeline.timelines[0].id, 'identity_timeline');
assert.equal(renamedTimeline.timelines[0].tracks[0].id, 'identity_track');
assert.equal(keyframeById(renamedTimeline, 'identity_keyframe').id, 'identity_keyframe');

const machine = createStateMachine({
  id: 'identity_machine',
  name: 'Machine Name',
  inputs: [{ id: 'identity_input', name: 'Input Name', type: 'number', value: 0 }],
  states: [
    { id: 'identity_state_a', name: 'State A', timeline: 'identity_timeline' },
    { id: 'identity_state_b', name: 'State B', timeline: 'identity_timeline' },
  ],
  transitions: [{
    id: 'identity_transition',
    from: 'identity_state_a',
    to: 'identity_state_b',
    conditions: [{ id: 'identity_condition', input: 'identity_input', op: '>', value: 1 }],
  }],
});
const machineDocument = normalizeDocument(createDocument({
  id: 'machine_document',
  nodes: [createNode('rectangle', { id: 'machine_node' })],
  timelines: [createTimeline({ id: 'identity_timeline' })],
  stateMachines: [machine],
}));
const renamedMachine = normalizeDocument({
  ...machineDocument,
  stateMachines: machineDocument.stateMachines.map((candidate) => ({
    ...candidate,
    name: 'Renamed Machine',
    inputs: candidate.inputs.map((input) => ({ ...input, name: 'Renamed Input' })),
    states: candidate.states.map((state) => ({ ...state, name: `Renamed ${state.id}` })),
  })),
});
const renamedTransition = renamedMachine.stateMachines[0].transitions[0];
assert.equal(renamedTransition.from.id, 'identity_state_a');
assert.equal(renamedTransition.to.id, 'identity_state_b');
assert.equal(renamedTransition.conditions[0].input.id, 'identity_input');
assert.equal(machineConditionById(renamedMachine, 'identity_machine', 'identity_condition').id, 'identity_condition');

const listenerDocument = normalizeDocument(createDocument({
  id: 'listener_document',
  nodes: [createNode('rectangle', { id: 'listener_node', name: 'Before Rename' })],
  listeners: [{ id: 'identity_listener', kind: 'pointer', event: 'pointerdown', action: 'play', target: 'listener_node', timeline: 'identity_timeline' }],
  timelines: [createTimeline({ id: 'identity_timeline' })],
}));
const renamedListenerDocument = normalizeDocument({
  ...listenerDocument,
  nodes: [{ ...listenerDocument.nodes[0], name: 'After Rename' }],
});
assert.equal(renamedListenerDocument.listeners[0].target.id, 'listener_node', 'node rename preserves listener target ref');

assert.throws(() => normalizeDocument(createDocument({
  id: 'duplicate_document',
  nodes: [createNode('rectangle', { id: 'same_node' }), createNode('ellipse', { id: 'same_node' })],
})), /Duplicate node id same_node/);
assert.throws(() => normalizeDocument(createDocument({
  id: 'duplicate_keyframes',
  nodes: [createNode('rectangle', { id: 'duplicate_node' })],
  timelines: [createTimeline({ id: 'duplicate_timeline', tracks: [createTrack('node:duplicate_node/transform/x', {
    id: 'duplicate_track',
    keyframes: [createKeyframe({ id: 'same_keyframe', frame: 0 }), createKeyframe({ id: 'same_keyframe', frame: 1 })],
  })] })],
})), /Duplicate keyframe id same_keyframe/);

const manifestDocument = normalizeDocument({
  ...renamedTimeline,
  stateMachines: renamedMachine.stateMachines,
});
const manifest = createProjectManifest(manifestDocument);
const manifestTimeline = manifest.timelines.find((candidate) => candidate.ref.id === 'identity_timeline');
const manifestKeyframe = manifestTimeline.tracks[0].keyframes.find((candidate) => candidate.ref.id === 'identity_keyframe');
assert.equal(manifestKeyframe.ref.kind, 'keyframe');
assert.equal(manifestKeyframe.ref.id, 'identity_keyframe');
assert.equal(keyframeById(manifestDocument, manifestKeyframe.ref.id).id, manifestKeyframe.ref.id);
assert.equal(manifest.scene.stateMachines[0].ref.kind, 'stateMachine');
assert.equal(manifest.scene.stateMachines[0].transitions[0].conditions[0].ref.kind, 'machineCondition');

console.log('veyra stable identity tests passed');
