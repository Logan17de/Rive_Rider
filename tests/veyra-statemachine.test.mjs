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
import { dispatchVeyraCommand, VEYRA_COMMAND_ACTIONS } from '../src/veyra/commands.js';

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

// ===========================================================================
// 3B-1 A: normalize rejects the illegal operator/type matrix
// Contract: docs/VEYRA_INTERACTION_SURFACE.md "Operator/type integrity".
{
  const { doc, idle, active } = fixtureDocument();

  function machineRaw(inputType, inputValue, condition) {
    return normalizeDocument({
      ...doc,
      stateMachines: [{
        id: 'm_matrix',
        name: 'Matrix',
        initial: null,
        inputs: [{ id: 'in_gate', name: 'Gate', type: inputType, value: inputValue }],
        states: [
          { id: 'sA', name: 'A', type: 'animation', timeline: { kind: 'timeline', id: idle.id } },
          { id: 'sB', name: 'B', type: 'animation', timeline: { kind: 'timeline', id: active.id } },
        ],
        transitions: [{
          id: 't_gate',
          from: { kind: 'machineState', id: 'sA' },
          to: { kind: 'machineState', id: 'sB' },
          duration: 0,
          after: null,
          conditions: [condition],
        }],
      }],
    });
  }

  const gateRef = { kind: 'machineInput', id: 'in_gate' };

  // The repro from the debate: bool gated by ordering op loaded clean and the
  // loader silently rewrote an authored 0.5 into true. Must now throw.
  assert.throws(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '>', value: 0.5 }), /op '>/);
  assert.throws(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '>=', value: 1 }), /requires a number input/);
  assert.throws(() => machineRaw('trigger', false, { id: 'c1', input: gateRef, op: '<', value: 1 }), /trigger/);
  assert.throws(() => machineRaw('number', 0, { id: 'c1', input: gateRef, op: 'fired' }), /requires a trigger input/);
  assert.throws(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '!fired' }), /requires a trigger input/);
  assert.throws(() => machineRaw('trigger', false, { id: 'c1', input: gateRef, op: '==', value: true }), /comparison operator/);
  // No silent coercion: equality values must match the input's own type.
  assert.throws(() => machineRaw('number', 0, { id: 'c1', input: gateRef, op: '==', value: true }), /number value/);
  assert.throws(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '!=', value: 1 }), /boolean value/);
  assert.throws(() => machineRaw('number', 0, { id: 'c1', input: gateRef, op: '>' }), /value/);

  // The legal matrix stays legal.
  assert.doesNotThrow(() => machineRaw('number', 0, { id: 'c1', input: gateRef, op: '>', value: 0.5 }));
  assert.doesNotThrow(() => machineRaw('number', 0, { id: 'c1', input: gateRef, op: '==', value: 2 }));
  assert.doesNotThrow(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '==', value: true }));
  assert.doesNotThrow(() => machineRaw('bool', false, { id: 'c1', input: gateRef, op: '!=', value: false }));
  assert.doesNotThrow(() => machineRaw('trigger', false, { id: 'c1', input: gateRef, op: 'fired' }));
  assert.doesNotThrow(() => machineRaw('trigger', false, { id: 'c1', input: gateRef, op: '!fired' }));

  console.log('✓ 3B-1 normalize enforces the operator/type matrix');
}

// 3B-1 A: in-place edit commands — undo/redo, uniqueness, ranges, cascade
{
  const { doc, idle, active } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Ops',
    inputs: [
      { id: 'in_speed', name: 'Speed', type: 'number', value: 1 },
      { id: 'in_tap', name: 'Tap', type: 'trigger' },
    ],
    states: [
      { id: 'sA', name: 'A', timeline: idle.id },
      { id: 'sB', name: 'B', timeline: idle.id },
    ],
    transitions: [{
      id: 't1',
      from: 'sA',
      to: 'sB',
      duration: 0.5,
      after: 2,
      conditions: [{ id: 'c1', input: 'in_speed', op: '>', value: 0.5 }],
    }],
  }, { label: 'Create machine', source: 'script' });
  const stateOf = (id) => machineById(store.document, machineId).states.find((s) => s.id === id);
  const transitionOf = (id) => machineById(store.document, machineId).transitions.find((t) => t.id === id);
  const inputOf = (id) => machineById(store.document, machineId).inputs.find((i) => i.id === id);

  // Missing ids return false like every other update*/remove* command.
  assert.strictEqual(store.updateMachineState(machineId, 's_missing', { name: 'x' }), false);
  assert.strictEqual(store.updateMachineInput(machineId, 'in_missing', { name: 'x' }), false);
  assert.strictEqual(store.updateMachineTransition(machineId, 't_missing', { duration: 1 }), false);
  assert.strictEqual(store.removeMachineInput(machineId, 'in_missing'), false);

  // updateMachineState: rename + timeline retarget, undoable.
  store.updateMachineState(machineId, 'sB', { name: 'Renamed', timelineId: active.id }, { label: 'Rename B', source: 'ai' });
  assert.strictEqual(stateOf('sB').name, 'Renamed');
  assert.strictEqual(stateOf('sB').timeline.id, active.id);
  assert.throws(() => store.updateMachineState(machineId, 'sB', { timelineId: 'no_such_timeline' }), /does not exist/);
  assert.strictEqual(stateOf('sB').timeline.id, active.id, 'a rejected retarget must leave the document untouched');
  assert.strictEqual(store.undo(), true);
  assert.strictEqual(stateOf('sB').name, 'B');
  assert.strictEqual(stateOf('sB').timeline.id, idle.id);
  assert.strictEqual(store.redo(), true);
  assert.strictEqual(stateOf('sB').name, 'Renamed');
  store.undo();

  // updateMachineTransition: duration, after (null clears the gate), conditions.
  store.updateMachineTransition(machineId, 't1', {
    duration: 0.25,
    after: null,
    conditions: [{ id: 'c1', input: 'in_speed', op: '>=', value: 2 }],
  }, { label: 'Tune t1', source: 'user' });
  assert.strictEqual(transitionOf('t1').duration, 0.25);
  assert.strictEqual(transitionOf('t1').after, null);
  assert.strictEqual(transitionOf('t1').conditions[0].op, '>=');
  assert.strictEqual(store.undo(), true);
  assert.strictEqual(transitionOf('t1').duration, 0.5);
  assert.strictEqual(transitionOf('t1').after, 2);
  store.redo();

  // Documented ranges are enforced by the model on commit (rollback atomic).
  assert.throws(() => store.updateMachineTransition(machineId, 't1', { duration: 10001 }), /duration/);
  assert.throws(() => store.updateMachineTransition(machineId, 't1', { after: 100001 }), /after/);
  assert.throws(
    () => store.updateMachineTransition(machineId, 't1', { conditions: [{ input: 'in_speed', op: 'fired' }] }),
    /trigger/,
  );
  assert.strictEqual(transitionOf('t1').duration, 0.25, 'rejected updates must not mutate the document');

  // updateMachineInput: rename with per-machine uniqueness.
  store.updateMachineInput(machineId, 'in_speed', { name: 'Velocity' }, { label: 'Rename input', source: 'ai' });
  assert.strictEqual(inputOf('in_speed').name, 'Velocity');
  assert.throws(() => store.updateMachineInput(machineId, 'in_tap', { name: 'Velocity' }), /already used/);
  assert.strictEqual(inputOf('in_tap').name, 'Tap');
  assert.strictEqual(store.undo(), true);
  assert.strictEqual(inputOf('in_speed').name, 'Speed');
  store.redo();

  // Type change that would invalidate dependent conditions: REJECT with a
  // named, actionable blocker list (contract: removeTimeline precedent).
  assert.throws(
    () => store.updateMachineInput(machineId, 'in_speed', { type: 'bool' }, { label: 'Retype', source: 'user' }),
    /t1/,
  );
  assert.throws(
    () => store.updateMachineInput(machineId, 'in_speed', { type: 'bool' }),
    /c1/,
  );
  assert.strictEqual(inputOf('in_speed').type, 'number', 'the rejected command must not mutate the input');
  // Clear the blocker, then retry — the documented AI recovery path.
  store.updateMachineTransition(machineId, 't1', { conditions: [] });
  store.updateMachineInput(machineId, 'in_speed', { type: 'bool', value: false });
  assert.strictEqual(inputOf('in_speed').type, 'bool');
  store.updateMachineTransition(machineId, 't1', { conditions: [{ id: 'c1', input: 'in_speed', op: '==', value: false }] });
  // ...and back the other way: equality conditions block a to-trigger change.
  assert.throws(
    () => store.updateMachineInput(machineId, 'in_speed', { type: 'trigger' }),
    /c1/,
  );
  assert.throws(
    () => store.updateMachineTransition(machineId, 't1', { conditions: [{ id: 'c1', input: 'in_speed', op: 'fired' }] }),
    /trigger/,
  );
  assert.strictEqual(inputOf('in_speed').type, 'bool', 'failed condition edit must roll back atomically');
  assert.strictEqual(transitionOf('t1').conditions[0].op, '==');

  // Authored value edits.
  store.updateMachineInput(machineId, 'in_speed', { value: true }, { label: 'Set authored', source: 'ai' });
  assert.strictEqual(inputOf('in_speed').value, true);
  assert.strictEqual(store.undo(), true);
  assert.strictEqual(inputOf('in_speed').value, false);
  store.redo();

  // removeMachineInput: REFUSES while conditions depend on the input —
  // pruning would leave the transition firing more easily than authored
  // (amended contract). With the blocker cleared, removal proceeds, undoable.
  assert.throws(() => store.removeMachineInput(machineId, 'in_speed'), /t1/);
  assert.throws(() => store.removeMachineInput(machineId, 'in_speed'), /c1/);
  assert.ok(inputOf('in_speed'), 'a refused removal must not touch the document');
  store.updateMachineTransition(machineId, 't1', { conditions: [] });
  assert.strictEqual(store.removeMachineInput(machineId, 'in_speed', { label: 'Delete input', source: 'user' }), true);
  assert.strictEqual(inputOf('in_speed'), undefined);
  store.undo();
  assert.ok(inputOf('in_speed'), 'undo restores the input');
  store.redo();
  assert.strictEqual(inputOf('in_speed'), undefined);

  console.log('✓ 3B-1 in-place machine edit commands');
}

// 3B-1 A: the new commands are registered on the serializable bus.
{
  const { doc, idle } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Bus',
    states: [{ id: 'sA', name: 'A', timeline: idle.id }],
  });
  for (const action of ['updateMachineState', 'updateMachineInput', 'updateMachineTransition', 'removeMachineInput']) {
    assert.ok(VEYRA_COMMAND_ACTIONS.includes(action), `${action} must be in the command table`);
  }
  const result = dispatchVeyraCommand(store, {
    action: 'updateMachineState',
    args: { machineId, stateId: 'sA', changes: { name: 'ViaBus' } },
    command: { label: 'Bus rename', source: 'ai' },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(machineById(store.document, machineId).states[0].name, 'ViaBus');
  const failure = dispatchVeyraCommand(store, {
    action: 'removeMachineInput',
    args: { machineId },
  });
  assert.equal(failure.ok, false);
  assert.match(failure.error, /inputId/);
  const last = store.commandHistory[store.commandHistory.length - 1];
  assert.equal(last.label, 'Bus rename');
  assert.equal(last.source, 'ai');

  console.log('✓ 3B-1 machine edit commands dispatch through the command bus');
}

// 3B-1 B: runtime reconciliation — never stale, never throws, never disturbed.
{
  const { doc, idle, active } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Preview',
    inputs: [
      { id: 'in_go', name: 'Go', type: 'trigger' },
      { id: 'in_amt', name: 'Amount', type: 'number', value: 1 },
    ],
    states: [
      { id: 'sA', name: 'A', timeline: idle.id },
      { id: 'sB', name: 'B', timeline: idle.id },
      { id: 'sC', name: 'C', timeline: active.id },
    ],
    transitions: [
      { id: 'tAB', from: 'sA', to: 'sB', duration: 0, conditions: [{ id: 'cGo', input: 'in_go', op: 'fired' }] },
      { id: 'tBlend', from: 'sB', to: 'sC', duration: 1 },
    ],
  }, { label: 'Create machine', source: 'script' });
  const runtime = createMachineRuntime(() => store.document, machineId);
  const events = [];
  const unsubscribe = runtime.onInvalidate((event) => events.push(event));

  // Defect 1: removing the ACTIVE state must not leave a dangling pair.
  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, 'sB');
  const eventsBefore = events.length;
  store.removeMachineState(machineId, 'sB'); // cascades tAB and tBlend away too
  assert.strictEqual(runtime.stateId, 'sA', 'runtime must land on a valid position, not a stale id');
  assert.ok(runtime.state, 'stateId and state can no longer disagree');
  assert.strictEqual(runtime.transition, null, 'a blend with deleted endpoints must be cleared');
  assert.strictEqual(events.length, eventsBefore + 1, 'exactly one runtime-invalidated per effective change');
  // The machine is not dead: add a new target and drive into it.
  const sD = store.addMachineState(machineId, { id: 'sD', name: 'D', timeline: idle.id }, { label: 'Add D', source: 'script' });
  store.addMachineTransition(machineId, {
    id: 'tAD', from: 'sA', to: 'sD', duration: 0, conditions: [{ id: 'cD', input: 'in_go', op: 'fired' }],
  }, { label: 'Add tAD', source: 'script' });
  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, sD, 'step() must not be permanently dead after a cascade');
  events.length = 0;

  // Unrelated document edits must NOT disturb the preview (contract §The rule).
  // Scalar transform property: an unrelated *node* edit, no paint-schema coupling.
  const address = nodePropertyAddress(store.document.nodes[0].id, 'transform.rotation');
  const stateTimeBefore = runtime.stateTime;
  store.setProperty({ label: 'Rotate', source: 'user' }, address, 0.5);
  assert.strictEqual(runtime.stateId, sD);
  assert.strictEqual(runtime.stateTime, stateTimeBefore);
  assert.strictEqual(events.length, 0, 'unrelated edits must not emit invalidations');

  // Defect 2: authored edits surface on clean inputs; overrides win when dirty.
  const amountEntry = () => runtime.inputs.find((input) => input.id === 'in_amt');
  assert.strictEqual(amountEntry().value, 1);
  store.updateMachineInput(machineId, 'in_amt', { value: 9 }, { label: 'Authored 9', source: 'ai' });
  assert.strictEqual(amountEntry().value, 9, 'authored edit must surface (no shadowing)');
  runtime.setInput('Amount', 5);
  assert.strictEqual(amountEntry().value, 5, 'dirty override wins over authored');
  store.updateMachineInput(machineId, 'in_amt', { value: 12 }, { label: 'Authored 12', source: 'ai' });
  assert.strictEqual(amountEntry().value, 5, 'dirty override survives authored edits');
  runtime.reset();
  assert.strictEqual(amountEntry().value, 12, 'reset drops overrides to authored truth');

  // Parity: getMachine truth (document) vs getMachineState truth (runtime)
  // agree for every clean input, including inputs created after construction.
  const lateInput = store.addMachineInput(machineId, { id: 'in_late', name: 'Late', type: 'bool', value: true });
  const docMachine = machineById(store.document, machineId);
  const stateInputs = new Map(runtime.inputs.map((input) => [input.id, input.value]));
  for (const authored of docMachine.inputs) {
    assert.strictEqual(stateInputs.get(authored.id), authored.value,
      `parity violated for input ${authored.id} (added ${authored.id === lateInput ? 'after' : 'before'} construction)`);
  }
  assert.strictEqual(new Set(docMachine.inputs.map((i) => i.id)).size, runtime.inputs.length,
    'runtime must expose exactly the document inputs');

  // Defect 3: deleting a blend endpoint mid-blend must not land on it.
  runtime.fire('Go');
  runtime.step(0.1); // sD -> sA? no: tAD is sA->sD and we are on sD already; drive from sA:
  runtime.reset();
  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, sD);
  // Build a blend and delete its target mid-flight.
  store.addMachineTransition(machineId, { id: 'tBlend2', from: sD, to: 'sC', duration: 2 }, { label: 'Blend', source: 'script' });
  runtime.reset();
  runtime.step(1); // arrives at sD? tAD requires Go; instead drive with a no-condition edge:
  // (sD has no outgoing non-condition edge yet; force via authored transition below)
  events.length = 0;
  store.addMachineTransition(machineId, { id: 'tDC', from: sD, to: 'sC', duration: 2 }, { label: 'D-C blend', source: 'script' });
  // The structural change reset us to sA; walk back to sD through Go.
  runtime.fire('Go');
  runtime.step(0.1);
  assert.strictEqual(runtime.stateId, sD, 'setup: preview must be on sD');
  runtime.step(0.5); // tBlend2 (first satisfied, authored order) or tDC starts a 2s blend — either way blending toward sC.
  assert.ok(runtime.transition, 'setup: a blend toward sC must be active');
  const danglingToId = runtime.transition.toId;
  assert.strictEqual(danglingToId, 'sC');
  store.removeMachineState(machineId, 'sC'); // deletes BOTH blends mid-flight
  assert.strictEqual(runtime.transition, null, 'the dangling blend must be reconciled away');
  runtime.step(3); // where the old code would land stateId on the deleted sC
  assert.notStrictEqual(runtime.stateId, 'sC', 'a deleted blend endpoint can never become current');
  assert.ok(machineById(store.document, machineId).states.some((s) => s.id === runtime.stateId));

  // Defect 4 / removal of a previewed machine: no throw anywhere.
  events.length = 0;
  store.removeStateMachine(machineId, { label: 'Delete machine', source: 'user' });
  assert.strictEqual(runtime.stateId, null);
  assert.strictEqual(runtime.state, null);
  assert.deepStrictEqual(runtime.step(0.5), []);
  assert.strictEqual(runtime.evaluate().overrides && Object.keys(runtime.evaluate().overrides).length, 0);
  assert.deepStrictEqual(runtime.inputs, []);
  assert.strictEqual(events.length, 1, 'one machine-removed event');
  assert.strictEqual(events[0].reason, 'machine-removed');
  assert.throws(() => runtime.fire('Go'), /no longer in the document/, 'explicit API calls on a dead machine still throw');

  // Undo restores the machine; the runtime adopts its initial position on the
  // first access after restore (lazy reconcile), without ever throwing.
  events.length = 0;
  store.undo();
  assert.strictEqual(runtime.stateId, 'sA');
  assert.strictEqual(events.length, 1, 'one machine-restored event');
  assert.strictEqual(events[0].reason, 'machine-restored');
  unsubscribe();
  store.removeStateMachine(machineId);
  assert.strictEqual(events.length, 1, 'unsubscribed listeners receive nothing');

  console.log('✓ 3B-1 runtime reconciliation (dangling state/transition, shadowing, remove/restore)');
}

// 3B-1 B: invalidation is per effective change — debounced, not per part.
{
  const { doc, idle } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Flicker',
    states: [
      { id: 'sA', name: 'A', timeline: idle.id },
      { id: 'sB', name: 'B', timeline: idle.id },
      { id: 'sC', name: 'C', timeline: idle.id },
    ],
    initial: 'sC',
    transitions: [
      { id: 'tBC', from: 'sB', to: 'sC' },
      { id: 'tCB', from: 'sC', to: 'sB' },
    ],
  });
  const runtime = createMachineRuntime(() => store.document, machineId);
  assert.strictEqual(runtime.stateId, 'sC');
  const events = [];
  runtime.onInvalidate((event) => events.push(event));

  // One command that structurally cascades (state + two transitions + initial)
  // must still produce exactly ONE event on next access.
  store.removeMachineState(machineId, 'sC', { label: 'Cascade', source: 'user' });
  void runtime.stateId;
  void runtime.stateId;
  void runtime.evaluate();
  assert.strictEqual(events.length, 1, 'multi-part commands must not flicker');
  assert.strictEqual(events[0].type, 'runtime-invalidated');
  assert.strictEqual(events[0].machineId, machineId);

  // A value-only edit is not structural: no reset, no event, position kept.
  runtime.step(2);
  const stateTimeBefore = runtime.stateTime;
  store.updateMachineTransition(machineId, 'tCB', { duration: 1.5 }, { label: 'Tune', source: 'user' });
  assert.strictEqual(runtime.stateTime, stateTimeBefore, 'duration tuning must not reset the preview');
  assert.strictEqual(events.length, 1);

  // Retargeting a live state's timeline is not a position change either:
  // preview continues and evaluation picks up the new timeline.
  const otherTimeline = store.addTimeline({ name: 'Retarget', duration: 60, fps: 30 });
  runtime.step(0.5);
  const timeBefore = runtime.stateTime;
  store.updateMachineState(machineId, 'sB', { timelineId: otherTimeline });
  assert.strictEqual(runtime.stateTime, timeBefore, 'retarget must not disturb the running preview');
  assert.strictEqual(events.length, 1);
  const evaluated = runtime.evaluate();
  assert.ok(Object.keys(evaluated.overrides).length === 0 || evaluated.stateId, 'evaluate stays consistent with the document');

  console.log('✓ 3B-1 invalidation is debounced per effective change');
}

// 3B-1 B: Logan's gate — commands interleaved with undo/redo under a fake
// clock; evaluate() must stay consistent with store.document at EVERY revision.
{
  const { doc, idle, active } = fixtureDocument();
  const store = new VeyraStore(doc);
  const machineId = store.addStateMachine({
    name: 'Chaos',
    inputs: [{ id: 'in_go', name: 'Go', type: 'trigger' }, { id: 'in_n', name: 'N', type: 'number', value: 0 }],
    states: [
      { id: 'sA', name: 'A', timeline: idle.id },
      { id: 'sB', name: 'B', timeline: idle.id },
      { id: 'sC', name: 'C', timeline: active.id },
    ],
    transitions: [{ id: 'tAB', from: 'sA', to: 'sB', duration: 0.5, conditions: [{ id: 'cg', input: 'in_go', op: 'fired' }] }],
  }, { label: 'Create', source: 'script' });
  const runtime = createMachineRuntime(() => store.document, machineId);

  const steps = [
    () => { runtime.step(1 / 60); },
    () => { runtime.fire('Go'); runtime.step(1 / 30); },
    () => { store.addMachineTransition(machineId, { id: 'tBC', from: 'sB', to: 'sC', duration: 1 }); },
    () => { runtime.step(0.25); },
    () => { store.updateMachineState(machineId, 'sC', { name: 'Renamed' }); },
    () => { runtime.step(0.75); },
    () => { store.undo(); },
    () => { runtime.step(1 / 60); },
    () => { store.removeMachineState(machineId, 'sB'); },
    () => { runtime.step(0.5); },
    () => { store.undo(); },
    () => { store.undo(); },
    () => { runtime.step(2); },
    () => { store.redo(); },
    () => { store.redo(); },
    () => { runtime.step(0.1); },
    () => { runtime.setInput('N', 3); runtime.step(1); },
    () => { store.removeMachineInput(machineId, 'in_n'); },
    () => { runtime.step(1); },
    () => {
      // Revision-aware: after the redo-cascade removed tAB (and cg with it),
      // nothing references in_go — then removal must simply succeed. Where a
      // condition does reference it, removal must refuse and name it. The
      // full refusal proof is the "Ops" command block above.
      const machine = machineById(store.document, machineId);
      const referenced = machine.transitions.some((t) =>
        t.conditions.some((c) => (c.input?.id ?? c.input) === 'in_go'));
      if (referenced) {
        assert.throws(() => store.removeMachineInput(machineId, 'in_go'), /in_go|cg/);
      } else {
        assert.strictEqual(store.removeMachineInput(machineId, 'in_go'), true);
        store.undo();
      }
    },
    () => { runtime.step(1); },
    () => { store.undo(); },
    () => { store.undo(); },
    () => { runtime.step(0.5); },
  ];

  const consistent = (where) => {
    const machine = machineById(store.document, machineId);
    const ev = runtime.evaluate();
    assert.strictEqual(ev.machineId, machineId, where);
    if (!machine) {
      assert.strictEqual(ev.stateId, null, `${where}: removed machine reports no state`);
      assert.strictEqual(ev.transition, null, `${where}: removed machine reports no transition`);
      assert.deepStrictEqual(ev.inputs, [], `${where}: removed machine reports no inputs`);
      return;
    }
    const stateIds = new Set(machine.states.map((s) => s.id));
    assert.ok(ev.stateId === null || stateIds.has(ev.stateId), `${where}: stateId ${ev.stateId} dangling`);
    if (ev.transition) {
      assert.ok(stateIds.has(ev.transition.fromId), `${where}: transition.fromId dangling`);
      assert.ok(stateIds.has(ev.transition.toId), `${where}: transition.toId dangling`);
      assert.ok(machine.transitions.some((t) => t.id === ev.transition.id), `${where}: transition id dangling`);
    }
    const inputIds = new Set(machine.inputs.map((i) => i.id));
    for (const input of ev.inputs) {
      assert.ok(inputIds.has(input.id), `${where}: runtime input ${input.id} dangling`);
    }
    assert.ok(ev.stateTime >= 0, `${where}: state time is never negative`);
    if (ev.stateId !== null) {
      const named = machine.states.find((s) => s.id === ev.stateId);
      assert.strictEqual(ev.stateName, named.name, `${where}: stateName must match the document`);
    }
  };

  consistent('revision 0');
  for (let index = 0; index < steps.length; index += 1) {
    steps[index]();
    consistent(`after step ${index}`);
  }

  console.log('✓ 3B-1 undo/redo interleave under a fake clock stays consistent at every revision');
}

// 3B-1 C: the new command surface is visible in the scene summary.
{
  const { doc, idle } = fixtureDocument();
  const normalized = normalizeDocument({
    ...doc,
    stateMachines: [createStateMachine({ name: 'Surfaced', states: [createMachineState({ name: 'A', timeline: idle.id })] })],
  });
  const [summaryMachine] = createSceneSummary(normalized).stateMachines;
  assert.ok(summaryMachine.capabilities, 'summary machines must surface capabilities');
  for (const op of ['update-input', 'remove-input', 'update-state', 'update-transition']) {
    assert.ok(summaryMachine.capabilities.graph.includes(op), `capabilities.graph must include ${op}`);
  }
  assert.ok(summaryMachine.capabilities.runtime.includes('evaluate'));

  console.log('✓ 3B-1 machine capabilities surface in the scene summary');
}

console.log('\n✅ All Veyra state machine tests passed!');
