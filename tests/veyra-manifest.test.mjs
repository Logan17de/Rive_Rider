import assert from 'node:assert/strict';
import {
  createAsset,
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createMachineCondition,
  createMachineInput,
  createMachineState,
  createMachineTransition,
  createMesh,
  createNode,
  createPointerListener,
  createStateMachine,
  createTimeline,
  VEYRA_MACHINE_INPUT_TYPES,
} from '../src/veyra/model.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { createProjectManifest as createProjectManifestPublic } from '../src/index.js';
import { createReference } from '../src/veyra/references.js';

function createManifestFixture() {
  const timeline = createTimeline({ id: 'timeline_bob', name: 'Bob Timeline', duration: 60, fps: 30 });
  const input = createMachineInput({ id: 'input_hover', name: 'Hover', type: 'trigger' });
  const stateA = createMachineState({ id: 'state_a', name: 'Idle', timeline: createReference('timeline', timeline.id) });
  const stateB = createMachineState({ id: 'state_b', name: 'Active', timeline: createReference('timeline', timeline.id) });
  const transition = createMachineTransition({
    id: 'transition_ab',
    from: createReference('machineState', stateA.id),
    to: createReference('machineState', stateB.id),
    conditions: [createMachineCondition({ id: 'condition_hover', input: createReference('machineInput', input.id), op: 'fired' })],
  });
  const machine = createStateMachine({
    id: 'machine_bob', name: 'Bob Machine', initial: createReference('machineState', stateA.id),
    inputs: [input], states: [stateA, stateB], transitions: [transition],
  });
  return createDocument({
    id: 'manifest_fixture',
    name: 'Manifest Fixture',
    artboards: [{ id: 'art_main', name: 'Main', x: 0, y: 0, width: 960, height: 640, background: '#fff7fc' }],
    nodes: [createNode('rectangle', { id: 'node_rect', name: 'Rect' })],
    assets: [
      createAsset('image', { id: 'asset_image', name: 'Image', source: { kind: 'external', uri: 'image.png' } }),
      createAsset('font', { id: 'asset_font', name: 'Font', mimeType: 'font/woff2', source: { kind: 'external', uri: 'font.woff2' } }),
    ],
    bones: [createBone({ id: 'bone_root', name: 'Root' })],
    meshes: [createMesh({ id: 'mesh_main', name: 'Mesh' })],
    controls: [createControl({ id: 'control_main', name: 'Control' })],
    constraints: [createConstraint('distance', { id: 'constraint_main', name: 'Distance', bone: createReference('bone', 'bone_root'), target: createReference('control', 'control_main') })],
    timelines: [timeline],
    stateMachines: [machine],
    listeners: [createPointerListener({ id: 'listener_hover', event: 'pointerdown', target: createReference('node', 'node_rect'), action: 'fire', machine: createReference('stateMachine', 'machine_bob'), input: createReference('machineInput', 'input_hover') })],
  });
}

const document = createManifestFixture();
const manifest = createProjectManifest(document);
const publicManifest = createProjectManifestPublic(document);
assert.deepEqual(publicManifest, manifest, 'Public manifest export must share the canonical implementation.');
assert.equal(manifest.format, 'veyra-manifest');
assert.equal(manifest.version, 3);
assert.deepEqual(manifest.document.ref, { kind: 'document', id: document.id });
assert.equal(manifest.document.name, document.name);
assert.equal(manifest.document.counts.nodes, 1);
assert.equal(manifest.document.counts.assets, 2);
assert.equal(manifest.document.counts.timelines, 1);
assert.equal(manifest.document.counts.stateMachines, 1);
assert.equal(manifest.document.counts.listeners, 1);
assert.equal(manifest.assets.length, 2);
assert.equal(manifest.timelines.length, 1);
assert.equal(manifest.stateMachines.length, 1);
assert.equal(manifest.listeners.length, 1);

// Asset data contract.
const image = manifest.assets.find((asset) => asset.ref.id === 'asset_image');
assert.equal(image.type, 'image');
assert.equal(image.source.kind, 'external');
assert.equal(image.source.uri, 'image.png');
assert.equal(image.source.data, undefined);
const withData = createProjectManifest(document, { includeAssetData: true });
assert.deepEqual(
  withData.assets.find((asset) => asset.ref.id === 'asset_image').source,
  image.source,
  'includeAssetData must not change external asset sources.',
);

const font = manifest.assets.find((asset) => asset.ref.id === 'asset_font');
assert.equal(font.type, 'font');
assert.deepEqual(font.capabilities.writable, ['name', 'mimeType', 'source.uri']);

// --- State machines -------------------------------------------------------------
assert.equal(manifest.stateMachines.length, 1);
const machine = manifest.stateMachines[0];
assert.deepEqual(machine.ref, { kind: 'stateMachine', id: 'machine_bob' });
assert.equal(machine.name, 'Bob Machine');
assert.deepEqual(machine.initial, { kind: 'machineState', id: 'state_a' });
assert.deepEqual(machine.inputs[0].ref, { kind: 'machineInput', id: 'input_hover' });
assert.equal(machine.inputs[0].type, 'trigger');
assert.deepEqual(machine.states[0].timeline, { kind: 'timeline', id: 'timeline_bob' });
assert.deepEqual(machine.capabilities.inputTypes, [...VEYRA_MACHINE_INPUT_TYPES]);
assert.deepEqual(machine.capabilities.graph, [
  'set-name', 'set-initial', 'add-layer', 'update-layer', 'remove-layer', 'reorder-layer',
  'add-input', 'remove-input', 'update-input',
  'add-state', 'update-state', 'remove-state',
  'add-transition', 'update-transition', 'remove-transition',
]);
assert.deepEqual(machine.capabilities.runtime, ['set-input', 'fire', 'step', 'scrub', 'reset', 'evaluate']);
assert.deepEqual(
  machine,
  { ...manifest.scene.stateMachines[0], capabilities: machine.capabilities },
  'Annotated machines must extend the scene summary machines unchanged.',
);

// --- Action schema --------------------------------------------------------------
const actions = manifest.actions;
assert.ok(actions.length >= 114, 'Action catalog must grow additively.');
const actionIds = actions.map((item) => item.ref.id);
assert.equal(new Set(actionIds).size, actionIds.length, 'Action ids must be unique.');
for (const item of actions) {
  assert.equal(item.ref.kind, 'action');
  assert.ok(item.command);
  assert.ok(item.description);
}

console.log('veyra manifest tests passed');
