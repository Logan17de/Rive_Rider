import assert from 'node:assert/strict';
import {
  createDocument, createNode, createTimeline, createTrack, createKeyframe,
  createStateMachine, normalizeDocument,
} from '../src/veyra/model.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

const ref = (kind, id) => ({ kind, id });
const artboard = () => ({ id: 'art', name: 'Art', x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });
function timeline(id, address, value) {
  return createTimeline({ id, duration: 30, fps: 30, loop: 'none', tracks: [createTrack(address, {
    id: `track_${id}`, keyframes: [
      createKeyframe({ id: `kf_${id}_0`, frame: 0, value, easing: 'linear' }),
      createKeyframe({ id: `kf_${id}_1`, frame: 30, value, easing: 'linear' }),
    ],
  })] });
}
function docFor(machine) {
  const box = createNode('rectangle', { id: 'box', opacity: 1 });
  const address = nodePropertyAddress('box', 'opacity');
  return normalizeDocument(createDocument({
    id: 'random_doc', artboards: [artboard()], nodes: [box], stateMachines: [machine],
    timelines: [timeline('hub_t', address, 0.1), timeline('a_t', address, 0.4), timeline('b_t', address, 0.8), timeline('c_t', address, 0.6)],
  }));
}
function randomMachine(overrides = {}) {
  return createStateMachine({ id: 'random_machine', inputs: [{ id: 'enabled', name: 'Enabled', type: 'bool', value: true }], layers: [{
    id: 'layer', initial: 'hub', states: [
      { id: 'hub', type: 'animation', timeline: 'hub_t', randomizeExit: true },
      { id: 'a', type: 'animation', timeline: 'a_t' },
      { id: 'b', type: 'animation', timeline: 'b_t' },
      { id: 'c', type: 'animation', timeline: 'c_t' },
    ], transitions: [
      { id: 'to_a', from: 'hub', to: 'a', duration: 0, randomWeight: 3, conditions: [{ id: 'a_on', input: 'enabled', op: '==', value: true }] },
      { id: 'to_b', from: 'hub', to: 'b', duration: 0, randomWeight: 1, conditions: [{ id: 'b_on', input: 'enabled', op: '==', value: true }] },
      { id: 'to_c', from: 'hub', to: 'c', duration: 0, randomWeight: 2, conditions: [{ id: 'c_on', input: 'enabled', op: '==', value: false }] },
      { id: 'a_back', from: 'a', to: 'hub', duration: 0 },
      { id: 'b_back', from: 'b', to: 'hub', duration: 0 },
      { id: 'c_back', from: 'c', to: 'hub', duration: 0 },
    ],
  }], ...overrides });
}
function choices(runtime, count) {
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const events = runtime.step(0.01);
    const start = events.find(event => event.type === 'transition-start' && event.fromId === 'hub');
    if (start) out.push(start.transitionId);
    if (runtime.stateId !== 'hub') runtime.step(0.01);
  }
  return out;
}

// Same authored machine + same seed yields byte-stable choices; different seed diverges.
{
  const doc = docFor(randomMachine());
  const a = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 12345 });
  const b = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 12345 });
  const c = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 54321 });
  const seqA = choices(a, 24);
  const seqB = choices(b, 24);
  const seqC = choices(c, 24);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every(id => ['to_a', 'to_b'].includes(id)), 'ineligible weighted path must never be selected');
  assert.equal(a.stats.randomDecisions, 24);
}

// Weighted selection is reproducible and honors relative weight over a long deterministic replay.
{
  const doc = docFor(randomMachine());
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 7 });
  const seq = choices(runtime, 600);
  const a = seq.filter(id => id === 'to_a').length;
  const b = seq.filter(id => id === 'to_b').length;
  assert.equal(a + b, 600);
  assert.ok(a > b * 2 && a < b * 4, `3:1 weighting should be reflected deterministically, got ${a}:${b}`);
}

// A single eligible path does not burn RNG state; choice begins only when a real weighted decision exists.
{
  const machine = randomMachine();
  machine.layers[0].transitions.find(t => t.id === 'to_b').conditions[0].value = false;
  machine.transitions = machine.layers[0].transitions;
  const doc = docFor(machine);
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 12345 });
  let events = runtime.step(0.01);
  assert.equal(events.find(event => event.type === 'transition-start')?.transitionId, 'to_a');
  assert.equal(runtime.stats.randomDecisions, 0);
  runtime.step(0.01); // a -> hub
  runtime.setInput('enabled', false);
  events = runtime.step(0.01);
  assert.ok(events.find(event => event.type === 'transition-start')?.transitionId === 'to_b' || events.find(event => event.type === 'transition-start')?.transitionId === 'to_c');
  assert.equal(runtime.stats.randomDecisions, 1, 'two eligible paths should consume one deterministic random decision');
}

// reset()/scrub restart the seed contract; fork() clones the current PRNG position.
{
  const doc = docFor(randomMachine());
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 2026 });
  const first = choices(runtime, 12);
  runtime.reset();
  assert.deepEqual(choices(runtime, 12), first, 'reset must replay from the configured seed');
  runtime.reset();
  choices(runtime, 5);
  const fork = runtime.fork();
  assert.deepEqual(choices(runtime, 10), choices(fork, 10), 'fork must clone the current PRNG state');
}

// Random selection never depends on global Math.random and exposes replay evidence on the chosen transition.
{
  const doc = docFor(randomMachine());
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 99 });
  const old = Math.random;
  Math.random = () => { throw new Error('global RNG must not be used'); };
  try {
    const events = runtime.step(0.01);
    const start = events.find(event => event.type === 'transition-start' && event.fromId === 'hub');
    assert.ok(start.randomDecision);
    assert.equal(start.randomDecision.seed, 99);
    assert.equal(start.randomDecision.candidates.length, 2);
    assert.equal(start.randomDecision.selected, start.transitionId);
    assert.ok(start.randomDecision.sample >= 0 && start.randomDecision.sample < 1);
  } finally {
    Math.random = old;
  }
}

// Only the selected transition's lifecycle action runs.
{
  const machine = randomMachine();
  machine.layers[0].transitions.find(t => t.id === 'to_a').actions = [{ id: 'a_action', type: 'emit', phase: 'transition-start', event: 'a' }];
  machine.layers[0].transitions.find(t => t.id === 'to_b').actions = [{ id: 'b_action', type: 'emit', phase: 'transition-start', event: 'b' }];
  machine.transitions = machine.layers[0].transitions;
  const doc = docFor(machine);
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 11 });
  const events = runtime.step(0.01);
  const start = events.find(event => event.type === 'transition-start' && event.fromId === 'hub');
  const actions = events.filter(event => event.type === 'machine-action');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].actionId, start.transitionId === 'to_a' ? 'a_action' : 'b_action');
}

// Non-random states retain authored first-match behavior and do not advance the PRNG.
{
  const machine = randomMachine();
  machine.layers[0].states.find(state => state.id === 'hub').randomizeExit = false;
  machine.states = machine.layers[0].states;
  const doc = docFor(machine);
  const runtime = createMachineRuntime(() => doc, 'random_machine', { randomSeed: 1 });
  const events = runtime.step(0.01);
  assert.equal(events.find(event => event.type === 'transition-start')?.transitionId, 'to_a');
  assert.equal(runtime.stats.randomDecisions, 0);
}

// Canonical authoring rejects invalid weights and invalid seeds.
{
  let machine = randomMachine();
  machine.layers[0].transitions[0].randomWeight = 0;
  machine.transitions = machine.layers[0].transitions;
  assert.throws(() => docFor(machine), /randomWeight|positive/i);

  machine = randomMachine();
  machine.layers[0].transitions[0].randomWeight = Infinity;
  machine.transitions = machine.layers[0].transitions;
  assert.throws(() => docFor(machine), /randomWeight|finite/i);

  const doc = docFor(randomMachine());
  assert.throws(() => createMachineRuntime(() => doc, 'random_machine', { randomSeed: -1 }), /randomSeed|unsigned/i);
  assert.throws(() => createMachineRuntime(() => doc, 'random_machine', { randomSeed: 1.5 }), /randomSeed|integer/i);
}

console.log('Veyra M9 deterministic Randomize Exit tests passed');
