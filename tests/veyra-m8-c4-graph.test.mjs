import assert from 'node:assert/strict';
import {baseStore,art,data,pg,prop,ref,board,addBinding,runtimeFor,evaluate,warm} from './helpers/m8-runtime.mjs';
import {createVeyraDataRuntime} from '../src/veyra/dataGraph.js';
import {parseVeyra,serializeVeyra} from '../src/veyra/io.js';
import {createVeyraControlPlane} from '../src/veyra/controlPlane.js';
import {createVeyraRuntimeHost} from '../src/veyra/runtimeHost.js';
import {createComponentRuntimeRegistry} from '../src/veyra/components.js';
const snapshot=s=>[serializeVeyra(s.document),s.revision,JSON.stringify(s.commandHistory)];
const failures=[];let checks=0;
function check(name,fn){checks++;try{fn();console.log('PASS',name);}catch(e){failures.push({name,error:e.stack});console.error('FAIL',name,e.stack);}}
function child2(s){s.createViewModelInstance({id:'child2',viewModel:ref('viewModel','vm_child'),artboard:art,initialValues:[{property:ref('dataProperty','child_value'),value:.9}]});}
function retargetAuthored(s,id){const root=s.document.viewModelInstances.find(v=>v.id==='root');s.updateViewModelInstance('root',{initialValues:root.initialValues.map(p=>p.property.id==='nested'?{...p,value:ref('viewModelInstance',id)}:p)});}
function value(out,node='box'){return out.overrides[`node:${node}/opacity`];}
check('both ID orders, nested sources/targets, rename/reorder/save-load keep one endpoint meaning',()=>{
 for(const [writer,reader] of [['z_writer','a_reader'],['a_writer','z_reader']])for(const nestedWriter of [false,true]){
  const s=baseStore();addBinding(s,writer,data('root','num'),nestedWriter?data('root','nested','child_value'):data('child','child_value'));
  addBinding(s,reader,nestedWriter?data('child','child_value'):data('root','nested','child_value'),prop('node:box/opacity'));
  const r=runtimeFor(s);assert.equal(value(evaluate(r,s)),.25);warm(r,s);const before=snapshot(s);
  r.setValue('root','num',.66);assert.equal(value(evaluate(r,s)),.66);assert.deepEqual(snapshot(s),before);
  s.execute({label:'Rename and reorder'},d=>{d.bindings.reverse();d.viewModelInstances.reverse();for(const m of d.viewModels){m.name='same';m.properties.reverse();for(const p of m.properties)p.name='';}for(const b of d.bindings)b.name='same';});
  assert.equal(value(evaluate(r,s)),.66);const loaded=parseVeyra(serializeVeyra(s.document));assert.equal(value(createVeyraDataRuntime(loaded).evaluateBindings(loaded,{artboardId:'art_main'})),.25);
 }
});
check('resolved conflict preserves priority and stable ID ties through reorder and reference retarget',()=>{
 const s=baseStore();child2(s);
 addBinding(s,'z_low',data('root','alt'),data('child','child_value'),{priority:0});
 addBinding(s,'b_high',data('root','num'),data('root','nested','child_value'),{priority:10});
 addBinding(s,'a_high',data('root','alt'),data('child','child_value'),{priority:10});
 addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);let out=evaluate(r,s);assert.equal(value(out),.75);assert.equal(out.diagnostics.conflicts.length,1);
 s.execute({label:'Reorder'},d=>d.bindings.reverse());assert.equal(value(evaluate(r,s)),.75);
 r.setValue('root','nested',ref('viewModelInstance','child2'));out=evaluate(r,s);assert.equal(value(out),.25);assert.equal(out.diagnostics.conflicts.length,1);
 r.setValue('root','nested',ref('viewModelInstance','child'));out=evaluate(r,s);assert.equal(value(out),.75);assert.equal(out.diagnostics.conflicts.length,1);
});
check('warm reference retarget removes stale dependencies, preserves unrelated cache and authored paths',()=>{
 const s=baseStore();child2(s);addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));addBinding(s,'unrelated',data('root','num'),prop('node:other/opacity'));
 const r=runtimeFor(s);warm(r,s);const before=snapshot(s);r.setValue('root','nested',ref('viewModelInstance','child2'));let out=evaluate(r,s);
 assert.equal(value(out),.9);assert.equal(out.stats.evaluatedBindings,1);assert.equal(out.stats.cacheHits,1);
 warm(r,s);r.resetStats();r.setValue('child','child_value',.3);assert.equal(r.stats.dependencyEdgesVisited,0);assert.equal(evaluate(r,s).stats.evaluatedBindings,0);
 r.setValue('child2','child_value',.6);out=evaluate(r,s);assert.equal(value(out),.6);assert.equal(out.stats.evaluatedBindings,1);assert.deepEqual(snapshot(s),before);
 r.resetStats();evaluate(r,s);for(const k of ['resolvedGraphBuilds','endpointResolutions','resolutionSegmentsVisited','graphBuilds','catalogBuilds','signatureBuilds','retargetPasses'])assert.equal(r.stats[k],0,k);
});
check('nested target retarget switches effective derived writes without changing authored child storage',()=>{
 const s=baseStore();child2(s);addBinding(s,'write',data('root','num'),data('root','nested','child_value'));addBinding(s,'read1',data('child','child_value'),prop('node:box/opacity'));addBinding(s,'read2',data('child2','child_value'),prop('node:other/opacity'));
 const r=runtimeFor(s);let out=evaluate(r,s);assert.deepEqual([value(out),value(out,'other')],[.25,.9]);warm(r,s);
 r.setValue('root','nested',ref('viewModelInstance','child2'));out=evaluate(r,s);assert.deepEqual([value(out),value(out,'other')],[.2,.25]);
 assert.equal(r.getValue('child','child_value'),.2);assert.equal(r.getValue('child2','child_value'),.9);
 r.setValue('root','num',.55);out=evaluate(r,s);assert.deepEqual([value(out),value(out,'other')],[.2,.55]);
});
check('authored retarget respects per-scope reference override and reset, without sibling leakage',()=>{
 const s=baseStore();child2(s);addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s),a=[ref('componentInstance','A')],b=[ref('componentInstance','B')];warm(r,s,a);warm(r,s,b);
 r.setValue('root','nested',ref('viewModelInstance','child'),{scopePath:a});retargetAuthored(s,'child2');assert.equal(value(evaluate(r,s,a)),.2);assert.equal(value(evaluate(r,s,b)),.9);
 r.reset({scopePath:a});assert.equal(value(evaluate(r,s,a)),.9);warm(r,s,a);warm(r,s,b);
});
check('multi-hop authored alias cycle rejects preview/dispatch before revision/history, with endpoint evidence',()=>{
 const s=baseStore();child2(s);addBinding(s,'one',data('root','nested','child_value'),data('child2','child_value'));
 const cmd={action:'createBinding',args:{overrides:{id:'two',artboard:art,source:data('child2','child_value'),target:data('child','child_value')}}};
 const cp=createVeyraControlPlane(s),before=snapshot(s);assert.equal(cp.previewCommand(cmd).ok,false);const result=cp.dispatchCommand(cmd);assert.equal(result.ok,false);assert.match(result.error,/binding-cycle/);assert.match(result.error,/one/);assert.match(result.error,/child_value/);assert.deepEqual(snapshot(s),before);
});
check('runtime retarget self-cycle is bounded, diagnosed, suppresses descendants only and recovers',()=>{
 const s=baseStore();child2(s);addBinding(s,'edge',data('root','nested','child_value'),data('child2','child_value'));addBinding(s,'read',data('child2','child_value'),prop('node:box/opacity'));addBinding(s,'other',data('root','num'),prop('node:other/opacity'));
 const r=runtimeFor(s);warm(r,s);const before=snapshot(s);r.setValue('root','nested',ref('viewModelInstance','child2'));let out=evaluate(r,s);
 assert.equal(value(out),undefined);assert.equal(value(out,'other'),.25);assert.ok(out.diagnostics.errors.some(e=>e.code==='binding-runtime-cycle'));assert.ok(out.diagnostics.errors.some(e=>JSON.stringify(e).includes('edge')));
 assert.deepEqual(snapshot(s),before);out=evaluate(r,s);assert.equal(out.stats.evaluatedBindings,0);assert.equal(value(out),undefined);
 r.setValue('root','nested',ref('viewModelInstance','child'));out=evaluate(r,s);assert.equal(value(out),.2);assert.deepEqual(out.diagnostics.errors,[]);
});
check('runtime retarget multi-hop cycle cannot use stale prior frame values and reopens on recovery',()=>{
 const s=baseStore();child2(s);s.createViewModelInstance({id:'child3',viewModel:ref('viewModel','vm_child'),artboard:art});
 addBinding(s,'first',data('root','nested','child_value'),data('child2','child_value'));addBinding(s,'second',data('child2','child_value'),data('child3','child_value'));addBinding(s,'read',data('child3','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);warm(r,s);r.setValue('root','nested',ref('viewModelInstance','child3'));let out=evaluate(r,s);assert.equal(value(out),undefined);assert.ok(out.diagnostics.errors.some(e=>e.code==='binding-runtime-cycle'));
 r.setValue('root','nested',ref('viewModelInstance','child'));assert.equal(value(evaluate(r,s)),.2);
});
check('derived reference writers settle nested aliases on cold/warm frames in either ID order',()=>{
 for(const ids of [['z_reference','a_write','b_read'],['a_reference','z_write','b_read']]){
 const s=baseStore();child2(s);s.addDataProperty('vm_root',{id:'next',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child2')});
 addBinding(s,ids[0],data('root','next'),data('root','nested'));addBinding(s,ids[1],data('root','num'),data('root','nested','child_value'));addBinding(s,ids[2],data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);let out=evaluate(r,s);assert.equal(value(out),.25);assert.deepEqual(out.diagnostics.errors,[]);warm(r,s);
 r.setValue('root','next',ref('viewModelInstance','child'));r.setValue('root','num',.62);out=evaluate(r,s);assert.equal(value(out),.62);assert.deepEqual(out.diagnostics.errors,[]);warm(r,s);
 r.setValue('child2','child_value',.8);assert.equal(evaluate(r,s).stats.evaluatedBindings,0);
 }
});
check('derived reference converter retargets aliases and stale references disappear after writer removal',()=>{
 const s=baseStore();child2(s);s.addDataProperty('vm_root',{id:'select',type:'boolean',defaultValue:true});
 s.createConverter({id:'choose',type:'conditional',outputType:'viewModel',config:{equals:true,then:ref('viewModelInstance','child2'),else:ref('viewModelInstance','child')}});
 addBinding(s,'choose',data('root','select'),data('root','nested'),{converterChain:[ref('converter','choose')]});addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);assert.equal(value(evaluate(r,s)),.9);warm(r,s);r.setValue('root','select',false);assert.equal(value(evaluate(r,s)),.2);warm(r,s);
 r.setValue('root','select',true);assert.equal(value(evaluate(r,s)),.9);s.execute({label:'Remove reference writer'},d=>{d.bindings=d.bindings.filter(b=>b.id!=='choose');});assert.equal(value(evaluate(r,s)),.2);warm(r,s);
});
check('derived retarget-created conflict applies priority before any downstream observation',()=>{
 const s=baseStore();child2(s);s.addDataProperty('vm_root',{id:'next',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child2')});
 addBinding(s,'ref',data('root','next'),data('root','nested'));addBinding(s,'a_high',data('root','num'),data('root','nested','child_value'),{priority:10});addBinding(s,'b_low',data('root','alt'),data('child2','child_value'));
 addBinding(s,'read',data('child2','child_value'),prop('node:box/opacity'));const r=runtimeFor(s);let out=evaluate(r,s);assert.equal(value(out),.25);assert.equal(out.diagnostics.conflicts.length,1);warm(r,s);
 r.setValue('root','next',ref('viewModelInstance','child'));out=evaluate(r,s);assert.equal(value(out),.75);assert.equal(out.diagnostics.conflicts.length,0);
});
check('derived retarget-created cycle is bounded and leaves unrelated output available',()=>{
 const s=baseStore();child2(s);s.addDataProperty('vm_root',{id:'next',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child')});
 addBinding(s,'ref',data('root','next'),data('root','nested'));addBinding(s,'selfAfterRetarget',data('root','nested','child_value'),data('child2','child_value'));addBinding(s,'read',data('child2','child_value'),prop('node:box/opacity'));addBinding(s,'other',data('root','num'),prop('node:other/opacity'));
 const r=runtimeFor(s);warm(r,s);r.setValue('root','next',ref('viewModelInstance','child2'));let out=evaluate(r,s);assert.equal(value(out),undefined);assert.equal(value(out,'other'),.25);assert.ok(out.diagnostics.errors.some(e=>e.code==='binding-runtime-cycle'));
 r.setValue('root','next',ref('viewModelInstance','child'));out=evaluate(r,s);assert.equal(value(out),.2);assert.deepEqual(out.diagnostics.errors,[]);
});
check('real repeated nested Component paths isolate effective graphs and compare full/scoped descendants',()=>{
 const s=baseStore();child2(s);addBinding(s,'write',data('root','num'),data('root','nested','child_value'));addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));
 s.addArtboard(board('middle'));s.addArtboard(board('host'));s.createComponent('art_main',{id:'leaf'});s.addComponentInstance('leaf',{id:'inner',artboard:ref('artboard','middle')});s.createComponent('middle',{id:'outer'});
 for(const id of ['A','B'])s.addComponentInstance('outer',{id,artboard:ref('artboard','host')});
 const a=[ref('componentInstance','A'),ref('componentInstance','inner')],b=[ref('componentInstance','B'),ref('componentInstance','inner')],r=runtimeFor(s),c=createComponentRuntimeRegistry(()=>s.document);
 r.setValue('root','nested',ref('viewModelInstance','child2'),{scopePath:a});r.setValue('root','num',.65,{scopePath:a});r.setValue('root','num',.33,{scopePath:b});
 const host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host'})}).api,full=host.getEvaluatedScene().componentEvaluatedNodes.filter(n=>n.sourceRef.id==='box');
 for(const [path,expected] of [[a,.65],[b,.33]]){assert.equal(host.read('node:box/opacity',{scopePath:path}).evaluatedValue,expected);assert.ok(full.some(n=>n.opacity===expected));}
 assert.equal(r.getValue('child','child_value',{scopePath:a}),.2);assert.equal(r.getValue('child2','child_value',{scopePath:a}),.9);
});
check('settled 220 bindings and scoped scalar writes do no new alias/graph work',()=>{
 const s=baseStore();child2(s);s.createPropertyGroup({id:'outputs',artboard:art,properties:Array.from({length:220},(_,i)=>({id:`p${i}`,type:'number',value:0}))});
 s.execute({label:'220 bindings'},d=>{for(let i=0;i<220;i++)d.bindings.push({id:`b${i}`,name:'',artboard:art,source:data('root',i===0?'nested':'num',...(i===0?['child_value']:[])),target:pg(`p${i}`),mode:'oneWay',enabled:true,priority:0,converterChain:[]});});
 const r=runtimeFor(s),a=[ref('componentInstance','A')],b=[ref('componentInstance','B')];warm(r,s,a);warm(r,s,b);r.resetStats();evaluate(r,s,a);evaluate(r,s,b);
 for(const key of ['resolvedGraphBuilds','endpointResolutions','resolutionSegmentsVisited','graphBuilds','catalogBuilds','signatureBuilds','converterEvaluations','bindingEvaluations'])assert.equal(r.stats[key],0,key);assert.equal(r.stats.outputApplications,440);
 r.resetStats();r.setValue('child','child_value',.55,{scopePath:a});assert.equal(r.stats.bindingsExamined,0);assert.equal(r.stats.dependencyEdgesVisited,1);let out=evaluate(r,s,a);assert.equal(out.stats.evaluatedBindings,1);assert.equal(out.stats.cacheHits,219);assert.equal(r.stats.resolvedGraphBuilds,0);assert.equal(evaluate(r,s,b).stats.evaluatedBindings,0);
 console.log('C4 220-binding scalar-write counters',JSON.stringify(r.stats));
 r.resetStats();r.setValue('root','nested',ref('viewModelInstance','child2'),{scopePath:a});assert.equal(r.stats.bindingsExamined,0);assert.equal(r.stats.dependencyEdgesVisited,1);out=evaluate(r,s,a);
 assert.equal(out.overrides['propertyGroupProperty:p0/value'],.9);assert.equal(out.stats.evaluatedBindings,1);assert.equal(out.stats.cacheHits,219);assert.equal(r.stats.endpointResolutions,2);assert.equal(r.stats.resolvedGraphBuilds,1);assert.equal(r.stats.catalogBuilds,0);assert.equal(r.stats.graphBuilds,0);
 console.log('C4 220-binding reference-retarget counters',JSON.stringify(r.stats));r.resetStats();evaluate(r,s,a);assert.equal(r.stats.endpointResolutions,0);assert.equal(r.stats.resolvedGraphBuilds,0);assert.equal(r.stats.bindingEvaluations,0);
});
check('derived authored default self-cycle is rejected before committing the reference writer',()=>{
 const s=baseStore();child2(s);s.addDataProperty('vm_root',{id:'next',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child2')});
 addBinding(s,'wouldCycle',data('root','nested','child_value'),data('child2','child_value'));
 const before=snapshot(s),cp=createVeyraControlPlane(s),command={action:'createBinding',args:{overrides:{id:'reference',artboard:art,source:data('root','next'),target:data('root','nested')}}};
 assert.equal(cp.previewCommand(command).ok,false);const result=cp.dispatchCommand(command);assert.equal(result.ok,false);assert.match(result.error,/binding-cycle/);assert.deepEqual(snapshot(s),before);
});
check('null scoped references diagnose the missing path and recover without stale terminal dependencies',()=>{
 const s=baseStore();child2(s);addBinding(s,'read',data('root','nested','child_value'),prop('node:box/opacity'));const r=runtimeFor(s);warm(r,s);r.setValue('root','nested',null);let out=evaluate(r,s);assert.equal(value(out),undefined);assert.ok(out.diagnostics.errors.some(e=>e.code==='binding-runtime-path'));
 r.resetStats();r.setValue('child','child_value',.7);assert.equal(r.stats.dependencyEdgesVisited,0);r.setValue('root','nested',ref('viewModelInstance','child2'));out=evaluate(r,s);assert.equal(value(out),.9);assert.deepEqual(out.diagnostics.errors,[]);
});
check('a retargeted losing binding unregisters stale source terminals until it becomes a winner again',()=>{
 const s=baseStore();child2(s);s.createViewModelInstance({id:'child3',viewModel:ref('viewModel','vm_child'),artboard:art});s.addDataProperty('vm_root',{id:'targetRef',type:'viewModel',viewModel:ref('viewModel','vm_child'),defaultValue:ref('viewModelInstance','child3')});
 addBinding(s,'low',data('root','nested','child_value'),data('root','targetRef','child_value'));addBinding(s,'high',data('root','num'),data('child2','child_value'),{priority:10});addBinding(s,'read',data('child2','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);warm(r,s);r.setValue('root','targetRef',ref('viewModelInstance','child2'));assert.equal(value(evaluate(r,s)),.25);r.resetStats();r.setValue('child','child_value',.61);assert.equal(r.stats.dependencyEdgesVisited,0);assert.equal(evaluate(r,s).stats.evaluatedBindings,0);
 r.setValue('root','targetRef',ref('viewModelInstance','child3'));evaluate(r,s);addBinding(s,'read3',data('child3','child_value'),prop('node:other/opacity'));assert.equal(value(evaluate(r,s),'other'),.61);
});
console.log(`M8-C4 graph composition: ${checks-failures.length}/${checks} passed`);assert.equal(failures.length,0,JSON.stringify(failures,null,2));
