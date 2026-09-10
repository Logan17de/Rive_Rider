import assert from 'node:assert/strict';
import {baseStore,art,data,pg,prop,ref,addBinding,runtimeFor,evaluate,warm} from './helpers/m8-runtime.mjs';
import {serializeVeyra,parseVeyra} from '../src/veyra/io.js';
import {normalizeDocument} from '../src/veyra/model.js';
import {evaluateDocument} from '../src/veyra/evaluation.js';
import {createVeyraControlPlane} from '../src/veyra/controlPlane.js';
const failures=[];let count=0;
function check(name,fn){count++;try{fn();console.log('PASS',name);}catch(e){failures.push({name,error:e.stack});console.error('FAIL',name,e.stack);}}
const snapshot=s=>[serializeVeyra(s.document),s.revision,JSON.stringify(s.commandHistory)];
const addr=id=>`propertyGroupProperty:${id}/value`;
function rejected(s,cmd,pattern=/binding.*type/){const before=snapshot(s),cp=createVeyraControlPlane(s);const p=cp.previewCommand(cmd);assert.equal(p.ok,false);assert.equal(p.sideEffects,false);const d=cp.dispatchCommand(cmd);assert.equal(d.ok,false);assert.match(d.error,pattern);assert.deepEqual(snapshot(s),before);}
function bindCommand(id,source,target,extras={}){return {action:'createBinding',args:{overrides:{id,artboard:art,source,target,...extras}}};}
function enums(s){s.createEnum({id:'e1',values:[{id:'e1a'},{id:'e1b'}]});s.createEnum({id:'e2',values:[{id:'e2a'},{id:'e2b'}]});s.addDataProperty('vm_root',{id:'enumSource',type:'enum',enum:ref('enum','e1'),defaultValue:ref('enumValue','e1a')});s.createPropertyGroup({id:'enumTargets',artboard:art,properties:[{id:'enum1',type:'enum',enum:ref('enum','e1'),value:null},{id:'enum2',type:'enum',enum:ref('enum','e2'),value:null}]});}
check('same enum/model definitions evaluate and round-trip; incompatible dispatch/preview/normalization are atomic',()=>{
 const s=baseStore();enums(s);s.createPropertyGroup({id:'modelTargets',artboard:art,properties:[{id:'model1',type:'viewModel',viewModel:ref('viewModel','vm_child'),value:null},{id:'model2',type:'viewModel',viewModel:ref('viewModel','vm_root'),value:null}]});
 rejected(s,bindCommand('badEnum',data('root','enumSource'),pg('enum2')));rejected(s,bindCommand('badModel',data('root','nested'),pg('model2')));
 const raw=structuredClone(s.document);raw.bindings.push(bindCommand('badRaw',data('root','enumSource'),pg('enum2')).args.overrides);assert.throws(()=>normalizeDocument(raw),/binding-type-mismatch/);
 addBinding(s,'enum',data('root','enumSource'),pg('enum1'));addBinding(s,'model',data('root','nested'),pg('model1'));let r=runtimeFor(s),out=evaluate(r,s);
 assert.deepEqual(out.overrides[addr('enum1')],ref('enumValue','e1a'));assert.deepEqual(out.overrides[addr('model1')],ref('viewModelInstance','child'));assert.deepEqual(out.diagnostics.errors,[]);
 assert.deepEqual(parseVeyra(serializeVeyra(s.document)).bindings,s.document.bindings);warm(r,s);r.setValue('root','enumSource',ref('enumValue','e1b'));assert.deepEqual(evaluate(r,s).overrides[addr('enum1')],ref('enumValue','e1b'));
});
check('two-way nominal definitions reject mismatch and preserve matching reverse writes',()=>{
 const s=baseStore();enums(s);rejected(s,bindCommand('bad',data('root','enumSource'),pg('enum2'),{mode:'twoWay'}));addBinding(s,'good',data('root','enumSource'),pg('enum1'),{mode:'twoWay'});
 const r=runtimeFor(s);warm(r,s);const before=snapshot(s);r.setTwoWayTarget('good',ref('enumValue','e1b'));assert.deepEqual(evaluate(r,s).overrides[addr('enum1')],ref('enumValue','e1b'));assert.deepEqual(snapshot(s),before);
});
check('explicit enum mapping refines broad output labels and every mapped definition is checked',()=>{
 const s=baseStore();enums(s);s.createConverter({id:'map',type:'enumMap',outputType:'enum',config:{map:{e1a:ref('enumValue','e2a'),e1b:ref('enumValue','e2b')}}});
 addBinding(s,'mapped',data('root','enumSource'),pg('enum2'),{converterChain:[ref('converter','map')]});const r=runtimeFor(s);assert.deepEqual(evaluate(r,s).overrides[addr('enum2')],ref('enumValue','e2a'));warm(r,s);r.setValue('root','enumSource',ref('enumValue','e1b'));assert.deepEqual(evaluate(r,s).overrides[addr('enum2')],ref('enumValue','e2b'));
 rejected(s,{action:'updateConverter',args:{converterId:'map',changes:{config:{map:{e1a:ref('enumValue','e2a'),e1b:ref('enumValue','e1a')}}}}},/binding-converter-type/);
 rejected(s,{action:'updateConverter',args:{converterId:'map',changes:{config:{map:{e2a:ref('enumValue','e2a')}}}}},/binding-converter-type/);
});
check('converter input/output descriptors carry nominal identities through multi-stage chains',()=>{
 const s=baseStore();enums(s);s.createConverter({id:'first',type:'enumMap',inputDescriptor:{type:'enum',enum:ref('enum','e1')},outputType:'enum',outputDescriptor:{type:'enum',enum:ref('enum','e2')},config:{map:{e1a:ref('enumValue','e2a'),e1b:ref('enumValue','e2b')}}});
 s.createConverter({id:'second',type:'enumMap',inputDescriptor:{type:'enum',enum:ref('enum','e2')},outputType:'enum',outputDescriptor:{type:'enum',enum:ref('enum','e1')},config:{map:{e2a:ref('enumValue','e1b'),e2b:ref('enumValue','e1a')}}});
 addBinding(s,'chain',data('root','enumSource'),pg('enum1'),{converterChain:[ref('converter','first'),ref('converter','second')]});assert.deepEqual(evaluate(runtimeFor(s),s).overrides[addr('enum1')],ref('enumValue','e1b'));
 const clone=parseVeyra(serializeVeyra(s.document));assert.equal(clone.converters[0].inputDescriptor.enum.id,'e1');assert.equal(clone.converters[1].outputDescriptor.enum.id,'e1');
 rejected(s,{action:'updateConverter',args:{converterId:'second',changes:{inputDescriptor:{type:'enum',enum:ref('enum','e1')}}}},/binding-converter-type/);
 rejected(s,{action:'updateConverter',args:{converterId:'second',changes:{outputDescriptor:{type:'enum',enum:ref('enum','e2')}}}},/binding-converter-type/);
});
check('conditional converter checks both branches, nullable refs, and definition mismatches',()=>{
 const s=baseStore();enums(s);s.createConverter({id:'conditional',type:'conditional',outputType:'enum',config:{equals:.25,then:ref('enumValue','e1a'),else:ref('enumValue','e2a')}});
 rejected(s,bindCommand('bad',data('root','num'),pg('enum1'),{converterChain:[ref('converter','conditional')]}),/binding-converter-type/);
 s.updateConverter('conditional',{config:{equals:.25,then:ref('enumValue','e1a'),else:null}});addBinding(s,'good',data('root','num'),pg('enum1'),{converterChain:[ref('converter','conditional')]});const r=runtimeFor(s);assert.deepEqual(evaluate(r,s).overrides[addr('enum1')],ref('enumValue','e1a'));r.setValue('root','num',.5);assert.equal(evaluate(r,s).overrides[addr('enum1')],null);
});
check('list descriptors compare recursively, including enum/model identity and range covariance',()=>{
 const s=baseStore();enums(s);
 const items=[{type:'enum',enum:ref('enum','e1')},{type:'enum',enum:ref('enum','e2')},{type:'viewModel',viewModel:ref('viewModel','vm_child')},{type:'viewModel',viewModel:ref('viewModel','vm_root')},{type:'list',itemType:{type:'enum',enum:ref('enum','e1')}},{type:'list',itemType:{type:'enum',enum:ref('enum','e2')}}];
 for(let i=0;i<items.length;i++){s.addDataProperty('vm_root',{id:`list${i}`,type:'list',itemType:items[i],defaultValue:null});s.createPropertyGroup({id:`group${i}`,artboard:art,properties:[{id:`target${i}`,type:'list',itemType:items[i],value:null}]});addBinding(s,`good${i}`,data('root',`list${i}`),pg(`target${i}`));}
 for(const [a,b] of [[0,1],[2,3],[4,5]])rejected(s,bindCommand(`bad${a}`,data('root',`list${a}`),pg(`target${b}`)));
 s.addDataProperty('vm_root',{id:'narrow',type:'list',itemType:{type:'number',min:0,max:1},defaultValue:null});s.createPropertyGroup({id:'range',artboard:art,properties:[{id:'wide',type:'list',itemType:{type:'number'},value:null},{id:'narrowTarget',type:'list',itemType:{type:'number',min:0,max:1},value:null}]});
 addBinding(s,'covariant',data('root','narrow'),pg('wide'));rejected(s,bindCommand('unsafeRange',data('root','items'),pg('narrowTarget')));
 assert.deepEqual(evaluate(runtimeFor(s),s).diagnostics.errors,[]);
});
check('numberToListIndex infers enum/model and nested-list output descriptors',()=>{
 const s=baseStore();enums(s);s.addDataProperty('vm_root',{id:'enumItems',type:'list',itemType:{type:'enum',enum:ref('enum','e1')},defaultValue:null});s.createList({id:'enumList',owner:ref('viewModelInstance','root'),property:ref('dataProperty','enumItems'),items:[{id:'ei',value:ref('enumValue','e1b')}]});
 s.createConverter({id:'pick',type:'numberToListIndex',outputType:'enum',config:{list:ref('list','enumList')}});rejected(s,bindCommand('bad',data('root','index'),pg('enum2'),{converterChain:[ref('converter','pick')]}));addBinding(s,'good',data('root','index'),pg('enum1'),{converterChain:[ref('converter','pick')]});assert.deepEqual(evaluate(runtimeFor(s),s).overrides[addr('enum1')],ref('enumValue','e1b'));
 s.addDataProperty('vm_root',{id:'outerItems',type:'list',itemType:{type:'list',itemType:{type:'enum',enum:ref('enum','e1')}},defaultValue:null});s.createList({id:'outerList',owner:ref('viewModelInstance','root'),property:ref('dataProperty','outerItems'),items:[{id:'ol',value:ref('list','enumList')}]});s.createConverter({id:'outerPick',type:'numberToListIndex',outputType:'list',config:{list:ref('list','outerList')}});
 s.createPropertyGroup({id:'lists',artboard:art,properties:[{id:'listTarget',type:'list',itemType:{type:'enum',enum:ref('enum','e1')},value:null},{id:'wrongListTarget',type:'list',itemType:{type:'enum',enum:ref('enum','e2')},value:null}]});
 rejected(s,bindCommand('wrongOuter',data('root','index'),pg('wrongListTarget'),{converterChain:[ref('converter','outerPick')]}));addBinding(s,'goodOuter',data('root','index'),pg('listTarget'),{converterChain:[ref('converter','outerPick')]});assert.deepEqual(evaluate(runtimeFor(s),s).overrides[addr('listTarget')],ref('list','enumList'));
});
check('runtime enum override incompatible after atomic schema change is diagnosed without corrupting frames and can be replaced',()=>{
 const s=baseStore();enums(s);addBinding(s,'enum',data('root','enumSource'),pg('enum1'));addBinding(s,'unrelated',data('root','num'),prop('node:box/opacity'));const r=runtimeFor(s);warm(r,s);r.setValue('root','enumSource',ref('enumValue','e1b'));evaluate(r,s);
 s.execute({label:'Move both ends to enum2'},d=>{const p=d.viewModels.find(m=>m.id==='vm_root').properties.find(p=>p.id==='enumSource');p.enum=ref('enum','e2');p.defaultValue=ref('enumValue','e2a');d.propertyGroups.find(g=>g.id==='enumTargets').properties.find(p=>p.id==='enum1').enum=ref('enum','e2');});
 const before=snapshot(s);let out=evaluate(r,s);assert.equal(out.overrides[addr('enum1')],undefined);assert.equal(out.overrides['node:box/opacity'],.25);assert.ok(out.diagnostics.errors.some(e=>e.code==='binding-runtime-value'));assert.deepEqual(snapshot(s),before);assert.doesNotThrow(()=>evaluateDocument(s.document,{},null,{dataRuntime:r}));
 r.setValue('root','enumSource',ref('enumValue','e2b'));out=evaluate(r,s);assert.deepEqual(out.overrides[addr('enum1')],ref('enumValue','e2b'));assert.deepEqual(out.diagnostics.errors,[]);warm(r,s);
});
check('runtime View Model override changed definition is diagnosed and can be replaced/reset',()=>{
 const s=baseStore();s.addDataProperty('vm_root',{id:'modelSource',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child')});s.createPropertyGroup({id:'models',artboard:art,properties:[{id:'modelTarget',type:'viewModel',viewModel:ref('viewModel','vm_child'),value:null}]});addBinding(s,'model',data('root','modelSource'),pg('modelTarget'));const r=runtimeFor(s);warm(r,s);r.setValue('root','modelSource',ref('viewModelInstance','child'));
 s.execute({label:'Change model schema'},d=>{const p=d.viewModels.find(m=>m.id==='vm_root').properties.find(p=>p.id==='modelSource');p.viewModel=ref('viewModel','vm_root');p.defaultValue=null;d.propertyGroups.find(g=>g.id==='models').properties[0].viewModel=ref('viewModel','vm_root');});let out=evaluate(r,s);assert.ok(out.diagnostics.errors.length);assert.equal(out.overrides[addr('modelTarget')],undefined);
 r.setValue('root','modelSource',ref('viewModelInstance','root'));assert.deepEqual(evaluate(r,s).overrides[addr('modelTarget')],ref('viewModelInstance','root'));r.reset();assert.equal(evaluate(r,s).overrides[addr('modelTarget')],null);
});
check('runtime Property Group override changed enum definition does not leak raw frame errors and can recover',()=>{
 const s=baseStore();enums(s);
 // Use same-definition source/target for the enabled path.
 s.createPropertyGroup({id:'same',artboard:art,properties:[{id:'sameTarget',type:'enum',enum:ref('enum','e1'),value:null}]});addBinding(s,'read',pg('enum1'),pg('sameTarget'));const r=runtimeFor(s);r.setPropertyGroupValue('enum1',ref('enumValue','e1a'));warm(r,s);
 s.execute({label:'Change PG definitions'},d=>{for(const g of d.propertyGroups)for(const p of g.properties)if(['enum1','sameTarget'].includes(p.id))p.enum=ref('enum','e2');});let out=evaluate(r,s);assert.ok(out.diagnostics.errors.length);assert.equal(out.overrides[addr('sameTarget')],undefined);
 r.setPropertyGroupValue('enum1',ref('enumValue','e2a'));out=evaluate(r,s);assert.deepEqual(out.overrides[addr('sameTarget')],ref('enumValue','e2a'));assert.deepEqual(out.diagnostics.errors,[]);
});
check('warm runtime list values are revalidated after declared item schema changes, including nonselected stale items',()=>{
 const s=baseStore();s.createConverter({id:'pick',type:'numberToListIndex',outputType:'number',config:{list:ref('list','numbers')}});addBinding(s,'pick',data('root','index'),prop('node:box/opacity'),{converterChain:[ref('converter','pick')]});const r=runtimeFor(s);warm(r,s);r.replaceListItem('numbers','item_b',.95);warm(r,s);
 s.updateDataProperty('vm_root','items',{itemType:{type:'number',min:0,max:.85}});const before=snapshot(s);let out=evaluate(r,s);assert.ok(out.diagnostics.errors.length,'nonselected stale runtime item must be diagnosed');assert.equal(out.overrides['node:box/opacity'],undefined);assert.deepEqual(snapshot(s),before);
 r.reset();out=evaluate(r,s);assert.equal(out.overrides['node:box/opacity'],.2);assert.deepEqual(out.diagnostics.errors,[]);warm(r,s);r.resetStats();evaluate(r,s);assert.equal(r.stats.runtimeListItemsValidated,0);
});
check('warm matching schema/config edits preserve valid overrides and invalid edits are atomic',()=>{
 const s=baseStore();enums(s);s.createConverter({id:'map',type:'enumMap',outputType:'enum',config:{map:{e1a:ref('enumValue','e2a'),e1b:ref('enumValue','e2b')}}});addBinding(s,'mapped',data('root','enumSource'),pg('enum2'),{converterChain:[ref('converter','map')]});const r=runtimeFor(s);r.setValue('root','enumSource',ref('enumValue','e1b'));warm(r,s);
 s.updateDataProperty('vm_root','enumSource',{name:'renamed'});s.updateConverter('map',{config:{map:{e1a:ref('enumValue','e2b'),e1b:ref('enumValue','e2a')}}});assert.deepEqual(evaluate(r,s).overrides[addr('enum2')],ref('enumValue','e2a'));warm(r,s);
 rejected(s,{action:'updateDataProperty',args:{modelId:'vm_root',propertyId:'enumSource',changes:{enum:ref('enum','e2'),defaultValue:ref('enumValue','e2b')}}},/binding-converter-type/);assert.deepEqual(r.getValue('root','enumSource'),ref('enumValue','e1b'));assert.deepEqual(evaluate(r,s).overrides[addr('enum2')],ref('enumValue','e2a'));
});
check('preview and dispatch retain structured source/target/type evidence, not just an exception string',()=>{
 const s=baseStore();enums(s);const cp=createVeyraControlPlane(s),cmd=bindCommand('typedFailure',data('root','enumSource'),pg('enum2')),before=snapshot(s);
 const preview=cp.previewCommand(cmd),dispatch=cp.dispatchCommand(cmd);assert.equal(preview.ok,false);assert.equal(preview.validation.ok,false);assert.equal(preview.validation.errors[0].code,'binding-type-mismatch');assert.equal(dispatch.errorCode,'binding-type-mismatch');
 assert.equal(dispatch.errorEvidence.sourceType.enum.id,'e1');assert.equal(dispatch.errorEvidence.targetType.enum.id,'e2');assert.equal(dispatch.errorEvidence.binding.id,'typedFailure');assert.deepEqual(preview.validation.errors[0].evidence,dispatch.errorEvidence);assert.deepEqual(snapshot(s),before);
});
console.log(`M8-C4 full type contracts: ${count-failures.length}/${count} passed`);assert.equal(failures.length,0,JSON.stringify(failures,null,2));
