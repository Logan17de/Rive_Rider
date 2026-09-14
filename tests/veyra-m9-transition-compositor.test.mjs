import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createKeyframe, createStateMachine, normalizeDocument } from '../src/veyra/model.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

function constantTimeline(id,address,value){
  return createTimeline({id,duration:30,fps:30,loop:'none',tracks:[createTrack(address,{id:`track_${id}`,keyframes:[
    createKeyframe({id:`kf_${id}_0`,frame:0,value,easing:'linear'}),
    createKeyframe({id:`kf_${id}_1`,frame:30,value,easing:'linear'}),
  ]})]});
}

function fixture({easing='linear'}={}){
  const box=createNode('rectangle',{id:'box',opacity:1});
  const opacity=nodePropertyAddress('box','opacity');
  const timelines=[
    constantTimeline('low',opacity,.2),
    constantTimeline('mid',opacity,.5),
    constantTimeline('high',opacity,.8),
    constantTimeline('single',opacity,.1),
  ];
  const machine=createStateMachine({id:'machine',inputs:[
    {id:'go',name:'Go',type:'bool',value:false},
    {id:'mix',name:'Mix',type:'number',value:.5},
    {id:'w0',name:'Weight A',type:'number',value:1},
    {id:'w1',name:'Weight B',type:'number',value:1},
  ],layers:[{id:'layer',initial:'single_state',states:[
    {id:'single_state',type:'animation',timeline:'single'},
    {id:'blend_state',type:'blend1d',input:'mix',children:[
      {id:'low_child',timeline:'low',threshold:0},
      {id:'high_child',timeline:'high',threshold:1},
    ]},
    {id:'direct_state',type:'directBlend',children:[
      {id:'direct_mid',timeline:'mid',input:'w0'},
      {id:'direct_high',timeline:'high',input:'w1'},
    ]},
  ],transitions:[
    {id:'to_blend',from:'single_state',to:'blend_state',duration:1,easing,conditions:[{id:'go_blend',input:'go',op:'==',value:true}]},
    {id:'to_direct',from:'blend_state',to:'direct_state',duration:1,easing:'linear',conditions:[{id:'go_direct',input:'go',op:'==',value:false}]},
  ]}]});
  const doc=normalizeDocument(createDocument({id:'transition_doc',nodes:[box],timelines,stateMachines:[machine]}));
  return {doc,opacity,runtime:createMachineRuntime(()=>doc,'machine')};
}

{
  const {runtime,opacity}=fixture();
  runtime.setInput('go',true);
  runtime.step(.01);
  assert.equal(runtime.transition?.toId,'blend_state','blend states must be legal transition endpoints');
  runtime.step(.49);
  const out=runtime.evaluate();
  assert.equal(Number(out.transition.progress.toFixed(3)),.49);
  assert.equal(Number(out.overrides[opacity].toFixed(3)),.296,'single -> 1D blend must compose outgoing/incoming contributions at transition progress');
  const effective=out.layers[0].evaluatedTimelines.map(item=>[item.timelineId,Number(item.effectiveWeight.toFixed(3))]);
  assert.deepEqual(effective,[['single',.51],['low',.245],['high',.245]]);
  runtime.step(.51);
  assert.equal(runtime.stateId,'blend_state');
  assert.equal(Number(runtime.evaluate().overrides[opacity].toFixed(3)),.5);
}

{
  const {runtime,opacity}=fixture({easing:'ease-in'});
  runtime.setInput('go',true);
  runtime.step(.01);
  runtime.step(.49);
  const out=runtime.evaluate();
  assert.equal(Number(out.transition.progress.toFixed(3)),.24,'transition progress must expose eased progress');
  assert.equal(Number(out.transition.rawProgress.toFixed(3)),.49,'raw transition progress remains available for debugging');
  assert.equal(Number(out.overrides[opacity].toFixed(3)),.196,'ease-in must affect transition composition, not state clocks');
}

{
  const {runtime,opacity}=fixture();
  runtime.setInput('go',true);
  runtime.step(.01);
  runtime.step(1);
  assert.equal(runtime.stateId,'blend_state');
  runtime.setInput('go',false);
  runtime.step(.01);
  assert.equal(runtime.transition?.toId,'direct_state');
  runtime.step(.49);
  const out=runtime.evaluate();
  assert.equal(Number(out.overrides[opacity].toFixed(4)),.5735,'blend -> directBlend transition composes both multi-child states deterministically');
  const ids=out.layers[0].evaluatedTimelines.map(item=>item.timelineId);
  assert.deepEqual(ids,['low','high','mid','high']);
  assert.equal(Number(out.layers[0].evaluatedTimelines.reduce((sum,item)=>sum+item.effectiveWeight,0).toFixed(6)),1);
}

{
  const {doc}=fixture();
  const transition=doc.stateMachines[0].layers[0].transitions[0];
  assert.equal(transition.enabled,true);
  assert.equal(transition.easing,'linear');
  assert.throws(()=>normalizeDocument({...doc,stateMachines:[{...doc.stateMachines[0],layers:[{...doc.stateMachines[0].layers[0],transitions:[{...transition,easing:'bogus'}]}]}]}),/easing/i);
  assert.throws(()=>normalizeDocument({...doc,stateMachines:[{...doc.stateMachines[0],layers:[{...doc.stateMachines[0].layers[0],transitions:[{...transition,easing:'cubic-bezier',easingParams:[0,1,2]}]}]}]}),/easingParams/i);
}

console.log('Veyra M9 transition compositor tests passed');
