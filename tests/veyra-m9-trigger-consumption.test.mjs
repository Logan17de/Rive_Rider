import assert from 'node:assert/strict';
import {
  createDocument,
  createNode,
  createTimeline,
  createTrack,
  createKeyframe,
  createStateMachine,
  normalizeDocument,
} from '../src/veyra/model.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

const ref = (kind, id) => ({ kind, id });
const data = (instance, property) => ({ kind: 'data', instance: ref('viewModelInstance', instance), path: [ref('dataProperty', property)] });
const artboard = () => ({ id: 'art', name: 'Art', x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });

function timeline(id, address, value) {
  return createTimeline({ id, duration: 30, fps: 30, loop: 'none', tracks: [createTrack(address, {
    id: `track_${id}`, keyframes: [
      createKeyframe({ id: `kf_${id}_0`, frame: 0, value, easing: 'linear' }),
      createKeyframe({ id: `kf_${id}_1`, frame: 30, value, easing: 'linear' }),
    ],
  })] });
}

function dataDoc(machine) {
  const box = createNode('rectangle', { id: 'box', opacity: 1 });
  const opacity = nodePropertyAddress('box', 'opacity');
  const timelines = [timeline('idle', opacity, 0.2), timeline('active', opacity, 0.8)];
  return normalizeDocument(createDocument({
    id: 'trigger_doc', artboards: [artboard()], nodes: [box], timelines, stateMachines: [machine],
    viewModels: [{ id: 'vm', name: 'VM', properties: [
      { id: 'pulse', name: 'Pulse', type: 'trigger' },
      { id: 'ready', name: 'Ready', type: 'boolean', defaultValue: false },
    ] }],
    viewModelInstances: [{ id: 'inst', name: 'Instance', viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', 'art') }],
  }));
}

function singleLayerMachine({ id = 'machine', conditions, after = null, exitTime = null } = {}) {
  return createStateMachine({ id, layers: [{ id: 'layer', initial: 'idle_state', states: [
    { id: 'idle_state', type: 'animation', timeline: 'idle' },
    { id: 'active_state', type: 'animation', timeline: 'active' },
  ], transitions: [{ id: 'go', from: 'idle_state', to: 'active_state', duration: 0,
    ...(after == null ? {} : { after }), ...(exitTime == null ? {} : { exitTime }), conditions }] }] });
}

// A queued M8 trigger used by a losing candidate is conserved.
{
  const machine = singleLayerMachine({ conditions: [
    { id: 'pulse_cond', source: data('inst', 'pulse'), op: 'fired' },
    { id: 'ready_cond', source: data('inst', 'ready'), op: '==', value: true },
  ] });
  const doc = dataDoc(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  dataRuntime.fire('inst', 'pulse');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'idle_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true, 'failed candidate must conserve its pulse');
  dataRuntime.setValue('inst', 'ready', true);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), false, 'selected transition consumes exactly one pulse');
  assert.equal(runtime.stats.triggerPulsesConsumed, 1);
}

// after / Exit Time gates do not spend the queued event before eligibility.
{
  const machine = singleLayerMachine({
    after: 0.25,
    exitTime: { unit: 'seconds', value: 0.5 },
    conditions: [{ id: 'pulse_cond', source: data('inst', 'pulse'), op: 'fired' }],
  });
  const doc = dataDoc(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  dataRuntime.fire('inst', 'pulse');
  runtime.step(0.25);
  assert.equal(runtime.stateId, 'idle_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true);
  runtime.step(0.24);
  assert.equal(runtime.stateId, 'idle_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), false);
}

// M8 queues are count-preserving: one selected transition spends one event only.
{
  const machine = singleLayerMachine({ conditions: [{ id: 'pulse_cond', source: data('inst', 'pulse'), op: 'fired' }] });
  const doc = dataDoc(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  dataRuntime.fire('inst', 'pulse');
  dataRuntime.fire('inst', 'pulse');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true, 'second queued pulse must remain after one transition');
  assert.equal(dataRuntime.stats.triggerPulsesConsumed, 1);
}

// Duplicate fired conditions for the same data endpoint consume only one queued pulse.
{
  const machine = singleLayerMachine({ conditions: [
    { id: 'pulse_a', source: data('inst', 'pulse'), op: 'fired' },
    { id: 'pulse_b', source: data('inst', 'pulse'), op: 'fired' },
  ] });
  const doc = dataDoc(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  dataRuntime.fire('inst', 'pulse');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), false);
  assert.equal(dataRuntime.stats.triggerPulsesConsumed, 1);
}

// Legacy machine triggers preserve their settled one-step broadcast compatibility contract.
{
  const machine = createStateMachine({ id: 'legacy', inputs: [
    { id: 'go_input', name: 'Go', type: 'trigger' },
    { id: 'ready_input', name: 'Ready', type: 'bool', value: false },
  ], layers: [{ id: 'layer', initial: 'idle_state', states: [
    { id: 'idle_state', type: 'animation', timeline: 'idle' },
    { id: 'active_state', type: 'animation', timeline: 'active' },
  ], transitions: [{ id: 'go', from: 'idle_state', to: 'active_state', duration: 0, conditions: [
    { id: 'fire', input: 'go_input', op: 'fired' },
    { id: 'ready', input: 'ready_input', op: '==', value: true },
  ] }] }] });
  const doc = dataDoc(machine);
  const runtime = createMachineRuntime(() => doc, 'legacy');
  runtime.fire('go_input');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'idle_state');
  assert.equal(runtime.inputs.find(input => input.id === 'go_input').value, false, 'legacy trigger clears after the step even when candidate loses');
  runtime.setInput('ready_input', true);
  runtime.fire('go_input');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
}

// A legacy one-step trigger broadcasts across simultaneously evaluated layers.
{
  const machine = createStateMachine({ id: 'legacy_layers', inputs: [{ id: 'go_input', name: 'Go', type: 'trigger' }], layers: [
    { id: 'layer_a', order: 0, initial: 'a0', states: [
      { id: 'a0', type: 'animation', timeline: 'idle' }, { id: 'a1', type: 'animation', timeline: 'active' },
    ], transitions: [{ id: 'a_go', from: 'a0', to: 'a1', duration: 0, conditions: [{ id: 'a_fire', input: 'go_input', op: 'fired' }] }] },
    { id: 'layer_b', order: 1, initial: 'b0', states: [
      { id: 'b0', type: 'animation', timeline: 'idle' }, { id: 'b1', type: 'animation', timeline: 'active' },
    ], transitions: [{ id: 'b_go', from: 'b0', to: 'b1', duration: 0, conditions: [{ id: 'b_fire', input: 'go_input', op: 'fired' }] }] },
  ] });
  const doc = dataDoc(machine);
  const runtime = createMachineRuntime(() => doc, 'legacy_layers');
  runtime.fire('go_input');
  runtime.step(0.01);
  const layers = Object.fromEntries(runtime.layers.map(layer => [layer.layer.id, layer.stateId]));
  assert.equal(layers.layer_a, 'a1');
  assert.equal(layers.layer_b, 'b1');
}

// M8 event queues are deterministic across ordered layers: one pulse wakes one layer,
// while two queued pulses allow both layers to transition in the same step.
{
  const machine = createStateMachine({ id: 'data_layers', layers: [
    { id: 'layer_a', order: 0, initial: 'a0', states: [
      { id: 'a0', type: 'animation', timeline: 'idle' }, { id: 'a1', type: 'animation', timeline: 'active' },
    ], transitions: [{ id: 'a_go', from: 'a0', to: 'a1', duration: 0, conditions: [{ id: 'a_fire', source: data('inst', 'pulse'), op: 'fired' }] }] },
    { id: 'layer_b', order: 1, initial: 'b0', states: [
      { id: 'b0', type: 'animation', timeline: 'idle' }, { id: 'b1', type: 'animation', timeline: 'active' },
    ], transitions: [{ id: 'b_go', from: 'b0', to: 'b1', duration: 0, conditions: [{ id: 'b_fire', source: data('inst', 'pulse'), op: 'fired' }] }] },
  ] });
  const doc = dataDoc(machine);

  const oneData = createVeyraDataRuntime(() => doc);
  const one = createMachineRuntime(() => doc, 'data_layers', { dataRuntime: oneData });
  oneData.fire('inst', 'pulse');
  one.step(0.01);
  let layers = Object.fromEntries(one.layers.map(layer => [layer.layer.id, layer.stateId]));
  assert.equal(layers.layer_a, 'a1');
  assert.equal(layers.layer_b, 'b0');

  const twoData = createVeyraDataRuntime(() => doc);
  const two = createMachineRuntime(() => doc, 'data_layers', { dataRuntime: twoData });
  twoData.fire('inst', 'pulse');
  twoData.fire('inst', 'pulse');
  two.step(0.01);
  layers = Object.fromEntries(two.layers.map(layer => [layer.layer.id, layer.stateId]));
  assert.equal(layers.layer_a, 'a1');
  assert.equal(layers.layer_b, 'b1');
  assert.equal(twoData.getValue('inst', 'pulse'), false);
}

// Forked machine observation spends only its private M8 trigger queue.
{
  const machine = singleLayerMachine({ conditions: [{ id: 'pulse_cond', source: data('inst', 'pulse'), op: 'fired' }] });
  const doc = dataDoc(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  dataRuntime.fire('inst', 'pulse');
  const fork = runtime.fork();
  fork.step(0.01);
  assert.equal(fork.stateId, 'active_state');
  assert.equal(runtime.stateId, 'idle_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true, 'fork must not spend the live queue');
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.equal(dataRuntime.getValue('inst', 'pulse'), false);
}

console.log('Veyra M9 exact data-trigger consumption tests passed');
