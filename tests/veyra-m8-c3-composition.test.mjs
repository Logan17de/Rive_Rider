import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraControlPlane, getOwnership } from '../src/veyra/controlPlane.js';
import { createComponentRuntimeRegistry } from '../src/veyra/components.js';
import { createVeyraDataRuntime, createDataRuntimeScope, bindingEndpointKey } from '../src/veyra/dataGraph.js';
import { createVeyraRuntimeHost } from '../src/veyra/runtimeHost.js';
import { VEYRA_DATA_RUNTIME_PORTS } from '../src/veyra/runtimePorts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { formatPropertyAddress, parsePropertyAddress } from '../src/veyra/properties.js';
import { serializeVeyra, parseVeyra } from '../src/veyra/io.js';
import {ref, art, data, pg, prop, board, baseStore, addBinding, runtimeFor, evaluate, warm} from './helpers/m8-runtime.mjs';

let checks = 0;
function check(name, fn) { try { fn(); checks++; } catch(e) { e.message=`[M8-C3 ${name}] ${e.message}`; throw e; } }
function authored(s) { return [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)]; }
function invokeEdit(host, edit, value) {
  assert.equal(typeof host[edit.port], 'function', `unavailable advertised operation ${edit.port}`);
  const args = structuredClone(edit.arguments);
  if (edit.valueIndex != null) args[edit.valueIndex] = value;
  return host[edit.port](...args);
}
function componentFixture() {
  const s = baseStore();
  s.addArtboard({ ...board('host'), id:'host' });
  s.addArtboard({ ...board('middle'), id:'middle' });
  s.createComponent('art_main', { id:'leaf_component' });
  s.addComponentInstance('leaf_component', { id:'inner', artboard:ref('artboard','middle') });
  s.createComponent('middle', { id:'middle_component' });
  s.addComponentInstance('middle_component', { id:'outer', artboard:ref('artboard','host') });
  s.addComponentInstance('leaf_component', { id:'outer/componentInstance:inner', artboard:ref('artboard','host') });
  const a = [ref('componentInstance','outer/componentInstance:inner')];
  const b = [ref('componentInstance','outer'),ref('componentInstance','inner')];
  const r = runtimeFor(s), c = createComponentRuntimeRegistry(()=>s.document);
  return { s, r, c, a, b };
}

check('opaque scope/tuple identity includes punctuation, Unicode and kind; reset is structural', () => {
  const s=baseStore(), r=runtimeFor(s);
  const ids=['outer/componentInstance:inner','a|b','x%2Fy','quote"','雪/川','a:b','same'];
  const scopes=ids.flatMap(id=>[[ref('componentInstance',id)],[ref('dataProperty',id)]]);
  const keys=scopes.map(path=>createDataRuntimeScope(path).key);
  assert.equal(new Set(keys).size,keys.length);
  scopes.forEach((scopePath,i)=>r.setValue('root','num',(i+1)/100,{scopePath}));
  scopes.forEach((scopePath,i)=>assert.equal(r.getValue('root','num',{scopePath}),(i+1)/100));
  r.reset({scopePath:scopes[0],subtree:true});
  assert.equal(r.getValue('root','num',{scopePath:scopes[0]}),.25);
  scopes.slice(1).forEach((scopePath,i)=>assert.equal(r.getValue('root','num',{scopePath}),(i+2)/100));
  assert.notEqual(bindingEndpointKey(data('a','b/c')),bindingEndpointKey(data('a/b','c')));
  assert.notEqual(bindingEndpointKey(data('a','b','c')),bindingEndpointKey(data('a','b/c')));
});

check('valid authored Component paths isolate values, PG, list, events and reset', () => {
  const {s,r,c,a,b}=componentFixture();
  s.createPropertyGroup({id:'group',artboard:art,properties:[{id:'pg|/:%"雪',type:'number',value:.3}]});
  addBinding(s,'two|/:雪',pg('pg|/:%"雪'),prop('node:box/opacity'),{mode:'twoWay'});
  addBinding(s,'event',data('root','nested','child_trigger'),prop('node:other/visible'));
  const before=authored(s);
  for(const scopePath of [a,b]) warm(r,s,scopePath);
  r.setTwoWayTarget('two|/:雪',.64,{scopePath:a});
  r.setTwoWayTarget('two|/:雪',.81,{scopePath:b});
  r.replaceListItem('numbers','item_a',.55,{scopePath:a});
  r.fire('child','child_trigger',{scopePath:a});r.fire('child','child_trigger',{scopePath:b});
  const scene=evaluateDocument(s.document,{},null,{artboardId:'host',dataRuntime:r,componentRuntime:c,observe:true});
  assert.ok(scene.componentEvaluatedNodes.some(n=>n.opacity===.64));
  assert.ok(scene.componentEvaluatedNodes.some(n=>n.opacity===.81));
  assert.deepEqual(c.listRuntimeScopes(),[],'observation cannot create live Component buckets');
  assert.equal(r.getList('numbers',{scopePath:b})[0].value,.2);
  r.reset({scopePath:a,subtree:true});
  assert.equal(r.getPropertyGroupValue('pg|/:%"雪',{scopePath:a}),.3);
  assert.equal(r.getPropertyGroupValue('pg|/:%"雪',{scopePath:b}),.81);
  assert.equal(r.getValue('child','child_trigger',{scopePath:b}),true);
  assert.equal(r.getValue('child','child_trigger',{scopePath:a}),false);
  assert.deepEqual(authored(s),before);
});

check('percent-encoded endpoint aliases use one priority/tie-break owner after reorder/save-load', () => {
  const s=baseStore(), id='p/|:%"雪', address=formatPropertyAddress(ref('propertyGroupProperty',id),['value']);
  s.createPropertyGroup({id:'group',artboard:art,properties:[{id,type:'number',value:.1}]});
  const encoded=address.replace('p%2F','%70%2f');
  assert.deepEqual(parsePropertyAddress(encoded),parsePropertyAddress(address));
  addBinding(s,'z_low',data('root','alt'),prop(encoded),{priority:0});
  addBinding(s,'b_high',data('root','num'),pg(id),{priority:10});
  addBinding(s,'a_high',data('root','alt'),prop(encoded),{priority:10});
  const r=runtimeFor(s);const first=evaluate(r,s);
  assert.equal(first.overrides[address],.75);assert.equal(first.ownership[address].ref.id,'a_high');assert.equal(first.diagnostics.conflicts.length,1);
  s.execute({label:'Reorder aliases',source:'user'},d=>{d.bindings.reverse();d.bindings.forEach(x=>{x.name='';});});
  assert.equal(evaluate(r,s).ownership[address].ref.id,'a_high');
  const loaded=parseVeyra(serializeVeyra(s.document)), rr=createVeyraDataRuntime(loaded);
  assert.equal(rr.evaluateBindings(loaded,{artboardId:'art_main'}).ownership[address].ref.id,'a_high');
});

check('multi-hop alias cycles reject preview/dispatch atomically and propagation reads derived data', () => {
  const s=baseStore();s.createPropertyGroup({id:'group',artboard:art,properties:[{id:'p',type:'number',value:.1},{id:'q',type:'number',value:.2}]});
  addBinding(s,'source',data('root','num'),pg('p'));
  addBinding(s,'chain',prop('propertyGroupProperty:%70/value'),pg('q'));
  addBinding(s,'visual',prop('propertyGroupProperty:%71/value'),prop('node:box/opacity'));
  const r=runtimeFor(s);warm(r,s);r.setValue('root','num',.61);
  assert.equal(evaluate(r,s).overrides['node:box/opacity'],.61);
  const before=authored(s),cp=createVeyraControlPlane(s);
  const command={action:'createBinding',args:{overrides:{id:'cycle',artboard:art,source:pg('q'),target:prop('propertyGroupProperty:p/value')}}};
  assert.equal(cp.previewCommand(command).ok,false);
  const result=cp.dispatchCommand(command);assert.equal(result.ok,false);assert.match(result.error,/binding-cycle/);
  assert.deepEqual(authored(s),before);
});

check('warm direct/nested trigger fan-out delivers every fire once and peeks never consume', () => {
  const s=baseStore();addBinding(s,'nested',data('root','nested','child_trigger'),prop('node:box/visible'));
  addBinding(s,'direct',data('child','child_trigger'),prop('node:other/visible'));
  s.createPropertyGroup({id:'other',artboard:art,properties:[{id:'other_value',type:'number',value:0}]});
  addBinding(s,'unrelated',data('root','num'),pg('other_value'));
  const r=runtimeFor(s),notes=[];r.subscribe(changes=>notes.push(changes));warm(r,s);
  for(let i=0;i<3;i++)r.fire('child','child_trigger');
  const before=authored(s), values=[];
  for(let i=0;i<4;i++){
    const stats=r.stats, n=notes.length;
    for(let j=0;j<3;j++){
      getOwnership(s.document,'node:box/visible',{dataRuntime:r});
      createVeyraControlPlane(s).read('node:box/visible',{dataRuntime:r});
      r.peekBindings(s.document,{artboardId:'art_main'});
    }
    assert.deepEqual(r.stats,stats);assert.equal(notes.length,n);
    const frame=evaluate(r,s);values.push(frame.overrides['node:box/visible']);
    assert.equal(frame.overrides['node:box/visible'],frame.overrides['node:other/visible']);
    assert.equal(frame.stats.cacheHits,1);
  }
  assert.deepEqual(values,[true,true,true,false]);assert.equal(r.stats.triggerPulsesConsumed,3);
  assert.equal(r.getValue('child','child_trigger'),false);assert.equal(evaluate(r,s).stats.evaluatedBindings,0);
  assert.deepEqual(authored(s),before);
});

check('trigger queues and observer state remain isolated across real repeated Component paths', () => {
  const {s,r,c,a,b}=componentFixture();addBinding(s,'event',data('root','nested','child_trigger'),prop('node:box/visible'));
  for(const path of [a,b])warm(r,s,path);
  r.fire('child','child_trigger',{scopePath:a});r.fire('child','child_trigger',{scopePath:a});r.fire('child','child_trigger',{scopePath:b});
  const host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host'})}).api;
  const stats=r.stats;
  for(let i=0;i<3;i++)assert.equal(host.read('node:box/visible',{scopePath:a}).evaluatedValue,true);
  assert.deepEqual(r.stats,stats);
  assert.equal(host.advanceDataRuntime({scopePath:a}).nodes.find(n=>n.id==='box').visible,true);
  assert.equal(host.advanceDataRuntime({scopePath:a}).nodes.find(n=>n.id==='box').visible,true);
  assert.equal(host.advanceDataRuntime({scopePath:a}).nodes.find(n=>n.id==='box').visible,false);
  assert.equal(r.getValue('child','child_trigger',{scopePath:b}),true);
  assert.equal(host.advanceDataRuntime({scopePath:b}).nodes.find(n=>n.id==='box').visible,true);
});

check('runtime list operations wake converter dependencies only and carry full notification evidence', () => {
  const s=baseStore();s.createConverter({id:'pick',type:'numberToListIndex',outputType:'number',config:{list:ref('list','numbers')}});
  addBinding(s,'pick',data('root','index'),prop('node:box/opacity'),{converterChain:[ref('converter','pick')]});
  addBinding(s,'other',data('root','num'),prop('node:other/opacity'));
  const r=runtimeFor(s),a=[ref('componentInstance','x/|:%"雪')],b=[ref('componentInstance','x'),ref('componentInstance','|:%"雪')],notes=[];
  warm(r,s,a);warm(r,s,b);r.subscribe(changes=>notes.push(...changes));const before=authored(s);
  r.replaceListItem('numbers','item_a',.6,{scopePath:a});
  let out=evaluate(r,s,a);assert.equal(out.overrides['node:box/opacity'],.6);assert.equal(out.stats.evaluatedBindings,1);assert.equal(out.stats.cacheHits,1);
  assert.equal(evaluate(r,s,b).overrides['node:box/opacity'],.2);
  r.moveListItem('numbers','item_b',0,{scopePath:a});assert.equal(evaluate(r,s,a).overrides['node:box/opacity'],.8);
  const inserted=r.insertListItem('numbers',.4,0,{scopePath:a});assert.equal(evaluate(r,s,a).overrides['node:box/opacity'],.4);
  r.removeListItem('numbers',inserted.id,{scopePath:a});assert.equal(evaluate(r,s,a).overrides['node:box/opacity'],.8);
  assert.deepEqual(r.getList('numbers',{scopePath:a}).map(x=>x.id),['item_b','item_a']);
  for(const note of notes){assert.deepEqual(note.runtimeScope.path,a);assert.ok(note.change.operation);assert.ok(Array.isArray(note.oldValue));assert.ok(Array.isArray(note.newValue));}
  assert.deepEqual(authored(s),before);
});

check('wrong list values/constraints/indices reject without state, queue or notification changes', () => {
  const s=baseStore();s.updateDataProperty('vm_root','items',{itemType:{type:'number',min:0,max:1}});
  const r=runtimeFor(s);r.fire('child','child_trigger');const notes=[];r.subscribe(changes=>notes.push(changes));
  const before=authored(s),items=r.getList('numbers');
  for(const fn of [()=>r.insertListItem('numbers','not-a-number'),()=>r.replaceListItem('numbers','item_a','0.6'),()=>r.insertListItem('numbers',2),()=>r.replaceListItem('numbers','item_a',NaN),()=>r.insertListItem('numbers',.5,Infinity),()=>r.moveListItem('numbers','item_a',NaN)]){
    assert.throws(fn);assert.deepEqual(r.getList('numbers'),items);assert.equal(r.getValue('child','child_trigger'),true);assert.equal(notes.length,0);assert.deepEqual(authored(s),before);
  }
  const a=r.insertListItem('numbers',.4),fresh=runtimeFor(s).insertListItem('numbers',.4);
  assert.equal(a.id,fresh.id,'rejected mutations cannot consume runtime item identity');
});

check('list reference families validate enum/model/asset/artboard and nested list schema', () => {
  const s=baseStore();s.createEnum({id:'enum',values:[{id:'enum_value'}]});s.createEnum({id:'wrong_enum',values:[{id:'wrong_value'}]});
  s.addAsset('image',{id:'image',source:{kind:'external',uri:'image.png'}});
  const descriptors=[{type:'enum',enum:ref('enum','enum')},{type:'viewModel',viewModel:ref('viewModel','vm_child')},{type:'image'},{type:'artboard'},{type:'list',itemType:{type:'number'}}];
  const good=[ref('enumValue','enum_value'),ref('viewModelInstance','child'),ref('asset','image'),art,ref('list','numbers')];
  const bad=[ref('enumValue','wrong_value'),ref('viewModelInstance','root'),ref('asset','missing'),ref('artboard','missing'),ref('list','strings')];
  s.addDataProperty('vm_root',{id:'string_items',type:'list',itemType:{type:'string'},defaultValue:null});
  s.createList({id:'strings',owner:ref('viewModelInstance','root'),property:ref('dataProperty','string_items'),items:[]});
  descriptors.forEach((itemType,i)=>{s.addDataProperty('vm_root',{id:`items_${i}`,type:'list',itemType,defaultValue:null});s.createList({id:`list_${i}`,owner:ref('viewModelInstance','root'),property:ref('dataProperty',`items_${i}`),items:[]});});
  const r=runtimeFor(s);
  descriptors.forEach((_,i)=>{assert.throws(()=>r.insertListItem(`list_${i}`,bad[i]));assert.deepEqual(r.getList(`list_${i}`),[]);r.insertListItem(`list_${i}`,good[i]);assert.deepEqual(r.getList(`list_${i}`)[0].value,good[i]);assert.throws(()=>r.replaceListItem(`list_${i}`,r.getList(`list_${i}`)[0].id,bad[i]));});
});

check('list copy-on-write preserves defaults, tracks authored changes until override and resets', () => {
  const s=baseStore();s.createConverter({id:'pick',type:'numberToListIndex',outputType:'number',config:{list:ref('list','numbers')}});
  addBinding(s,'pick',data('root','index'),prop('node:box/opacity'),{converterChain:[ref('converter','pick')]});
  const r=runtimeFor(s);warm(r,s);r.getList('numbers');
  s.updateListItem('numbers','item_a',{value:.35});assert.equal(evaluate(r,s).overrides['node:box/opacity'],.35);
  r.replaceListItem('numbers','item_a',.61);assert.equal(evaluate(r,s).overrides['node:box/opacity'],.61);
  s.updateListItem('numbers','item_a',{value:.11});assert.equal(evaluate(r,s).overrides['node:box/opacity'],.61);
  r.reset();assert.equal(evaluate(r,s).overrides['node:box/opacity'],.11);
  r.setValue('root','index',999);assert.equal(evaluate(r,s).overrides['node:box/opacity'],.8);
  r.setValue('root','index',-999);assert.equal(evaluate(r,s).overrides['node:box/opacity'],.11);
  r.removeListItem('numbers','item_a');r.removeListItem('numbers','item_b');assert.equal(evaluate(r,s).overrides['node:box/opacity'],null);
});

check('nested reference rebinding drops stale terminal dependencies and preserves scope', () => {
  const s=baseStore();s.createViewModelInstance({id:'child_b',viewModel:ref('viewModel','vm_child'),artboard:art,initialValues:[{property:ref('dataProperty','child_value'),value:.8}]});
  addBinding(s,'nested',data('root','nested','child_value'),prop('node:box/opacity'));
  const r=runtimeFor(s);warm(r,s);r.setValue('root','nested',ref('viewModelInstance','child_b'));
  assert.equal(evaluate(r,s).overrides['node:box/opacity'],.8);r.setValue('child','child_value',.6);
  assert.equal(evaluate(r,s).stats.evaluatedBindings,0);r.setValue('child_b','child_value',.7);assert.equal(evaluate(r,s).overrides['node:box/opacity'],.7);
});

check('public nested recommendations resolve callable terminal args in current real Component scope', () => {
  const {s,r,c,a,b}=componentFixture();addBinding(s,'nested',data('root','nested','child_value'),prop('node:box/opacity'),{mode:'twoWay'});
  const host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host',runtimeScopePath:b})}).api;
  const owner=host.getOwnership('node:box/opacity'),edit=owner.writableSource.edit,before=authored(s);
  assert.equal(owner.evaluatedValue,.2);assert.equal(edit.arguments[0],'child');assert.equal(edit.arguments[1],'child_value');
  invokeEdit(host,JSON.parse(JSON.stringify(edit)),.63);
  assert.equal(host.read('node:box/opacity').evaluatedValue,.63);assert.equal(host.read('node:box/opacity',{scopePath:a}).evaluatedValue,.2);
  assert.equal(host.getEvaluatedScene().nodes.find(n=>n.id==='box').opacity,.63);
  assert.equal(host.read('node:box/opacity',{live:false}).authoredValue,1);
  assert.deepEqual(authored(s),before);
});

check('ownership traces data -> converter -> PG -> visual winner; edits never target overwritten PG', () => {
  const s=baseStore();s.createPropertyGroup({id:'group',artboard:art,properties:[{id:'bridge',type:'number',value:.1}]});
  s.createConverter({id:'convert',type:'conditional',inputType:'number',outputType:'number',config:{equals:.25,then:.4,else:.9}});
  addBinding(s,'root_binding',data('root','num'),pg('bridge'),{converterChain:[ref('converter','convert')]});
  addBinding(s,'visual',prop('propertyGroupProperty:bridge/value'),prop('node:box/opacity'),{priority:10});
  addBinding(s,'loser',data('root','alt'),prop('node:box/opacity'),{priority:0});
  const host=createVeyraRuntimeHost({store:s,dataRuntime:runtimeFor(s)}).api;
  const owner=host.getOwnership('node:box/opacity');assert.equal(owner.evaluatedValue,.4);assert.equal(owner.activeOwner.ref.id,'visual');
  assert.equal(owner.activeOwner.chain.stages.length,2);assert.equal(owner.activeOwner.chain.converters[0].id,'convert');
  assert.equal(owner.writableSource.kind,'data-runtime-property');assert.equal(owner.ownerStack.filter(x=>x.active).length,1);
  invokeEdit(host,owner.writableSource.edit,.5);assert.equal(host.read('node:box/opacity').evaluatedValue,.9);
  assert.equal(s.document.propertyGroups[0].properties[0].value,.1);
});

check('public runtime registry is executable; canonical authored PG edits remain one undo transaction', () => {
  const s=baseStore();s.createPropertyGroup({id:'group',artboard:art,properties:[{id:'pg',type:'number',value:.3}]});
  addBinding(s,'pg_binding',pg('pg'),prop('node:box/opacity'));
  const r=runtimeFor(s), cp=createVeyraControlPlane(s),host=createVeyraRuntimeHost({store:s,dataRuntime:r,controlPlane:cp}).api;
  const declared=host.getManifest().authoring.dataGraph.runtimeContract.runtimePorts;
  for(const [name,metadata] of Object.entries(VEYRA_DATA_RUNTIME_PORTS)){assert.equal(typeof host[name],'function');assert.deepEqual(declared[name],metadata);}
  const edit=host.getOwnership('node:box/opacity').writableSource.edit;assert.equal(edit.transport,'command');
  const count=s.commandHistory.length,command={action:edit.action,args:structuredClone(edit.args),command:{source:'ai',label:'Persist source intentionally'}};
  command.args.changes.value=.62;assert.equal(cp.dispatchCommand(command).ok,true);assert.equal(s.commandHistory.length,count+1);
  assert.equal(host.read('node:box/opacity').evaluatedValue,.62);s.undo();assert.equal(host.read('node:box/opacity').evaluatedValue,.3);
  const shell=readFileSync(new URL('../veyra.js',import.meta.url),'utf8');
  assert.match(shell,/createVeyraRuntimeHost\(\{/);assert.match(shell,/read:.*controlPlane\.read\(refOrAddress, runtimeHost\.readOptions\(options\)\)/);
});

check('retained multi-artboard indexes and actual work counters on a 220-binding graph', () => {
  const s=new VeyraStore(createDocument({id:'perf',artboards:[board('A'),board('B')]}));
  s.createViewModel({id:'vm',properties:Array.from({length:220},(_,i)=>({id:`p${i}`,type:'number',defaultValue:0}))});
  for(const id of ['A','B']){
    s.createViewModelInstance({id,viewModel:ref('viewModel','vm'),artboard:ref('artboard',id)});
    s.createPropertyGroup({id:`g${id}`,artboard:ref('artboard',id),properties:Array.from({length:110},(_,i)=>({id:`${id}_${i}`,type:'number',value:0}))});
    // One canonical transaction avoids test setup quadratic validation noise.
    s.execute({label:'seed binding fixture',source:'user'},d=>{for(let i=0;i<110;i++)d.bindings.push({id:`b${id}${i}`,name:'',displayNameAdvisory:true,artboard:ref('artboard',id),source:data(id,`p${i}`),target:pg(`${id}_${i}`),mode:'oneWay',enabled:true,priority:0,converterChain:[]});});
  }
  const r=runtimeFor(s), path=[ref('componentInstance','repeat')];
  for(const scopePath of [[],path])for(const artboardId of ['A','B'])r.evaluateBindings(s.document,{scopePath,artboardId});
  r.resetStats();
  for(const scopePath of [[],path])for(const artboardId of ['A','B'])r.evaluateBindings(s.document,{scopePath,artboardId});
  assert.equal(r.stats.graphBuilds,0);assert.equal(r.stats.catalogBuilds,0);assert.equal(r.stats.signatureBuilds,0);assert.equal(r.stats.bindingEvaluations,0);
  assert.equal(r.stats.converterEvaluations,0);assert.equal(r.stats.pathSegmentsVisited,0);assert.equal(r.stats.outputApplications,440);
  r.resetStats();r.setValue('A','p57',.4,{scopePath:path});
  assert.equal(r.stats.bindingsExamined,0,'runtime write cannot scan the project');assert.equal(r.stats.graphBuilds,0);assert.equal(r.stats.dependencyEdgesVisited,1);
  const changed=r.evaluateBindings(s.document,{scopePath:path,artboardId:'A'});assert.equal(changed.stats.evaluatedBindings,1);assert.equal(changed.stats.cacheHits,109);
  assert.equal(r.evaluateBindings(s.document,{artboardId:'A'}).stats.evaluatedBindings,0);
  assert.equal(r.evaluateBindings(s.document,{scopePath:path,artboardId:'B'}).stats.evaluatedBindings,0);
  assert.equal(r.evaluateBindings(s.document,{scopePath:path,artboardId:'A'}).stats.evaluatedBindings,0);
});

check('immutable snapshot/explicit mutable-host generation and zero-binding fast path are honest', () => {
  const s=baseStore();addBinding(s,'data',data('root','num'),prop('node:box/opacity'));const r=runtimeFor(s);warm(r,s);r.resetStats();
  s.document.viewModels.find(x=>x.id==='vm_root').properties.find(x=>x.id==='num').defaultValue=.43;
  r.invalidateAuthoredDocument();assert.equal(evaluate(r,s).overrides['node:box/opacity'],.43);assert.equal(evaluate(r,s).stats.evaluatedBindings,0);
  const empty={bindings:[]}, rr=createVeyraDataRuntime(empty);rr.evaluateBindings(empty);assert.equal(rr.stats.catalogBuilds,0);assert.equal(rr.stats.graphBuilds,0);assert.equal(rr.stats.bindingsExamined,0);
});

check('one-way PG observation recommends the live override port; readonly data does not advertise a write', () => {
  const s=baseStore();s.createPropertyGroup({id:'group',artboard:art,properties:[{id:'p',type:'number',value:.2}]});
  addBinding(s,'two_way',pg('p'),prop('node:other/opacity'),{mode:'twoWay'});
  addBinding(s,'one_way',pg('p'),prop('node:box/opacity'));
  const r=runtimeFor(s),host=createVeyraRuntimeHost({store:s,dataRuntime:r,getContext:()=>({artboardId:'art_main'})}).api;
  host.setTwoWayBindingTarget('two_way',.6);
  const before=authored(s),owner=host.getOwnership('node:box/opacity');
  assert.equal(owner.writableSource.authored,false);
  assert.equal(owner.writableSource.targetEditsPropagate,false);
  invokeEdit(host,owner.writableSource.edit,.8);
  assert.equal(host.read('node:box/opacity').evaluatedValue,.8);
  assert.deepEqual(authored(s),before);
  s.updateDataProperty('vm_root','num',{writable:false});
  s.updateBinding('one_way',{source:data('root','num')});
  const readonly=host.getOwnership('node:box/opacity').writableSource;
  assert.equal(readonly.writable,false);assert.equal(readonly.edit,null);
});

console.log(`M8-C3 composed runtime contracts: ${checks} checks passed`);
