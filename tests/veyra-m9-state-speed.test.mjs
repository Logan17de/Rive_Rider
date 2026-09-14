import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createTrack, createStateMachine, normalizeDocument } from '../src/veyra/model.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import { buildSceneSummary } from '../src/veyra/summary.js';

const ref=(kind,id)=>({kind,id});
const board={id:'art_main',name:'Main',x:0,y:0,width:640,height:480,background:'#ffffff'};
function fixture(speed){
 const timeline=createTimeline({id:'tl',name:'Move',duration:30,fps:10,loop:'none',tracks:[createTrack('node:box/transform/x',{id:'track_x',keyframes:[{id:'k0',frame:0,value:0},{id:'k1',frame:30,value:30}]})]});
 const machine=createStateMachine({id:'machine',name:'Machine',initial:ref('machineState','state'),states:[{id:'state',name:'Move',type:'animation',timeline:ref('timeline','tl'),speed,caption:'Move state',graph:{x:120,y:80}}]});
 return normalizeDocument(createDocument({id:'doc',artboards:[board],nodes:[createNode('rectangle',{id:'box'})],timelines:[timeline],stateMachines:[machine]}));
}

{
 const document=fixture(2);
 const state=document.stateMachines[0].states[0];
 assert.equal(state.speed,2);
 assert.equal(state.caption,'Move state');
 assert.deepEqual(state.graph,{x:120,y:80});
 const runtime=createMachineRuntime(document,'machine');
 assert.equal(runtime.evaluate().overrides['node:box/transform/x'],0);
 runtime.step(1);
 const out=runtime.evaluate();
 assert.equal(out.stateTime,1,'runtime clock remains real seconds');
 assert.equal(out.evaluatedTimelines[0].time,2,'positive state speed scales only timeline-local time');
 assert.equal(out.overrides['node:box/transform/x'],20);
}

{
 const document=fixture(-1);
 const runtime=createMachineRuntime(document,'machine');
 const start=runtime.evaluate();
 assert.equal(start.evaluatedTimelines[0].time,3,'reverse animation enters at timeline end');
 assert.equal(start.overrides['node:box/transform/x'],30);
 runtime.step(1);
 const middle=runtime.evaluate();
 assert.equal(middle.stateTime,1);
 assert.equal(middle.evaluatedTimelines[0].time,2);
 assert.equal(middle.overrides['node:box/transform/x'],20);
 runtime.step(2);
 assert.equal(runtime.evaluate().overrides['node:box/transform/x'],0,'reverse playback reaches timeline start deterministically');
}

{
 const document=fixture(0);
 const runtime=createMachineRuntime(document,'machine');
 runtime.step(2);
 assert.equal(runtime.stateTime,2);
 assert.equal(runtime.evaluate().evaluatedTimelines[0].time,0,'zero speed freezes timeline without freezing transition clock');
}

{
 assert.throws(()=>fixture(Infinity),/speed.*finite/i);
 assert.throws(()=>fixture(101),/speed.*between/i);
 assert.throws(()=>fixture(-101),/speed.*between/i);
}

{
 const document=fixture(-1);
 const summary=buildSceneSummary(document);
 const state=summary.stateMachines[0].states[0];
 assert.equal(state.speed,-1);
 assert.equal(state.caption,'Move state');
 assert.deepEqual(state.graph,{x:120,y:80});
}

console.log('Veyra M9 state speed/reverse/metadata regressions: PASS');
