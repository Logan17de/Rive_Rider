// Independent probes for production d36f0ac2841fa6320f4335f617847d123dd394ca.
// Run from repository root: node verification/m8-c3-review.mjs
// No production edits; setup uses the canonical Store with the existing validated fixture.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {baseStore,art,data,pg,prop,ref,board,addBinding,runtimeFor,evaluate,warm} from '../tests/helpers/m8-runtime.mjs';
import {serializeVeyra} from '../src/veyra/io.js';
import {evaluateDocument} from '../src/veyra/evaluation.js';
import {createVeyraControlPlane} from '../src/veyra/controlPlane.js';
import {createVeyraRuntimeHost} from '../src/veyra/runtimeHost.js';
import {createComponentRuntimeRegistry} from '../src/veyra/components.js';
const results=[];
const snapshot=s=>[serializeVeyra(s.document),s.revision,JSON.stringify(s.commandHistory)];
function check(name,expected,fn){
 let actual;
 try{actual=fn();assert.deepEqual(actual,expected);results.push({name,status:'PASS',actual,expected});}
 catch(e){results.push({name,status:actual===undefined?'SETUP_OR_EXECUTION_ERROR':'FAIL',actual,expected,error:e.message});}
 console.log(JSON.stringify(results.at(-1)));
}
check('control: warm nested numeric updates invalidate once, then sleep',[.61,1,0],()=>{
 const s=baseStore();addBinding(s,'nested',data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s);warm(r,s);r.setValue('child','child_value',.61);const changed=evaluate(r,s);
 return [changed.overrides['node:box/opacity'],changed.stats.evaluatedBindings,evaluate(r,s).stats.evaluatedBindings];
});
check('control: live ownership observation preserves queued trigger and runtime counters',[true,true,true],()=>{
 const s=baseStore();addBinding(s,'trigger',data('root','nested','child_trigger'),prop('node:box/visible'));
 const r=runtimeFor(s);warm(r,s);r.fire('child','child_trigger');const before=r.stats;
 const host=createVeyraRuntimeHost({store:s,dataRuntime:r}).api;
 const value=host.read('node:box/visible').evaluatedValue;
 return [value,r.getValue('child','child_trigger'),JSON.stringify(before)===JSON.stringify(r.stats)];
});
check('resolved nested/direct data aliases propagate independent of binding ID sort order',[.25,.66],()=>{
 const s=baseStore();addBinding(s,'z_writer',data('root','num'),data('child','child_value'));
 addBinding(s,'a_reader',data('root','nested','child_value'),prop('node:box/opacity'));
 const r=runtimeFor(s),cold=evaluate(r,s);evaluate(r,s);r.setValue('root','num',.66);const changed=evaluate(r,s);
 return [cold.overrides['node:box/opacity'],changed.overrides['node:box/opacity']];
});
check('resolved nested/direct alias targets share one conflict winner',{value:.25,conflicts:1},()=>{
 const s=baseStore();addBinding(s,'a_high',data('root','num'),data('root','nested','child_value'),{priority:10});
 addBinding(s,'b_low',data('root','alt'),data('child','child_value'),{priority:0});
 addBinding(s,'z_reader',data('child','child_value'),prop('node:box/opacity'));
 const result=evaluate(runtimeFor(s),s);return {value:result.overrides['node:box/opacity'],conflicts:result.diagnostics.conflicts.length};
});
check('self-cycle through nested/direct aliases rejects before authored mutation',{rejected:true,unchanged:true},()=>{
 const s=baseStore(),before=snapshot(s);
 const result=createVeyraControlPlane(s).dispatchCommand({action:'createBinding',args:{overrides:{id:'self',artboard:art,source:data('root','nested','child_value'),target:data('child','child_value')}}});
 return {rejected:!result.ok,unchanged:JSON.stringify(snapshot(s))===JSON.stringify(before)};
});
check('nominal enum mismatch fails validation, not later scene evaluation',{previewRejected:true,previewThrew:false,dispatchRejected:true,unchanged:true,evaluationError:null},()=>{
 const s=baseStore();s.createEnum({id:'e1',values:[{id:'e1v'}]});s.createEnum({id:'e2',values:[{id:'e2v'}]});
 s.addDataProperty('vm_root',{id:'enum',type:'enum',enum:ref('enum','e1'),defaultValue:ref('enumValue','e1v')});
 s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'v',type:'enum',enum:ref('enum','e2'),value:ref('enumValue','e2v')}]});
 const before=snapshot(s),cp=createVeyraControlPlane(s),command={action:'createBinding',args:{overrides:{id:'bad',artboard:art,source:data('root','enum'),target:pg('v')}}};
 let preview,previewThrew=false;try{preview=cp.previewCommand(command);}catch(e){previewThrew=true;preview={ok:false,error:e.message};}
 const dispatch=cp.dispatchCommand(command);let evaluationError=null;
 try{evaluateDocument(s.document,{},null,{dataRuntime:runtimeFor(s)});}catch(e){evaluationError=e.message;}
 return {previewRejected:!preview.ok,previewThrew,dispatchRejected:!dispatch.ok,unchanged:JSON.stringify(snapshot(s))===JSON.stringify(before),evaluationError};
});
check('nominal nested View Model mismatch also rejects before commit',{rejected:true,unchanged:true,evaluationError:null},()=>{
 const s=baseStore();s.createViewModel({id:'different_model',properties:[{id:'different_property',type:'number',defaultValue:0}]});
 s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'v',type:'viewModel',viewModel:ref('viewModel','different_model'),value:null}]});
 const before=snapshot(s),res=createVeyraControlPlane(s).dispatchCommand({action:'createBinding',args:{overrides:{id:'bad',artboard:art,source:data('root','nested'),target:pg('v')}}});
 let evaluationError=null;try{evaluateDocument(s.document,{},null,{dataRuntime:runtimeFor(s)});}catch(e){evaluationError=e.message;}
 return {rejected:!res.ok,unchanged:JSON.stringify(snapshot(s))===JSON.stringify(before),evaluationError};
});
function animatedComponentFixture(){
 const s=baseStore();s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'v',type:'number',value:.2}]});
 addBinding(s,'bound',pg('v'),prop('node:box/opacity'));
 // Author timeline on its one-board source before adding hosts; no workaround edits to production.
 const tl=s.addTimeline({id:'tl',duration:30,fps:30,loop:'none'});
 s.setKeyframe({timelineId:tl,address:'propertyGroupProperty:v/value',frame:0,value:.2});
 s.setKeyframe({timelineId:tl,address:'propertyGroupProperty:v/value',frame:30,value:.8});
 s.addArtboard(board('host'));s.createComponent('art_main',{id:'cmp'});
 for(const id of ['A','B'])s.addComponentInstance('cmp',{id,artboard:ref('artboard','host'),runtime:{timeline:ref('timeline','tl')}});
 const r=runtimeFor(s),c=createComponentRuntimeRegistry(()=>s.document);
 c.setTimelineTime('A','tl',1);c.setTimelineTime('B','tl',0);
 return {s,r,c,host:createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'host'})}).api};
}
check('scoped host read/scene agree with full evaluated animated Component',{whole:[.8,.2],reads:[.8,.2],scopedScene:.8,unchanged:true},()=>{
 const {s,r,c,host}=animatedComponentFixture(),before=snapshot(s),stats=r.stats,scopes=JSON.stringify(c.listRuntimeScopes());
 const whole=host.getEvaluatedScene().componentEvaluatedNodes.filter(n=>n.sourceRef.id==='box').sort((a,b)=>a.componentInstanceRef.id.localeCompare(b.componentInstanceRef.id)).map(n=>n.opacity);
 const reads=['A','B'].map(id=>host.read('node:box/opacity',{scopePath:[ref('componentInstance',id)]}).evaluatedValue);
 const scopedScene=host.getEvaluatedScene({scopePath:[ref('componentInstance','A')]}).nodes.find(n=>n.id==='box').opacity;
 return {whole,reads,scopedScene,unchanged:JSON.stringify(before)===JSON.stringify(snapshot(s))&&JSON.stringify(stats)===JSON.stringify(r.stats)&&scopes===JSON.stringify(c.listRuntimeScopes())};
});
check('ownership traces an animated Property Group source rather than recommending overwritten authored value',{visible:.8,recommendsOverwrittenAuthoredValue:false,traceIncludesTimeline:true},()=>{
 const {s,r,c}=animatedComponentFixture();
 const host=createVeyraRuntimeHost({store:s,dataRuntime:r,componentRuntime:c,getContext:()=>({artboardId:'art_main',runtimeContext:{timelineId:'tl',timeSeconds:1}})}).api;
 const o=host.getOwnership('node:box/opacity'),w=o.writableSource;
 return {visible:o.evaluatedValue,recommendsOverwrittenAuthoredValue:w.authored===true&&w.address==='propertyGroupProperty:v/value',traceIncludesTimeline:JSON.stringify(o).includes('"tl"')};
});
mkdirSync('verification',{recursive:true});
writeFileSync('verification/m8-c3-review-results.json',JSON.stringify({baseline:'d36f0ac2841fa6320f4335f617847d123dd394ca',results},null,2)+'\n');
console.log(`Independent C3 review: ${results.filter(r=>r.status==='PASS').length}/${results.length} probes passed; ${results.filter(r=>r.status==='FAIL').length} failed assertions; ${results.filter(r=>r.status==='SETUP_OR_EXECUTION_ERROR').length} setup/execution errors.`);
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
