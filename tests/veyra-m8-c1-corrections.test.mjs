import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  VEYRA_DATA_PROPERTY_TYPES,
  bindingComplexityEnvelope,
  bindingEndpointCapabilities,
  createDataRuntimeScope,
  createVeyraDataRuntime,
} from '../src/veyra/dataGraph.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { buildSemanticIndex, queryEntities } from '../src/veyra/resolver.js';
import { getDependencyGraph } from '../src/veyra/dependencyGraph.js';
import { VEYRA_COMMAND_TABLE } from '../src/veyra/commands.js';
import { VEYRA_BROWSER_MUTATION_COMPATIBILITY } from '../src/veyra/serviceRegistry.js';
import { createComponentRuntimeRegistry } from '../src/veyra/components.js';

let checks = 0;
const coveredOriginal = new Set();
function check(name, originals, fn) {
  try {
    fn();
    for (const value of originals) coveredOriginal.add(value);
    checks += 1;
  } catch (error) {
    error.message = `[M8-C1 ${name}] ${error.message}`;
    throw error;
  }
}
function ref(kind, id) { return { kind, id }; }
function artboard(id = 'art_main', x = 0) { return { id, name: id, x, y: 0, width: 640, height: 480, background: '#ffffff' }; }
function dataEndpoint(instanceId, ...propertyIds) {
  return { kind: 'data', instance: ref('viewModelInstance', instanceId), path: propertyIds.map((id) => ref('dataProperty', id)) };
}
function pgEndpoint(id) { return { kind: 'propertyGroupProperty', property: ref('propertyGroupProperty', id) }; }
function propertyEndpoint(address) { return { kind: 'property', address }; }
function snapshot(store) {
  return { document: serializeVeyra(store.document), revision: store.revision, history: JSON.stringify(store.commandHistory) };
}
function assertSnapshot(store, before) {
  assert.equal(serializeVeyra(store.document), before.document);
  assert.equal(store.revision, before.revision);
  assert.equal(JSON.stringify(store.commandHistory), before.history);
}
function baseStore() {
  return new VeyraStore(createDocument({
    id: 'doc_c1',
    artboards: [artboard()],
    nodes: [
      createNode('rectangle', { id: 'box', name: 'Box', opacity: 1, transform: { x: 10, y: 20 } }),
      createNode('rectangle', { id: 'other', name: 'Other', opacity: 1, transform: { x: 30, y: 40 } }),
    ],
  }));
}
function seedCore(store) {
  const art = ref('artboard', store.document.artboards[0].id);
  store.createEnum({ id: 'enum_state', name: 'State', values: [{ id: 'enum_idle', name: 'Idle' }, { id: 'enum_run', name: 'Run' }] });
  store.createViewModel({ id: 'vm_nested', name: 'Nested', properties: [
    { id: 'nested_value', name: 'Value', type: 'number', defaultValue: 0.2, min: 0, max: 1 },
  ] });
  store.createViewModel({ id: 'vm_main', name: 'Main', properties: [
    { id: 'num', name: 'Amount', type: 'number', defaultValue: 0.25, min: 0, max: 1 },
    { id: 'bool', name: 'Enabled', type: 'boolean', defaultValue: false },
    { id: 'trigger', name: 'Tap', type: 'trigger' },
    { id: 'string', name: 'Label', type: 'string', defaultValue: 'hello' },
    { id: 'color', name: 'Tint', type: 'color', defaultValue: '#112233' },
    { id: 'image', name: 'Image', type: 'image', defaultValue: null },
    { id: 'artboard_value', name: 'Artboard', type: 'artboard', defaultValue: null },
    { id: 'list_prop', name: 'Items', type: 'list', defaultValue: null, itemType: { type: 'string' } },
    { id: 'enum_prop', name: 'Mode', type: 'enum', enum: ref('enum', 'enum_state'), defaultValue: ref('enumValue', 'enum_idle') },
    { id: 'nested', name: 'Nested', type: 'viewModel', viewModel: ref('viewModel', 'vm_nested'), defaultValue: null },
  ] });
  store.createViewModelInstance({ id: 'inst_nested', name: 'Nested Instance', viewModel: ref('viewModel', 'vm_nested'), artboard: art });
  store.createViewModelInstance({ id: 'inst_main', name: 'Main Instance', viewModel: ref('viewModel', 'vm_main'), artboard: art, initialValues: [
    { property: ref('dataProperty', 'nested'), value: ref('viewModelInstance', 'inst_nested') },
  ] });
  store.createList({ id: 'list_main', name: 'Items', owner: ref('viewModelInstance', 'inst_main'), property: ref('dataProperty', 'list_prop'), items: [
    { id: 'item_a', value: 'A' }, { id: 'item_b', value: 'B' },
  ] });
  const instance = store.document.viewModelInstances.find((item) => item.id === 'inst_main');
  store.updateViewModelInstance('inst_main', { initialValues: [
    ...instance.initialValues,
    { property: ref('dataProperty', 'list_prop'), value: ref('list', 'list_main') },
  ] });
}

check('capability: non-drivable property target fails before commit', [7, 8, 24], () => {
  const store = baseStore(); seedCore(store);
  const cp = createVeyraControlPlane(store);
  const before = snapshot(store);
  const descriptor = { action: 'createBinding', args: { overrides: {
    id: 'bad_name_target', artboard: ref('artboard', 'art_main'),
    source: dataEndpoint('inst_main', 'string'), target: propertyEndpoint('node:box/name'),
  } } };
  const preview = cp.previewCommand(descriptor);
  assert.equal(preview.ok, false);
  assert.match(preview.error, /binding-target-not-drivable/);
  assertSnapshot(store, before);
  const dispatch = cp.dispatchCommand(descriptor);
  assert.equal(dispatch.ok, false);
  assert.equal(dispatch.errorCode, 'binding-target-not-drivable');
  assert.match(dispatch.error, /node:box\/name/);
  assertSnapshot(store, before);
});

check('capability: readable/writable/bindable flags are enforced by endpoint role', [6, 7, 8], () => {
  const cases = [
    { id: 'src_unreadable', flags: { readable: false }, role: 'source', code: 'binding-source-unreadable' },
    { id: 'src_unbindable', flags: { bindable: false }, role: 'source', code: 'binding-source-unbindable' },
    { id: 'target_readonly', flags: { writable: false }, role: 'target', code: 'binding-target-readonly' },
    { id: 'target_unbindable', flags: { bindable: false }, role: 'target', code: 'binding-target-unbindable' },
  ];
  for (const testCase of cases) {
    const store = baseStore(); seedCore(store);
    store.addDataProperty('vm_main', { id: testCase.id, name: testCase.id, type: 'number', defaultValue: 0.5, ...testCase.flags });
    const cp = createVeyraControlPlane(store);
    const before = snapshot(store);
    const source = testCase.role === 'source' ? dataEndpoint('inst_main', testCase.id) : dataEndpoint('inst_main', 'num');
    const target = testCase.role === 'target' ? dataEndpoint('inst_main', testCase.id) : pgEndpoint('missing');
    if (testCase.role === 'source') {
      store.createPropertyGroup({ id: `pg_${testCase.id}`, artboard: ref('artboard', 'art_main'), properties: [{ id: `pgp_${testCase.id}`, type: 'number', value: 0 }] });
    }
    const actualTarget = testCase.role === 'source' ? pgEndpoint(`pgp_${testCase.id}`) : target;
    const result = cp.dispatchCommand({ action: 'createBinding', args: { overrides: { id: `b_${testCase.id}`, artboard: ref('artboard', 'art_main'), source, target: actualTarget } } });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, testCase.code);
    assertSnapshot(store, before);
  }

  const pg = baseStore(); seedCore(pg);
  pg.createPropertyGroup({ id: 'pg_caps', artboard: ref('artboard', 'art_main'), properties: [
    { id: 'pg_src_unreadable', type: 'number', value: 0.1, readable: false },
    { id: 'pg_tgt_unbindable', type: 'number', value: 0.1, bindable: false },
  ] });
  assert.throws(() => pg.createBinding({ id: 'b_pg_read', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_src_unreadable'), target: propertyEndpoint('node:box/opacity') }), /binding-source-unreadable/);
  assert.throws(() => pg.createBinding({ id: 'b_pg_bind', artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','num'), target: pgEndpoint('pg_tgt_unbindable') }), /binding-target-unbindable/);
});

check('two-way: invalid capabilities fail atomically and ordinary-property source is unsupported', [6, 7, 24], () => {
  const store = baseStore(); seedCore(store);
  store.addDataProperty('vm_main', { id: 'readonly_source', type: 'number', defaultValue: 0.2, writable: false });
  const cp = createVeyraControlPlane(store);
  for (const descriptor of [
    { id: 'bad_ro', source: dataEndpoint('inst_main', 'readonly_source'), target: propertyEndpoint('node:box/opacity') },
    { id: 'bad_property_source', source: propertyEndpoint('node:other/opacity'), target: dataEndpoint('inst_main', 'num') },
  ]) {
    const before = snapshot(store);
    const result = cp.dispatchCommand({ action: 'createBinding', args: { overrides: { ...descriptor, mode: 'twoWay', artboard: ref('artboard', 'art_main') } } });
    assert.equal(result.ok, false);
    assert.match(result.error, /binding-two-way-source-(readonly|unsupported)/);
    assertSnapshot(store, before);
  }
});

check('two-way: nested data source reverse-writes in the same runtime scope', [4, 6, 16], () => {
  const store = baseStore(); seedCore(store);
  store.createBinding({ id: 'nested_two_way', mode: 'twoWay', artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','nested','nested_value'), target: propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const scope = [ref('componentInstance','outer'), ref('componentInstance','inner')];
  const authored = serializeVeyra(store.document);
  runtime.setTwoWayTarget('nested_two_way', 0.77, { scopePath: scope });
  assert.equal(runtime.getValue('inst_nested','nested_value',{ scopePath: scope }), 0.77);
  assert.equal(runtime.getValue('inst_nested','nested_value'), 0.2);
  assert.equal(serializeVeyra(store.document), authored);
});

check('two-way: Property Group source has explicit authored reverse-write semantics', [6, 17], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_two', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_two_value', type: 'number', value: 0.3 }] });
  store.createBinding({ id: 'pg_two_way', mode: 'twoWay', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_two_value'), target: propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(runtime.setTwoWayTarget('pg_two_way', 0.62), true);
  assert.equal(store.document.propertyGroups[0].properties[0].value, 0.62);
});

check('typed identity: equal literal IDs across kinds never create false dependency blockers', [1, 12, 24], () => {
  const store = baseStore(); seedCore(store);
  store.addDataProperty('vm_main', { id: 'collision', type: 'number', defaultValue: 0.4 });
  store.createConverter({ id: 'collision', type: 'numberToString' });
  store.createEnum({ id: 'enum_collision_owner', values: [{ id: 'collision', name: 'Collision' }] });
  assert.doesNotThrow(() => store.removeConverter('collision'));
  assert.ok(store.document.viewModels.find((item) => item.id === 'vm_main').properties.some((item) => item.id === 'collision'));
  assert.ok(store.document.enums.find((item) => item.id === 'enum_collision_owner').values.some((item) => item.id === 'collision'));

  store.createPropertyGroup({ id: 'pg_collision', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_collision_value', type: 'number', value: 0 }] });
  store.createBinding({ id: 'collision_binding', artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','collision'), target: pgEndpoint('pg_collision_value') });
  assert.throws(() => store.removeDataProperty('vm_main','collision'), /binding:collision_binding/);
});

check('ownership: writableSource points to active data source and only conflict winner is active', [10, 11, 24], () => {
  const store = baseStore(); seedCore(store);
  store.addDataProperty('vm_main', { id: 'num2', type: 'number', defaultValue: 0.8 });
  store.createBinding({ id: 'z_loser', priority: 1, artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','num2'), target: propertyEndpoint('node:box/opacity') });
  store.createBinding({ id: 'a_winner', priority: 1, artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','num'), target: propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const ownership = createVeyraControlPlane(store).getOwnership('node:box/opacity', { dataRuntime: runtime, runtimeScopePath: [ref('componentInstance','scope_a')] });
  assert.equal(ownership.evaluatedSource, 'data-binding');
  assert.equal(ownership.activeOwner.ref.id, 'a_winner');
  assert.equal(ownership.writableSource.kind, 'data-runtime-property');
  assert.equal(ownership.writableSource.instance.id, 'inst_main');
  assert.equal(ownership.writableSource.path.at(-1).id, 'num');
  assert.equal(ownership.writableSource.edit.port, 'setDataRuntimeValue');
  assert.equal(ownership.writableSource.authored, false);
  const dataOwners = ownership.ownerStack.filter((item) => item.kind === 'data-binding');
  assert.equal(dataOwners.filter((item) => item.active).length, 1);
  assert.equal(dataOwners.find((item) => item.active).ref.id, 'a_winner');
});

check('ownership: Property Group source reports its canonical source address', [11, 17], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_owner', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_owner_value', type: 'number', value: 0.42 }] });
  store.createBinding({ id: 'pg_owner_binding', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_owner_value'), target: propertyEndpoint('node:box/opacity') });
  const ownership = createVeyraControlPlane(store).getOwnership('node:box/opacity', { dataRuntime: createVeyraDataRuntime(() => store.document) });
  assert.equal(ownership.writableSource.kind, 'property-group-property');
  assert.equal(ownership.writableSource.ref.id, 'pg_owner_value');
  assert.equal(ownership.writableSource.address, 'propertyGroupProperty:pg_owner_value/value');
  assert.equal(ownership.writableSource.authored, true);
});

check('trigger queue: two explicit fires produce two pulses, false settle, then sleep', [13], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_trigger', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_trigger_value', type: 'boolean', value: false }] });
  store.createBinding({ id: 'trigger_binding', artboard: ref('artboard','art_main'), source: dataEndpoint('inst_main','trigger'), target: pgEndpoint('pg_trigger_value') });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(runtime.fire('inst_main','trigger'), 1);
  assert.equal(runtime.fire('inst_main','trigger'), 2);
  const one = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  const two = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  const settle = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  const sleep = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(one.overrides['propertyGroupProperty:pg_trigger_value/value'], true);
  assert.equal(two.overrides['propertyGroupProperty:pg_trigger_value/value'], true);
  assert.equal(settle.overrides['propertyGroupProperty:pg_trigger_value/value'], false);
  assert.equal(sleep.stats.evaluatedBindings, 0);
  assert.equal(runtime.stats.triggerPulsesConsumed, 2);
});

check('settled runtime: unchanged Property Group source is cached and change invalidates only its branch', [17, 21, 27], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_source', artboard: ref('artboard','art_main'), properties: [
    { id: 'pg_a', type: 'number', value: 0.1 }, { id: 'pg_b', type: 'number', value: 0.2 },
  ] });
  store.createBinding({ id: 'pg_bind_a', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_a'), target: propertyEndpoint('node:box/opacity') });
  store.createBinding({ id: 'pg_bind_b', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_b'), target: propertyEndpoint('node:other/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(runtime.evaluateBindings(store.document,{artboardId:'art_main'}).stats.evaluatedBindings, 2);
  const settled = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(settled.stats.evaluatedBindings, 0);
  assert.equal(settled.stats.cacheHits, 2);
  store.updatePropertyGroupProperty('pg_source','pg_a',{ value: 0.7 });
  const changed = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(changed.stats.evaluatedBindings, 1);
  assert.equal(changed.stats.cacheHits, 1);
  assert.equal(changed.stats.sourceInvalidations, 1);
  const sleptAgain = runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(sleptAgain.stats.evaluatedBindings, 0);
});

check('names: random, duplicate and empty display names never change stable routing', [2], () => {
  const store = baseStore(); seedCore(store);
  store.updateViewModel('vm_main',{name:''});
  store.updateViewModel('vm_nested',{name:''});
  store.updateDataProperty('vm_main','num',{name:'same'});
  store.updateDataProperty('vm_main','bool',{name:'same'});
  store.updateViewModelInstance('inst_main',{name:'x-7d2a'});
  store.createBinding({ id:'names_binding', name:'', artboard:ref('artboard','art_main'), source:dataEndpoint('inst_main','num'), target:propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.setValue('inst_main','num',0.66);
  const scene = evaluateDocument(store.document,{},null,{artboardId:'art_main',dataRuntime:runtime});
  assert.equal(scene.nodes.find((item)=>item.id==='box').opacity,0.66);
});

check('save/load: every required property type remains deterministic', [3, 25], () => {
  const store = baseStore(); seedCore(store);
  const before = serializeVeyra(store.document);
  const parsed = parseVeyra(before);
  const after = serializeVeyra(parsed);
  assert.equal(after, before);
  const types = parsed.viewModels.find((item)=>item.id==='vm_main').properties.map((item)=>item.type);
  assert.deepEqual([...new Set(types)].sort(), [...VEYRA_DATA_PROPERTY_TYPES].sort());
  assert.equal(after.includes('dirtyInvalidations'), false);
  assert.equal(after.includes('triggerPulsesConsumed'), false);
  assert.equal(after.includes('dataRuntimeScope'), false);
});

check('nested path: renames and declaration reorder preserve stable binding behavior', [4], () => {
  const store = baseStore(); seedCore(store);
  store.createBinding({ id:'nested_bind', artboard:ref('artboard','art_main'), source:dataEndpoint('inst_main','nested','nested_value'), target:propertyEndpoint('node:box/opacity') });
  store.updateViewModel('vm_nested',{name:'Renamed Nested'});
  store.updateDataProperty('vm_main','nested',{name:'Renamed link'});
  store.updateDataProperty('vm_nested','nested_value',{name:'Renamed terminal'});
  const main = store.document.viewModels.find((item)=>item.id==='vm_main');
  main.properties.reverse();
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.setValue('inst_nested','nested_value',0.73);
  const scene = evaluateDocument(store.document,{},null,{artboardId:'art_main',dataRuntime:runtime});
  assert.equal(scene.nodes.find((item)=>item.id==='box').opacity,0.73);
});

check('runtime reset: values return to deterministic authored initial/default state', [14], () => {
  const store = baseStore(); seedCore(store);
  const runtime = createVeyraDataRuntime(() => store.document);
  runtime.setValue('inst_main','num',0.91);
  runtime.insertListItem('list_main','Runtime');
  runtime.fire('inst_main','trigger');
  runtime.reset();
  assert.equal(runtime.getValue('inst_main','num'),0.25);
  assert.equal(runtime.getValue('inst_main','trigger'),false);
  assert.deepEqual(runtime.getList('list_main').map((item)=>item.id),['item_a','item_b']);
});

check('nested repeated Components: full instance paths isolate identical source runtime data', [15, 16], () => {
  const host = artboard('host',0); const middle = artboard('middle',800); const leaf = artboard('leaf',1600);
  const store = new VeyraStore(createDocument({ id:'nested_components', artboards:[host,middle,leaf], nodes:[createNode('rectangle',{id:'leaf_node',artboard:ref('artboard','leaf'),opacity:1})] }));
  store.createComponent('leaf',{id:'leaf_cmp'});
  store.addComponentInstance('leaf_cmp',{id:'leaf_in_middle',artboard:ref('artboard','middle')});
  store.createComponent('middle',{id:'middle_cmp'});
  store.addComponentInstance('middle_cmp',{id:'middle_a',artboard:ref('artboard','host'),transform:{x:0,y:0}});
  store.addComponentInstance('middle_cmp',{id:'middle_b',artboard:ref('artboard','host'),transform:{x:200,y:0}});
  store.createViewModel({id:'leaf_vm',properties:[{id:'leaf_opacity',type:'number',defaultValue:0.1,min:0,max:1}]});
  store.createViewModelInstance({id:'leaf_data',viewModel:ref('viewModel','leaf_vm'),artboard:ref('artboard','leaf')});
  store.createBinding({id:'leaf_binding',artboard:ref('artboard','leaf'),source:dataEndpoint('leaf_data','leaf_opacity'),target:propertyEndpoint('node:leaf_node/opacity')});
  const runtime = createVeyraDataRuntime(()=>store.document);
  const pathA=[ref('componentInstance','middle_a'),ref('componentInstance','leaf_in_middle')];
  const pathB=[ref('componentInstance','middle_b'),ref('componentInstance','leaf_in_middle')];
  runtime.setValue('leaf_data','leaf_opacity',0.31,{scopePath:pathA});
  runtime.setValue('leaf_data','leaf_opacity',0.82,{scopePath:pathB});
  const scene=evaluateDocument(store.document,{},null,{artboardId:'host',dataRuntime:runtime,componentRuntime:createComponentRuntimeRegistry(()=>store.document)});
  const leafNodes=scene.componentEvaluatedNodes.filter((item)=>item.sourceRef?.id==='leaf_node' || item.id==='leaf_node');
  assert.ok(leafNodes.some((item)=>item.opacity===0.31));
  assert.ok(leafNodes.some((item)=>item.opacity===0.82));
  assert.equal(runtime.getValue('leaf_data','leaf_opacity'),0.1);
});

check('Property Group direction is explicit and reverse binding cycles fail closed', [17], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({id:'pg_cycle',artboard:ref('artboard','art_main'),properties:[{id:'pg_cycle_value',type:'number',value:0.4}]});
  store.createBinding({id:'data_to_pg',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:pgEndpoint('pg_cycle_value')});
  assert.throws(()=>store.createBinding({id:'pg_to_data',artboard:ref('artboard','art_main'),source:pgEndpoint('pg_cycle_value'),target:dataEndpoint('inst_main','num')}),/binding-cycle/);
});

check('enum reorder: bound/value identity remains enumValue stable ref', [18], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({id:'pg_enum',artboard:ref('artboard','art_main'),properties:[{id:'pg_enum_value',type:'enum',enum:ref('enum','enum_state'),value:ref('enumValue','enum_idle')}]});
  store.createBinding({id:'enum_binding',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','enum_prop'),target:pgEndpoint('pg_enum_value')});
  store.moveEnumValue('enum_state','enum_idle',1);
  store.updateEnumValue('enum_state','enum_idle',{name:'Resting'});
  const runtime=createVeyraDataRuntime(()=>store.document);
  const result=runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(result.overrides['propertyGroupProperty:pg_enum_value/value'].id,'enum_idle');
  assert.equal(store.document.viewModels.find((item)=>item.id==='vm_main').properties.find((item)=>item.id==='enum_prop').defaultValue.id,'enum_idle');
});

check('converter composition: incompatible chain fails atomically with machine-readable evidence', [19, 24], () => {
  const store=baseStore(); seedCore(store);
  store.createConverter({id:'to_string',type:'numberToString'});
  store.createConverter({id:'bool_to_num',type:'booleanToNumber'});
  store.createPropertyGroup({id:'pg_string',artboard:ref('artboard','art_main'),properties:[{id:'pg_string_value',type:'string',value:''}]});
  const before=snapshot(store);
  const result=createVeyraControlPlane(store).dispatchCommand({action:'createBinding',args:{overrides:{id:'bad_chain',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:pgEndpoint('pg_string_value'),converterChain:[ref('converter','to_string'),ref('converter','bool_to_num')]}}});
  assert.equal(result.ok,false);
  assert.equal(result.errorCode,'binding-converter-type-mismatch');
  assertSnapshot(store,before);
});

check('runtime list mutation invalidates only bindings reachable from its owning data property', [20, 21], () => {
  const store=baseStore(); seedCore(store);
  store.createPropertyGroup({id:'pg_list',artboard:ref('artboard','art_main'),properties:[{id:'pg_list_value',type:'list',itemType:{type:'string'},value:ref('list','list_main')},{id:'pg_other_value',type:'number',value:0}]});
  store.createBinding({id:'list_binding',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','list_prop'),target:pgEndpoint('pg_list_value')});
  store.createBinding({id:'other_binding',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:pgEndpoint('pg_other_value')});
  const runtime=createVeyraDataRuntime(()=>store.document);
  runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  const inserted=runtime.insertListItem('list_main','C');
  const changed=runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(changed.stats.evaluatedBindings,1);
  assert.equal(changed.stats.cacheHits,1);
  assert.ok(runtime.getList('list_main').some((item)=>item.id===inserted.id));
  runtime.removeListItem('list_main',inserted.id);
  runtime.moveListItem('list_main','item_b',0);
  assert.equal(runtime.getList('list_main')[0].id,'item_b');
});

check('semantic/query/manifest surfaces cover every persistent M8 reference kind', [22], () => {
  const store=baseStore(); seedCore(store);
  store.createConverter({id:'conv',type:'numberToString'});
  store.createPropertyGroup({id:'pg',artboard:ref('artboard','art_main'),properties:[{id:'pgp',type:'number',value:0}]});
  store.createBinding({id:'bind',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:pgEndpoint('pgp')});
  const required=['viewModel','viewModelInstance','dataProperty','enum','enumValue','binding','converter','propertyGroup','propertyGroupProperty','list','listItem'];
  const index=buildSemanticIndex(store.document,{maxEntities:5000});
  for(const kind of required){
    assert.ok(index.entities.some((item)=>item.ref.kind===kind),`missing semantic index ${kind}`);
    assert.ok(queryEntities(store.document,{kinds:[kind]},{maxResults:500}).entities.length>0,`missing query ${kind}`);
  }
  const manifest=createProjectManifest(store.document);
  assert.match(manifest.authoring.dataGraph.identity,/viewModel/);
  assert.match(manifest.authoring.dataGraph.endpointCapabilities.target,/canonical-drivable/);
});

check('UI/helper parity: every persistent M8 browser helper maps to a real canonical command', [23], () => {
  const m8Actions=new Set([
    'createViewModel','updateViewModel','removeViewModel','addDataProperty','updateDataProperty','removeDataProperty',
    'createViewModelInstance','updateViewModelInstance','removeViewModelInstance','createBinding','updateBinding','removeBinding',
    'createEnum','updateEnum','removeEnum','addEnumValue','updateEnumValue','removeEnumValue','moveEnumValue',
    'createConverter','updateConverter','removeConverter','createPropertyGroup','updatePropertyGroup','removePropertyGroup',
    'addPropertyGroupProperty','updatePropertyGroupProperty','removePropertyGroupProperty','createList','updateList','removeList',
    'addListItem','updateListItem','removeListItem','moveListItem',
  ]);
  const source=readFileSync(new URL('../veyra.js',import.meta.url),'utf8');
  const entries=Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY).filter(([,metadata])=>metadata.transport==='command'&&m8Actions.has(metadata.action));
  assert.equal(entries.length,m8Actions.size);
  for(const [helper,metadata] of entries){
    assert.ok(VEYRA_COMMAND_TABLE[metadata.action],`missing command ${metadata.action}`);
    assert.match(source,new RegExp(`${helper}:.*dispatchCompatibilityCommand\\(`,'s'),`helper ${helper} bypasses canonical dispatcher`);
  }
});

check('read/query/ownership/preview/failure are observationally non-mutating', [24], () => {
  const store=baseStore(); seedCore(store);
  store.createBinding({id:'observe_binding',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:propertyEndpoint('node:box/opacity')});
  const cp=createVeyraControlPlane(store); const runtime=createVeyraDataRuntime(()=>store.document); const before=snapshot(store);
  cp.read('node:box/opacity',{dataRuntime:runtime});
  cp.queryEntities({kinds:['binding']});
  cp.getOwnership('node:box/opacity',{dataRuntime:runtime});
  cp.previewCommand({action:'updateViewModel',args:{modelId:'vm_main',changes:{name:'Preview'}}});
  const failed=cp.dispatchCommand({action:'createBinding',args:{overrides:{id:'bad_observe',artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main','num'),target:propertyEndpoint('node:box/name')}}});
  assert.equal(failed.ok,false);
  assertSnapshot(store,before);
});

check('220-binding complexity envelope stays deterministic and one dirty source evaluates one binding', [27], () => {
  const store=baseStore(); seedCore(store); const count=220;
  for(let i=0;i<count;i+=1){
    const p=`bulk_${i}`, pg=`bulk_pg_${i}`, pgp=`bulk_pgp_${i}`, b=`bulk_binding_${String(i).padStart(3,'0')}`;
    store.addDataProperty('vm_main',{id:p,type:'number',defaultValue:i/count});
    store.createPropertyGroup({id:pg,artboard:ref('artboard','art_main'),properties:[{id:pgp,type:'number',value:0}]});
    store.createBinding({id:b,artboard:ref('artboard','art_main'),source:dataEndpoint('inst_main',p),target:pgEndpoint(pgp)});
  }
  const envelope=bindingComplexityEnvelope(store.document,'art_main');
  assert.equal(envelope.bindingCount,count);
  assert.equal(envelope.maxDirectFanOut,1);
  assert.equal(envelope.complexity.dirtyPropagation,'O(reachable binding edges)');
  const runtime=createVeyraDataRuntime(()=>store.document);
  assert.equal(runtime.evaluateBindings(store.document,{artboardId:'art_main'}).stats.evaluatedBindings,count);
  runtime.setValue('inst_main','bulk_117',0.333);
  const changed=runtime.evaluateBindings(store.document,{artboardId:'art_main'});
  assert.equal(changed.stats.evaluatedBindings,1);
  assert.equal(changed.stats.cacheHits,count-1);
});

check('canonical endpoint capability surface exposes one shared authoring/runtime answer', [6, 8, 22], () => {
  const store=baseStore(); seedCore(store);
  store.addDataProperty('vm_main',{id:'locked',type:'number',defaultValue:0,writable:false,bindable:true});
  const locked=bindingEndpointCapabilities(store.document,dataEndpoint('inst_main','locked'));
  assert.deepEqual({readable:locked.readable,writable:locked.writable,bindable:locked.bindable,drivable:locked.drivable,reverseWritable:locked.reverseWritable},{readable:true,writable:false,bindable:true,drivable:false,reverseWritable:false});
  const visual=bindingEndpointCapabilities(store.document,propertyEndpoint('node:box/opacity'));
  assert.equal(visual.drivable,true);
  const display=bindingEndpointCapabilities(store.document,propertyEndpoint('node:box/name'));
  assert.equal(display.writable,true);
  assert.equal(display.drivable,false);
});

check('runtime scope identity remains deterministic after correction', [16, 25], () => {
  const path=[ref('componentInstance','outer'),ref('componentInstance','inner')];
  assert.deepEqual(createDataRuntimeScope(path),{kind:'dataRuntimeScope',key:'componentInstance:outer/componentInstance:inner',path});
});

const requiredOriginal = Array.from({length:27},(_,index)=>index+1);
const uncovered = requiredOriginal.filter((value)=>!coveredOriginal.has(value));
assert.deepEqual(uncovered,[],`Original M8 acceptance cases missing explicit M8-C1 evidence: ${uncovered.join(', ')}`);
console.log(`veyra M8-C1 correction tests passed — ${checks} checks; original M8 acceptance #1-#27 explicitly mapped (#28 is exact-final-head CI)`);
