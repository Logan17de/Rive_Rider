import assert from 'node:assert/strict';
import {
  createDocument,
  createKeyframe,
  createMachineLayer,
  createNode,
  createTimeline,
  createTrack,
  machineLayerById,
  machineLayers,
  normalizeDocument,
} from '../src/veyra/model.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { VeyraStore } from '../src/veyra/store.js';
import { dispatchVeyraCommand } from '../src/veyra/commands.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { createVeyraManifest } from '../src/veyra/manifest.js';
import { buildSemanticIndex } from '../src/veyra/resolver.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

const ref = (kind, id) => ({ kind, id });
const constantTimeline = (id, address, value) => createTimeline({
  id,
  name: id,
  duration: 60,
  fps: 30,
  tracks: [createTrack(address, {
    id: `${id}_track`,
    keyframes: [createKeyframe({ id: `${id}_key`, frame: 0, value })],
  })],
});

function fixture() {
  const node = createNode('rectangle', { id: 'layer_box', opacity: 0.4 });
  const address = nodePropertyAddress(node.id, 'opacity');
  const timelines = [
    constantTimeline('base_idle', address, 0.2),
    constantTimeline('base_active', address, 0.4),
    constantTimeline('overlay_idle', address, 0.8),
    constantTimeline('overlay_active', address, 1),
  ];
  const layer = (id, idle, active, overrides = {}) => ({
    id,
    name: id,
    enabled: true,
    weight: 1,
    initial: ref('machineState', `${id}_idle`),
    states: [
      { id: `${id}_idle`, name: 'Idle', type: 'animation', timeline: ref('timeline', idle) },
      { id: `${id}_active`, name: 'Active', type: 'animation', timeline: ref('timeline', active) },
    ],
    transitions: [{
      id: `${id}_go`,
      from: ref('machineState', `${id}_idle`),
      to: ref('machineState', `${id}_active`),
      duration: 0,
      conditions: [{ id: `${id}_condition`, input: ref('machineInput', 'go'), op: 'fired' }],
    }],
    ...overrides,
  });
  const document = normalizeDocument(createDocument({
    id: 'layer_document',
    nodes: [node],
    timelines,
    stateMachines: [{
      id: 'layer_machine',
      name: 'Layer Machine',
      inputs: [{ id: 'go', name: 'Go', type: 'trigger', value: false }],
      layers: [
        layer('base', 'base_idle', 'base_active'),
        layer('overlay', 'overlay_idle', 'overlay_active', { weight: 0.5 }),
      ],
    }],
  }));
  return { document, address };
}

// Legacy root graphs migrate to one stable layer while root reads remain valid.
{
  const node = createNode('rectangle', { id: 'legacy_box' });
  const address = nodePropertyAddress(node.id, 'opacity');
  const timeline = constantTimeline('legacy_timeline', address, 0.5);
  const raw = createDocument({
    id: 'legacy_document',
    nodes: [node],
    timelines: [timeline],
    stateMachines: [{
      id: 'legacy_machine',
      name: 'Legacy',
      initial: ref('machineState', 'legacy_state'),
      inputs: [],
      states: [{ id: 'legacy_state', name: 'Legacy', type: 'animation', timeline: ref('timeline', timeline.id) }],
      transitions: [],
    }],
  });
  const first = normalizeDocument(raw);
  const second = normalizeDocument(raw);
  const machine = first.stateMachines[0];
  assert.equal(machine.layers.length, 1);
  assert.equal(machine.layers[0].id, second.stateMachines[0].layers[0].id);
  assert.equal(machine.layers[0].ref?.kind, undefined, 'records do not embed redundant refs');
  assert.deepEqual(machine.states, machine.layers[0].states);
  assert.deepEqual(machine.transitions, machine.layers[0].transitions);
  assert.deepEqual(machine.initial, machine.layers[0].initial);
  assert.deepEqual(parseVeyra(serializeVeyra(first)).stateMachines, first.stateMachines);
}

// Layer validation is strict: ids are global and transitions cannot cross layers.
{
  const { document } = fixture();
  const raw = JSON.parse(serializeVeyra(document));
  raw.stateMachines[0].layers[1].states[0].id = 'base_idle';
  assert.throws(() => normalizeDocument(raw), /Duplicate machine state id/);

  const cross = JSON.parse(serializeVeyra(document));
  cross.stateMachines[0].layers[1].transitions[0].to = ref('machineState', 'base_active');
  assert.throws(() => normalizeDocument(cross), /same layer|missing machine state/);
}

// All layers sample one trigger before it is consumed; later layers have priority.
{
  const { document, address } = fixture();
  const runtime = createMachineRuntime(() => document, 'layer_machine');
  const initial = runtime.evaluate();
  assert.equal(initial.layers.length, 2);
  assert.equal(initial.overrides[address], 0.5, 'overlay weight blends over the base value');

  runtime.fire('go');
  const events = runtime.step(1 / 60);
  assert.equal(events.filter((event) => event.type === 'transition-end').length, 2);
  const active = runtime.evaluate();
  assert.deepEqual(active.layers.map((layer) => layer.stateId), ['base_active', 'overlay_active']);
  assert.equal(active.overrides[address], 0.7);
  assert.equal(runtime.inputs.find((input) => input.id === 'go').value, false);
}

// Disabled layers freeze, then resume from the same clock when enabled.
{
  const { document } = fixture();
  document.stateMachines[0].layers[1].enabled = false;
  const runtime = createMachineRuntime(() => document, 'layer_machine');
  runtime.step(0.25);
  assert.deepEqual(runtime.evaluate().layers.map((layer) => layer.stateTime), [0.25, 0]);
  document.stateMachines[0].layers[1].enabled = true;
  runtime.step(0.25);
  assert.deepEqual(runtime.evaluate().layers.map((layer) => layer.stateTime), [0.5, 0.25]);
}

// Layer authoring is transactional, undoable, order-preserving and addressable by id.
{
  const { document } = fixture();
  const store = new VeyraStore(document);
  const added = dispatchVeyraCommand(store, {
    action: 'addMachineLayer',
    args: { machineId: 'layer_machine', overrides: { id: 'effects', name: 'Effects', enabled: false, weight: 0.25 } },
  });
  assert.equal(added.ok, true);
  assert.equal(machineLayerById(store.document, 'layer_machine', 'effects').weight, 0.25);
  assert.equal(store.undo(), true);
  assert.equal(machineLayerById(store.document, 'layer_machine', 'effects'), null);
  assert.equal(store.redo(), true);
  assert.equal(store.reorderMachineLayer('layer_machine', 'effects', 0), true);
  assert.deepEqual(machineLayers(store.document.stateMachines[0]).map((layer) => layer.id), ['effects', 'base', 'overlay']);
  assert.equal(store.updateMachineLayer('layer_machine', 'effects', { enabled: true, weight: 0.75, name: 'Renamed' }), true);
  assert.equal(machineLayerById(store.document, 'layer_machine', 'effects').weight, 0.75);
  assert.equal(store.removeMachineLayer('layer_machine', 'effects'), true);
}

// The AI surfaces expose stable typed layer refs and layer-aware capabilities.
{
  const { document } = fixture();
  const summary = createSceneSummary(document).stateMachines[0];
  assert.deepEqual(summary.layers.map((layer) => layer.ref), [ref('machineLayer', 'base'), ref('machineLayer', 'overlay')]);
  assert.ok(summary.capabilities.graph.includes('add-layer'));
  const manifest = createVeyraManifest(document);
  assert.deepEqual(manifest.scene.stateMachines[0].layers[1].ref, ref('machineLayer', 'overlay'));
  assert.equal(manifest.authoringContract.machineLayer.identity, 'stable machineLayer ref; display name and order are advisory');
  const indexed = buildSemanticIndex(document).entities.find((entity) => entity.ref.kind === 'machineLayer' && entity.ref.id === 'overlay');
  assert.equal(indexed.relationships.some((relation) => relation.relation === 'owner' && relation.target.id === 'layer_machine'), true);
}

// Public constructor keeps stable ids and normalized layer defaults.
{
  const layer = createMachineLayer({ id: 'constructed', name: 'Constructed' });
  assert.deepEqual(layer, {
    id: 'constructed', name: 'Constructed', enabled: true, weight: 1, initial: null, states: [], transitions: [],
  });
}

console.log('M9-C1 layered machine contract: 7 groups passed');
