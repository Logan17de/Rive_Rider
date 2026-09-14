import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createKeyframe, createStateMachine, normalizeDocument } from '../src/veyra/model.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

const ref = (kind, id) => ({ kind, id });
function timeline(id, address, from, to) {
  return createTimeline({ id, duration: 30, fps: 30, loop: 'none', tracks: [createTrack(address, { id: `track_${id}`, keyframes: [
    createKeyframe({ id: `kf_${id}_0`, frame: 0, value: from, easing: 'linear' }),
    createKeyframe({ id: `kf_${id}_1`, frame: 30, value: to, easing: 'linear' }),
  ] })] });
}
function fixture() {
  const box = createNode('rectangle', { id: 'box', opacity: .1, transform: { x: 0, y: 0 } });
  const opacity = nodePropertyAddress('box', 'opacity');
  const x = nodePropertyAddress('box', 'transform/x');
  const timelines = [timeline('base_opacity', opacity, .2, .4), timeline('top_opacity', opacity, .6, .8), timeline('move_x', x, 10, 30), timeline('reverse_x', x, 100, 200)];
  const machine = createStateMachine({ id: 'machine', name: 'Layered', layers: [
    { id: 'base', name: 'Base', order: 0, enabled: true, initial: 'base_state', states: [{ id: 'base_state', name: 'BaseState', type: 'animation', timeline: 'base_opacity' }], transitions: [] },
    { id: 'top', name: 'Top', order: 1, enabled: true, initial: 'top_state', states: [{ id: 'top_state', name: 'TopState', type: 'animation', timeline: 'top_opacity' }], transitions: [] },
    { id: 'motion', name: 'Motion', order: 2, enabled: true, initial: 'move_state', states: [{ id: 'move_state', name: 'Move', type: 'animation', timeline: 'move_x', speed: 1 }], transitions: [] },
  ] });
  const doc = normalizeDocument(createDocument({ id: 'doc', nodes: [box], timelines, stateMachines: [machine] }));
  return { doc, opacity, x };
}

{
  const { doc, opacity, x } = fixture();
  const runtime = createMachineRuntime(() => doc, 'machine');
  const initial = runtime.evaluate();
  assert.equal(initial.layers.length, 3);
  assert.equal(initial.layers[0].stateId, 'base_state');
  assert.equal(initial.layers[1].stateId, 'top_state');
  assert.equal(initial.overrides[opacity], .6);
  assert.equal(initial.overrides[x], 10);
  assert.deepEqual(initial.ownership[opacity].map(item => item.layer.id), ['base', 'top']);
  assert.equal(initial.ownership[opacity].at(-1).effective, true);
  runtime.step(.5);
  const half = runtime.evaluate();
  assert.equal(half.overrides[opacity], .7);
  assert.equal(half.overrides[x], 20);
  assert.equal(half.stats.activeLayers, 3);
}

{
  const { doc, opacity } = fixture();
  doc.stateMachines[0].layers.find(layer => layer.id === 'top').enabled = false;
  const runtime = createMachineRuntime(() => doc, 'machine');
  const out = runtime.evaluate();
  assert.equal(out.overrides[opacity], .2);
  assert.equal(out.stats.inactiveLayers, 1);
  assert.ok(!out.ownership[opacity].some(item => item.layer.id === 'top'));
}

{
  const { doc, opacity } = fixture();
  const machine = doc.stateMachines[0];
  const base = machine.layers.find(layer => layer.id === 'base');
  const top = machine.layers.find(layer => layer.id === 'top');
  base.order = 1; top.order = 0; machine.layers = [top, base, machine.layers.find(layer => layer.id === 'motion')];
  const runtime = createMachineRuntime(() => doc, 'machine');
  assert.equal(runtime.evaluate().overrides[opacity], .2);
}

{
  const { doc, x } = fixture();
  const machine = doc.stateMachines[0];
  machine.layers = [{ id: 'reverse', name: 'Reverse', order: 0, enabled: true, initial: ref('machineState', 'rev'), states: [
    { id: 'rev', name: 'Reverse', type: 'animation', timeline: ref('timeline', 'reverse_x'), speed: -1, graph: { x: 0, y: 0 } },
  ], transitions: [], graph: { x: 0, y: 0 } }];
  machine.compatibilityLayer = ref('machineLayer', 'reverse'); machine.states = machine.layers[0].states; machine.transitions = []; machine.initial = ref('machineState', 'rev');
  const normalized = normalizeDocument(doc);
  const runtime = createMachineRuntime(() => normalized, 'machine');
  assert.equal(runtime.evaluate().overrides[x], 200);
  runtime.step(.5);
  assert.equal(runtime.evaluate().overrides[x], 150);
}

{
  const { doc } = fixture();
  const machine = doc.stateMachines[0];
  machine.layers = [{ id: 'pseudo', name: 'Pseudo', order: 0, enabled: true, initial: ref('machineState', 'entry'), states: [
    { id: 'entry', name: 'Entry', type: 'entry', graph: { x: 0, y: 0 } },
    { id: 'any', name: 'Any', type: 'any', graph: { x: 0, y: 0 } },
    { id: 'play', name: 'Play', type: 'animation', timeline: ref('timeline', 'move_x'), speed: 1, graph: { x: 0, y: 0 } },
    { id: 'exit', name: 'Exit', type: 'exit', graph: { x: 0, y: 0 } },
  ], transitions: [
    { id: 'entry_play', from: ref('machineState', 'entry'), to: ref('machineState', 'play'), duration: 0, after: null, conditions: [] },
    { id: 'any_exit', from: ref('machineState', 'any'), to: ref('machineState', 'exit'), duration: 0, after: .25, conditions: [] },
  ], graph: { x: 0, y: 0 } }];
  machine.compatibilityLayer = ref('machineLayer', 'pseudo'); machine.states = machine.layers[0].states; machine.transitions = machine.layers[0].transitions; machine.initial = ref('machineState', 'entry');
  const normalized = normalizeDocument(doc);
  const runtime = createMachineRuntime(() => normalized, 'machine');
  assert.equal(runtime.evaluate().layers[0].stateId, 'play');
  runtime.step(.3);
  assert.equal(runtime.evaluate().layers[0].stateId, null);
}

{
  const { doc } = fixture();
  const runtime = createMachineRuntime(() => doc, 'machine');
  const before = runtime.evaluate();
  const fork = runtime.fork();
  fork.step(.5);
  assert.equal(runtime.evaluate().layers[0].stateTime, before.layers[0].stateTime);
  assert.notEqual(fork.evaluate().layers[0].stateTime, runtime.evaluate().layers[0].stateTime);
}

console.log('Veyra M9 layered runtime / pseudo-state / reverse-speed tests passed');
