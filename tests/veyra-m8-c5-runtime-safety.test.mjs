import assert from 'node:assert/strict';

import { createComponentRuntimeRegistry } from '../src/veyra/components.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode } from '../src/veyra/model.js';
import { writeProperty } from '../src/veyra/properties.js';
import { createVeyraRuntimeHost } from '../src/veyra/runtimeHost.js';
import { VeyraStore } from '../src/veyra/store.js';

const ref = (kind, id) => ({ kind, id });
const artboard = ref('artboard', 'source');
const board = (id) => ({ id, name: id, x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });
const data = (instance, ...ids) => ({
  kind: 'data',
  instance: ref('viewModelInstance', instance),
  path: ids.map((id) => ref('dataProperty', id)),
});
const property = (address) => ({ kind: 'property', address });
const addBinding = (store, id, source, target, extra = {}) => store.createBinding({
  id,
  artboard,
  source,
  target,
  ...extra,
});

function snapshot(store) {
  return {
    serialized: serializeVeyra(store.document),
    revision: store.revision,
    history: JSON.stringify(store.commandHistory),
  };
}

function fixture() {
  const store = new VeyraStore(createDocument({
    id: 'm8_c5_runtime_safety',
    artboards: [board('source')],
    nodes: [
      createNode('rectangle', { id: 'box', opacity: 1 }),
      createNode('rectangle', { id: 'other', opacity: 1 }),
      createNode('rectangle', { id: 'event', visible: false }),
      createNode('polygon', { id: 'poly' }),
    ],
  }));
  store.createViewModel({
    id: 'child_model',
    properties: [{ id: 'value', type: 'number', defaultValue: 0.2, min: 0, max: 1 }],
  });
  store.createViewModel({
    id: 'root_model',
    properties: [
      { id: 'number', type: 'number', defaultValue: 0.25, min: 0, max: 1 },
      { id: 'wide', type: 'number', defaultValue: 0.2 },
      { id: 'trigger', type: 'trigger' },
      { id: 'nested', type: 'viewModel', viewModel: ref('viewModel', 'child_model'), defaultValue: null },
      { id: 'selector', type: 'viewModel', viewModel: ref('viewModel', 'child_model'), defaultValue: null },
    ],
  });
  for (const [id, value] of [['child', 0.2], ['child2', 0.9], ['child3', 0.7]]) {
    store.createViewModelInstance({
      id,
      viewModel: ref('viewModel', 'child_model'),
      artboard,
      initialValues: [{ property: ref('dataProperty', 'value'), value }],
    });
  }
  store.createViewModelInstance({
    id: 'root',
    viewModel: ref('viewModel', 'root_model'),
    artboard,
    initialValues: [
      { property: ref('dataProperty', 'nested'), value: ref('viewModelInstance', 'child') },
      { property: ref('dataProperty', 'selector'), value: ref('viewModelInstance', 'child2') },
    ],
  });
  const dataRuntime = createVeyraDataRuntime(() => store.document);
  const controlPlane = createVeyraControlPlane(store);
  const host = createVeyraRuntimeHost({
    store,
    dataRuntime,
    controlPlane,
    getContext: () => ({ artboardId: 'source' }),
  }).api;
  return { store, dataRuntime, controlPlane, host };
}

function derived(options = {}) {
  const result = fixture();
  addBinding(result.store, 'reference_writer', data('root', 'selector'), data('root', 'nested'));
  addBinding(result.store, 'two_way', data('root', 'nested', 'value'), property('node:box/opacity'), { mode: 'twoWay' });
  if (options.components) {
    result.store.addArtboard(board('host'));
    result.store.addArtboard(board('middle'));
    result.store.createComponent('source', { id: 'leaf' });
    result.store.addComponentInstance('leaf', { id: 'inner', artboard: ref('artboard', 'middle') });
    result.store.createComponent('middle', { id: 'outer' });
    for (const id of ['A', 'B']) result.store.addComponentInstance('outer', { id, artboard: ref('artboard', 'host') });
    result.paths = ['A', 'B'].map((id) => [ref('componentInstance', id), ref('componentInstance', 'inner')]);
    result.componentRuntime = createComponentRuntimeRegistry(() => result.store.document);
    result.host = createVeyraRuntimeHost({
      store: result.store,
      dataRuntime: result.dataRuntime,
      componentRuntime: result.componentRuntime,
      controlPlane: result.controlPlane,
      getContext: () => ({ artboardId: 'host' }),
    }).api;
  }
  return result;
}

function sceneValue(scene, id, path) {
  return path.split('.').reduce((value, key) => value?.[key], scene.nodes.find((node) => node.id === id));
}

function safeScene(result) {
  try {
    return {
      scene: evaluateDocument(result.store.document, {}, null, {
        dataRuntime: result.dataRuntime,
        artboardId: 'source',
      }),
      error: null,
    };
  } catch (error) {
    return { scene: null, error };
  }
}

{
  const result = derived();
  assert.equal(result.host.read('node:box/opacity').evaluatedValue, 0.9);
  const before = snapshot(result.store);
  assert.equal(result.host.setTwoWayBindingTarget('two_way', 0.47), true);
  assert.equal(result.host.read('node:box/opacity').evaluatedValue, 0.47);
  assert.equal(result.dataRuntime.getValue('child', 'value'), 0.2);
  assert.equal(result.dataRuntime.getValue('child2', 'value'), 0.47);
  assert.deepEqual(snapshot(result.store), before);
}

for (const [writerId, twoWayId] of [['a_writer', 'z_two_way'], ['z_writer', 'a_two_way']]) {
  const result = fixture();
  addBinding(result.store, writerId, data('root', 'selector'), data('root', 'nested'));
  addBinding(result.store, twoWayId, data('root', 'nested', 'value'), property('node:box/opacity'), { mode: 'twoWay' });
  result.dataRuntime.evaluateBindings(result.store.document, { artboardId: 'source' });
  result.dataRuntime.evaluateBindings(result.store.document, { artboardId: 'source' });
  result.host.setDataRuntimeValue('root', 'selector', ref('viewModelInstance', 'child3'));
  const before = snapshot(result.store);
  const statsBefore = result.host.getDataRuntimeStats();
  const notifications = [];
  const unsubscribe = result.dataRuntime.subscribe((changes) => notifications.push(...changes));
  assert.equal(result.host.setTwoWayBindingTarget(twoWayId, 0.63), true);
  unsubscribe();
  const statsAfter = result.host.getDataRuntimeStats();
  assert.equal(result.dataRuntime.getValue('child2', 'value'), 0.9);
  assert.equal(result.dataRuntime.getValue('child3', 'value'), 0.63);
  assert.equal(result.host.read('node:box/opacity').evaluatedValue, 0.63);
  assert.equal(statsAfter.evaluations, statsBefore.evaluations);
  assert.equal(statsAfter.notifications, statsBefore.notifications + 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].provenance.binding.id, twoWayId);
  assert.deepEqual(snapshot(result.store), before);
}

{
  const document = fixture().store.document;
  assert.throws(() => writeProperty(document, 'node:box/opacity', 2), /between 0 and 1/);
  assert.throws(() => writeProperty(document, 'node:box/paint/stroke', 'not-a-color'), /six-digit hex color/);
  assert.throws(() => writeProperty(document, 'node:poly/geometry/sides', 4.5), /must be an integer/);
  writeProperty(document, 'node:box/opacity', 0.4);
  writeProperty(document, 'node:box/paint/stroke', '#AABBCC');
  writeProperty(document, 'node:poly/geometry/sides', 7);
  assert.equal(document.nodes.find((node) => node.id === 'box').opacity, 0.4);
  assert.equal(document.nodes.find((node) => node.id === 'box').paint.stroke, '#aabbcc');
  assert.equal(document.nodes.find((node) => node.id === 'poly').geometry.sides, 7);
}

{
  const result = fixture();
  addBinding(result.store, 'discrete', data('root', 'wide'), property('node:poly/geometry/sides'));
  result.host.setDataRuntimeValue('root', 'wide', 4.5);
  const invalid = safeScene(result);
  assert.equal(invalid.error, null);
  assert.equal(invalid.scene.data.diagnostics.errors[0].phase, 'target');
  assert.equal(sceneValue(invalid.scene, 'poly', 'geometry.sides'), 6);
  result.host.setDataRuntimeValue('root', 'wide', 7);
  const recovered = safeScene(result);
  assert.equal(sceneValue(recovered.scene, 'poly', 'geometry.sides'), 7);
  assert.deepEqual(recovered.scene.data.diagnostics.errors, []);
}

{
  const result = fixture();
  result.store.createConverter({
    id: 'choose_child',
    type: 'conditional',
    inputType: 'number',
    outputType: 'viewModel',
    config: {
      equals: 0.66,
      then: ref('viewModelInstance', 'child3'),
      else: ref('viewModelInstance', 'child2'),
    },
  });
  addBinding(result.store, 'choose_reference', data('root', 'number'), data('root', 'nested'), {
    converterChain: [ref('converter', 'choose_child')],
  });
  addBinding(result.store, 'two_way', data('root', 'nested', 'value'), property('node:box/opacity'), { mode: 'twoWay' });
  assert.equal(result.host.setTwoWayBindingTarget('two_way', 0.41), true);
  assert.equal(result.dataRuntime.getValue('child2', 'value'), 0.41);
  result.host.setDataRuntimeValue('root', 'number', 0.66);
  assert.equal(result.host.setTwoWayBindingTarget('two_way', 0.73), true);
  assert.equal(result.dataRuntime.getValue('child2', 'value'), 0.41);
  assert.equal(result.dataRuntime.getValue('child3', 'value'), 0.73);
}

{
  const result = derived();
  result.host.setDataRuntimeValue('root', 'selector', null);
  const before = snapshot(result.store);
  const runtimeBefore = {
    child: result.dataRuntime.getValue('child', 'value'),
    child2: result.dataRuntime.getValue('child2', 'value'),
    stats: result.host.getDataRuntimeStats(),
  };
  assert.throws(
    () => result.host.setTwoWayBindingTarget('two_way', 0.55),
    /binding-two-way-resolution/,
  );
  assert.deepEqual(snapshot(result.store), before);
  assert.equal(result.dataRuntime.getValue('child', 'value'), runtimeBefore.child);
  assert.equal(result.dataRuntime.getValue('child2', 'value'), runtimeBefore.child2);
  assert.deepEqual(result.host.getDataRuntimeStats(), runtimeBefore.stats);
}

{
  const result = fixture();
  addBinding(result.store, 'repairable', data('root', 'wide'), property('node:box/opacity'), { mode: 'twoWay' });
  result.host.setDataRuntimeValue('root', 'wide', 2);
  const invalid = safeScene(result);
  assert.equal(invalid.error, null);
  assert.equal(invalid.scene.data.diagnostics.errors[0].phase, 'target');
  assert.equal(result.host.setTwoWayBindingTarget('repairable', 0.58), true);
  assert.equal(result.host.read('node:box/opacity').evaluatedValue, 0.58);
}

{
  const result = derived({ components: true });
  const [scopeA, scopeB] = result.paths;
  result.host.setDataRuntimeValue('root', 'selector', ref('viewModelInstance', 'child3'), { scopePath: scopeA });
  assert.equal(result.host.setTwoWayBindingTarget('two_way', 0.63, { scopePath: scopeA }), true);
  assert.equal(result.host.read('node:box/opacity', { scopePath: scopeA }).evaluatedValue, 0.63);
  assert.equal(result.host.read('node:box/opacity', { scopePath: scopeB }).evaluatedValue, 0.9);
  assert.equal(result.dataRuntime.getValue('child', 'value', { scopePath: scopeA }), 0.2);
  assert.equal(result.dataRuntime.getValue('child3', 'value', { scopePath: scopeA }), 0.63);
}

{
  const result = fixture();
  addBinding(result.store, 'bad', data('root', 'wide'), property('node:box/opacity'));
  addBinding(result.store, 'independent', data('root', 'number'), property('node:other/opacity'));
  addBinding(result.store, 'valid-wide-range', data('root', 'wide'), property('node:other/transform/x'));
  addBinding(result.store, 'event', data('root', 'trigger'), property('node:event/visible'));
  result.dataRuntime.evaluateBindings(result.store.document, { artboardId: 'source' });
  result.dataRuntime.setValue('root', 'wide', 2);
  result.dataRuntime.fire('root', 'trigger');
  const output = safeScene(result);
  assert.equal(output.error, null);
  assert.ok(output.scene.data.diagnostics.errors.some((item) => item.binding?.id === 'bad'));
  assert.equal(sceneValue(output.scene, 'box', 'opacity'), 1);
  assert.equal(sceneValue(output.scene, 'other', 'opacity'), 0.25);
  assert.equal(sceneValue(output.scene, 'other', 'transform.x'), 2);
  assert.equal(sceneValue(output.scene, 'event', 'visible'), true);
  assert.equal(result.dataRuntime.getValue('root', 'trigger'), false);
  result.dataRuntime.setValue('root', 'wide', 0.6);
  const recovered = safeScene(result);
  assert.equal(recovered.error, null);
  assert.equal(sceneValue(recovered.scene, 'box', 'opacity'), 0.6);
  assert.equal(recovered.scene.data.diagnostics.errors.length, 0);
  const settled = safeScene(result);
  assert.equal(settled.scene.data.stats.evaluatedBindings, 0);
}

{
  const result = fixture();
  result.store.createConverter({
    id: 'color',
    type: 'conditional',
    inputType: 'number',
    outputType: 'color',
    config: { equals: 0.66, then: 'not-a-color', else: '#112233' },
  });
  addBinding(result.store, 'color', data('root', 'number'), property('node:box/paint/stroke'), {
    converterChain: [ref('converter', 'color')],
  });
  addBinding(result.store, 'independent', data('root', 'wide'), property('node:other/opacity'));
  result.dataRuntime.setValue('root', 'number', 0.66);
  const output = safeScene(result);
  assert.equal(output.error, null);
  assert.ok(output.scene.data.diagnostics.errors.some((item) => item.binding?.id === 'color'));
  assert.equal(sceneValue(output.scene, 'box', 'paint.stroke'), '#2c1830');
  assert.equal(sceneValue(output.scene, 'other', 'opacity'), 0.2);
}

{
  const result = fixture();
  result.store.updateDataProperty('root_model', 'wide', { defaultValue: 2 });
  const before = snapshot(result.store);
  const command = {
    action: 'createBinding',
    args: {
      overrides: {
        id: 'invalid-default',
        artboard,
        source: data('root', 'wide'),
        target: property('node:box/opacity'),
      },
    },
  };
  const preview = result.controlPlane.previewCommand(command);
  const dispatch = result.controlPlane.dispatchCommand(command);
  const output = safeScene(result);
  assert.equal(typeof preview.ok, 'boolean');
  assert.equal(dispatch.ok, true);
  assert.equal(output.error, null);
  assert.ok(output.scene.data.diagnostics.errors.some((item) => item.binding?.id === 'invalid-default'));
  assert.notDeepEqual(snapshot(result.store), before);
}

console.log('veyra M8-C5 reverse-write and runtime-output safety regressions passed');
