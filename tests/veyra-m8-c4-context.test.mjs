import assert from 'node:assert/strict';
import {baseStore,art,data,pg,prop,ref,board,addBinding,runtimeFor} from './helpers/m8-runtime.mjs';
import {serializeVeyra} from '../src/veyra/io.js';
import {createVeyraRuntimeHost} from '../src/veyra/runtimeHost.js';
import {createVeyraControlPlane} from '../src/veyra/controlPlane.js';
import {createComponentRuntimeRegistry} from '../src/veyra/components.js';
const failures=[];let count=0;
function check(name,fn){count++;try{fn();console.log('PASS',name);}catch(e){failures.push({name,error:e.stack});console.error('FAIL',name,e.stack);}}
const snapshot=s=>[serializeVeyra(s.document),s.revision,JSON.stringify(s.commandHistory)];
const scope=id=>[ref('componentInstance',id)],address='propertyGroupProperty:v/value';
function fixture({nested=false,direct=false,machine=false}={}){
 const s=baseStore();s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'v',type:'number',value:.2},{id:'out',type:'number',value:.1}]});
 addBinding(s,'bound',direct?prop('node:other/opacity'):pg('v'),prop('node:box/opacity'));
 const target=direct?'node:other/opacity':address;
 for(const [id,start,end] of [['tl',.2,.8],['altTl',.4,.6]]){const t=s.addTimeline({id,duration:30,fps:30,loop:'none'});s.setKeyframe({timelineId:t,address:target,frame:0,value:start});s.setKeyframe({timelineId:t,address:target,frame:30,value:end});}
 if(machine){for(const [id,tl] of [['machine','tl'],['altMachine','altTl']])s.addStateMachine({id,initial:ref('machineState',id+'State'),states:[{id:id+'State',type:'animation',timeline:ref('timeline',tl)}],inputs:[{id:id+'Trigger',type:'trigger'}]});}
 s.addArtboard(board('host'));s.createComponent('art_main',{id:'cmp'});let paths;
 const runtime=machine?{stateMachine:ref('stateMachine','machine')}:{timeline:ref('timeline','tl')};
 if(nested){s.addArtboard(board('middle'));s.addComponentInstance('cmp',{id:'inner',artboard:ref('artboard','middle'),runtime});s.createComponent('middle',{id:'outer'});for(const id of ['A','B'])s.addComponentInstance('outer',{id,artboard:ref('artboard','host')});paths=['A','B'].map(id=>[...scope(id),ref('componentInstance','inner')]);}
 else {for(const id of ['A','B'])s.addComponentInstance('cmp',{id,artboard:ref('artboard','host'),runtime});paths=['A','B'].map(scope);}
 const r=runtimeFor(s),c=createComponentRuntimeRegistry(()=>s.document),notes=[],refresh=[],advances=[];r.subscribe(x=>notes.push(...x));
 if(machine){c.machineRuntime(paths[0],'machine').scrub(1);c.machineRuntime(paths[1],'machine').scrub(0);}else{c.setTimelineTime(paths[0],'tl',1);c.setTimelineTime(paths[1],'tl',0);}
 const cp=createVeyraControlPlane(s),host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,controlPlane:cp,getContext:()=>({artboardId:'host'}),onChange:x=>refresh.push(x),onAdvance:x=>advances.push(x)}).api;
 return {s,r,c,cp,host,paths,notes,refresh,advances};
}
function fullValue(host,path,id='box'){const nodes=host.getEvaluatedScene().componentEvaluatedNodes.filter(n=>n.sourceRef.id===id);const n=nodes.find(n=>JSON.stringify(n.componentRuntimeScope.path)===JSON.stringify(path));assert.ok(n,'full scene must contain exact requested path, not any sibling');return n.opacity;}
function assertRead(host,path,expected,id='box'){const read=host.read(`node:${id}/opacity`,{scopePath:path});assert.equal(read.evaluatedValue,expected);assert.equal(fullValue(host,path,id),expected);assert.equal(host.getEvaluatedScene({scopePath:path}).nodes.find(n=>n.id===id).opacity,expected);return read;}
function runtimeEdit(host,ownership,value){const edit=ownership.writableSource.edit;assert.equal(edit.transport,'runtime');assert.equal(typeof host[edit.port],'function');const args=structuredClone(edit.arguments);args[edit.valueIndex]=value;return host[edit.port](...args);}
function commandEdit(cp,ownership,value){const edit=ownership.writableSource.edit;assert.equal(edit.transport,'command');const args=structuredClone(edit.args);let cursor=args;for(const key of edit.valuePath.slice(0,-1))cursor=cursor[key];cursor[edit.valuePath.at(-1)]=value;const result=cp.dispatchCommand({action:edit.action,args});assert.equal(result.ok,true,result.error);return result;}
check('A/B timeline contexts match full/scoped scene and expose source-local wrapper semantics',()=>{
 const {s,host,paths}=fixture();assertRead(host,paths[0],.8);assertRead(host,paths[1],.2);
 s.updateComponentInstance('A',{opacity:.5});const read=host.read('node:box/opacity',{scopePath:paths[0]});assert.equal(read.evaluatedValue,.8);assert.equal(read.valueSpace,'source-local');assert.equal(read.componentContext.wrapperOpacity,.5);assert.equal(fullValue(host,paths[0]),.4);
});
check('repeated nested instances use exact path and independent current animation/live values',()=>{
 const {s,r,c,host,paths}=fixture({nested:true});assertRead(host,paths[0],.8);assertRead(host,paths[1],.2);r.setPropertyGroupValue('v',.63,{scopePath:paths[0]});assertRead(host,paths[0],.63);assertRead(host,paths[1],.2);
 c.setTimelineTime(paths[1],'tl',.5);assertRead(host,paths[1],.5);const before=snapshot(s);s.execute({label:'Rename everything'},d=>{for(const b of d.bindings)b.name='';for(const t of d.timelines)t.name='';d.componentInstances.reverse();});assertRead(host,paths[0],.63);assertRead(host,paths[1],.5);assert.notDeepEqual(snapshot(s),before);
});
check('remapped controller slot and partial mix retain effective timeline identity through ownership',()=>{
 const {s,c,host,paths}=fixture();s.updateComponentInstance('A',{runtime:{timeline:ref('timeline','tl'),remap:{timeline:ref('timeline','altTl')},mix:.5}});
 assertRead(host,paths[0],.4);assertRead(host,paths[1],.2);let o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.activeOwner.chain.controller.timeline.id,'altTl');assert.equal(o.activeOwner.chain.controller.controller.id,'tl');assert.equal(o.activeOwner.chain.controller.mix,.5);
 const before=c.fork().evaluate(paths[0]);runtimeEdit(host,o,.71);assertRead(host,paths[0],.71);assert.deepEqual(c.fork().evaluate(paths[0]),before);
 s.updateComponentInstance('B',{runtime:{timeline:ref('timeline','tl'),mix:0}});assertRead(host,paths[1],.2);
});
check('animated PG recommendation executes through advertised public port, changes one instance, preserves authored history/time',()=>{
 const {s,r,c,host,paths,notes,refresh}=fixture(),before=snapshot(s),clocks=paths.map(p=>c.fork().evaluate(p));
 const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.writableSource.authored,false);assert.equal(o.activeOwner.chain.controller.timeline.id,'tl');assert.equal(o.activeOwner.chain.controller.ref.kind,'track');assert.match(o.writableSource.precedence,/after animation/);
 runtimeEdit(host,o,.47);assertRead(host,paths[0],.47);assertRead(host,paths[1],.2);assert.deepEqual(snapshot(s),before);assert.deepEqual(paths.map(p=>c.fork().evaluate(p)),clocks);assert.equal(notes.length,1);assert.equal(refresh.length,1);assert.equal(r.getPropertyGroupValue('v',{scopePath:paths[0]}),.47);
});
check('data -> converter -> PG -> PG -> visual retains winning root source and executable scoped edit',()=>{
 const {s,host,paths}=fixture();s.execute({label:'Use data source'},d=>{d.timelines=d.timelines.filter(t=>t.id!=='tl');for(const i of d.componentInstances)i.runtime.timeline=null;});
 s.createConverter({id:'invert',type:'conditional',outputType:'number',config:{equals:.25,then:.125,else:.4}});addBinding(s,'input',data('root','num'),pg('v'),{converterChain:[ref('converter','invert')]});addBinding(s,'second',pg('v'),pg('out'));s.updateBinding('bound',{source:pg('out')});
 // Use fresh controller registry: removing an explicitly selected controller invalidates old imperative slots by contract.
 const r=runtimeFor(s),c=createComponentRuntimeRegistry(()=>s.document),api=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host'})}).api;
 const o=api.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.activeOwner.chain.stages.length,3);assert.equal(o.writableSource.property.id,'num');runtimeEdit(api,o,.8);assertRead(api,paths[0],.4);assertRead(api,paths[1],.125);
});
check('binding from an animated ordinary property recommends a canonical keyframe edit and evaluated read-back changes',()=>{
 const {s,cp,host,paths}=fixture({direct:true}),before=s.revision;
 const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.activeOwner.chain.controller.timeline.id,'tl');assert.equal(o.writableSource.edit.action,'setKeyframe');commandEdit(cp,o,.67);assertRead(host,paths[0],.67);assertRead(host,paths[1],.2);assert.equal(s.revision,before+1);assert.equal(s.undo(),true);assertRead(host,paths[0],.8);
});
check('binding sourced from a supported authored Component override recommends editing that override, not overwritten source defaults',()=>{
 const {s,cp,paths}=fixture({direct:true});s.execute({label:'No timelines'},d=>{d.timelines=[];for(const i of d.componentInstances)i.runtime.timeline=null;});
 s.setComponentOverride('A',{id:'overrideA',target:ref('node','other'),address:'node:other/opacity',value:.43});const r=runtimeFor(s),c=createComponentRuntimeRegistry(()=>s.document),host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host'})}).api;
 assertRead(host,paths[0],.43);assertRead(host,paths[1],1);const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.writableSource.edit.action,'setComponentOverride');assert.ok(JSON.stringify(o.activeOwner.chain).includes('overrideA'));commandEdit(cp,o,.57);assertRead(host,paths[0],.57);assertRead(host,paths[1],1);
});
check('actual state-machine context and remap agree with full scene and PG recommendation overrides it explicitly',()=>{
 const {s,c,host,paths}=fixture({machine:true});assertRead(host,paths[0],.8);assertRead(host,paths[1],.2);let o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.activeOwner.chain.controller.machine.id,'machine');assert.equal(o.activeOwner.chain.controller.tracks[0].timeline.id,'tl');
 const state=c.machineRuntime(paths[0],'machine').fork().evaluate();runtimeEdit(host,o,.51);assertRead(host,paths[0],.51);assert.deepEqual(c.machineRuntime(paths[0],'machine').fork().evaluate(),state);
 s.updateComponentInstance('B',{runtime:{stateMachine:ref('stateMachine','machine'),remap:{stateMachine:ref('stateMachine','altMachine')},mix:1}});assertRead(host,paths[1],.4);o=host.getOwnership('node:box/opacity',{scopePath:paths[1]});assert.equal(o.activeOwner.chain.controller.machine.id,'altMachine');assert.equal(o.activeOwner.chain.controller.controller.id,'machine');
});
check('state-machine transition reports both effective timeline tracks and observations do not advance it',()=>{
 const {s,c,host,paths}=fixture({machine:true});s.addMachineState('machine',{id:'nextState',type:'animation',timeline:ref('timeline','altTl')});s.addMachineTransition('machine',{id:'transition',from:ref('machineState','machineState'),to:ref('machineState','nextState'),duration:1,conditions:[{id:'when',input:ref('machineInput','machineTrigger'),op:'fired'}]});
 c.fireMachineInput(paths[0],'machine','machineTrigger');c.stepMachine(paths[0],'machine',.01);c.stepMachine(paths[0],'machine',.25);const machine=c.machineRuntime(paths[0],'machine').fork().evaluate();assert.ok(machine.transition);
 const read=host.read('node:box/opacity',{scopePath:paths[0]});assert.equal(fullValue(host,paths[0]),read.evaluatedValue);const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.deepEqual(o.activeOwner.chain.controller.tracks.map(t=>t.timeline.id),['tl','altTl']);runtimeEdit(host,o,.59);assertRead(host,paths[0],.59);assert.deepEqual(c.machineRuntime(paths[0],'machine').fork().evaluate(),machine);
});
check('repeated observation preserves authored state, live values/events, machine clocks/buckets, counters and all notifications',()=>{
 const {s,r,c,host,paths,notes,refresh,advances}=fixture({nested:true,machine:true});addBinding(s,'trigger',data('root','nested','child_trigger'),prop('node:other/visible'));
 r.fire('child','child_trigger',{scopePath:paths[0]});r.fire('child','child_trigger',{scopePath:paths[0]});c.fireMachineInput(paths[0],'machine','machineTrigger');r.setValue('root','num',.65,{scopePath:paths[0]});r.insertListItem('numbers',.4,0,{scopePath:paths[0]});
 const before={authored:snapshot(s),stats:r.stats,scopes:c.listRuntimeScopes(),state:paths.map(p=>c.machineRuntime(p,'machine').fork().evaluate()),notes:structuredClone(notes),refresh:structuredClone(refresh),advances:advances.length,lists:host.getRuntimeList('numbers',{scopePath:paths[0]})};
 for(let i=0;i<4;i++)for(const path of paths){host.read('node:box/opacity',{scopePath:path});host.getOwnership('node:box/opacity',{scopePath:path});host.getEvaluatedScene({scopePath:path});}
 assert.deepEqual({authored:snapshot(s),stats:r.stats,scopes:c.listRuntimeScopes(),state:paths.map(p=>c.machineRuntime(p,'machine').fork().evaluate()),notes,refresh,advances:advances.length,lists:host.getRuntimeList('numbers',{scopePath:paths[0]})},before);assert.equal(r.getValue('child','child_trigger',{scopePath:paths[0]}),true);assert.equal(r.getValue('root','num',{scopePath:paths[0]}),.65);
 const a=r.evaluateBindings(s.document,{artboardId:'art_main',scopePath:paths[0]}),b=r.evaluateBindings(s.document,{artboardId:'art_main',scopePath:paths[0]}),z=r.evaluateBindings(s.document,{artboardId:'art_main',scopePath:paths[0]});assert.deepEqual([a.overrides['node:other/visible'],b.overrides['node:other/visible'],z.overrides['node:other/visible']],[true,true,false]);
});
check('explicit live:false uses authored/default controller state and invalid scopes never fall back to a sibling',()=>{
 const {s,r,host,paths}=fixture();r.setPropertyGroupValue('v',.7,{scopePath:paths[0]});assertRead(host,paths[0],.7);assert.equal(host.read('node:box/opacity',{scopePath:paths[0],live:false}).evaluatedValue,.2);
 assert.throws(()=>host.read('node:box/opacity',{scopePath:[...paths[0],ref('componentInstance','B')]}),/scope/);s.updateComponentInstance('A',{visible:false});assert.throws(()=>host.read('node:box/opacity',{scopePath:paths[0]}),/scope-not-evaluated/);assertRead(host,paths[1],.2);
});
check('readonly data roots do not advertise edits even while sibling Property Groups are animated',()=>{
 const {s,host,paths}=fixture();s.updateDataProperty('vm_root','num',{writable:false});s.updateBinding('bound',{source:data('root','num')});const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.evaluatedValue,.25);assert.equal(o.writableSource.writable,false);assert.equal(o.writableSource.edit,null);
});
check('unscoped explicit timeline context has one read/scene meaning and respects loop override when editing',()=>{
 const {s,r,c,cp}=fixture({direct:true});const context={artboardId:'art_main',runtimeContext:{timelineId:'tl',timeSeconds:1,loop:'loop'}};
 const host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>context}).api;
 assert.equal(host.read('node:box/opacity').evaluatedValue,.2);assert.equal(host.getEvaluatedScene().nodes.find(n=>n.id==='box').opacity,.2);
 const o=host.getOwnership('node:box/opacity');commandEdit(cp,o,.49);assert.equal(host.read('node:box/opacity').evaluatedValue,.49);assert.equal(host.getEvaluatedScene().nodes.find(n=>n.id==='box').opacity,.49);
});
check('direct machine animation and transitions recommend contributing keyframes, not overwritten authored values',()=>{
 const {s,c,cp,host,paths}=fixture({direct:true,machine:true});const o=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(o.activeOwner.chain.controller.machine.id,'machine');commandEdit(cp,o,.69);assertRead(host,paths[0],.69);
 s.addMachineState('machine',{id:'nextState',type:'animation',timeline:ref('timeline','altTl')});s.addMachineTransition('machine',{id:'transition',from:ref('machineState','machineState'),to:ref('machineState','nextState'),duration:1,conditions:[{id:'when',input:ref('machineInput','machineTrigger'),op:'fired'}]});
 c.fireMachineInput(paths[0],'machine','machineTrigger');c.stepMachine(paths[0],'machine',.01);c.stepMachine(paths[0],'machine',.25);const before=host.read('node:box/opacity',{scopePath:paths[0]}).evaluatedValue;
 const owner=host.getOwnership('node:box/opacity',{scopePath:paths[0]});assert.equal(owner.writableSource.edit.args.timelineId,'altTl');commandEdit(cp,owner,.9);const after=host.read('node:box/opacity',{scopePath:paths[0]}).evaluatedValue;assert.notEqual(after,before);assert.equal(fullValue(host,paths[0]),after);
});
check('scoped observation reports full host traversal cost while public read-only ports leave live counters unchanged',()=>{
 for(const nested of [false,true]){const {r,host,paths}=fixture({nested});r.insertListItem('numbers',.5,0,{scopePath:paths[0]});const stats=r.stats;
 const o=host.read('node:box/opacity',{scopePath:paths[0]});assert.equal(o.observationWork.evaluatedScopes,nested?5:3);assert.equal(o.observationWork.traversal,'full-canonical-host');assert.equal(o.observationWork.runtimeSnapshot,true);
 host.getRuntimeList('numbers',{scopePath:paths[0]});host.getDataRuntimeValue('root','num',{scopePath:paths[0]});assert.deepEqual(r.stats,stats);
 console.log('C4 observation work',JSON.stringify(o.observationWork));}
});
console.log(`M8-C4 evaluated context: ${count-failures.length}/${count} passed`);assert.equal(failures.length,0,JSON.stringify(failures,null,2));
