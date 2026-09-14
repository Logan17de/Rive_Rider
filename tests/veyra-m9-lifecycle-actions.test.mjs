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
const data = (property) => ({ kind: 'data', instance: ref('viewModelInstance', 'inst'), path: [ref('dataProperty', property)] });
const artboard = () => ({ id: 'art', name: 'Art', x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });

function timeline(id, address, value) {
  return createTimeline({ id, duration: 30, fps: 30, loop: 'none', tracks: [createTrack(address, {
    id: `track_${id}`, keyframes: [
      createKeyframe({ id: `kf_${id}_0`, frame: 0, value, easing: 'linear' }),
      createKeyframe({ id: `kf_${id}_1`, frame: 30, value, easing: 'linear' }),
    ],
  })] });
}

function documentWithMachine(machine) {
  const box = createNode('rectangle', { id: 'box', opacity: 1 });
  const address = nodePropertyAddress('box', 'opacity');
  return normalizeDocument(createDocument({
    id: 'actions_doc', artboards: [artboard()], nodes: [box],
    timelines: [timeline('idle', address, 0.2), timeline('active', address, 0.8), timeline('third', address, 0.5)],
    stateMachines: [machine],
    viewModels: [{ id: 'vm', name: 'VM', properties: [
      { id: 'value', name: 'Value', type: 'number', defaultValue: 0, min: 0, max: 10 },
      { id: 'flag', name: 'Flag', type: 'boolean', defaultValue: false },
      { id: 'pulse', name: 'Pulse', type: 'trigger' },
    ] }],
    viewModelInstances: [{ id: 'inst', name: 'Instance', viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', 'art') }],
  }));
}

function actionsOf(events) { return events.filter(event => event.type === 'machine-action'); }

// Initial state-start is deferred until the first real step and fires exactly once.
{
  const machine = createStateMachine({ id: 'initial_actions', layers: [{ id: 'layer', initial: 'idle_state', states: [
    { id: 'idle_state', type: 'animation', timeline: 'idle', actions: [
      { id: 'initial_set', type: 'data-set', phase: 'state-start', target: data('value'), value: 1 },
    ] },
  ], transitions: [] }] });
  const doc = documentWithMachine(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'initial_actions', { dataRuntime });
  assert.equal(dataRuntime.getValue('inst', 'value'), 0, 'construction/read paths must stay side-effect-free');
  assert.deepEqual(runtime.step(0), []);
  assert.equal(dataRuntime.getValue('inst', 'value'), 0, 'zero-time observation must not flush lifecycle actions');
  let events = runtime.step(0.01);
  console.log('INITIAL_LIFECYCLE_EVENTS', JSON.stringify(actionsOf(events)));
  assert.equal(dataRuntime.getValue('inst', 'value'), 1);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['initial_set']);
  dataRuntime.setValue('inst', 'value', 2);
  events = runtime.step(0.01);
  assert.equal(dataRuntime.getValue('inst', 'value'), 2, 'state-start must not repeat on later steps');
  assert.equal(actionsOf(events).length, 0);
}

// Timed lifecycle ordering is source-end -> transition-start -> target-start -> transition-end.
{
  const machine = createStateMachine({ id: 'timed_actions', inputs: [{ id: 'go', name: 'Go', type: 'bool', value: false }], layers: [{
    id: 'layer', initial: 'a', states: [
      { id: 'a', type: 'animation', timeline: 'idle', actions: [
        { id: 'a_end', type: 'emit', phase: 'state-end', event: 'a-ended', payload: { from: 'a' } },
      ] },
      { id: 'b', type: 'animation', timeline: 'active', actions: [
        { id: 'b_start', type: 'data-set', phase: 'state-start', target: data('value'), value: 3 },
      ] },
    ], transitions: [{ id: 'ab', from: 'a', to: 'b', duration: 0.5,
      conditions: [{ id: 'go_cond', input: 'go', op: '==', value: true }], actions: [
        { id: 'ab_start', type: 'emit', phase: 'transition-start', event: 'ab-start' },
        { id: 'ab_end', type: 'data-fire', phase: 'transition-end', target: data('pulse') },
      ] }],
  }] });
  const doc = documentWithMachine(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'timed_actions', { dataRuntime });
  runtime.step(0.01); // flush initial state-start (none)
  runtime.setInput('go', true);
  let events = runtime.step(0.01);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['a_end', 'ab_start', 'b_start']);
  assert.equal(dataRuntime.getValue('inst', 'value'), 3);
  assert.equal(dataRuntime.getValue('inst', 'pulse'), false);
  events = runtime.step(0.5);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['ab_end']);
  assert.equal(dataRuntime.getValue('inst', 'pulse'), true);
  assert.equal(runtime.stats.actionsExecuted, 4);
  assert.equal(runtime.stats.actionErrors, 0);
  assert.equal(actionsOf(runtime.step(0.1)).length, 0, 'completed transition actions must not repeat');
}

// Zero-duration transitions execute the full lifecycle once in deterministic order.
{
  const machine = createStateMachine({ id: 'cut_actions', inputs: [{ id: 'go', name: 'Go', type: 'bool', value: false }], layers: [{
    id: 'layer', initial: 'a', states: [
      { id: 'a', type: 'animation', timeline: 'idle', actions: [{ id: 'a_end', type: 'emit', phase: 'state-end', event: 'a-end' }] },
      { id: 'b', type: 'animation', timeline: 'active', actions: [{ id: 'b_start', type: 'emit', phase: 'state-start', event: 'b-start' }] },
    ], transitions: [{ id: 'ab', from: 'a', to: 'b', duration: 0,
      conditions: [{ id: 'go_cond', input: 'go', op: '==', value: true }], actions: [
        { id: 'ab_start', type: 'emit', phase: 'transition-start', event: 'ab-start' },
        { id: 'ab_end', type: 'emit', phase: 'transition-end', event: 'ab-end' },
      ] }],
  }] });
  const doc = documentWithMachine(machine);
  const runtime = createMachineRuntime(() => doc, 'cut_actions');
  runtime.step(0.01);
  runtime.setInput('go', true);
  const events = runtime.step(0.01);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['a_end', 'ab_start', 'b_start', 'ab_end']);
  assert.equal(runtime.stateId, 'b');
}

// Lifecycle input actions participate in the same deterministic step and legacy trigger broadcast is retained.
{
  const machine = createStateMachine({ id: 'input_actions', inputs: [
    { id: 'ready', name: 'Ready', type: 'bool', value: false },
    { id: 'go', name: 'Go', type: 'trigger' },
  ], layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'idle', actions: [
      { id: 'set_ready', type: 'input-set', phase: 'state-start', input: 'ready', value: true },
      { id: 'fire_go', type: 'input-fire', phase: 'state-start', input: 'go' },
    ] },
    { id: 'b', type: 'animation', timeline: 'active' },
  ], transitions: [{ id: 'ab', from: 'a', to: 'b', duration: 0, conditions: [
    { id: 'ready_cond', input: 'ready', op: '==', value: true },
    { id: 'go_cond', input: 'go', op: 'fired' },
  ] }] }] });
  const doc = documentWithMachine(machine);
  const runtime = createMachineRuntime(() => doc, 'input_actions');
  const events = runtime.step(0.01);
  assert.equal(runtime.stateId, 'b');
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['set_ready', 'fire_go']);
  assert.equal(runtime.inputs.find(input => input.id === 'ready').value, true);
  assert.equal(runtime.inputs.find(input => input.id === 'go').value, false, 'legacy action-fired trigger clears at step end');
}

// Interruption closes the interrupted transition exactly once, then ends B and starts C exactly once.
{
  const machine = createStateMachine({ id: 'interrupt_actions', inputs: [
    { id: 'go', name: 'Go', type: 'bool', value: false }, { id: 'next', name: 'Next', type: 'bool', value: false },
  ], layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'idle' },
    { id: 'b', type: 'animation', timeline: 'active', actions: [
      { id: 'b_start', type: 'emit', phase: 'state-start', event: 'b-start' },
      { id: 'b_end', type: 'emit', phase: 'state-end', event: 'b-end' },
    ] },
    { id: 'c', type: 'animation', timeline: 'third', actions: [{ id: 'c_start', type: 'emit', phase: 'state-start', event: 'c-start' }] },
  ], transitions: [
    { id: 'ab', from: 'a', to: 'b', duration: 1, allowExitDuringTransition: true,
      conditions: [{ id: 'go_cond', input: 'go', op: '==', value: true }],
      actions: [{ id: 'ab_end', type: 'emit', phase: 'transition-end', event: 'ab-end' }] },
    { id: 'bc', from: 'b', to: 'c', duration: 0.5,
      conditions: [{ id: 'next_cond', input: 'next', op: '==', value: true }],
      actions: [{ id: 'bc_start', type: 'emit', phase: 'transition-start', event: 'bc-start' }] },
  ] }] });
  const doc = documentWithMachine(machine);
  const runtime = createMachineRuntime(() => doc, 'interrupt_actions');
  runtime.step(0.01);
  runtime.setInput('go', true);
  let events = runtime.step(0.01);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['b_start']);
  runtime.setInput('next', true);
  events = runtime.step(0.1);
  assert.deepEqual(actionsOf(events).map(event => event.actionId), ['ab_end', 'b_end', 'bc_start', 'c_start']);
  assert.equal(actionsOf(runtime.step(0.1)).filter(event => event.actionId === 'ab_end').length, 0);
}

// emit/timeline actions are runtime requests; they never mutate authored document state.
{
  const machine = createStateMachine({ id: 'requests', layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'idle', actions: [
      { id: 'emit_start', type: 'emit', phase: 'state-start', event: 'hello', payload: { count: 1 } },
      { id: 'timeline_start', type: 'timeline', phase: 'state-start', timeline: 'active', operation: 'seek', time: 0.25 },
    ] },
  ], transitions: [] }] });
  const doc = documentWithMachine(machine);
  const before = JSON.stringify(doc);
  const runtime = createMachineRuntime(() => doc, 'requests');
  const actionEvents = actionsOf(runtime.step(0.01));
  assert.equal(actionEvents[0].effect.kind, 'emit');
  assert.deepEqual(actionEvents[0].effect.payload, { count: 1 });
  assert.deepEqual(actionEvents[1].request, { kind: 'timeline', timeline: ref('timeline', 'active'), operation: 'seek', time: 0.25 });
  assert.equal(JSON.stringify(doc), before, 'machine actions must not mutate authored document data');
}

// A fork executes lifecycle side effects only against its private M8 runtime snapshot.
{
  const machine = createStateMachine({ id: 'fork_actions', layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'idle', actions: [{ id: 'set_value', type: 'data-set', phase: 'state-start', target: data('value'), value: 4 }] },
  ], transitions: [] }] });
  const doc = documentWithMachine(machine);
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'fork_actions', { dataRuntime });
  const fork = runtime.fork();
  fork.step(0.01);
  assert.equal(dataRuntime.getValue('inst', 'value'), 0, 'fork lifecycle action must not touch live data runtime');
  runtime.step(0.01);
  assert.equal(dataRuntime.getValue('inst', 'value'), 4);
}

// Authoring rejects unsupported/mistyped lifecycle actions before runtime.
{
  const base = () => createStateMachine({ id: 'bad', inputs: [
    { id: 'number_input', name: 'N', type: 'number', value: 0 }, { id: 'trigger_input', name: 'T', type: 'trigger' },
  ], layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'idle' }, { id: 'b', type: 'animation', timeline: 'active' },
  ], transitions: [] }] });

  let machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_phase', type: 'emit', phase: 'transition-start', event: 'x' }];
  assert.throws(() => documentWithMachine(machine), /state-start|state-end|phase/i);

  machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_input', type: 'input-fire', phase: 'state-start', input: 'number_input' }];
  assert.throws(() => documentWithMachine(machine), /trigger input/i);

  machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_data_fire', type: 'data-fire', phase: 'state-start', target: data('flag') }];
  assert.throws(() => documentWithMachine(machine), /trigger/i);

  machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_data_set', type: 'data-set', phase: 'state-start', target: data('pulse'), value: true }];
  assert.throws(() => documentWithMachine(machine), /trigger|data-set/i);

  machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_timeline', type: 'timeline', phase: 'state-start', timeline: 'missing', operation: 'play' }];
  assert.throws(() => documentWithMachine(machine), /missing timeline/i);

  machine = base();
  machine.layers[0].states[0].actions = [{ id: 'bad_type', type: 'future-magic', phase: 'state-start' }];
  assert.throws(() => documentWithMachine(machine), /action type|Unsupported/i);

  machine = base();
  machine.layers[0].states[0] = { id: 'entry', type: 'entry', actions: [{ id: 'pseudo', type: 'emit', phase: 'state-start', event: 'x' }] };
  machine.layers[0].initial = ref('machineState', 'entry');
  assert.throws(() => documentWithMachine(machine), /pseudo|lifecycle actions/i);
}

console.log('Veyra M9 lifecycle action tests passed');
