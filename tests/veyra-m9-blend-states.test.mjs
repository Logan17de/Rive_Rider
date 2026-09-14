import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createKeyframe, createStateMachine, normalizeDocument } from '../src/veyra/model.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

const ref=(kind,id)=>({kind,id});
function constantTimeline(id,address,value){
  return createTimeline({id,duration:30,fps:30,loop:'none',tracks:[createTrack(address,{id:`track_${id}`,keyframes:[
    createKeyframe({id:`kf_${id}_0`,frame:0,value,easing:'linear'}),
    createKeyframe({id:`kf_${id}_1`,frame:30,value,easing:'linear'}),
  ]})]});
}
function base(){
  const box=createNode('rectangle',{id:'box',opacity:1});
  const opacity=nodePropertyAddress('box','opacity');
  const timelines=[constantTimeline('low',opacity,.2),constantTimeline('mid',opacity,.5),constantTimeline('high',opacity,.8)];
  return {box,opacity,timelines};
}

{
  const {box,opacity,timelines}=base();
  const machine=createStateMachine({id:'blend_machine',inputs:[{id:'mix',name:'Mix',type:'number',value:.25}],layers:[{
    id:'layer',name:'Layer',initial:'blend',states:[{id:'blend',name:'Blend',type:'blend1d',input:'mix',children:[
      {id:'low_child',timeline:'low',threshold:0},
      {id:'mid_child',timeline:'mid',threshold:.5},
      {id:'high_child',timeline:'high',threshold:1},
    ]}],transitions:[],
  }]});
  const doc=normalizeDocument(createDocument({id:'blend_doc',nodes:[box],timelines,stateMachines:[machine]}));
  const runtime=createMachineRuntime(()=>doc,'blend_machine');
  let out=runtime.evaluate();
  assert.equal(out.overrides[opacity],.35);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.timelineId),['low','mid']);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.effectiveWeight),[.5,.5]);
  runtime.setInput('mix',.75);
  out=runtime.evaluate();
  assert.equal(out.overrides[opacity],.65);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.timelineId),['mid','high']);
  runtime.setInput('mix',-10);
  out=runtime.evaluate();
  assert.equal(out.overrides[opacity],.2);
  assert.equal(out.layers[0].evaluatedTimelines.length,1);
  runtime.setInput('mix',10);
  assert.equal(runtime.evaluate().overrides[opacity],.8);
}

{
  const {box,opacity,timelines}=base();
  const machine=createStateMachine({id:'direct_machine',inputs:[
    {id:'w0',name:'W0',type:'number',value:1},
    {id:'w1',name:'W1',type:'number',value:1},
    {id:'w2',name:'W2',type:'number',value:0},
  ],layers:[{id:'layer',name:'Layer',initial:'direct',states:[{id:'direct',name:'Direct',type:'directBlend',children:[
    {id:'c0',timeline:'low',input:'w0'},
    {id:'c1',timeline:'mid',input:'w1'},
    {id:'c2',timeline:'high',input:'w2'},
  ]}],transitions:[]}]});
  const doc=normalizeDocument(createDocument({id:'direct_doc',nodes:[box],timelines,stateMachines:[machine]}));
  const runtime=createMachineRuntime(()=>doc,'direct_machine');
  let out=runtime.evaluate();
  assert.equal(out.overrides[opacity],.35);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.timelineId),['low','mid']);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.effectiveWeight),[.5,.5]);
  assert.equal(out.stats.timelineEvaluations,2,'zero-weight direct child must sleep');
  runtime.setInput('w0',0);runtime.setInput('w1',1);runtime.setInput('w2',1);
  out=runtime.evaluate();
  assert.equal(out.overrides[opacity],.65);
  assert.deepEqual(out.layers[0].evaluatedTimelines.map(item=>item.timelineId),['mid','high']);
  runtime.setInput('w1',0);runtime.setInput('w2',0);
  out=runtime.evaluate();
  assert.equal(out.overrides[opacity],undefined,'all-zero direct blend publishes no property override');
  assert.equal(out.layers[0].evaluatedTimelines.length,0);
}

{
  const {box,timelines}=base();
  assert.throws(()=>normalizeDocument(createDocument({nodes:[box],timelines,stateMachines:[createStateMachine({id:'bad_threshold',inputs:[{id:'mix',type:'number',value:0}],layers:[{
    id:'layer',initial:'blend',states:[{id:'blend',type:'blend1d',input:'mix',children:[
      {id:'a',timeline:'low',threshold:0},{id:'b',timeline:'mid',threshold:0},
    ]}],transitions:[],
  }]})]})),/strictly increasing|threshold/i);
  assert.throws(()=>normalizeDocument(createDocument({nodes:[box],timelines,stateMachines:[createStateMachine({id:'bad_input',inputs:[{id:'flag',type:'bool',value:false}],layers:[{
    id:'layer',initial:'blend',states:[{id:'blend',type:'blend1d',input:'flag',children:[
      {id:'a',timeline:'low',threshold:0},{id:'b',timeline:'mid',threshold:1},
    ]}],transitions:[],
  }]})]})),/number input/i);
}

console.log('Veyra M9 1D/Direct blend state tests passed');
