import assert from 'node:assert';
import {
  createDocument,
  createKeyframe,
  createMachineInput,
  createMachineState,
  createMachineTransition,
  createStateMachine,
  createNode,
  createStarterDocument,
  createTimeline,
  createTrack,
  machineById,
  normalizeDocument,
} from '../src/veyra/model.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { evaluateTimeline, evaluateTimelines } from '../src/veyra/animation.js';
import { evaluateDocument, propertySource } from '../src/veyra/evaluation.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { VeyraStore } from '../src/veyra/store.js';

console.log('Testing Veyra state machine system...');

function fixtureDocument() {
  const node = createNode('rectangle', {
    name: 'Box',
    geometry: { width: 100, height: 40, cornerRadius: 0 },
  });
  const idle = createTimeline({
    name: 'Idle',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'geometry/width'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 100, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 200, easing: 'linear' }),
        ],
      }),
    ],
  });
  const active = createTimeline({
    name: 'Active',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'geometry/width'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 300, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 400, easing: 'linear' }),
        ],
      }),
    ],
  });
  const doc = normalizeDocument(createDocument({
    name: 'Machine Fixture',
    nodes: [node],
    timelines: [idle, active],
  }));
  return { doc, node, idle, active };
}

// Test: document defaults and legacy normalization
{
  const legacy = createDocument({ name: 'Legacy' });
  delete legacy.stateMachines;
  const normalized = normalizeDocument(legacy);
  assert.deepStrictEqual(normalized.stateMachines, []);

  const withMachines = createDocument({ name: 'With', stateMachines: [] });
  assert.deepStrictEqual(withMachines.stateMachines, []);

  console.log('✓ document defaults and legacy normalization');
}

// Test: machine input/condition/state/transition creators
{
  const number = createMachineInput({ name: 'Speed', type: 'number', value: 2 });
  assert.strictEqual(number.type, 'number');
  assert.strictEqual(number.value, 2);

  const bool = createMachineInput({ name: 'On', type: 'bool', value: 1 });
  assert.strictEqual(bool.value, true);

  const trigger = createMachineInput({ name: 'Tap', type: 'trigger' });
  assert.strictEqual(trigger.type, 'trigger');
  assert.strictEqual(trigger.value, false);

  assert.throws(() => createMachineInput({ type: 'string' }), /Unsupported machine input type/);

  const state = createMachineState({ name: 'Idle', timeline: 'timeline_x' });
  assert.deepStrictEqual(state.timeline, { kind: 'timeline', id: 'timeline_x' });
  assert.throws(() => createMachineState({ name: 'NoTimeline' }), /timeline reference/);
  assert.throws(() => createMachineState({ name: 'Weird', type: 'entry' }), /Unsupported machine state type/);

  const transition = createMachineTransition({
    from: 's1',
    to: 's2',
    duration: 0.25,
    after: 1,
    conditions: [{ input: 'Speed', op: '>', value: 0.5 }],
  });
  assert.strictEqual(transition.from.id, 's1');
  assert.strictEqual(transition.after, 1);
  assert.strictEqual(transition.conditions[0].value, 0.5);
  assert.throws(() => createMachineTransition({ from: 's1', to: 's1' }), /same state/);
  assert.throws(() => createMachineTransition({ from: 's1', to: 's2', duration: -1 }), /zero or positive/);
  assert.throws(() => createMachineTransition({ from: 's1', to: 's2', after: -1 }), /zero or positive/);
  assert.throws(
    () => createMachineTransition({ from: 's1', to: 's2', conditions: [{ input: 'x', op: '~>' }] }),
    /operator/
  );
  assert.throws(
    () => createMachineTransition({ from: 's1', to: 's2', conditions: [{ input: 'x', op: '==' }] }),
    /value is required/
  );

  console.log('✓ machine input/condition/state/transition creators');
}

// Test: full machine normalizes through the document
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Button',
    initial: 'state_idle',
    inputs: [
      { id: 'in_hover', name: 'Hover', type: 'trigger' },
      { id: 'in_speed', name: 'Speed', type: 'number', value: 0 },
    ],
    states: [
      { id: 'state_idle', name: 'Idle', timeline: idle.id },
      { id: 'state_active', name: 'Active', timelineId: active.id },
    ],
    transitions: [
      {
        id: 'tr_hover',
        from: 'state_idle',
        to: 'state_active',
        duration: 0.5,
        conditions: [{ id: 'cond_hover', input: 'in_hover', op: 'fired' }],
      },
      {
        id: 'tr_speed',
        from: 'state_active',
        to: 'state_idle',
        duration: 0,
        conditions: [{ id: 'cond_speed', input: 'in_speed', op: '==', value: 0 }],
      },
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const result = normalized.stateMachines[0];
  assert.strictEqual(result.name, 'Button');
  assert.deepStrictEqual(result.initial, { kind: 'machineState', id: 'state_idle' });
  assert.strictEqual(result.states[1].timeline.id, active.id);
  assert.strictEqual(result.transitions[0].conditions[0].op, 'fired');
  assert.strictEqual(result.transitions[1].duration, 0);
  assert.strictEqual(result.transitions[1].after, null);

  console.log('✓ full machine normalizes through the document');
}

// Test: machine validation errors
{
  const { doc, idle } = fixtureDocument();
  const base = () => ({
    id: 'machine_a',
    name: 'M',
    inputs: [{ id: 'in_a', name: 'A', type: 'trigger' }],
    states: [
      { id: 's_a', name: 'A', timeline: idle.id },
      { id: 's_b', name: 'B', timeline: idle.id },
    ],
    transitions: [],
  });
  const normalize = (machines) => normalizeDocument({ ...doc, stateMachines: machines });

  assert.throws(() => normalize([{ ...base() }, { ...base() }]), /Duplicate state machine id/);
  assert.throws(() => normalize([{ ...base(), initial: 'missing' }]), /initial references missing/);
  assert.throws(() => normalize([{
    ...base(),
    states: [
      { id: 's_a', name: 'A', timeline: idle.id },
      { id: 's_b', name: 'B', timeline: idle.id },
      { id: 's_b', name: 'B2', timeline: idle.id },
    ],
  }]), /Duplicate machine state id/);
  assert.throws(() => normalize([{
    ...base(),
    states: [{ id: 's_a', name: 'A', timeline: 'timeline_missing' }],
  }]), /missing timeline/);
  assert.throws(() => normalize([{
    ...base(),
    transitions: [{ id: 't', from: 's_a', to: 's_missing', duration: 0 }],
  }]), /missing machine state/);
  assert.throws(() => normalize([{
    ...base(),
    transitions: [{ id: 't', from: 's_a', to: 's_a', duration: 0 }],
  }]), /same state/);
  assert.throws(() => normalize([{
    ...base(),
    transitions: [{ id: 't', from: 's_a', to: 's_b', duration: 0, conditions: [{ id: 'c', input: 'in_missing', op: 'fired' }] }],
  }]), /missing machine input/);
  assert.throws(() => normalize([{
    ...base(),
    inputs: [{ id: 'in_a', name: 'A', type: 'bool' }],
    transitions: [{ id: 't', from: 's_a', to: 's_b', duration: 0, conditions: [{ id: 'c', input: 'in_a', op: 'fired' }] }],
  }]), /requires a trigger input/);
  assert.throws(() => normalize([{
    ...base(),
    inputs: [
      { id: 'in_a', name: 'A', type: 'trigger' },
      { id: 'in_b', name: 'A', type: 'trigger' },
    ],
  }]), /Duplicate machine input name/);

  console.log('✓ machine validation errors');
}

// Test: runtime initial state and authored-time evaluation
{
  const { doc, idle } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Idle Machine',
    states: [
      createMachineState({ name: 'Idle', timeline: idle.id }),
      createMachineState({ name: 'Other', timeline: idle.id }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(() => normalized, machine.id);

  assert.strictEqual(runtime.stateId, machine.states[0].id);
  assert.strictEqual(runtime.stateTime, 0);
  const evalAt0 = runtime.evaluate();
  assert.strictEqual(evalAt0.stateName, 'Idle');
  assert.deepStrictEqual(evalAt0.overrides, evaluateTimeline(idle, 0));

  runtime.step(0.5);
  assert.strictEqual(runtime.stateTime, 0.5);
  assert.deepStrictEqual(runtime.evaluate().overrides, evaluateTimeline(idle, 0.5));

  console.log('✓ runtime initial state and authored-time evaluation');
}

// Test: explicit initial state
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Initial Machine',
    initial: 'state_active',
    states: [
      createMachineState({ id: 'state_idle', name: 'Idle', timeline: idle.id }),
      createMachineState({ id: 'state_active', name: 'Active', timeline: active.id }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);
  assert.strictEqual(runtime.stateId, 'state_active');

  console.log('✓ explicit initial state');
}

// Test: trigger fires transition, blends, completes, and consumes the trigger
{
  const { doc, node, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Hover',
    inputs: [createMachineInput({ name: 'Hover', type: 'trigger' })],
    states: [
      createMachineState({ name: 'Idle', timeline: idle.id }),
      createMachineState({ name: 'Hovered', timeline: active.id }),
    ],
  });
  machine.transitions.push(createMachineTransition({
    from: machine.states[0].id,
    to: machine.states[1].id,
    duration: 0.5,
    conditions: [{ input: 'Hover', op: 'fired' }],
  }));
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(() => normalized, machine.id);
  const address = nodePropertyAddress(node.id, 'geometry/width');

  assert.deepStrictEqual(runtime.step(0), []);

  assert.strictEqual(runtime.fire('Hover'), true);
  const startEvents = runtime.step(0.25);
  assert.strictEqual(startEvents.length, 1);
  assert.strictEqual(startEvents[0].type, 'transition-start');
  assert.strictEqual(startEvents[0].toId, machine.states[1].id);
  assert.strictEqual(runtime.stateId, machine.states[0].id);
  assert.strictEqual(runtime.transition.progress, 0);

  // Mid-blend (p=0.5): outgoing keeps playing at full state time, incoming
  // plays from its own elapsed time, and the two crossfade.
  //   out = Idle @0.5s (frame 15) = 150
  //   in  = Active @0.25s (frame 7.5) = 325
  //   lerp(150, 325, 0.5) = 237.5
  runtime.step(0.25);
  assert.strictEqual(runtime.transition.progress, 0.5);
  const mid = runtime.evaluate();
  assert.strictEqual(mid.overrides[address], 237.5);

  const endEvents = runtime.step(0.25);
  assert.strictEqual(endEvents.length, 1);
  assert.strictEqual(endEvents[0].type, 'transition-end');
  assert.strictEqual(runtime.stateId, machine.states[1].id);
  assert.strictEqual(runtime.transition, null);
  // The incoming timeline keeps its elapsed time after the blend.
  assert.strictEqual(runtime.stateTime, 0.5);
  assert.deepStrictEqual(runtime.evaluate().overrides, evaluateTimeline(active, 0.5));

  // The trigger was consumed by the step that used it.
  assert.strictEqual(runtime.inputs.find((input) => input.name === 'Hover').value, false);

  console.log('✓ trigger fires transition, blends, completes, and consumes the trigger');
}

// Test: zero-duration transition cuts immediately
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Cut',
    inputs: [createMachineInput({ name: 'Go', type: 'trigger' })],
    states: [
      createMachineState({ name: 'Idle', timeline: idle.id }),
      createMachineState({ name: 'Active', timeline: active.id }),
    ],
  });
  machine.transitions.push(createMachineTransition({
    from: machine.states[0].id,
    to: machine.states[1].id,
    duration: 0,
    conditions: [{ input: 'Go', op: 'fired' }],
  }));
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);
  runtime.fire('Go');
  const events = runtime.step(0.001);
  assert.deepStrictEqual(
    events.map((event) => event.type),
    ['transition-start', 'transition-end']
  );
  assert.strictEqual(runtime.stateId, machine.states[1].id);
  assert.strictEqual(runtime.stateTime, 0);

  console.log('✓ zero-duration transition cuts immediately');
}

// Test: number and boolean conditions
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Threshold',
    inputs: [
      createMachineInput({ name: 'Speed', type: 'number', value: 0 }),
      createMachineInput({ name: 'Locked', type: 'bool', value: false }),
    ],
    states: [
      createMachineState({ id: 's0', name: 'Base', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'Fast', timeline: active.id }),
      createMachineState({ id: 's2', name: 'Unlocked', timeline: idle.id }),
    ],
    transitions: [
      createMachineTransition({ from: 's0', to: 's1', duration: 0, conditions: [{ input: 'Speed', op: '>', value: 0.5 }] }),
      createMachineTransition({ from: 's1', to: 's2', duration: 0, conditions: [{ input: 'Locked', op: '==', value: true }] }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);

  runtime.setInput('Speed', 0.25);
  assert.deepStrictEqual(runtime.step(0.1), []);
  runtime.setInput('Speed', 0.75);
  assert.strictEqual(runtime.step(0.1).length, 2);
  assert.strictEqual(runtime.stateId, 's1');

  runtime.setInput('Locked', 'yes');
  assert.strictEqual(runtime.step(0.1).length, 2);
  assert.strictEqual(runtime.stateId, 's2');

  assert.throws(() => runtime.setInput('Speed', 'fast'), /finite number/);
  assert.throws(() => runtime.setInput('Missing', 1), /was not found/);

  console.log('✓ number and boolean conditions');
}

// Test: trigger single-shot and !fired conditions
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Latch',
    inputs: [createMachineInput({ name: 'Tap', type: 'trigger' })],
    states: [
      createMachineState({ id: 's0', name: 'A', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'B', timeline: active.id }),
      createMachineState({ id: 's2', name: 'C', timeline: idle.id }),
    ],
    transitions: [
      createMachineTransition({ from: 's0', to: 's1', duration: 0, conditions: [{ input: 'Tap', op: 'fired' }] }),
      createMachineTransition({ from: 's1', to: 's2', duration: 0, conditions: [{ input: 'Tap', op: '!fired' }] }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);

  // Idle: nothing fires without a tap.
  assert.deepStrictEqual(runtime.step(0.1), []);

  // A fired trigger (even armed twice) takes the first transition once.
  runtime.fire('Tap');
  runtime.fire('Tap');
  const first = runtime.step(0.1);
  assert.strictEqual(first[0].toId, 's1');
  assert.strictEqual(runtime.stateId, 's1');
  assert.strictEqual(runtime.inputs.find((input) => input.name === 'Tap').value, false);

  // The next step sees the consumed trigger, so !fired fires.
  const second = runtime.step(0.1);
  assert.strictEqual(second[0].toId, 's2');
  assert.strictEqual(runtime.stateId, 's2');

  assert.throws(() => runtime.fire('Nonexistent'), /was not found/);

  console.log('✓ trigger single-shot and !fired conditions');
}

// Test: after gating
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Gated',
    inputs: [createMachineInput({ name: 'Always', type: 'bool', value: true })],
    states: [
      createMachineState({ id: 's0', name: 'A', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'B', timeline: active.id }),
    ],
    transitions: [createMachineTransition({
      from: 's0',
      to: 's1',
      duration: 0,
      after: 0.5,
      conditions: [{ input: 'Always', op: '==', value: true }],
    })],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);

  assert.deepStrictEqual(runtime.step(0.2), []);
  assert.deepStrictEqual(runtime.step(0.2), []);
  assert.strictEqual(runtime.step(0.2).length, 2);
  assert.strictEqual(runtime.stateId, 's1');

  console.log('✓ after gating');
}

// Test: first eligible transition wins
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Order',
    inputs: [createMachineInput({ name: 'Always', type: 'bool', value: true })],
    states: [
      createMachineState({ id: 's0', name: 'A', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'B', timeline: active.id }),
      createMachineState({ id: 's2', name: 'C', timeline: idle.id }),
    ],
    transitions: [
      createMachineTransition({ from: 's0', to: 's1', duration: 0, conditions: [{ input: 'Always', op: '==', value: true }] }),
      createMachineTransition({ from: 's0', to: 's2', duration: 0, conditions: [{ input: 'Always', op: '==', value: true }] }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);
  assert.deepStrictEqual(runtime.step(0.1).map((event) => event.type), ['transition-start', 'transition-end']);
  assert.strictEqual(runtime.stateId, 's1');

  console.log('✓ first eligible transition wins');
}

// Test: chained transitions across steps
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Chain',
    inputs: [
      createMachineInput({ name: 'Go', type: 'trigger' }),
      createMachineInput({ name: 'Next', type: 'bool', value: false }),
    ],
    states: [
      createMachineState({ id: 's0', name: 'A', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'B', timeline: active.id }),
      createMachineState({ id: 's2', name: 'C', timeline: idle.id }),
    ],
    transitions: [
      createMachineTransition({ from: 's0', to: 's1', duration: 0, conditions: [{ input: 'Go', op: 'fired' }] }),
      createMachineTransition({ from: 's1', to: 's2', duration: 0, conditions: [{ input: 'Next', op: '==', value: true }] }),
    ],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);

  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, 's1');
  runtime.setInput('Next', true);
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, 's2');

  console.log('✓ chained transitions across steps');
}

// Test: reset and deterministic scrub
{
  const { doc, idle, active } = fixtureDocument();
  const makeMachine = () => createStateMachine({
    name: 'Scrub',
    inputs: [createMachineInput({ name: 'Always', type: 'bool', value: true })],
    states: [
      createMachineState({ id: 's0', name: 'A', timeline: idle.id }),
      createMachineState({ id: 's1', name: 'B', timeline: active.id }),
    ],
    transitions: [createMachineTransition({
      from: 's0',
      to: 's1',
      duration: 0.5,
      conditions: [{ input: 'Always', op: '==', value: true }],
    })],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [makeMachine()] });
  const machineId = normalized.stateMachines[0].id;
  const runtime = createMachineRuntime(() => normalized, machineId);

  // The transition starts when the condition is sampled, then blends for
  // its authored duration before the state actually switches.
  runtime.step(2);
  assert.strictEqual(runtime.stateId, 's0');
  assert.strictEqual(runtime.transition.progress, 0);
  runtime.step(0.5);
  assert.strictEqual(runtime.stateId, 's1');
  assert.strictEqual(runtime.stateTime, 0.5);

  runtime.reset();
  assert.strictEqual(runtime.stateId, 's0');
  assert.strictEqual(runtime.stateTime, 0);

  const scrubbed = runtime.scrub(1);
  // The always-true transition starts at stateTime 1.0 and has not finished.
  assert.strictEqual(scrubbed.stateId, 's0');
  assert.strictEqual(scrubbed.transition.progress, 0);

  // A fresh runtime driven with the same step sequence reaches the same state.
  const fresh = createMachineRuntime(() => normalized, machineId);
  fresh.step(1);
  assert.deepStrictEqual(fresh.evaluate(), scrubbed);

  assert.throws(() => runtime.step(-1), /non-negative/);
  assert.throws(() => runtime.step(Number.NaN), /finite/);

  console.log('✓ reset and deterministic scrub');
}

// Test: runtime tracks document edits through the store
{
  const fixture = fixtureDocument();
  const store = new VeyraStore(fixture.doc);
  const machineId = store.addStateMachine({
    name: 'Grown',
    inputs: [{ name: 'Go', type: 'trigger' }],
    states: [{ name: 'Idle', timeline: fixture.idle.id }],
  }, { label: 'Create machine', source: 'script' });
  const runtime = createMachineRuntime(() => store.document, machineId);
  assert.strictEqual(runtime.machine.states.length, 1);

  const liveBefore = machineById(store.document, machineId);
  const activeStateId = store.addMachineState(machineId, {
    name: 'Active',
    timeline: { kind: 'timeline', id: fixture.active.id },
  }, { label: 'Add state', source: 'script' });
  store.addMachineTransition(machineId, {
    from: liveBefore.states[0].id,
    to: activeStateId,
    duration: 0,
    conditions: [{ input: liveBefore.inputs[0].id, op: 'fired' }],
  }, { label: 'Add transition', source: 'script' });
  const liveAfter = machineById(store.document, machineId);
  assert.strictEqual(liveAfter.transitions[0].from.id, liveAfter.states[0].id);
  assert.strictEqual(liveAfter.transitions[0].conditions[0].input.id, liveAfter.inputs[0].id);

  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, activeStateId);
  // A zero-duration cut leaves the new state at time zero.
  assert.deepStrictEqual(
    runtime.evaluate().overrides,
    evaluateTimelines(store.document, [{ timelineId: fixture.active.id, time: 0, weight: 1 }])
  );

  console.log('✓ runtime tracks document edits through the store');
}

// Test: evaluated scene integration and ownership
{
  const { doc, node, idle } = fixtureDocument();
  const address = nodePropertyAddress(node.id, 'geometry/width');
  const machine = createStateMachine({
    name: 'Drive',
    states: [createMachineState({ name: 'Idle', timeline: idle.id })],
  });
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });
  const runtime = createMachineRuntime(normalized, machine.id);
  runtime.step(0.25);
  const scene = evaluateDocument(normalized, { animation: runtime.evaluate().overrides });
  const evaluatedNode = scene.nodes.find((candidate) => candidate.id === node.id);
  assert.strictEqual(evaluatedNode.geometry.width, 125);
  assert.strictEqual(propertySource(scene, address), 'animation');

  console.log('✓ evaluated scene integration and ownership');
}

// Test: store lifecycle, undo, and timeline deletion guard
{
  const { doc, idle } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Lifecycle',
    states: [
      { id: 's0', name: 'Idle', timeline: idle.id },
      { id: 's1', name: 'Active', timeline: idle.id },
    ],
    transitions: [{ id: 't0', from: 's0', to: 's1', duration: 0 }],
  }, { label: 'Create machine', source: 'script' });
  assert.strictEqual(machineById(store.document, machineId).states.length, 2);

  assert.strictEqual(store.undo(), true);
  assert.strictEqual(machineById(store.document, machineId), null);
  assert.strictEqual(store.redo(), true);
  assert.strictEqual(machineById(store.document, machineId).states.length, 2);

  assert.throws(() => store.removeTimeline(idle.id), /used by state machine/);

  assert.strictEqual(store.removeMachineState(machineId, 's1'), true);
  const afterRemove = machineById(store.document, machineId);
  assert.strictEqual(afterRemove.states.length, 1);
  assert.strictEqual(afterRemove.transitions.length, 0);

  assert.strictEqual(store.removeMachineState(machineId, 's_missing'), false);
  assert.strictEqual(store.removeMachineTransition(machineId, 't_missing'), false);
  assert.strictEqual(store.removeStateMachine(machineId), true);
  assert.strictEqual(store.document.stateMachines.length, 0);

  console.log('✓ store lifecycle, undo, and timeline deletion guard');
}

// Test: scene summary and serialization round-trip
{
  const { doc, idle, active } = fixtureDocument();
  const machine = createStateMachine({
    name: 'Summary Machine',
    inputs: [createMachineInput({ name: 'Hover', type: 'trigger' })],
    states: [
      createMachineState({ name: 'Idle', timeline: idle.id }),
      createMachineState({ name: 'Active', timeline: active.id }),
    ],
  });
  machine.transitions.push(createMachineTransition({
    from: machine.states[0].id,
    to: machine.states[1].id,
    duration: 0.2,
    conditions: [{ input: 'Hover', op: 'fired' }],
  }));
  const normalized = normalizeDocument({ ...doc, stateMachines: [machine] });

  const summary = createSceneSummary(normalized);
  assert.strictEqual(summary.stateMachines.length, 1);
  const [summaryMachine] = summary.stateMachines;
  assert.strictEqual(summaryMachine.name, 'Summary Machine');
  assert.strictEqual(summaryMachine.states[0].timeline.id, idle.id);
  assert.strictEqual(summaryMachine.transitions[0].conditions[0].op, 'fired');
  assert.strictEqual(summaryMachine.transitions[0].conditions[0].value, undefined);

  const roundTripped = parseVeyra(serializeVeyra(normalized));
  assert.deepStrictEqual(roundTripped.stateMachines, normalized.stateMachines);
  assert.deepStrictEqual(normalizeDocument(normalized).stateMachines, normalized.stateMachines);

  console.log('✓ scene summary and serialization round-trip');
}

// Test: end-to-end AI workflow — author a hover button and render it
// Mirrors the roadmap's "Create a button with hover state" example flow:
// an agent authors timelines, builds a machine from the summary, drives it,
// and renders the evaluated scene at each point.
{
  const node = createNode('rectangle', { name: 'Button', geometry: { width: 100, height: 40, cornerRadius: 8 } });
  const doc = normalizeDocument(createDocument({ name: 'AI Button', nodes: [node] }));
  const store = new VeyraStore(doc);
  const address = nodePropertyAddress(node.id, 'geometry/width');

  // Author the two animations.
  const idleId = store.addTimeline({ name: 'Idle', duration: 60, fps: 30, loop: 'loop' });
  store.setKeyframe({ timelineId: idleId, address, frame: 0, value: 100 });
  store.setKeyframe({ timelineId: idleId, address, frame: 30, value: 120 });
  const hoverId = store.addTimeline({ name: 'Hover', duration: 60, fps: 30, loop: 'loop' });
  store.setKeyframe({ timelineId: hoverId, address, frame: 0, value: 140 });
  store.setKeyframe({ timelineId: hoverId, address, frame: 30, value: 160 });

  // The AI perceives the scene through the summary.
  const summary = createSceneSummary(store.document);
  assert.strictEqual(summary.document.objectCount, 1);

  // Build the machine from stable timeline references.
  const machineId = store.addStateMachine({
    name: 'Button',
    inputs: [{ name: 'Hover', type: 'trigger' }],
    states: [
      { id: 'st_idle', name: 'Idle', timeline: idleId },
      { id: 'st_hover', name: 'Hovered', timeline: hoverId },
    ],
  });
  const machine = machineById(store.document, machineId);
  store.addMachineTransition(machineId, {
    from: 'st_idle',
    to: 'st_hover',
    duration: 0.25,
    conditions: [{ input: 'Hover', op: 'fired' }],
  });
  assert.strictEqual(machine.transitions.length, 1);

  const runtime = createMachineRuntime(() => store.document, machineId);
  const render = () => {
    const scene = evaluateDocument(store.document, { animation: runtime.evaluate().overrides });
    return renderSvgString(scene);
  };

  // Idle playback: Idle @0.5s (frame 15, t=0.5) → 110.
  runtime.step(0.5);
  assert.match(render(), /width="110"/);

  // Hover: the trigger arms a 0.25s blend.
  runtime.fire('Hover');
  runtime.step(0.25); // blend starts at stateTime 0.75
  runtime.step(0.125); // elapsed 0.125 → progress exactly 0.5
  assert.strictEqual(runtime.transition.progress, 0.5);
  // out = Idle @0.875s = 117.5, in = Hover @0.125s = 142.5 → lerp = 130.
  assert.match(render(), /width="130"/);
  runtime.step(0.125); // elapsed 0.25 → blend completes
  assert.strictEqual(runtime.stateId, 'st_hover');
  // Hover @0.25s (frame 7.5, t=0.25) → 145.
  assert.match(render(), /width="145"/);

  console.log('✓ end-to-end AI workflow: author timelines, build machine, render hover');
}

// Test: unknown machine and empty-machine runtime safety
{
  const starter = createStarterDocument();
  assert.throws(() => createMachineRuntime(starter, 'missing_machine'), /not found/);

  const doc = normalizeDocument(createDocument({ name: 'Empty' }));
  const machine = createStateMachine({ name: 'No States' });
  const withMachine = normalizeDocument({ ...doc, stateMachines: [machine] });
  const empty = createMachineRuntime(withMachine, machine.id);
  assert.strictEqual(empty.stateId, null);
  assert.deepStrictEqual(empty.step(1), []);
  assert.deepStrictEqual(empty.evaluate().overrides, {});
  assert.throws(() => empty.fire('Missing'), /was not found/);

  console.log('✓ unknown machine and empty-machine runtime safety');
}

console.log('\n✅ All Veyra state machine tests passed!');
