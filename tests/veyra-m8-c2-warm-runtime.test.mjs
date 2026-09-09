import assert from 'node:assert/strict';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { getOwnership } from '../src/veyra/controlPlane.js';
import { serializeVeyra } from '../src/veyra/io.js';

let checks = 0;
function check(name, fn) {
  try { fn(); checks += 1; }
  catch (error) { error.message = `[M8-C2 ${name}] ${error.message}`; throw error; }
}
function ref(kind, id) { return { kind, id }; }
function endpoint(instanceId, ...propertyIds) { return { kind: 'data', instance: ref('viewModelInstance', instanceId), path: propertyIds.map((id) => ref('dataProperty', id)) }; }
function property(address) { return { kind: 'property', address }; }
function pg(id) { return { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty', id) }; }
function artboard() { return { id: 'art_main', name: 'Main', x: 0, y: 0, width: 640, height: 480, background: '#ffffff' }; }
function baseStore() {
  const store = new VeyraStore(createDocument({
    id: 'doc_m8_c2', artboards: [artboard()],
    nodes: [
      createNode('rectangle', { id: 'box', opacity: 1 }),
      createNode('rectangle', { id: 'other', opacity: 1 }),
      createNode('rectangle', { id: 'third', opacity: 1 }),
    ],
  }));
  const art = ref('artboard', 'art_main');
  store.createViewModel({ id: 'vm_nested', name: 'Nested', properties: [
    { id: 'nested_value', type: 'number', defaultValue: 0.2, min: 0, max: 1 },
  ] });
  store.createViewModel({ id: 'vm_main', name: 'Main', properties: [
    { id: 'num', type: 'number', defaultValue: 0.25, min: 0, max: 1 },
    { id: 'alt', type: 'number', defaultValue: 0.75, min: 0, max: 1 },
    { id: 'nested', type: 'viewModel', viewModel: ref('viewModel', 'vm_nested'), defaultValue: null },
  ] });
  store.createViewModelInstance({ id: 'inst_nested_a', viewModel: ref('viewModel', 'vm_nested'), artboard: art });
  store.createViewModelInstance({ id: 'inst_nested_b', viewModel: ref('viewModel', 'vm_nested'), artboard: art, initialValues: [
    { property: ref('dataProperty', 'nested_value'), value: 0.8 },
  ] });
  store.createViewModelInstance({ id: 'inst_main', viewModel: ref('viewModel', 'vm_main'), artboard: art, initialValues: [
    { property: ref('dataProperty', 'nested'), value: ref('viewModelInstance', 'inst_nested_a') },
  ] });
  return store;
}
function evalRuntime(runtime, store, scopePath = []) {
  return runtime.evaluateBindings(store.document, { artboardId: 'art_main', scopePath });
}
function warm(runtime, store, scopePath = []) {
  evalRuntime(runtime, store, scopePath);
  const settled = evalRuntime(runtime, store, scopePath);
  assert.equal(settled.stats.evaluatedBindings, 0);
  return settled;
}
function snapshot(store) {
  return { serialized: serializeVeyra(store.document), revision: store.revision, history: JSON.stringify(store.commandHistory) };
}
function assertSnapshot(store, before) {
  assert.equal(serializeVeyra(store.document), before.serialized);
  assert.equal(store.revision, before.revision);
  assert.equal(JSON.stringify(store.commandHistory), before.history);
}

check('nested terminal invalidation wakes only the reachable warm branch', () => {
  const store = baseStore();
  store.createBinding({ id: 'nested_bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','nested','nested_value'), target: property('node:box/opacity') });
  store.createBinding({ id: 'unrelated', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:other/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  runtime.setValue('inst_nested_a', 'nested_value', 0.61);
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], 0.61);
  assert.equal(changed.overrides['node:other/opacity'], 0.25);
  assert.equal(changed.stats.evaluatedBindings, 1);
  assert.equal(changed.stats.cacheHits, 1);
  assert.equal(evalRuntime(runtime, store).stats.evaluatedBindings, 0);
});

check('nested two-way reverse write invalidates the already-warm forward path', () => {
  const store = baseStore();
  store.createBinding({ id: 'nested_two', mode: 'twoWay', artboard: ref('artboard','art_main'), source: endpoint('inst_main','nested','nested_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  assert.equal(runtime.setTwoWayTarget('nested_two', 0.66), true);
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], 0.66);
  assert.equal(changed.stats.evaluatedBindings, 1);
  assert.equal(evalRuntime(runtime, store).stats.evaluatedBindings, 0);
});

check('nested warm invalidation and two-way writes remain isolated by full Component scope', () => {
  const store = baseStore();
  store.createBinding({ id: 'nested_two', mode: 'twoWay', artboard: ref('artboard','art_main'), source: endpoint('inst_main','nested','nested_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const a = [ref('componentInstance','outer_a'), ref('componentInstance','inner')];
  const b = [ref('componentInstance','outer_b'), ref('componentInstance','inner')];
  warm(runtime, store, a); warm(runtime, store, b);
  runtime.setTwoWayTarget('nested_two', 0.71, { scopePath: a });
  const outA = evalRuntime(runtime, store, a);
  const outB = evalRuntime(runtime, store, b);
  assert.equal(outA.overrides['node:box/opacity'], 0.71);
  assert.equal(outA.stats.evaluatedBindings, 1);
  assert.equal(outB.overrides['node:box/opacity'], 0.2);
  assert.equal(outB.stats.evaluatedBindings, 0);
  runtime.setValue('inst_nested_a', 'nested_value', 0.33, { scopePath: b });
  assert.equal(evalRuntime(runtime, store, b).overrides['node:box/opacity'], 0.33);
  assert.equal(evalRuntime(runtime, store, a).overrides['node:box/opacity'], 0.71);
});

check('nested rename/reorder after warmup keeps invalidation on stable refs', () => {
  const store = baseStore();
  store.createBinding({ id: 'nested_bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','nested','nested_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateViewModel('vm_main', { name: '' });
  store.updateViewModel('vm_nested', { name: 'totally random' });
  store.execute({ label: 'Reorder stable data properties', source: 'test' }, (document) => {
    const model = document.viewModels.find((item) => item.id === 'vm_main');
    model.properties = [...model.properties].reverse();
  });
  evalRuntime(runtime, store);
  warm(runtime, store);
  runtime.setValue('inst_nested_a', 'nested_value', 0.58);
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.58);
});

check('converter config change under the same IDs invalidates warm cache exactly once', () => {
  const store = baseStore();
  store.createConverter({ id: 'conv', type: 'conditional', inputType: 'number', outputType: 'number', config: { equals: 0.25, then: 0.1, else: 0.9 } });
  store.createBinding({ id: 'bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity'), converterChain: [ref('converter','conv')] });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateConverter('conv', { config: { equals: 0.25, then: 0.44, else: 0.9 } });
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], 0.44);
  assert.ok(changed.stats.evaluatedBindings > 0);
  assert.equal(evalRuntime(runtime, store).stats.evaluatedBindings, 0);
});

check('binding source change under the same ID cannot reuse old output', () => {
  const store = baseStore();
  store.createBinding({ id: 'bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateBinding('bind', { source: endpoint('inst_main','alt') });
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], 0.75);
  assert.ok(changed.stats.evaluatedBindings > 0);
  assert.equal(evalRuntime(runtime, store).stats.evaluatedBindings, 0);
});

check('binding target change under the same ID drops old ownership/output and applies new target', () => {
  const store = baseStore();
  store.createBinding({ id: 'bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateBinding('bind', { target: property('node:other/opacity') });
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], undefined);
  assert.equal(changed.ownership['node:box/opacity'], undefined);
  assert.equal(changed.overrides['node:other/opacity'], 0.25);
  assert.equal(changed.ownership['node:other/opacity'].ref.id, 'bind');
});

check('authored default and initial changes refresh warm data unless a runtime override exists', () => {
  const store = baseStore();
  store.createBinding({ id: 'bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateDataProperty('vm_main', 'num', { defaultValue: 0.52 });
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.52);
  warm(runtime, store);
  runtime.setValue('inst_main', 'num', 0.73);
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.73);
  store.updateDataProperty('vm_main', 'num', { defaultValue: 0.11 });
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.73);
  runtime.reset();
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.11);

  const current = store.document.viewModelInstances.find((item) => item.id === 'inst_main');
  store.updateViewModelInstance('inst_main', { initialValues: [...current.initialValues, { property: ref('dataProperty','num'), value: 0.42 }] });
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.42);
});

check('nested initial-reference authored change refreshes an already-warm nested binding', () => {
  const store = baseStore();
  store.createBinding({ id: 'nested_bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','nested','nested_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateViewModelInstance('inst_main', { initialValues: [{ property: ref('dataProperty','nested'), value: ref('viewModelInstance','inst_nested_b') }] });
  const changed = evalRuntime(runtime, store);
  assert.equal(changed.overrides['node:box/opacity'], 0.8);
  assert.equal(evalRuntime(runtime, store).stats.evaluatedBindings, 0);
});

check('winner changes and reused binding IDs cannot resurrect stale cache entries', () => {
  const store = baseStore();
  store.createBinding({ id: 'a', priority: 0, artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity') });
  store.createBinding({ id: 'b', priority: 1, artboard: ref('artboard','art_main'), source: endpoint('inst_main','alt'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(warm(runtime, store).overrides['node:box/opacity'], 0.75);
  store.updateBinding('a', { priority: 2 });
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.25);
  warm(runtime, store);
  store.removeBinding('a');
  store.createBinding({ id: 'a', priority: 3, artboard: ref('artboard','art_main'), source: endpoint('inst_main','alt'), target: property('node:box/opacity') });
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.75);
});

check('Property Group two-way writes are scoped runtime state, never silent authored mutation', () => {
  const store = baseStore();
  store.createPropertyGroup({ id: 'pg', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_value', type: 'number', value: 0.3 }] });
  store.createBinding({ id: 'pg_two', mode: 'twoWay', artboard: ref('artboard','art_main'), source: pg('pg_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  const before = snapshot(store);
  assert.equal(runtime.setTwoWayTarget('pg_two', 0.64), true);
  assertSnapshot(store, before);
  assert.equal(runtime.getPropertyGroupValue('pg_value'), 0.64);
  assert.equal(store.document.propertyGroups[0].properties[0].value, 0.3);
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.64);
  const ownership = getOwnership(store.document, 'node:box/opacity', { dataRuntime: runtime });
  assert.equal(ownership.writableSource.kind, 'property-group-runtime-property');
  assert.equal(ownership.writableSource.authored, false);
  assert.equal(ownership.writableSource.runtimeOverride, true);
  runtime.reset();
  assert.equal(runtime.getPropertyGroupValue('pg_value'), 0.3);
  assert.equal(evalRuntime(runtime, store).overrides['node:box/opacity'], 0.3);
  assertSnapshot(store, before);
});

check('Property Group runtime reverse writes stay isolated across repeated Component scopes', () => {
  const store = baseStore();
  store.createPropertyGroup({ id: 'pg', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_value', type: 'number', value: 0.3 }] });
  store.createBinding({ id: 'pg_two', mode: 'twoWay', artboard: ref('artboard','art_main'), source: pg('pg_value'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const a = [ref('componentInstance','outer_a'), ref('componentInstance','inner')];
  const b = [ref('componentInstance','outer_b'), ref('componentInstance','inner')];
  warm(runtime, store, a); warm(runtime, store, b);
  runtime.setTwoWayTarget('pg_two', 0.81, { scopePath: a });
  assert.equal(evalRuntime(runtime, store, a).overrides['node:box/opacity'], 0.81);
  assert.equal(evalRuntime(runtime, store, b).overrides['node:box/opacity'], 0.3);
  assert.equal(runtime.getPropertyGroupValue('pg_value', { scopePath: a }), 0.81);
  assert.equal(runtime.getPropertyGroupValue('pg_value', { scopePath: b }), 0.3);
});

check('authored invalidation returns to settled sleeping and zero-binding path remains O(1)', () => {
  const store = baseStore();
  const emptyRuntime = createVeyraDataRuntime(() => store.document);
  const zero = evalRuntime(emptyRuntime, store);
  assert.equal(zero.stats.zeroBindingFastPath, true);
  assert.equal(zero.stats.graphBuilt, false);

  store.createBinding({ id: 'bind', artboard: ref('artboard','art_main'), source: endpoint('inst_main','num'), target: property('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  warm(runtime, store);
  store.updateDataProperty('vm_main', 'num', { defaultValue: 0.49 });
  const invalidated = evalRuntime(runtime, store);
  assert.ok(invalidated.stats.evaluatedBindings > 0);
  const settled = evalRuntime(runtime, store);
  assert.equal(settled.stats.evaluatedBindings, 0);
  assert.ok(settled.stats.cacheHits > 0);
});

console.log(`veyra M8-C2 warm-runtime correction tests passed — ${checks} checks green`);
