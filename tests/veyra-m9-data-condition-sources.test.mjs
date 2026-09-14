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
const artboard = () => ({ id: 'art', name: 'Art', x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });
const data = (instance, ...path) => ({ kind: 'data', instance: ref('viewModelInstance', instance), path: path.map(id => ref('dataProperty', id)) });

function constantTimeline(id, address, value) {
  return createTimeline({
    id, duration: 30, fps: 30, loop: 'none', tracks: [createTrack(address, {
      id: `track_${id}`, keyframes: [
        createKeyframe({ id: `kf_${id}_0`, frame: 0, value, easing: 'linear' }),
        createKeyframe({ id: `kf_${id}_1`, frame: 30, value, easing: 'linear' }),
      ],
    })],
  });
}

function fixture() {
  const box = createNode('rectangle', { id: 'box', opacity: 1 });
  const opacity = nodePropertyAddress('box', 'opacity');
  const timelines = [
    constantTimeline('idle', opacity, 0.2),
    constantTimeline('active', opacity, 0.5),
    constantTimeline('done', opacity, 0.8),
    constantTimeline('pulse', opacity, 0.35),
  ];
  const machine = createStateMachine({
    id: 'machine',
    layers: [{
      id: 'layer', initial: 'idle_state', states: [
        { id: 'idle_state', type: 'animation', timeline: 'idle' },
        { id: 'active_state', type: 'animation', timeline: 'active' },
        { id: 'done_state', type: 'animation', timeline: 'done' },
        { id: 'pulse_state', type: 'animation', timeline: 'pulse' },
      ], transitions: [
        {
          id: 'score_gate', from: 'idle_state', to: 'active_state', duration: 0,
          conditions: [{
            id: 'score_cond', source: data('inst_main', 'p_nested', 'p_score'), op: '>',
            compare: data('inst_main', 'p_threshold'),
          }],
        },
        {
          id: 'bool_gate', from: 'active_state', to: 'done_state', duration: 0,
          conditions: [{ id: 'bool_cond', source: data('inst_main', 'p_enabled'), op: '==', value: true }],
        },
        {
          id: 'pulse_gate', from: 'done_state', to: 'pulse_state', duration: 0,
          conditions: [{ id: 'pulse_cond', source: data('inst_main', 'p_trigger'), op: 'fired' }],
        },
      ],
    }],
  });
  const doc = normalizeDocument(createDocument({
    id: 'data_machine_doc', artboards: [artboard()], nodes: [box], timelines, stateMachines: [machine],
    viewModels: [
      { id: 'vm_nested', name: 'Nested', properties: [
        { id: 'p_score', name: 'Score', type: 'number', defaultValue: 0.2, min: 0, max: 1 },
      ] },
      { id: 'vm_main', name: 'Main', properties: [
        { id: 'p_nested', name: 'Nested', type: 'viewModel', viewModel: ref('viewModel', 'vm_nested'), defaultValue: null },
        { id: 'p_threshold', name: 'Threshold', type: 'number', defaultValue: 0.5, min: 0, max: 1 },
        { id: 'p_enabled', name: 'Enabled', type: 'boolean', defaultValue: false },
        { id: 'p_trigger', name: 'Trigger', type: 'trigger' },
      ] },
    ],
    viewModelInstances: [
      { id: 'inst_nested_a', name: 'Nested A', viewModel: ref('viewModel', 'vm_nested'), artboard: ref('artboard', 'art'), initialValues: [] },
      { id: 'inst_nested_b', name: 'Nested B', viewModel: ref('viewModel', 'vm_nested'), artboard: ref('artboard', 'art'), initialValues: [{ property: ref('dataProperty', 'p_score'), value: 0.9 }] },
      { id: 'inst_main', name: 'Main', viewModel: ref('viewModel', 'vm_main'), artboard: ref('artboard', 'art'), initialValues: [
        { property: ref('dataProperty', 'p_nested'), value: ref('viewModelInstance', 'inst_nested_a') },
      ] },
    ],
  }));
  const dataRuntime = createVeyraDataRuntime(() => doc);
  const runtime = createMachineRuntime(() => doc, 'machine', { dataRuntime });
  return { doc, dataRuntime, runtime, opacity };
}

// Nested View Model source + data-bound comparison drive the same canonical machine evaluator.
{
  const { dataRuntime, runtime } = fixture();
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'idle_state');
  dataRuntime.setValue('inst_nested_a', 'p_score', 0.7);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  assert.ok(runtime.stats.dataConditionReads >= 4, 'data source and compare reads must be counted as real runtime work');
}

// Nested reference retargeting follows the current effective View Model instance without machine rebuild.
{
  const { dataRuntime, runtime } = fixture();
  dataRuntime.setValue('inst_main', 'p_nested', ref('viewModelInstance', 'inst_nested_b'));
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
}

// Boolean View Model conditions use strict literal typing.
{
  const { dataRuntime, runtime } = fixture();
  dataRuntime.setValue('inst_nested_a', 'p_score', 0.8);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'active_state');
  dataRuntime.setValue('inst_main', 'p_enabled', true);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'done_state');
}

// M8 trigger properties are legal machine event sources. A selected transition now
// consumes exactly one queued pulse; plain endpoint reads and forks remain non-consuming.
{
  const { dataRuntime, runtime } = fixture();
  dataRuntime.setValue('inst_nested_a', 'p_score', 0.8);
  runtime.step(0.01);
  dataRuntime.setValue('inst_main', 'p_enabled', true);
  runtime.step(0.01);
  dataRuntime.fire('inst_main', 'p_trigger');
  assert.equal(dataRuntime.getValue('inst_main', 'p_trigger'), true);
  runtime.step(0.01);
  assert.equal(runtime.stateId, 'pulse_state');
  assert.equal(dataRuntime.getValue('inst_main', 'p_trigger'), false, 'selected transition must consume exactly one M8 trigger pulse');
}

// getEndpointValue is nested and non-consuming, so MachineRuntime forks can safely observe M8 state.
{
  const { dataRuntime } = fixture();
  dataRuntime.setValue('inst_nested_a', 'p_score', 0.61);
  assert.equal(dataRuntime.getEndpointValue(data('inst_main', 'p_nested', 'p_score')), 0.61);
  dataRuntime.fire('inst_main', 'p_trigger');
  const fork = dataRuntime.fork();
  assert.equal(fork.getEndpointValue(data('inst_main', 'p_trigger')), true);
  assert.equal(dataRuntime.getValue('inst_main', 'p_trigger'), true);
}

// Authoring rejects incompatible data-bound comparisons instead of runtime coercion.
{
  const box = createNode('rectangle', { id: 'bad_box' });
  const timeline = constantTimeline('bad_timeline', nodePropertyAddress('bad_box', 'opacity'), 0.5);
  const machine = createStateMachine({ id: 'bad_machine', layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'bad_timeline' }, { id: 'b', type: 'animation', timeline: 'bad_timeline' },
  ], transitions: [{ id: 'bad', from: 'a', to: 'b', conditions: [{ id: 'bad_cond', source: data('inst', 'p_num'), op: '==', compare: data('inst', 'p_bool') }] }] }] });
  assert.throws(() => normalizeDocument(createDocument({ id: 'bad_doc', artboards: [artboard()], nodes: [box], timelines: [timeline], stateMachines: [machine],
    viewModels: [{ id: 'vm', properties: [
      { id: 'p_num', type: 'number', defaultValue: 1 }, { id: 'p_bool', type: 'boolean', defaultValue: false },
    ] }], viewModelInstances: [{ id: 'inst', viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', 'art') }],
  })), /machine-condition-type|incompatible/i);
}

// Trigger-only operators remain nominal: a boolean source cannot masquerade as an event.
{
  const box = createNode('rectangle', { id: 'trigger_bad_box' });
  const timeline = constantTimeline('trigger_bad_timeline', nodePropertyAddress('trigger_bad_box', 'opacity'), 0.5);
  const machine = createStateMachine({ id: 'trigger_bad_machine', layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'trigger_bad_timeline' }, { id: 'b', type: 'animation', timeline: 'trigger_bad_timeline' },
  ], transitions: [{ id: 'bad', from: 'a', to: 'b', conditions: [{ id: 'bad_cond', source: data('inst', 'p_bool'), op: 'fired' }] }] }] });
  assert.throws(() => normalizeDocument(createDocument({ id: 'trigger_bad_doc', artboards: [artboard()], nodes: [box], timelines: [timeline], stateMachines: [machine],
    viewModels: [{ id: 'vm', properties: [{ id: 'p_bool', type: 'boolean', defaultValue: false }] }],
    viewModelInstances: [{ id: 'inst', viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', 'art') }],
  })), /requires a trigger source/i);
}

// Nominal enum definitions must match on both sides of a data-bound comparison.
{
  const box = createNode('rectangle', { id: 'enum_box' });
  const timeline = constantTimeline('enum_timeline', nodePropertyAddress('enum_box', 'opacity'), 0.5);
  const machine = createStateMachine({ id: 'enum_machine', layers: [{ id: 'layer', initial: 'a', states: [
    { id: 'a', type: 'animation', timeline: 'enum_timeline' }, { id: 'b', type: 'animation', timeline: 'enum_timeline' },
  ], transitions: [{ id: 'bad', from: 'a', to: 'b', conditions: [{ id: 'bad_enum', source: data('inst', 'p_a'), op: '==', compare: data('inst', 'p_b') }] }] }] });
  assert.throws(() => normalizeDocument(createDocument({ id: 'enum_doc', artboards: [artboard()], nodes: [box], timelines: [timeline], stateMachines: [machine],
    enums: [
      { id: 'enum_a', values: [{ id: 'a1', name: 'A' }] },
      { id: 'enum_b', values: [{ id: 'b1', name: 'B' }] },
    ],
    viewModels: [{ id: 'vm', properties: [
      { id: 'p_a', type: 'enum', enum: ref('enum', 'enum_a'), defaultValue: ref('enumValue', 'a1') },
      { id: 'p_b', type: 'enum', enum: ref('enum', 'enum_b'), defaultValue: ref('enumValue', 'b1') },
    ] }], viewModelInstances: [{ id: 'inst', viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', 'art') }],
  })), /machine-condition-type|incompatible/i);
}

console.log('Veyra M9 View Model/data-bound condition source tests passed');
