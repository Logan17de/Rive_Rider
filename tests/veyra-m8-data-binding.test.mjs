import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createAsset, createDocument, createNode, normalizeDocument, VEYRA_SUPPORTED_VERSIONS,
} from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  VEYRA_DATA_PROPERTY_TYPES, VEYRA_BINDING_CONFLICT_POLICY, VEYRA_DATA_EVALUATION_COMPLEXITY,
  createVeyraDataRuntime, createDataRuntimeScope, bindingComplexityEnvelope,
  normalizeDataGraphDocument,
} from '../src/veyra/dataGraph.js';
import { evaluateDocument, VEYRA_EVALUATION_ORDER, propertySource } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { buildSemanticIndex, queryEntities } from '../src/veyra/resolver.js';
import { getDependencyGraph } from '../src/veyra/dependencyGraph.js';
import { createComponentRuntimeRegistry } from '../src/veyra/components.js';

let checks = 0;
function check(name, fn) {
  try { fn(); checks += 1; }
  catch (error) { error.message = `[M8 ${name}] ${error.message}`; throw error; }
}
function ref(kind, id) { return { kind, id }; }
function artboard(id = 'art_main', x = 0) { return { id, name: id, x, y: 0, width: 640, height: 480, background: '#ffffff' }; }
function baseStore() {
  return new VeyraStore(createDocument({
    id: 'doc_m8',
    artboards: [artboard()],
    nodes: [
      createNode('rectangle', { id: 'node_box', name: 'Box', opacity: 1, transform: { x: 40, y: 50 } }),
      createNode('rectangle', { id: 'node_other', name: 'Other', opacity: 1, transform: { x: 10, y: 20 } }),
    ],
  }));
}
function addCoreData(store, suffix = '') {
  const s = suffix;
  const artboardId = store.document.artboards[0].id;
  store.createEnum({ id: `enum_state${s}`, name: 'State', values: [
    { id: `enum_idle${s}`, name: 'Idle' }, { id: `enum_run${s}`, name: 'Run' },
  ]});
  store.createViewModel({ id: `vm_nested${s}`, name: 'Nested', properties: [
    { id: `p_nested_value${s}`, name: 'Nested Value', type: 'number', defaultValue: 3 },
  ]});
  store.createViewModel({ id: `vm_main${s}`, name: 'Main', properties: [
    { id: `p_num${s}`, name: 'Amount', type: 'number', defaultValue: 0.25, min: 0, max: 1 },
    { id: `p_bool${s}`, name: 'Enabled', type: 'boolean', defaultValue: false },
    { id: `p_trigger${s}`, name: 'Tap', type: 'trigger' },
    { id: `p_string${s}`, name: 'Label', type: 'string', defaultValue: 'hello' },
    { id: `p_color${s}`, name: 'Tint', type: 'color', defaultValue: '#112233' },
    { id: `p_image${s}`, name: 'Image', type: 'image', defaultValue: null },
    { id: `p_artboard${s}`, name: 'Artboard', type: 'artboard', defaultValue: null },
    { id: `p_list${s}`, name: 'Items', type: 'list', defaultValue: null, itemType: { type: 'string' } },
  ]});
  store.addDataProperty(`vm_main${s}`, { id: `p_enum${s}`, name: 'Mode', type: 'enum', enum: ref('enum', `enum_state${s}`), defaultValue: ref('enumValue', `enum_idle${s}`) });
  store.addDataProperty(`vm_main${s}`, { id: `p_nested${s}`, name: 'Nested', type: 'viewModel', viewModel: ref('viewModel', `vm_nested${s}`), defaultValue: null });
  store.createViewModelInstance({ id: `inst_nested${s}`, name: 'Nested Instance', viewModel: ref('viewModel', `vm_nested${s}`), artboard: ref('artboard', artboardId) });
  store.createViewModelInstance({ id: `inst_main${s}`, name: 'Main Instance', viewModel: ref('viewModel', `vm_main${s}`), artboard: ref('artboard', artboardId), initialValues: [
    { property: ref('dataProperty', `p_nested${s}`), value: ref('viewModelInstance', `inst_nested${s}`) },
  ] });
  store.createList({ id: `list_main${s}`, name: 'Items', owner: ref('viewModelInstance', `inst_main${s}`), property: ref('dataProperty', `p_list${s}`), items: [
    { id: `item_a${s}`, value: 'A' }, { id: `item_b${s}`, value: 'B' },
  ] });
  const current = store.document.viewModelInstances.find((item) => item.id === `inst_main${s}`);
  store.updateViewModelInstance(`inst_main${s}`, { initialValues: [
    ...current.initialValues,
    { property: ref('dataProperty', `p_list${s}`), value: ref('list', `list_main${s}`) },
  ] });
  return { artboardId };
}
function dataEndpoint(instanceId, propertyId) {
  return { kind: 'data', instance: ref('viewModelInstance', instanceId), path: [ref('dataProperty', propertyId)] };
}

check('1 schema generation is additive and old projects stay pre-M8', () => {
  const old = normalizeDocument(createDocument({ id: 'old', artboards: [artboard('old_art')] }));
  assert.equal(old.version, 5);
  const store = baseStore(); addCoreData(store);
  assert.equal(store.document.version, 6);
  assert.deepEqual(VEYRA_SUPPORTED_VERSIONS, [1, 2, 3, 4, 5, 6]);
});

check('2 all required property types normalize with stable typed identity', () => {
  const store = baseStore(); addCoreData(store);
  const model = store.document.viewModels.find((item) => item.id === 'vm_main');
  assert.deepEqual([...new Set(model.properties.map((item) => item.type))].sort(), [...VEYRA_DATA_PROPERTY_TYPES].sort());
  assert.equal(new Set(model.properties.map((item) => item.id)).size, model.properties.length);
});

check('3 human names are display-only while refs survive renames', () => {
  const store = baseStore(); addCoreData(store);
  store.updateViewModel('vm_main', { name: 'Totally Different' });
  store.updateDataProperty('vm_main', 'p_num', { name: 'Renamed Amount' });
  assert.equal(store.document.viewModelInstances.find((item) => item.id === 'inst_main').viewModel.id, 'vm_main');
  assert.equal(store.document.bindings.length, 0);
});

check('4 runtime values never pollute authored serialization', () => {
  const store = baseStore(); addCoreData(store);
  const runtime = createVeyraDataRuntime(() => store.document);
  const before = serializeVeyra(store.document);
  runtime.setValue('inst_main', 'p_num', 0.75);
  runtime.setValue('inst_main', 'p_string', 'runtime');
  assert.equal(runtime.getValue('inst_main', 'p_num'), 0.75);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.document.viewModelInstances.find((item) => item.id === 'inst_main').initialValues.some((item) => item.value === 0.75), false);
});

check('5 trigger edges are one-shot and settle back to false', () => {
  const store = baseStore(); addCoreData(store);
  store.createPropertyGroup({ id: 'pg_trigger', name: 'PG', artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: 'pgp_trigger', name: 'Triggered', type: 'boolean', value: false }] });
  store.createBinding({ id: 'binding_trigger', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_trigger'), target: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty','pgp_trigger') } });
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.fire('inst_main','p_trigger');
  const first = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  const second = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  const third = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(first.overrides['propertyGroupProperty:pgp_trigger/value'], true);
  assert.equal(second.overrides['propertyGroupProperty:pgp_trigger/value'], false);
  assert.equal(third.stats.evaluatedBindings, 0);
});

check('6 one-way binding drives a real evaluated property', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id: 'binding_opacity', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  const runtime = createVeyraDataRuntime(() => store.document); runtime.setValue('inst_main','p_num',0.61);
  const scene = evaluateDocument(store.document, {}, null, { artboardId: store.document.artboards[0].id, dataRuntime: runtime });
  assert.equal(scene.nodes.find((item) => item.id === 'node_box').opacity, 0.61);
  assert.equal(propertySource(scene, 'node:node_box/opacity'), 'data-binding');
});

check('7 converter chains are deterministic and typed', () => {
  const store = baseStore(); addCoreData(store);
  store.createConverter({ id: 'conv_string', name: 'Number text', type: 'numberToString', config: { decimals: 2 } });
  store.createPropertyGroup({ id: 'pg_text', name: 'Text', artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: 'pgp_text', name: 'Text', type: 'string', value: '' }] });
  store.createBinding({ id: 'binding_text', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty','pgp_text') }, converterChain: [ref('converter','conv_string')] });
  const runtime = createVeyraDataRuntime(() => store.document); runtime.setValue('inst_main','p_num',0.5);
  const result = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(result.overrides['propertyGroupProperty:pgp_text/value'], '0.50');
});

check('8 competing bindings use explicit priority and stable-id tie break', () => {
  const store = baseStore(); addCoreData(store);
  store.addDataProperty('vm_main', { id: 'p_num2', name: 'Second', type: 'number', defaultValue: 0.8, min: 0, max: 1 });
  store.createBinding({ id: 'binding_z', priority: 1, artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num2'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  store.createBinding({ id: 'binding_a', priority: 1, artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  const result = createVeyraDataRuntime(() => store.document).evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(result.ownership['node:node_box/opacity'].ref.id, 'binding_a');
  assert.equal(result.diagnostics.conflicts[0].policy.tieBreak, VEYRA_BINDING_CONFLICT_POLICY.tieBreak);
});

check('9 direct binding cycles fail atomically', () => {
  const store = baseStore(); addCoreData(store);
  const before = serializeVeyra(store.document);
  assert.throws(() => store.createBinding({ id: 'self_cycle', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: dataEndpoint('inst_main','p_num') }), /binding-cycle/);
  assert.equal(serializeVeyra(store.document), before);
});

check('10 multi-hop binding cycles fail atomically', () => {
  const store = baseStore(); addCoreData(store);
  store.createPropertyGroup({ id: 'pg_cycle', name: 'Cycle', artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: 'pgp_cycle', name: 'Cycle', type: 'number', value: 0 }] });
  store.createBinding({ id: 'cycle_one', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty','pgp_cycle') } });
  const before = serializeVeyra(store.document);
  assert.throws(() => store.createBinding({ id: 'cycle_two', artboard: ref('artboard', store.document.artboards[0].id), source: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty','pgp_cycle') }, target: dataEndpoint('inst_main','p_num') }), /binding-cycle/);
  assert.equal(serializeVeyra(store.document), before);
});

check('11 legal two-way binding reverses target edits into runtime data only', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id: 'two_way', mode: 'twoWay', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  const runtime = createVeyraDataRuntime(() => store.document);
  const authored = serializeVeyra(store.document);
  runtime.setTwoWayTarget('two_way', 0.44);
  assert.equal(runtime.getValue('inst_main','p_num'), 0.44);
  assert.equal(serializeVeyra(store.document), authored);
});

check('12 Property Groups are keyable sources in the normal timeline system', () => {
  const store = baseStore(); addCoreData(store);
  store.createPropertyGroup({ id: 'pg_anim', name: 'Animatable', artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: 'pgp_anim', name: 'Value', type: 'number', value: 0.1, keyable: true }] });
  const timelineId = store.addTimeline({ id: 'tl_data', artboard: ref('artboard', store.document.artboards[0].id), name: 'Data', duration: 30, fps: 30 });
  store.setKeyframe({ timelineId, address: 'propertyGroupProperty:pgp_anim/value', frame: 0, value: 0.1 });
  store.setKeyframe({ timelineId, address: 'propertyGroupProperty:pgp_anim/value', frame: 30, value: 0.9 });
  assert.equal(store.document.timelines.find((item) => item.id === timelineId).tracks[0].address, 'propertyGroupProperty:pgp_anim/value');
});

check('13 evaluation precedence is explicit and binding sits between playback and constraints', () => {
  assert.deepEqual(VEYRA_EVALUATION_ORDER, ['authored','animation','playback','data-binding','constraints','interactive']);
});

check('14 zero bindings have an O(1) fast path with no graph construction', () => {
  const store = baseStore(); addCoreData(store);
  const runtime = createVeyraDataRuntime(() => store.document);
  const result = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(result.stats.zeroBindingFastPath, true);
  assert.equal(result.stats.graphBuilt, false);
  assert.equal(result.stats.evaluatedBindings, 0);
});

check('15 dirty propagation touches only reachable branches', () => {
  const store = baseStore(); addCoreData(store);
  store.addDataProperty('vm_main', { id: 'p_branch_b', name: 'B', type: 'number', defaultValue: 0.2 });
  store.createBinding({ id: 'branch_a', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  store.createBinding({ id: 'branch_b', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_branch_b'), target: { kind: 'property', address: 'node:node_other/opacity' } });
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  runtime.setValue('inst_main','p_num',0.7);
  const dirty = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(dirty.stats.evaluatedBindings, 1);
  assert.equal(dirty.stats.cacheHits, 1);
});

check('16 moderately large graph stays incremental', () => {
  const store = baseStore(); addCoreData(store);
  const count = 220;
  for (let i = 0; i < count; i += 1) {
    const propertyId = `p_bulk_${i}`;
    store.addDataProperty('vm_main', { id: propertyId, name: `P ${i}`, type: 'number', defaultValue: i / count });
    store.createPropertyGroup({ id: `pg_bulk_${i}`, name: `PG ${i}`, artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: `pgp_bulk_${i}`, name: 'Value', type: 'number', value: 0 }] });
    store.createBinding({ id: `binding_bulk_${String(i).padStart(3,'0')}`, artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main', propertyId), target: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty', `pgp_bulk_${i}`) } });
  }
  const runtime = createVeyraDataRuntime(() => store.document);
  const initial = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(initial.stats.evaluatedBindings, count);
  runtime.setValue('inst_main','p_bulk_117',0.333);
  const next = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(next.stats.evaluatedBindings, 1);
  assert.ok(runtime.stats.dirtyInvalidations <= 1);
  const envelope = bindingComplexityEnvelope(store.document);
  assert.equal(envelope.bindingCount, count);
  assert.equal(VEYRA_DATA_EVALUATION_COMPLEXITY.dirtyPropagation, 'O(reachable binding edges)');
});

check('17 Component runtime scopes isolate data values and bindings', () => {
  const source = artboard('source_art', 800);
  const host = artboard('host_art', 0);
  const doc = createDocument({ id: 'component_data', artboards: [host, source], nodes: [createNode('rectangle', { id: 'source_node', artboard: ref('artboard','source_art'), opacity: 1 })] });
  const store = new VeyraStore(doc);
  store.createComponent('source_art', { id: 'cmp_data', name: 'Data component' });
  store.addComponentInstance('cmp_data', { id: 'cmp_inst_a', name: 'A', artboard: ref('artboard','host_art'), transform: { x: 0, y: 0 } });
  store.addComponentInstance('cmp_data', { id: 'cmp_inst_b', name: 'B', artboard: ref('artboard','host_art'), transform: { x: 200, y: 0 } });
  store.createViewModel({ id: 'vm_component', name: 'ComponentVM', properties: [{ id: 'p_component', name: 'Opacity', type: 'number', defaultValue: 0.2, min: 0, max: 1 }] });
  store.createViewModelInstance({ id: 'inst_component', name: 'Component Data', viewModel: ref('viewModel','vm_component'), artboard: ref('artboard','source_art') });
  store.createBinding({ id: 'bind_component', artboard: ref('artboard','source_art'), source: dataEndpoint('inst_component','p_component'), target: { kind: 'property', address: 'node:source_node/opacity' } });
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.setValue('inst_component','p_component',0.3,{ scopePath: [ref('componentInstance','cmp_inst_a')] });
  runtime.setValue('inst_component','p_component',0.8,{ scopePath: [ref('componentInstance','cmp_inst_b')] });
  const componentRuntime = createComponentRuntimeRegistry(() => store.document);
  const scene = evaluateDocument(store.document, {}, null, { artboardId: 'host_art', dataRuntime: runtime, componentRuntime });
  const instanceA = scene.componentEvaluatedNodes.find((node) => node.componentInstanceRef.id === 'cmp_inst_a');
  const instanceB = scene.componentEvaluatedNodes.find((node) => node.componentInstanceRef.id === 'cmp_inst_b');
  assert.equal(instanceA.opacity, 0.3);
  assert.equal(instanceB.opacity, 0.8);
});

check('18 persistent and runtime list mutation stay distinct', () => {
  const store = baseStore(); addCoreData(store);
  const runtime = createVeyraDataRuntime(() => store.document);
  const before = serializeVeyra(store.document);
  const inserted = runtime.insertListItem('list_main', 'Runtime', 1);
  assert.equal(runtime.getList('list_main')[1].id, inserted.id);
  assert.equal(runtime.getList('list_main')[1].value, 'Runtime');
  assert.equal(serializeVeyra(store.document), before);
  store.moveListItem('list_main','item_b',0);
  assert.equal(store.document.lists.find((item) => item.id === 'list_main').items[0].id, 'item_b');
  store.undo();
  assert.equal(store.document.lists.find((item) => item.id === 'list_main').items[0].id, 'item_a');
});

check('19 deletion of bound data fails closed with dependency ids', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id: 'dep_binding', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  assert.throws(() => store.removeDataProperty('vm_main','p_num'), /dep_binding/);
  assert.throws(() => store.removeViewModelInstance('inst_main'), /dep_binding/);
});

check('20 enums preserve stable value identity and block live removal', () => {
  const store = baseStore(); addCoreData(store);
  store.updateEnumValue('enum_state','enum_idle',{ name: 'Resting' });
  assert.equal(store.document.viewModels.find((item) => item.id === 'vm_main').properties.find((item) => item.id === 'p_enum').defaultValue.id,'enum_idle');
  assert.throws(() => store.removeEnumValue('enum_state','enum_idle'), /viewModel:vm_main/);
});

check('21 image/artboard refs validate target families', () => {
  const store = baseStore(); addCoreData(store);
  store.addAsset('image',{ id:'asset_img', name:'Picture', source:{kind:'external',uri:'picture.png'} });
  store.updateDataProperty('vm_main','p_image',{ defaultValue: ref('asset','asset_img') });
  store.updateDataProperty('vm_main','p_artboard',{ defaultValue: ref('artboard',store.document.artboards[0].id) });
  assert.throws(() => store.updateDataProperty('vm_main','p_artboard',{ defaultValue: ref('asset','asset_img') }), /artboard/);
});

check('22 undo/redo of authored data never touches runtime data', () => {
  const store = baseStore(); addCoreData(store);
  const runtime = createVeyraDataRuntime(() => store.document); runtime.setValue('inst_main','p_num',0.87);
  store.updateDataProperty('vm_main','p_num',{ name:'Changed' });
  store.undo();
  assert.equal(runtime.getValue('inst_main','p_num'),0.87);
  store.redo();
  assert.equal(runtime.getValue('inst_main','p_num'),0.87);
});

check('23 canonical command preview/dispatch share stable ids and invalid binding is atomic', () => {
  const store = baseStore(); addCoreData(store);
  const cp = createVeyraControlPlane(store);
  const descriptor = { action:'createConverter', args:{overrides:{name:'Generated',type:'numberToString'}}, command:{source:'ai',label:'Create converter'} };
  const preview = cp.previewCommand(descriptor);
  const dispatch = cp.dispatchCommand(descriptor);
  assert.equal(preview.result.id, dispatch.result.id);
  const before = serializeVeyra(store.document);
  const bad = cp.dispatchCommand({ action:'createBinding', args:{overrides:{artboard:ref('artboard',store.document.artboards[0].id),source:dataEndpoint('inst_main','p_num'),target:dataEndpoint('inst_main','p_num')}} });
  assert.equal(bad.ok,false); assert.equal(serializeVeyra(store.document),before);
});

check('24 resolver/dependency/ownership surfaces expose M8 stable entities', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id:'bind_surface', artboard:ref('artboard',store.document.artboards[0].id), source:dataEndpoint('inst_main','p_num'), target:{kind:'property',address:'node:node_box/opacity'} });
  const index = buildSemanticIndex(store.document,{maxEntities:5000});
  assert.ok(index.entities.some((item)=>item.ref.kind==='viewModel'&&item.ref.id==='vm_main'));
  assert.ok(queryEntities(store.document,{kinds:['binding']},{maxResults:50}).entities.some((item)=>item.ref.id==='bind_surface'));
  const graph = getDependencyGraph(store.document,ref('binding','bind_surface'),{depth:2,maxNodes:5000,maxEdges:10000});
  assert.ok(graph.edges.some((edge)=>edge.type==='writes'&&edge.from.ref?.id==='bind_surface'));
  const ownership = createVeyraControlPlane(store).getOwnership('node:node_box/opacity',{dataRuntime:createVeyraDataRuntime(()=>store.document)});
  assert.ok(ownership.potentialControllers.some((item)=>item.kind==='data-binding'));
});

check('25 manifest and scene summary expose authored graph but no live runtime', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id:'manifest_binding', artboard:ref('artboard',store.document.artboards[0].id), source:dataEndpoint('inst_main','p_num'), target:{kind:'property',address:'node:node_box/opacity'} });
  const manifest = createProjectManifest(store.document);
  assert.equal(manifest.authoring.dataGraph.runtimeState.includes('never serialized'),true);
  assert.ok(manifest.actions.some((item)=>item.ref.id==='create-view-model'));
  assert.ok(manifest.actions.some((item)=>item.ref.id==='set-data-runtime-value'&&item.transport==='runtime'));
  assert.equal(JSON.stringify(manifest).includes('dirtySources'),false);
});

check('26 static browser integration routes persistent M8 writes through dispatcher', () => {
  const source = readFileSync(new URL('../veyra.js',import.meta.url),'utf8');
  for (const helper of ['createViewModel','addDataProperty','createViewModelInstance','createBinding','createEnum','createConverter','createPropertyGroup','createList']) {
    assert.match(source,new RegExp(`${helper}:.*dispatchCompatibilityCommand\\(`,'s'));
  }
  assert.match(source,/const dataRuntime = createVeyraDataRuntime/);
  assert.match(source,/function appendDataGraphInspector/);
});

check('27 runtime scopes are canonical and deterministic', () => {
  const scope = createDataRuntimeScope([ref('componentInstance','outer')]);
  assert.deepEqual(scope,{kind:'dataRuntimeScope',key:'componentInstance:outer',path:[ref('componentInstance','outer')]});
});

check('28 validation catches missing nested View Model and list references', () => {
  const store = baseStore(); addCoreData(store);
  const raw = JSON.parse(serializeVeyra(store.document));
  raw.viewModelInstances.find((item)=>item.id==='inst_main').initialValues = [{property:ref('dataProperty','p_nested'),value:ref('viewModelInstance','missing')}];
  assert.throws(()=>normalizeDataGraphDocument(raw),/missing/);
});

console.log(`veyra M8 View Models/data binding tests passed — ${checks}/28 adversarial checks green`);
