import { createVeyraRuntimeHost } from '../src/veyra/runtimeHost.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraDataRuntime, createDataRuntimeScope } from '../src/veyra/dataGraph.js';
import { getOwnership } from '../src/veyra/controlPlane.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';

const BASE = '216deb8c972cf476c3c9c0de90d640e47520568f';
const results = [];
const ref = (kind, id) => ({ kind, id });
const art = ref('artboard', 'art_main');
const data = (instance, ...ids) => ({ kind: 'data', instance: ref('viewModelInstance', instance), path: ids.map(id => ref('dataProperty', id)) });
const pg = id => ({ kind: 'propertyGroupProperty', property: ref('propertyGroupProperty', id) });
const prop = address => ({ kind: 'property', address });
const board = id => ({ id, name: id, x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });
function baseStore() {
  const store = new VeyraStore(createDocument({
    id: 'independent_m8_review', artboards: [board('art_main')],
    nodes: [createNode('rectangle', { id: 'box', opacity: 1 }), createNode('rectangle', { id: 'other', opacity: 1 })],
  }));
  store.createViewModel({ id: 'vm_child', properties: [
    { id: 'child_value', type: 'number', defaultValue: 0.2, min: 0, max: 1 },
    { id: 'child_trigger', type: 'trigger' },
  ] });
  store.createViewModel({ id: 'vm_root', properties: [
    { id: 'num', type: 'number', defaultValue: 0.25, min: 0, max: 1 },
    { id: 'alt', type: 'number', defaultValue: 0.75, min: 0, max: 1 },
    { id: 'index', type: 'number', defaultValue: 0 },
    { id: 'nested', type: 'viewModel', viewModel: ref('viewModel', 'vm_child'), defaultValue: null },
    { id: 'items', type: 'list', itemType: { type: 'number' }, defaultValue: null },
  ] });
  store.createViewModelInstance({ id: 'child', viewModel: ref('viewModel', 'vm_child'), artboard: art });
  store.createViewModelInstance({ id: 'root', viewModel: ref('viewModel', 'vm_root'), artboard: art,
    initialValues: [{ property: ref('dataProperty', 'nested'), value: ref('viewModelInstance', 'child') }] });
  store.createList({ id: 'numbers', owner: ref('viewModelInstance', 'root'), property: ref('dataProperty', 'items'),
    items: [{ id: 'item_a', value: 0.2 }, { id: 'item_b', value: 0.8 }] });
  const current = store.document.viewModelInstances.find(item => item.id === 'root');
  store.updateViewModelInstance('root', { initialValues: [...current.initialValues, { property: ref('dataProperty', 'items'), value: ref('list', 'numbers') }] });
  return store;
}
function addBinding(store, id, source, target, extras = {}) {
  return store.createBinding({ id, artboard: art, source, target, ...extras });
}
function runtimeFor(store) { return createVeyraDataRuntime(() => store.document); }
function evaluate(runtime, store, scopePath = []) { return runtime.evaluateBindings(store.document, { artboardId: 'art_main', scopePath }); }
function warm(runtime, store, scopePath = []) {
  evaluate(runtime, store, scopePath);
  const result = evaluate(runtime, store, scopePath);
  assert.equal(result.stats.evaluatedBindings, 0, 'Fixture must be warm before the probe');
}
function check(name, fn) {
  let observation;
  try {
    observation = fn();
    assert.deepEqual(observation.actual, observation.expected);
    results.push({ name, status: 'PASS', ...observation });
  } catch (error) {
    results.push({ name, status: observation ? 'FAIL' : 'SETUP_ERROR', ...observation, error: String(error.message) });
  }
  console.log(JSON.stringify(results.at(-1)));
}

check('C2 control: warm nested number invalidates and sleeps again', () => {
  const s = baseStore(); addBinding(s, 'nested_number', data('root', 'nested', 'child_value'), prop('node:box/opacity'));
  const r = runtimeFor(s); warm(r, s); r.setValue('child', 'child_value', 0.61);
  const next = evaluate(r, s);
  return { actual: [next.overrides['node:box/opacity'], next.stats.evaluatedBindings, evaluate(r, s).stats.evaluatedBindings], expected: [0.61, 1, 0] };
});
check('C2 control: Property Group reverse-write leaves authored state/history untouched', () => {
  const s = baseStore(); s.createPropertyGroup({ id: 'group', artboard: art, properties: [{ id: 'value', type: 'number', value: 0.3 }] });
  addBinding(s, 'two_way', pg('value'), prop('node:box/opacity'), { mode: 'twoWay' });
  const r = runtimeFor(s); warm(r, s);
  const before = [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)];
  r.setTwoWayTarget('two_way', 0.64);
  const after = [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)];
  return { actual: [JSON.stringify(before) === JSON.stringify(after), evaluate(r, s).overrides['node:box/opacity']], expected: [true, 0.64] };
});
check('Nested trigger: two fires must yield two pulses then false, not a cached true', () => {
  const s = baseStore(); addBinding(s, 'nested_event', data('root', 'nested', 'child_trigger'), prop('node:box/visible'));
  const r = runtimeFor(s); warm(r, s); r.fire('child', 'child_trigger'); r.fire('child', 'child_trigger');
  const values = Array.from({ length: 3 }, () => evaluate(r, s).overrides['node:box/visible']);
  return { actual: { values, consumed: r.stats.triggerPulsesConsumed, pending: r.getValue('child', 'child_trigger') }, expected: { values: [true, true, false], consumed: 2, pending: false } };
});
check('Runtime list converter must consume the changed scoped list, including after forced recomputation', () => {
  const s = baseStore(); s.createConverter({ id: 'pick', type: 'numberToListIndex', outputType: 'number', config: { list: ref('list', 'numbers') } });
  addBinding(s, 'list_pick', data('root', 'index'), prop('node:box/opacity'), { converterChain: [ref('converter', 'pick')] });
  const r = runtimeFor(s); warm(r, s); r.replaceListItem('numbers', 'item_a', 0.6);
  const next = evaluate(r, s).overrides['node:box/opacity'];
  r.setValue('root', 'index', 1); evaluate(r, s); r.setValue('root', 'index', 0);
  return { actual: [r.getList('numbers')[0].value, next, evaluate(r, s).overrides['node:box/opacity']], expected: [0.6, 0.6, 0.6] };
});
check('Runtime list insert must reject the wrong declared item type atomically', () => {
  const s = baseStore(); const r = runtimeFor(s); const before = JSON.stringify(r.getList('numbers'));
  let rejected = false; try { r.insertListItem('numbers', 'not-a-number'); } catch { rejected = true; }
  return { actual: [rejected, JSON.stringify(r.getList('numbers')) === before], expected: [true, true] };
});
check('Distinct full Component paths with punctuation-heavy legal IDs must not alias', () => {
  const s = baseStore(); const r = runtimeFor(s);
  const a = [ref('componentInstance', 'outer/componentInstance:inner')];
  const b = [ref('componentInstance', 'outer'), ref('componentInstance', 'inner')];
  r.setValue('root', 'num', 0.66, { scopePath: a });
  return { actual: { sameKey: createDataRuntimeScope(a).key === createDataRuntimeScope(b).key, sibling: r.getValue('root', 'num', { scopePath: b }) }, expected: { sameKey: false, sibling: 0.25 } };
});
check('Distinct instance/property tuples containing pipe characters must not alias', () => {
  const s = baseStore();
  s.createViewModel({ id: 'pipe_vm_a', properties: [{ id: 'c', type: 'number', defaultValue: 0.1 }] });
  s.createViewModel({ id: 'pipe_vm_b', properties: [{ id: 'b|c', type: 'number', defaultValue: 0.1 }] });
  s.createViewModelInstance({ id: 'a|b', viewModel: ref('viewModel', 'pipe_vm_a'), artboard: art });
  s.createViewModelInstance({ id: 'a', viewModel: ref('viewModel', 'pipe_vm_b'), artboard: art });
  const r = runtimeFor(s); r.setValue('a|b', 'c', 0.66);
  return { actual: r.getValue('a', 'b|c'), expected: 0.1 };
});
check('Two accepted spellings of one Property Group target must share conflict identity', () => {
  const s = baseStore(); s.createPropertyGroup({ id: 'alias_group', artboard: art, properties: [{ id: 'alias_value', type: 'number', value: 0.1 }] });
  addBinding(s, 'a_high', data('root', 'num'), pg('alias_value'), { priority: 10 });
  addBinding(s, 'z_low', data('root', 'alt'), prop('propertyGroupProperty:alias_value/value'), { priority: 0 });
  const result = evaluate(runtimeFor(s), s);
  return { actual: { value: result.overrides['propertyGroupProperty:alias_value/value'], owner: result.ownership['propertyGroupProperty:alias_value/value'].ref.id, conflicts: result.diagnostics.conflicts.length }, expected: { value: 0.25, owner: 'a_high', conflicts: 1 } };
});
check('Self-cycle through two equivalent Property Group endpoint spellings must fail before commit', () => {
  const s = baseStore(); s.createPropertyGroup({ id: 'cycle_group', artboard: art, properties: [{ id: 'cycle_value', type: 'number', value: 0.1 }] });
  const before = serializeVeyra(s.document); let rejected = false;
  try { addBinding(s, 'alias_cycle', pg('cycle_value'), prop('propertyGroupProperty:cycle_value/value')); } catch { rejected = true; }
  return { actual: [rejected, serializeVeyra(s.document) === before], expected: [true, true] };
});
check('Ownership read with a live runtime must not consume pending triggers', () => {
  const s = baseStore(); addBinding(s, 'direct_event', data('child', 'child_trigger'), prop('node:box/visible'));
  const r = runtimeFor(s); warm(r, s); r.fire('child', 'child_trigger');
  const before = r.stats.triggerPulsesConsumed;
  const ownership = getOwnership(s.document, 'node:box/visible', { dataRuntime: r });
  return { actual: { status: ownership.status, pending: r.getValue('child', 'child_trigger'), consumedByRead: r.stats.triggerPulsesConsumed - before }, expected: { status: 'ok', pending: true, consumedByRead: 0 } };
});
check('Public operation discovery, invocation and live read-back use one host adapter', () => {
  const s = baseStore(); s.createPropertyGroup({ id: 'port_group', artboard: art, properties: [{ id: 'port_value', type: 'number', value: 0.3 }] });
  addBinding(s, 'port_two', pg('port_value'), prop('node:box/opacity'), { mode: 'twoWay' });
  const r = runtimeFor(s), host = createVeyraRuntimeHost({ store: s, dataRuntime: r }).api;
  const before = [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)];
  const edit = host.getOwnership('node:box/opacity').writableSource.edit;
  const discovery = host.getManifest().authoring.dataGraph.runtimeContract.runtimePorts;
  assert.equal(discovery[edit.port].mutation, true);
  assert.equal(typeof host[edit.port], 'function');
  const args = structuredClone(edit.arguments); args[edit.valueIndex] = 0.67;
  host[edit.port](...args);
  const after = [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)];
  return { actual: [host.read('node:box/opacity').evaluatedValue, JSON.stringify(before) === JSON.stringify(after)], expected: [0.67, true] };
});
check('Alternating unchanged artboards must retain both compiled binding indexes', () => {
  const s = new VeyraStore(createDocument({ id: 'multi_index', artboards: [board('one'), board('two')] }));
  s.createViewModel({ id: 'vm', properties: [{ id: 'p', type: 'number', defaultValue: 0.1 }] });
  for (const id of ['one', 'two']) {
    s.createViewModelInstance({ id: `data_${id}`, viewModel: ref('viewModel', 'vm'), artboard: ref('artboard', id) });
    s.createPropertyGroup({ id: `pg_${id}`, artboard: ref('artboard', id), properties: [{ id: `value_${id}`, type: 'number', value: 0 }] });
    s.createBinding({ id: `binding_${id}`, artboard: ref('artboard', id), source: data(`data_${id}`, 'p'), target: pg(`value_${id}`) });
  }
  const r = runtimeFor(s);
  for (const id of ['one', 'two']) r.evaluateBindings(s.document, { artboardId: id });
  const before = r.stats.graphBuilds;
  for (const id of ['one', 'two']) r.evaluateBindings(s.document, { artboardId: id });
  return { actual: r.stats.graphBuilds - before, expected: 0 };
});


const failed = results.filter(item => item.status !== 'PASS');
assert.equal(failed.length, 0, JSON.stringify(failed, null, 2));
console.log(`M8-C3 reproduced contracts: ${results.length} checks passed`);
