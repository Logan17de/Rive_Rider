import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createKeyframe, createStateMachine } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

const ref=(kind,id)=>({kind,id});
const art=ref('artboard','source');
const data=(instance,...ids)=>({kind:'data',instance:ref('viewModelInstance',instance),path:ids.map(id=>ref('dataProperty',id))});
const source=endpoint=>({kind:'data',endpoint});
function board(id){return{id,name:id,x:0,y:0,width:640,height:480,background:'#fff7fc'};}
function timeline(id,address,value){return createTimeline({id,duration:30,fps:30,loop:'none',tracks:[createTrack(address,{id:`track_${id}`,keyframes:[createKeyframe({id:`${id}_0`,frame:0,value,easing:'linear'}),createKeyframe({id:`${id}_1`,frame:30,value,easing:'linear'})]})]});}

function fixture(){
  const box=createNode('rectangle',{id:'box',opacity:1});
  const address=nodePropertyAddress('box','opacity');
  const store=new VeyraStore(createDocument({id:'m9_data',artboards:[board('source')],nodes:[box],timelines:[timeline('idle',address,.2),timeline('go',address,.8)]}));
  store.createViewModel({id:'child_model',properties:[{id:'child_value',type:'number',defaultValue:.1}]});
  store.createViewModel({id:'root_model',properties:[
    {id:'limit',type:'number',defaultValue:.5},
    {id:'nested',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null},
    {id:'selector',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null},
    {id:'flag',type:'boolean',defaultValue:false},
  ]});
  for(const [id,value] of [['child1',.2],['child2',.8]])store.createViewModelInstance({id,viewModel:ref('viewModel','child_model'),artboard:art,initialValues:[{property:ref('dataProperty','child_value'),value}]});
  store.createViewModelInstance({id:'root',viewModel:ref('viewModel','root_model'),artboard:art,initialValues:[
    {property:ref('dataProperty','nested'),value:ref('viewModelInstance','child1')},
    {property:ref('dataProperty','selector'),value:ref('viewModelInstance','child2')},
  ]});
  store.createBinding({id:'reference_writer',artboard:art,source:data('root','selector'),target:data('root','nested')});
  store.addStateMachine(createStateMachine({id:'machine',name:'Data machine',layers:[{id:'layer',name:'Layer',initial:'idle_state',states:[
    {id:'idle_state',name:'Idle',type:'animation',timeline:'idle'},
    {id:'go_state',name:'Go',type:'animation',timeline:'go'},
  ],transitions:[{id:'go_when_data',from:'idle_state',to:'go_state',duration:0,conditions:[{
    id:'data_condition',source:source(data('root','nested','child_value')),op:'>=',compareSource:source(data('root','limit')),
  }]}]}]}));
  const dataRuntime=createVeyraDataRuntime(()=>store.document);
  return{store,dataRuntime,address};
}

{
  const {store,dataRuntime}=fixture();
  const before=dataRuntime.stats;
  const runtime=createMachineRuntime(()=>store.document,'machine',{dataRuntime,artboardId:'source'});
  runtime.step(.01);
  assert.equal(runtime.stateId,'go_state','condition must see binding-derived effective nested child2=.8 rather than authored child1=.2');
  assert.deepEqual(dataRuntime.stats,before,'machine property observation must evaluate on a fork without changing live M8 work counters');
  assert.equal(runtime.evaluate().diagnostics.length,0);
}

{
  const {store,dataRuntime}=fixture();
  const A=[ref('componentInstance','A')],B=[ref('componentInstance','B')];
  dataRuntime.setValue('root','selector',ref('viewModelInstance','child1'),{scopePath:A});
  dataRuntime.setValue('root','selector',ref('viewModelInstance','child2'),{scopePath:B});
  const a=createMachineRuntime(()=>store.document,'machine',{dataRuntime,artboardId:'source',runtimeScopePath:A});
  const b=createMachineRuntime(()=>store.document,'machine',{dataRuntime,artboardId:'source',runtimeScopePath:B});
  a.step(.01);b.step(.01);
  assert.equal(a.stateId,'idle_state','A must read its own scoped effective reference (.2 < .5)');
  assert.equal(b.stateId,'go_state','B must independently read its scoped effective reference (.8 >= .5)');
}

{
  const {store}=fixture();
  const runtime=createMachineRuntime(()=>store.document,'machine',{artboardId:'source'});
  runtime.step(.01);
  assert.equal(runtime.stateId,'idle_state','missing M8 runtime must fail closed rather than use authored/default data silently');
  const error=runtime.evaluate().diagnostics.find(item=>item.code==='machine-data-runtime-unavailable');
  assert.ok(error,'missing runtime must produce bounded machine-readable diagnostic evidence');
}

{
  const {store}=fixture();
  assert.throws(()=>store.addStateMachine(createStateMachine({id:'bad_machine',layers:[{id:'layer2',initial:'a',states:[
    {id:'a',type:'animation',timeline:'idle'},{id:'b',type:'animation',timeline:'go'},
  ],transitions:[{id:'bad',from:'a',to:'b',conditions:[{id:'bad_condition',source:source(data('root','flag')),op:'>',value:false}]}]}]})),/number|ordering|requires/i);
}

console.log('Veyra M9 M8/View Model transition-source tests passed');
