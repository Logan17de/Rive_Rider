// Independent M8-C4 probes. Run from repo root: node verification/m8-c4-review.mjs
// Production baseline: b57b390b245b363f9024349d9b116996eb045e7a.
// No production edits, mocks, external dependencies, or browser-acceptance claims.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createDocument, createNode} from '../src/veyra/model.js';
import {VeyraStore} from '../src/veyra/store.js';
import {createVeyraDataRuntime} from '../src/veyra/dataGraph.js';
import {createVeyraRuntimeHost} from '../src/veyra/runtimeHost.js';
import {createVeyraControlPlane} from '../src/veyra/controlPlane.js';
import {createComponentRuntimeRegistry} from '../src/veyra/components.js';
import {evaluateDocument} from '../src/veyra/evaluation.js';
import {serializeVeyra} from '../src/veyra/io.js';

const ref=(kind,id)=>({kind,id});
const art=ref('artboard','source');
const board=id=>({id,name:id,x:0,y:0,width:640,height:480,background:'#ffffff'});
const data=(instance,...ids)=>({kind:'data',instance:ref('viewModelInstance',instance),path:ids.map(id=>ref('dataProperty',id))});
const prop=address=>({kind:'property',address});
const pg=id=>({kind:'propertyGroupProperty',property:ref('propertyGroupProperty',id)});
const snapshot=s=>({serialized:serializeVeyra(s.document),revision:s.revision,history:JSON.stringify(s.commandHistory)});
const add=(s,id,source,target,extra={})=>s.createBinding({id,artboard:art,source,target,...extra});
const sceneValue=(scene,id='box',path='opacity')=>path.split('.').reduce((v,key)=>v?.[key],scene?.nodes.find(n=>n.id===id));
function base(){
 const s=new VeyraStore(createDocument({id:'independent_c4',artboards:[board('source')],nodes:[
  createNode('rectangle',{id:'box',opacity:1}),createNode('rectangle',{id:'other',opacity:1}),createNode('rectangle',{id:'event',visible:false})]}));
 s.createViewModel({id:'child_model',properties:[{id:'value',type:'number',defaultValue:.2,min:0,max:1}]});
 s.createViewModel({id:'root_model',properties:[
  {id:'number',type:'number',defaultValue:.25,min:0,max:1},
  {id:'wide',type:'number',defaultValue:.2},
  {id:'trigger',type:'trigger'},
  {id:'nested',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null},
  {id:'selector',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null} ]});
 for(const [id,value] of [['child',.2],['child2',.9],['child3',.7]])s.createViewModelInstance({id,viewModel:ref('viewModel','child_model'),artboard:art,initialValues:[{property:ref('dataProperty','value'),value}]});
 s.createViewModelInstance({id:'root',viewModel:ref('viewModel','root_model'),artboard:art,initialValues:[
  {property:ref('dataProperty','nested'),value:ref('viewModelInstance','child')},
  {property:ref('dataProperty','selector'),value:ref('viewModelInstance','child2')}]});
 const r=createVeyraDataRuntime(()=>s.document),cp=createVeyraControlPlane(s);
 const host=createVeyraRuntimeHost({store:s,dataRuntime:r,controlPlane:cp,getContext:()=>({artboardId:'source'})}).api;
 return {s,r,cp,host};
}
function advance(f,scopePath=[]){return f.r.evaluateBindings(f.s.document,{artboardId:'source',scopePath});}
function warm(f,scopePath=[]){advance(f,scopePath);assert.equal(advance(f,scopePath).stats.evaluatedBindings,0,'setup: warm-up must settle');}
function derived({components=false}={}){
 const f=base();add(f.s,'reference_writer',data('root','selector'),data('root','nested'));
 add(f.s,'two_way',data('root','nested','value'),prop('node:box/opacity'),{mode:'twoWay'});
 if(components){
  f.s.addArtboard(board('host'));f.s.addArtboard(board('middle'));f.s.createComponent('source',{id:'leaf'});
  f.s.addComponentInstance('leaf',{id:'inner',artboard:ref('artboard','middle')});f.s.createComponent('middle',{id:'outer'});
  for(const id of ['A','B'])f.s.addComponentInstance('outer',{id,artboard:ref('artboard','host')});
  f.paths=['A','B'].map(id=>[ref('componentInstance',id),ref('componentInstance','inner')]);
  f.c=createComponentRuntimeRegistry(()=>f.s.document);
  f.host=createVeyraRuntimeHost({store:f.s,dataRuntime:f.r,componentRuntime:f.c,controlPlane:f.cp,getContext:()=>({artboardId:'host'})}).api;
 }
 return f;
}
function checkedScene(f){try{return {scene:evaluateDocument(f.s.document,{},null,{dataRuntime:f.r,artboardId:'source'}),thrown:null};}catch(e){return {scene:null,thrown:String(e.message)};}}
const records=[];
function probe(name,setup,observe,expected){
 let fixture;
 try{fixture=setup();}catch(e){records.push({name,status:'SETUP_ERROR',error:e.stack});console.error(JSON.stringify(records.at(-1)));return;}
 let actual;
 try{actual=observe(fixture);}catch(e){records.push({name,status:'EXECUTION_ERROR',error:e.stack});console.error(JSON.stringify(records.at(-1)));return;}
 try{assert.deepEqual(actual,expected);records.push({name,status:'PASS',actual,expected});}
 catch(e){records.push({name,status:'FAIL',actual,expected,error:e.message});}
 if(fixture.evidence) records.at(-1).evidence=fixture.evidence;
 console.log(JSON.stringify(records.at(-1)));
}
probe('control: resolved direct/nested chain refreshes then sleeps',()=>{
 const f=base();add(f.s,'z_writer',data('root','number'),data('child','value'));add(f.s,'a_reader',data('root','nested','value'),prop('node:box/opacity'));return f;
},f=>{const cold=advance(f).overrides['node:box/opacity'];warm(f);f.r.setValue('root','number',.66);const changed=advance(f);return [cold,changed.overrides['node:box/opacity'],advance(f).stats.evaluatedBindings];},[.25,.66,0]);
probe('control: nominal enum mismatch rejects preview/dispatch atomically',()=>{
 const f=base();for(const id of ['enumA','enumB'])f.s.createEnum({id,values:[{id:id+'Value'}]});
 f.s.addDataProperty('root_model',{id:'enum_value',type:'enum',enum:ref('enum','enumA'),defaultValue:ref('enumValue','enumAValue')});
 f.s.createPropertyGroup({id:'enum_group',artboard:art,properties:[{id:'enum_target',type:'enum',enum:ref('enum','enumB'),value:null}]});return f;
},f=>{const before=snapshot(f.s),cmd={action:'createBinding',args:{overrides:{id:'bad',artboard:art,source:data('root','enum_value'),target:pg('enum_target')}}};
 const pre=f.cp.previewCommand(cmd),post=f.cp.dispatchCommand(cmd);return [pre.ok,post.ok,JSON.stringify(snapshot(f.s))===JSON.stringify(before),!!pre.validation.errors[0].evidence];},[false,false,true,true]);
probe('control: scoped animated Component reads match whole scene without advancing live state',()=>{
 const f=base();f.s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'v',type:'number',value:.2}]});add(f.s,'bound',pg('v'),prop('node:box/opacity'));
 f.s.addTimeline({id:'timeline',artboard:art,duration:30,fps:30,loop:'none'});for(const [frame,value]of [[0,.2],[30,.8]])f.s.setKeyframe({timelineId:'timeline',address:'propertyGroupProperty:v/value',frame,value});
 f.s.addArtboard(board('host'));f.s.createComponent('source',{id:'component'});for(const id of ['A','B'])f.s.addComponentInstance('component',{id,artboard:ref('artboard','host'),runtime:{timeline:ref('timeline','timeline')}});
 f.paths=['A','B'].map(id=>[ref('componentInstance',id)]);f.c=createComponentRuntimeRegistry(()=>f.s.document);f.c.setTimelineTime(f.paths[0],'timeline',1);f.c.setTimelineTime(f.paths[1],'timeline',0);
 f.host=createVeyraRuntimeHost({store:f.s,dataRuntime:f.r,componentRuntime:f.c,getContext:()=>({artboardId:'host'})}).api;return f;
},f=>{const before=JSON.stringify([snapshot(f.s),f.r.stats,f.c.listRuntimeScopes(),f.c.fork().evaluate(f.paths[0])]);
 const values=f.paths.map(scopePath=>f.host.read('node:box/opacity',{scopePath}).evaluatedValue),full=f.host.getEvaluatedScene();
 const whole=f.paths.map(path=>full.componentEvaluatedNodes.find(n=>n.sourceRef.id==='box'&&JSON.stringify(n.componentRuntimeScope.path)===JSON.stringify(path)).opacity);
 return {values,whole,unchanged:before===JSON.stringify([snapshot(f.s),f.r.stats,f.c.listRuntimeScopes(),f.c.fork().evaluate(f.paths[0])])};},{values:[.8,.2],whole:[.8,.2],unchanged:true});
probe('control: ownership terminal recommendation edits the derived-reference child correctly',()=>derived(),f=>{
 const owner=f.host.getOwnership('node:box/opacity'),edit=owner.writableSource.edit,args=structuredClone(edit.arguments),before=snapshot(f.s);args[edit.valueIndex]=.47;f.host[edit.port](...args);
 return [f.host.read('node:box/opacity').evaluatedValue,f.r.getValue('child','value'),f.r.getValue('child2','value'),JSON.stringify(snapshot(f.s))===JSON.stringify(before)];},[.47,.2,.47,true]);
probe('two-way binding port must write the currently derived terminal, not the authored-default child',()=>{const f=derived();assert.equal(f.host.read('node:box/opacity').evaluatedValue,.9);warm(f);return f;},f=>{
 const before=snapshot(f.s),result=f.host.setTwoWayBindingTarget('two_way',.47);
 return {result,visible:f.host.read('node:box/opacity').evaluatedValue,oldChild:f.r.getValue('child','value'),effectiveChild:f.r.getValue('child2','value'),authoredUnchanged:JSON.stringify(snapshot(f.s))===JSON.stringify(before)};
},{result:true,visible:.47,oldChild:.2,effectiveChild:.47,authoredUnchanged:true});
probe('two-way binding port must resolve a just-retargeted real nested Component scope without a prior render',()=>{const f=derived({components:true});for(const path of f.paths)warm(f,path);return f;},f=>{
 const [A,B]=f.paths,before=snapshot(f.s);f.host.setDataRuntimeValue('root','selector',ref('viewModelInstance','child3'),{scopePath:A});
 // No intervening read/advance: the mutation must not use the last rendered path.
 f.host.setTwoWayBindingTarget('two_way',.63,{scopePath:A});
 const values=f.paths.map(scopePath=>f.host.read('node:box/opacity',{scopePath}).evaluatedValue);
 return {values,oldChildA:f.r.getValue('child','value',{scopePath:A}),effectiveChildA:f.r.getValue('child3','value',{scopePath:A}),siblingChild:f.r.getValue('child2','value',{scopePath:B}),authoredUnchanged:JSON.stringify(snapshot(f.s))===JSON.stringify(before)};
},{values:[.63,.9],oldChildA:.2,effectiveChildA:.63,siblingChild:.9,authoredUnchanged:true});
probe('control: invalid Property Group value is isolated and valid replacement recovers',()=>{
 const f=base();f.s.createPropertyGroup({id:'g',artboard:art,properties:[{id:'bounded',type:'number',value:0,min:0,max:1}]});add(f.s,'bad',data('root','wide'),pg('bounded'));add(f.s,'independent',data('root','number'),prop('node:other/opacity'));warm(f);return f;
},f=>{f.r.setValue('root','wide',2);const failed=checkedScene(f);f.r.setValue('root','wide',.6);const fixed=checkedScene(f);
 return {failedWithoutThrow:failed.thrown===null,diagnosed:!!failed.scene?.data.diagnostics.errors.length,independent:sceneValue(failed.scene,'other'),recovered:fixed.scene?.propertyGroups[0].properties[0].value,errorsAfter:fixed.scene?.data.diagnostics.errors.length};},
{failedWithoutThrow:true,diagnosed:true,independent:.25,recovered:.6,errorsAfter:0});
probe('invalid visual scalar output must not abort a frame or consume an event without returning its output',()=>{
 const f=base();add(f.s,'bad',data('root','wide'),prop('node:box/opacity'));add(f.s,'independent',data('root','number'),prop('node:other/opacity'));add(f.s,'event',data('root','trigger'),prop('node:event/visible'));warm(f);return f;
},f=>{const before=snapshot(f.s);f.r.setValue('root','wide',2);f.r.fire('root','trigger');const out=checkedScene(f);
 return {returnedScene:out.scene!==null,diagnosed:!!out.scene?.data.diagnostics.errors.length,independent:sceneValue(out.scene,'other')??null,eventOutput:sceneValue(out.scene,'event','visible')??null,pending:f.r.getValue('root','trigger'),authoredUnchanged:JSON.stringify(snapshot(f.s))===JSON.stringify(before),rawError:out.thrown};},
{returnedScene:true,diagnosed:true,independent:.25,eventOutput:true,pending:false,authoredUnchanged:true,rawError:null});
probe('invalid color converter branch must be isolated by the same visual-target value contract',()=>{
 const f=base();f.s.createConverter({id:'color',type:'conditional',inputType:'number',outputType:'color',config:{equals:.66,then:'not-a-color',else:'#112233'}});
 add(f.s,'color',data('root','number'),prop('node:box/paint/stroke'),{converterChain:[ref('converter','color')]});add(f.s,'independent',data('root','wide'),prop('node:other/opacity'));warm(f);assert.equal(checkedScene(f).thrown,null);return f;
},f=>{f.r.setValue('root','number',.66);const out=checkedScene(f);return {returnedScene:!!out.scene,diagnosed:!!out.scene?.data.diagnostics.errors.length,independent:sceneValue(out.scene,'other')??null,rawError:out.thrown};},
{returnedScene:true,diagnosed:true,independent:.2,rawError:null});
probe('preview/dispatch must not save a binding that immediately crashes canonical evaluation',()=>{
 const f=base();f.s.updateDataProperty('root_model','wide',{defaultValue:2});assert.equal(checkedScene(f).thrown,null);return f;
},f=>{
 const before=snapshot(f.s),cmd={action:'createBinding',args:{overrides:{id:'invalid-default',artboard:art,source:data('root','wide'),target:prop('node:box/opacity')}}};
 const preview=f.cp.previewCommand(cmd),dispatch=f.cp.dispatchCommand(cmd),out=checkedScene(f);
 // A safe, documented bounded-diagnostic acceptance is allowed as an alternative
 // to rejection. An accepted graph with a raw evaluation exception is not.
 f.evidence={previewOk:preview.ok,dispatchOk:dispatch.ok,authoredChanged:JSON.stringify(snapshot(f.s))!==JSON.stringify(before)};
 const safe=dispatch.ok ? out.thrown===null : JSON.stringify(snapshot(f.s))===JSON.stringify(before);
 return {safeAfterDispatch:safe,rawError:out.thrown,previewStructured:typeof preview.ok==='boolean'};
},{safeAfterDispatch:true,rawError:null,previewStructured:true});

const summary={baseline:'b57b390b245b363f9024349d9b116996eb045e7a',node:process.version,passed:records.filter(x=>x.status==='PASS').length,failed:records.filter(x=>x.status==='FAIL').length,setupErrors:records.filter(x=>x.status==='SETUP_ERROR').length,executionErrors:records.filter(x=>x.status==='EXECUTION_ERROR').length};
writeFileSync(new URL('./m8-c4-review-results.json',import.meta.url),JSON.stringify({summary,records},null,2)+'\n');
console.log('INDEPENDENT C4 REVIEW',JSON.stringify(summary));
process.exitCode=summary.failed||summary.setupErrors||summary.executionErrors?1:0;
