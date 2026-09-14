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
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

function constantTimeline(id, address, value) {
  return createTimeline({
    id,
    duration: 60,
    fps: 30,
    loop: 'none',
    tracks: [createTrack(address, {
      id: `track_${id}`,
      keyframes: [
        createKeyframe({ id: `kf_${id}_0`, frame: 0, value, easing: 'linear' }),
        createKeyframe({ id: `kf_${id}_1`, frame: 60, value, easing: 'linear' }),
      ],
    })],
  });
}

function baseFixture({ allowAB = true, bcExitTime = null } = {}) {
  const box = createNode('rectangle', { id: 'box', opacity: 1 });
  const opacity = nodePropertyAddress('box', 'opacity');
  const timelines = [
    constantTimeline('a', opacity, 0.1),
    constantTimeline('b', opacity, 0.9),
    constantTimeline('c', opacity, 0.5),
    constantTimeline('d', opacity, 0.2),
  ];
  const machine = createStateMachine({
    id: 'machine',
    inputs: [
      { id: 'start', name: 'Start', type: 'bool', value: false },
      { id: 'next', name: 'Next', type: 'bool', value: false },
      { id: 'emergency', name: 'Emergency', type: 'bool', value: false },
      { id: 'final', name: 'Final', type: 'bool', value: false },
    ],
    layers: [{
      id: 'layer',
      initial: 'state_a',
      states: [
        { id: 'state_a', type: 'animation', timeline: 'a' },
        { id: 'state_b', type: 'animation', timeline: 'b' },
        { id: 'state_c', type: 'animation', timeline: 'c' },
        { id: 'state_d', type: 'animation', timeline: 'd' },
        { id: 'any', type: 'any' },
      ],
      transitions: [
        {
          id: 'ab', from: 'state_a', to: 'state_b', duration: 2,
          allowExitDuringTransition: allowAB,
          conditions: [{ id: 'cond_start', input: 'start', op: '==', value: true }],
        },
        {
          id: 'bc', from: 'state_b', to: 'state_c', duration: 1,
          allowExitDuringTransition: true,
          ...(bcExitTime ? { exitTime: bcExitTime } : {}),
          conditions: [{ id: 'cond_next', input: 'next', op: '==', value: true }],
        },
        {
          id: 'cd', from: 'state_c', to: 'state_d', duration: 1,
          conditions: [{ id: 'cond_final', input: 'final', op: '==', value: true }],
        },
        {
          id: 'any_d', from: 'any', to: 'state_d', duration: 0.5,
          conditions: [{ id: 'cond_emergency', input: 'emergency', op: '==', value: true }],
        },
      ],
    }],
  });
  const doc = normalizeDocument(createDocument({ id: 'interrupt_doc', nodes: [box], timelines, stateMachines: [machine] }));
  return { doc, opacity, runtime: createMachineRuntime(() => doc, 'machine') };
}

// Default behavior remains non-interruptible: the target state's transition waits
// until the active transition finishes.
{
  const { runtime } = baseFixture({ allowAB: false });
  runtime.setInput('start', true);
  runtime.step(0.01);
  runtime.step(0.49);
  runtime.setInput('next', true);
  runtime.step(0.01);
  assert.equal(runtime.transition?.id, 'ab');
  runtime.step(1.5);
  assert.equal(runtime.stateId, 'state_b');
  assert.equal(runtime.transition, null);
  runtime.step(0.01);
  assert.equal(runtime.transition?.id, 'bc');
}

// Interrupting A->B snapshots the exact currently composed pose and begins B->C
// from that frozen composite without a visual discontinuity.
{
  const { runtime, opacity } = baseFixture();
  runtime.setInput('start', true);
  runtime.step(0.01);
  runtime.step(0.49);
  runtime.setInput('next', true);
  const events = runtime.step(0.01);
  assert.equal(runtime.transition?.id, 'bc');
  assert.equal(runtime.transition?.sourceKind, 'snapshot');
  assert.equal(runtime.transition?.interruptedFromTransitionId, 'ab');
  assert.equal(Number(runtime.evaluate().overrides[opacity].toFixed(6)), 0.3);
  assert.deepEqual(events.map(event => [event.type, event.transitionId, Boolean(event.interrupted)]), [
    ['transition-end', 'ab', true],
    ['transition-start', 'bc', false],
  ]);
  runtime.step(0.5);
  const halfway = runtime.evaluate();
  assert.equal(Number(halfway.overrides[opacity].toFixed(6)), 0.4);
  assert.equal(Number(halfway.layers[0].evaluatedTimelines.reduce((sum, item) => sum + item.effectiveWeight, 0).toFixed(6)), 1);
}

// Exit Time on the target state's outgoing transition uses the target state's
// incoming clock, not the original source state's older clock.
{
  const { runtime } = baseFixture({ bcExitTime: { unit: 'seconds', value: 0.75 } });
  runtime.setInput('start', true);
  runtime.setInput('next', true);
  runtime.step(0.01);
  runtime.step(0.5);
  assert.equal(runtime.transition?.id, 'ab', 'target exit time must block early interruption');
  runtime.step(0.25);
  assert.equal(runtime.transition?.id, 'bc', 'target transition should interrupt once its own incoming clock reaches exit time');
}

// Any-state routing participates in interruption against the active target state.
{
  const { runtime } = baseFixture();
  runtime.setInput('start', true);
  runtime.step(0.01);
  runtime.step(0.3);
  runtime.setInput('emergency', true);
  runtime.step(0.01);
  assert.equal(runtime.transition?.id, 'any_d');
  assert.equal(runtime.transition?.fromId, 'state_b');
  assert.equal(runtime.transition?.sourceKind, 'snapshot');
}

// Recursive interruption snapshots the already-interrupted composite rather than
// falling back to the raw logical source state.
{
  const { runtime, opacity } = baseFixture();
  runtime.setInput('start', true);
  runtime.step(0.01);
  runtime.step(0.49);
  runtime.setInput('next', true);
  runtime.step(0.01); // A->B interrupted at exactly 25%, snapshot value 0.3.
  runtime.step(0.25); // B->C is 25%, value 0.35.
  runtime.setInput('final', true);
  const events = runtime.step(0.01); // B->C reaches 26%, value 0.352 before interruption.
  assert.equal(runtime.transition?.id, 'cd');
  assert.equal(runtime.transition?.sourceKind, 'snapshot');
  assert.equal(runtime.transition?.interruptedFromTransitionId, 'bc');
  assert.equal(Number(runtime.evaluate().overrides[opacity].toFixed(6)), 0.352);
  assert.equal(events[0].transitionId, 'bc');
  assert.equal(events[0].interrupted, true);
}

// Forking an interrupted runtime clones the source snapshot; observation/replay on
// the fork cannot advance or mutate the live transition.
{
  const { runtime, opacity } = baseFixture();
  runtime.setInput('start', true);
  runtime.step(0.01);
  runtime.step(0.49);
  runtime.setInput('next', true);
  runtime.step(0.01);
  const liveBefore = runtime.evaluate();
  const fork = runtime.fork();
  fork.step(0.4);
  assert.notEqual(Number(fork.evaluate().overrides[opacity].toFixed(6)), Number(liveBefore.overrides[opacity].toFixed(6)));
  assert.equal(Number(runtime.evaluate().overrides[opacity].toFixed(6)), Number(liveBefore.overrides[opacity].toFixed(6)));
  assert.equal(runtime.transition?.rawProgress, liveBefore.transition.rawProgress);
}

// Interruption snapshots multi-child blend ownership as absolute weights.
{
  const box = createNode('rectangle', { id: 'blend_box', opacity: 1 });
  const opacity = nodePropertyAddress('blend_box', 'opacity');
  const timelines = [
    constantTimeline('source', opacity, 0.1),
    constantTimeline('low', opacity, 0.2),
    constantTimeline('high', opacity, 0.8),
    constantTimeline('target', opacity, 0.6),
  ];
  const machine = createStateMachine({
    id: 'blend_interrupt',
    inputs: [
      { id: 'go', name: 'Go', type: 'bool', value: false },
      { id: 'next_blend', name: 'Next Blend', type: 'bool', value: false },
      { id: 'mix', name: 'Mix', type: 'number', value: 0.5 },
    ],
    layers: [{
      id: 'layer', initial: 'source_state', states: [
        { id: 'source_state', type: 'animation', timeline: 'source' },
        { id: 'blend_state', type: 'blend1d', input: 'mix', children: [
          { id: 'low_child', timeline: 'low', threshold: 0 },
          { id: 'high_child', timeline: 'high', threshold: 1 },
        ] },
        { id: 'target_state', type: 'animation', timeline: 'target' },
      ], transitions: [
        { id: 'to_blend', from: 'source_state', to: 'blend_state', duration: 2, allowExitDuringTransition: true, conditions: [{ id: 'go_cond', input: 'go', op: '==', value: true }] },
        { id: 'from_blend', from: 'blend_state', to: 'target_state', duration: 1, conditions: [{ id: 'next_cond', input: 'next_blend', op: '==', value: true }] },
      ],
    }],
  });
  const doc = normalizeDocument(createDocument({ id: 'blend_interrupt_doc', nodes: [box], timelines, stateMachines: [machine] }));
  const runtime = createMachineRuntime(() => doc, 'blend_interrupt');
  assert.equal(doc.stateMachines[0].layers[0].transitions[0].allowExitDuringTransition, true);
  runtime.setInput('go', true);
  runtime.step(0.01);
  runtime.step(0.49);
  runtime.setInput('next_blend', true);
  runtime.step(0.01);
  const out = runtime.evaluate();
  assert.equal(Number(out.overrides[opacity].toFixed(6)), 0.2);
  assert.equal(out.transition.sourceKind, 'snapshot');
  assert.equal(out.layers[0].evaluatedTimelines.filter(item => item.transitionRole === 'interrupted-snapshot').length, 3);
}

console.log('Veyra M9 allow-exit-during-transition tests passed');
