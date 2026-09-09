import assert from 'node:assert/strict';
import {createDocument,createNode} from '../../src/veyra/model.js';
import {VeyraStore} from '../../src/veyra/store.js';
import {createVeyraDataRuntime} from '../../src/veyra/dataGraph.js';
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

export {ref, art, data, pg, prop, board, baseStore, addBinding, runtimeFor, evaluate, warm};
