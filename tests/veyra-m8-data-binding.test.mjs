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

check('12 Property Groups are keyable sources in the same frame as data binding', () => {
  const store = baseStore(); addCoreData(store);
  store.createPropertyGroup({ id: 'pg_anim', name: 'Anim', artboard: ref('artboard', store.document.artboards[0].id), properties: [{ id: 'pgp_anim', name: 'Opacity', type: 'number', value: 0.1, keyable: true }] });
  store.createBinding({ id: 'pg_to_node', artboard: ref('artboard', store.document.artboards[0].id), source: { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty','pgp_anim') }, target: { kind: 'property', address: 'node:node_box/opacity' } });
  const scene = evaluateDocument(store.document, { animation: { 'propertyGroupProperty:pgp_anim/value': 0.72 } }, null, { artboardId: store.document.artboards[0].id, dataRuntime: createVeyraDataRuntime(() => store.document) });
  assert.equal(scene.nodes.find((item) => item.id === 'node_box').opacity, 0.72);
  assert.deepEqual(VEYRA_EVALUATION_ORDER, ['authored','animation','playback','data-binding','constraints','interactive']);
});

check('13 declared precedence makes interactive win over data binding and data binding win over animation', () => {
  const store = baseStore(); addCoreData(store);
  store.createBinding({ id: 'precedence', artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main','p_num'), target: { kind: 'property', address: 'node:node_box/opacity' } });
  const runtime = createVeyraDataRuntime(() => store.document); runtime.setValue('inst_main','p_num',0.6);
  const dataScene = evaluateDocument(store.document, { animation: { 'node:node_box/opacity': 0.2 } }, null, { artboardId: store.document.artboards[0].id, dataRuntime: runtime });
  assert.equal(dataScene.nodes.find((item) => item.id === 'node_box').opacity, 0.6);
  const interactiveScene = evaluateDocument(store.document, { animation: { 'node:node_box/opacity': 0.2 }, interactive: { 'node:node_box/opacity': 0.9 } }, null, { artboardId: store.document.artboards[0].id, dataRuntime: runtime });
  assert.equal(interactiveScene.nodes.find((item) => item.id === 'node_box').opacity, 0.9);
});

check('14 zero bindings takes the O(1) fast path without graph construction', () => {
  const store = baseStore(); const runtime = createVeyraDataRuntime(() => store.document); runtime.resetStats();
  const result = runtime.evaluateBindings(store.document, { artboardId: store.document.artboards[0].id });
  assert.equal(result.stats.zeroBindingFastPath, true);
  assert.equal(runtime.stats.graphBuilds, 0);
  assert.equal(runtime.stats.zeroBindingFastPaths, 1);
  assert.match(VEYRA_DATA_EVALUATION_COMPLEXITY.zeroBinding, /O\(1\)/);
});

check('15 dirty propagation recomputes only a reachable branch', () => {
  const store = baseStore(); addCoreData(store);
  store.addDataProperty('vm_main', { id: 'p_x', name: 'X', type: 'number', defaultValue: 10 });
  store.addDataProperty('vm_main', { id: 'p_y', name: 'Y', type: 'number', defaultValue: 20 });
  for (const [id, property, address] of [['b_o','p_num','node:node_box/opacity'],['b_x','p_x','node:node_box/transform/x'],['b_y','p_y','node:node_box/transform/y']]) store.createBinding({ id, artboard: ref('artboard', store.document.artboards[0].id), source: dataEndpoint('inst_main',property), target: { kind: 'property', address } });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id}).stats.evaluatedBindings,3);
  assert.equal(runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id}).stats.evaluatedBindings,0);
  runtime.setValue('inst_main','p_x',33);
  const dirty = runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id});
  assert.equal(dirty.stats.evaluatedBindings,1);
  assert.equal(dirty.overrides['node:node_box/transform/x'],33);
});

check('16 subscriptions batch deterministically and include provenance', () => {
  const store = baseStore(); addCoreData(store); const runtime = createVeyraDataRuntime(() => store.document); const batches=[];
  const off = runtime.subscribe((changes)=>batches.push(changes));
  runtime.batch(()=>{ runtime.setValue('inst_main','p_string','B',{source:'preview',provenance:{who:'user'}}); runtime.setValue('inst_main','p_bool',true,{source:'preview',provenance:{who:'user'}}); });
  off();
  assert.equal(batches.length,1); assert.equal(batches[0].length,2); assert.equal(batches[0][0].source,'preview'); assert.equal(batches[0][0].provenance.who,'user');
});

check('17 authored list operations preserve stable IDs and undo/redo', () => {
  const store = baseStore(); addCoreData(store); const before = store.document.lists[0].items.map((item)=>item.id);
  store.addListItem('list_main',{id:'item_c',value:'C'},1); assert.deepEqual(store.document.lists[0].items.map((item)=>item.id),['item_a','item_c','item_b']);
  store.undo(); assert.deepEqual(store.document.lists[0].items.map((item)=>item.id),before); store.redo(); assert.equal(store.document.lists[0].items[1].id,'item_c');
});

check('18 runtime list mutations are ephemeral and get non-persistent identity', () => {
  const store = baseStore(); addCoreData(store); const runtime=createVeyraDataRuntime(()=>store.document); const before=serializeVeyra(store.document);
  const item=runtime.insertListItem('list_main','R',1); assert.equal(item.persistent,false); assert.match(item.id,/^listItemRuntime_/); assert.equal(runtime.getList('list_main')[1].value,'R'); assert.equal(serializeVeyra(store.document),before);
});

check('19 runtime list move replace remove semantics are deterministic', () => {
  const store=baseStore(); addCoreData(store); const runtime=createVeyraDataRuntime(()=>store.document); const added=runtime.insertListItem('list_main','R');
  assert.equal(runtime.moveListItem('list_main',added.id,0),true); assert.equal(runtime.getList('list_main')[0].id,added.id);
  assert.equal(runtime.replaceListItem('list_main',added.id,'RR'),true); assert.equal(runtime.getList('list_main')[0].value,'RR');
  assert.equal(runtime.removeListItem('list_main',added.id),true); assert.equal(runtime.getList('list_main').some((item)=>item.id===added.id),false);
});

check('20 enumMap converter uses stable enumValue IDs, never names', () => {
  const store=baseStore(); addCoreData(store);
  store.createConverter({id:'enum_conv',name:'Enum map',type:'enumMap',outputType:'string',config:{map:{enum_idle:'idle-value',enum_run:'run-value'}}});
  store.createPropertyGroup({id:'pg_enum',name:'PG',artboard:ref('artboard',store.document.artboards[0].id),properties:[{id:'pgp_enum',name:'Text',type:'string',value:''}]});
  store.createBinding({id:'enum_binding',artboard:ref('artboard',store.document.artboards[0].id),source:dataEndpoint('inst_main','p_enum'),target:{kind:'propertyGroupProperty',property:ref('propertyGroupProperty','pgp_enum')},converterChain:[ref('converter','enum_conv')]});
  const runtime=createVeyraDataRuntime(()=>store.document); runtime.setValue('inst_main','p_enum',ref('enumValue','enum_run'));
  const result=runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id}); assert.equal(result.overrides['propertyGroupProperty:pgp_enum/value'],'run-value');
  store.updateEnumValue('enum_state','enum_run',{name:'Completely Renamed'}); assert.equal(runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id}).overrides['propertyGroupProperty:pgp_enum/value'],'run-value');
});

check('21 image and artboard values validate typed references', () => {
  const store=baseStore(); addCoreData(store); store.addAsset('image',{id:'asset_img',name:'Image',mimeType:'image/png',source:{kind:'external',uri:'image.png'}});
  const runtime=createVeyraDataRuntime(()=>store.document); assert.equal(runtime.setValue('inst_main','p_image',ref('asset','asset_img')),true); assert.equal(runtime.setValue('inst_main','p_artboard',ref('artboard',store.document.artboards[0].id)),true);
  assert.throws(()=>runtime.setValue('inst_main','p_image',ref('asset','missing')),/image asset/);
});

check('22 nested View Model paths resolve through stable instance refs', () => {
  const store=baseStore(); addCoreData(store); store.createPropertyGroup({id:'pg_nested',name:'PG',artboard:ref('artboard',store.document.artboards[0].id),properties:[{id:'pgp_nested',name:'Value',type:'number',value:0}]});
  store.createBinding({id:'nested_binding',artboard:ref('artboard',store.document.artboards[0].id),source:{kind:'data',instance:ref('viewModelInstance','inst_main'),path:[ref('dataProperty','p_nested'),ref('dataProperty','p_nested_value')]},target:{kind:'propertyGroupProperty',property:ref('propertyGroupProperty','pgp_nested')}});
  const runtime=createVeyraDataRuntime(()=>store.document); runtime.setValue('inst_nested','p_nested_value',9); const result=runtime.evaluateBindings(store.document,{artboardId:store.document.artboards[0].id}); assert.equal(result.overrides['propertyGroupProperty:pgp_nested/value'],9);
});

check('23 Component runtime scope isolates the same source data instance for siblings', () => {
  const host=artboard('host',0), source=artboard('source',700);
  const sourceNode=createNode('rectangle',{id:'source_box',name:'Source Box',opacity:1,artboard:ref('artboard','source')});
  const store=new VeyraStore(createDocument({id:'component_data_doc',artboards:[host,source],nodes:[sourceNode],components:[{id:'comp_source',name:'Source',source:ref('artboard','source')}],componentInstances:[
    {id:'ci_a',name:'A',artboard:ref('artboard','host'),component:ref('component','comp_source'),frame:{width:200,height:150},transform:{x:20,y:20}},
    {id:'ci_b',name:'B',artboard:ref('artboard','host'),component:ref('component','comp_source'),frame:{width:200,height:150},transform:{x:260,y:20}},
  ]}));
  store.createViewModel({id:'vm_component',name:'Component Data',properties:[{id:'p_component_opacity',name:'Opacity',type:'number',defaultValue:0.2,min:0,max:1}]});
  store.createViewModelInstance({id:'inst_component',name:'Source Data',viewModel:ref('viewModel','vm_component'),artboard:ref('artboard','source')});
  store.createBinding({id:'component_binding',artboard:ref('artboard','source'),source:dataEndpoint('inst_component','p_component_opacity'),target:{kind:'property',address:'node:source_box/opacity'}});
  const runtime=createVeyraDataRuntime(()=>store.document); runtime.setValue('inst_component','p_component_opacity',0.3,{scopePath:[ref('componentInstance','ci_a')]}); runtime.setValue('inst_component','p_component_opacity',0.8,{scopePath:[ref('componentInstance','ci_b')]});
  const scene=evaluateDocument(store.document,{},null,{artboardId:'host',dataRuntime:runtime,componentRuntime:createComponentRuntimeRegistry(()=>store.document)});
  const a=scene.componentEvaluatedNodes.find((item)=>item.componentInstanceRef?.id==='ci_a'&&item.sourceRef?.id==='source_box'); const b=scene.componentEvaluatedNodes.find((item)=>item.componentInstanceRef?.id==='ci_b'&&item.sourceRef?.id==='source_box');
  assert.equal(a.opacity,0.3); assert.equal(b.opacity,0.8); assert.equal(runtime.getValue('inst_component','p_component_opacity',{scopePath:[ref('componentInstance','ci_a')]}),0.3);
});

check('24 dependency and ownership surfaces expose binding chains', () => {
  const store=baseStore(); addCoreData(store); store.createBinding({id:'dep_binding',artboard:ref('artboard',store.document.artboards[0].id),source:dataEndpoint('inst_main','p_num'),target:{kind:'property',address:'node:node_box/opacity'}});
  const graph=getDependencyGraph(store.document,ref('binding','dep_binding'),{depth:2,maxNodes:500,maxEdges:1000}); assert.equal(graph.status,'ok'); assert.ok(graph.edges.some((edge)=>edge.type==='reads')); assert.ok(graph.edges.some((edge)=>edge.type==='writes'));
  const runtime=createVeyraDataRuntime(()=>store.document); runtime.setValue('inst_main','p_num',0.4); const plane=createVeyraControlPlane(store); const ownership=plane.getOwnership('node:node_box/opacity',{dataRuntime:runtime,artboardId:store.document.artboards[0].id}); assert.equal(ownership.activeOwner.kind,'data-binding'); assert.equal(ownership.activeOwner.ref.id,'dep_binding');
});

check('25 resolver and summary index M8 identities without display-name authority', () => {
  const store=baseStore(); addCoreData(store); const index=buildSemanticIndex(store.document,{maxEntities:5000}); assert.ok(index.entities.some((item)=>item.ref.kind==='viewModel'&&item.ref.id==='vm_main')); assert.ok(index.entities.some((item)=>item.ref.kind==='dataProperty'&&item.ref.id==='p_num'));
  const result=queryEntities(store.document,{kinds:['dataProperty']},{maxResults:100}); assert.ok(result.entities.some((item)=>item.ref.id==='p_num'));
});

check('26 manifest and scene summary declare runtime non-serialization and precedence', () => {
  const store=baseStore(); addCoreData(store); const manifest=createProjectManifest(store.document); assert.equal(manifest.authoring.dataGraph.runtimeState.includes('never serialized'),true); assert.deepEqual(manifest.authoring.dataGraph.evaluationOrder,VEYRA_EVALUATION_ORDER); assert.equal(manifest.scene.data.runtimeStateSerialized,false); assert.ok(manifest.capabilities.includes('data.incremental-dirty-evaluation'));
});

check('27 persistent M8 commands preserve provenance and undo/redo through the canonical dispatcher', () => {
  const store=baseStore(); const plane=createVeyraControlPlane(store); const result=plane.dispatchCommand({action:'createViewModel',args:{overrides:{id:'vm_command',name:'Command Model'}},command:{label:'AI create VM',source:'ai',metadata:{ticket:'m8'}}}); assert.equal(result.ok,true); assert.equal(store.commandHistory.at(-1).source,'ai'); assert.equal(store.commandHistory.at(-1).metadata.ticket,'m8'); store.undo(); assert.equal(store.document.viewModels.some((item)=>item.id==='vm_command'),false); store.redo(); assert.equal(store.document.viewModels.some((item)=>item.id==='vm_command'),true);
});

check('28 large graph envelope and settled evaluation stay bounded/incremental', () => {
  const store=baseStore(); const art=store.document.artboards[0].id; const props=[];
  store.createViewModel({id:'vm_large',name:'Large',properties:Array.from({length:120},(_,index)=>({id:`large_p_${index}`,name:`P${index}`,type:'number',defaultValue:index}))}); store.createViewModelInstance({id:'inst_large',name:'Large',viewModel:ref('viewModel','vm_large'),artboard:ref('artboard',art)});
  for(let index=0;index<120;index+=1){ const groupId=`large_g_${index}`, propertyId=`large_gp_${index}`; store.createPropertyGroup({id:groupId,name:groupId,artboard:ref('artboard',art),properties:[{id:propertyId,name:'Value',type:'number',value:0}]}); store.createBinding({id:`large_b_${index}`,artboard:ref('artboard',art),source:dataEndpoint('inst_large',`large_p_${index}`),target:{kind:'propertyGroupProperty',property:ref('propertyGroupProperty',propertyId)}}); props.push(propertyId); }
  const envelope=bindingComplexityEnvelope(store.document,art); assert.equal(envelope.bindingCount,120); assert.equal(envelope.maxDirectFanOut,1);
  const runtime=createVeyraDataRuntime(()=>store.document); const first=runtime.evaluateBindings(store.document,{artboardId:art}); const settled=runtime.evaluateBindings(store.document,{artboardId:art}); assert.equal(first.stats.evaluatedBindings,120); assert.equal(settled.stats.evaluatedBindings,0); assert.equal(settled.stats.cacheHits,120);
  runtime.setValue('inst_large','large_p_57',999); const dirty=runtime.evaluateBindings(store.document,{artboardId:art}); assert.equal(dirty.stats.evaluatedBindings,1); assert.equal(dirty.overrides[`propertyGroupProperty:${props[57]}/value`],999);
});

assert.equal(checks, 28);
const browserSource=readFileSync(new URL('../veyra.js',import.meta.url),'utf8');
assert.match(browserSource,/View Models & Data Binding/);
assert.match(browserSource,/Runtime Data Preview/);
assert.match(browserSource,/createViewModel:\s*\(overrides = \{\}\) => dispatchCompatibilityCommand\('createViewModel'/);
assert.match(browserSource,/setDataRuntimeValue:[\s\S]*dataRuntime\.setValue/);
assert.match(browserSource,/dataRuntime,\n\s*\}\);/);
console.log(`veyra M8 View Models/data binding tests passed — ${checks}/28 adversarial checks green`);
