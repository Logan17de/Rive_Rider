import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createKeyframe, createStateMachine, normalizeDocument } from '../src/veyra/model.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

function timeline(id,address,from,to,duration=30){
  return createTimeline({id,duration,fps:30,loop:'none',tracks:[createTrack(address,{id:`track_${id}`,keyframes:[
    createKeyframe({id:`${id}_0`,frame:0,value:from,easing:'linear'}),
    createKeyframe({id:`${id}_1`,frame:duration,value:to,easing:'linear'}),
  ]})]});
}

function fixture({exitTime=null,pauseSource=false,speed=1}={}){
  const node=createNode('rectangle',{id:'box',opacity:0});
  const opacity=nodePropertyAddress('box','opacity');
  const source=timeline('source',opacity,0,1);
  const target=timeline('target',opacity,0,0);
  const machine=createStateMachine({id:'machine',inputs:[{id:'go',name:'Go',type:'bool',value:true}],layers:[{
    id:'layer',initial:'source_state',states:[
      {id:'source_state',type:'animation',timeline:'source',speed},
      {id:'target_state',type:'animation',timeline:'target'},
    ],transitions:[{
      id:'transition',from:'source_state',to:'target_state',duration:.4,exitTime,pauseSource,
      conditions:[{id:'condition',input:'go',op:'==',value:true}],
    }],
  }]});
  const doc=normalizeDocument(createDocument({id:'doc',nodes:[node],timelines:[source,target],stateMachines:[machine]}));
  return {doc,opacity,runtime:createMachineRuntime(()=>doc,'machine')};
}

{
  const {runtime}=fixture({exitTime:{unit:'percent',value:.5}});
  runtime.step(.49);
  assert.equal(runtime.transition,null,'50% exit time must not fire before half of a one-second state has played');
  runtime.step(.01);
  assert.equal(runtime.transition?.toId,'target_state');
  assert.deepEqual(runtime.transition.exitTime,{unit:'percent',value:.5});
}

{
  const {runtime}=fixture({exitTime:{unit:'seconds',value:.25}});
  runtime.step(.24);
  assert.equal(runtime.transition,null);
  runtime.step(.01);
  assert.equal(runtime.transition?.toId,'target_state');
}

{
  const {runtime}=fixture({exitTime:{unit:'percent',value:.5},speed:2});
  runtime.step(.24);
  assert.equal(runtime.transition,null,'state speed must affect percent exit time');
  runtime.step(.01);
  assert.equal(runtime.transition?.toId,'target_state');
}

{
  const paused=fixture({exitTime:{unit:'seconds',value:.4},pauseSource:true});
  paused.runtime.step(.4);
  assert.equal(paused.runtime.transition?.pauseSource,true);
  paused.runtime.step(.2);
  const pausedValue=paused.runtime.evaluate().overrides[paused.opacity];
  assert.equal(Number(pausedValue.toFixed(3)),.2,'paused source must freeze at the source frame captured when transition begins');

  const playing=fixture({exitTime:{unit:'seconds',value:.4},pauseSource:false});
  playing.runtime.step(.4);
  playing.runtime.step(.2);
  const playingValue=playing.runtime.evaluate().overrides[playing.opacity];
  assert.equal(Number(playingValue.toFixed(3)),.3,'unpaused source continues advancing while its transition fades out');
}

{
  const {doc}=fixture();
  const machine=doc.stateMachines[0];
  const transition=machine.transitions[0];
  const withTransition=(next)=>({...doc,stateMachines:[{...machine,transitions:[next],layers:[{...machine.layers[0],transitions:[next]}]}]});
  assert.throws(()=>normalizeDocument(withTransition({...transition,exitTime:{unit:'percent',value:1.1}})),/exitTime/i);
  assert.throws(()=>normalizeDocument(withTransition({...transition,exitTime:{unit:'seconds',value:-1}})),/exitTime/i);
  assert.throws(()=>normalizeDocument(withTransition({...transition,exitTime:{unit:'frames',value:1}})),/exitTime/i);
}

console.log('Veyra M9 transition exit-time/pause-source tests passed');
