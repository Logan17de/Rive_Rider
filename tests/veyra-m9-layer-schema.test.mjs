import assert from 'node:assert/strict';
import { createDocument, createNode, createTimeline, createStateMachine, createMachineLayer, normalizeDocument } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import { MachineRuntime } from '../src/veyra/stateMachine.js';
import { serializeVeyra, parseVeyra } from '../src/veyra/io.js';

const ref=(kind,id)=>({kind,id});
const board={id:'art',name:'Art',x:0,y:0,width:640,height:480,background:'#ffffff'};
const node=createNode('rectangle',{id:'box'});node.artboard=ref('artboard','art');
const timeline=createTimeline({id:'tl',name:'TL',duration:30,fps:30});timeline.artboard=ref('artboard','art');
const state={id:'idle',name:'Idle',type:'animation',timeline:ref('timeline','tl')};
function legacy(){
 const machine={id:'machine',name:'Machine',artboard:ref('artboard','art'),initial:ref('machineState','idle'),inputs:[],states:[state],transitions:[]};
 return createDocument({id:'m9',artboards:[board],nodes:[node],timelines:[timeline],stateMachines:[machine]});
}

{
 const doc=normalizeDocument(legacy());
 const machine=doc.stateMachines[0];
 assert.equal(machine.layers.length,1);
 assert.equal(machine.layers[0].id,'machineLayer_machine_default');
 assert.equal(machine.layers[0].name,'Base Layer');
 assert.equal(machine.layers[0].enabled,true);
 assert.equal(machine.layers[0].order,0);
 assert.equal(machine.layers[0].states[0].id,'idle');
 assert.equal(machine.states[0],machine.layers[0].states[0], 'legacy compatibility aliases share the primary layer objects in-memory');
 const runtime=new MachineRuntime(doc,'machine');
 assert.equal(runtime.stateId,'idle');
 assert.equal(runtime.evaluate().evaluatedTimelines.length,1);
}

{
 const once=normalizeDocument(legacy());
 const serialized=serializeVeyra(once);
 const twice=parseVeyra(serialized);
 assert.equal(serializeVeyra(twice),serialized,'migration must be deterministic after save/load');
 assert.equal(twice.stateMachines[0].layers[0].id,'machineLayer_machine_default');
}

{
 const machine=createStateMachine({id:'layered',name:'Layered',layers:[
   createMachineLayer({id:'base',name:'Base',order:0,states:[state],initial:ref('machineState','idle')}),
   createMachineLayer({id:'fx',name:'FX',order:1,enabled:false,states:[],transitions:[]}),
 ]});
 assert.equal(machine.layers.length,2);
 assert.equal(machine.states[0].id,'idle');
 assert.equal(machine.initial.id,'idle');
}

{
 const store=new VeyraStore(normalizeDocument(legacy()));
 const base=store.document.stateMachines[0].layers[0];
 const baseId=base.id;
 const stateId=base.states[0].id;
 const layerId=store.addMachineLayer('machine',{id:'overlay',name:'Overlay'});
 assert.equal(layerId,'overlay');
 assert.deepEqual(store.document.stateMachines[0].layers.map(l=>l.id),[baseId,'overlay']);
 store.updateMachineLayer('machine','overlay',{name:'Renamed',enabled:false});
 assert.equal(store.document.stateMachines[0].layers[1].name,'Renamed');
 assert.equal(store.document.stateMachines[0].layers[1].enabled,false);
 store.reorderMachineLayer('machine','overlay',0);
 assert.deepEqual(store.document.stateMachines[0].layers.map(l=>l.id),['overlay',baseId]);
 assert.equal(store.document.stateMachines[0].layers[0].order,0);
 assert.equal(store.document.stateMachines[0].layers[1].order,1);
 assert.equal(store.document.stateMachines[0].layers[1].states[0].id,stateId,'reorder preserves state identity');
 assert.equal(store.document.stateMachines[0].compatibilityLayer.id,baseId,'reorder does not repoint legacy compatibility layer');
 assert.equal(new MachineRuntime(()=>store.document,'machine').stateId,stateId,'legacy runtime remains on compatibility layer after reorder');
 store.removeMachineLayer('machine','overlay');
 assert.equal(store.document.stateMachines[0].layers.length,1);
 assert.equal(store.document.stateMachines[0].layers[0].id,baseId);
 assert.equal(store.document.stateMachines[0].layers[0].states[0].id,stateId);
 store.undo();
 assert.equal(store.document.stateMachines[0].layers[0].id,'overlay','undo restores same layer id');
 store.redo();
 assert.equal(store.document.stateMachines[0].layers[0].id,baseId);
}

{
 const store=new VeyraStore(normalizeDocument(legacy()));
 const only=store.document.stateMachines[0].layers[0].id;
 assert.throws(()=>store.removeMachineLayer('machine',only),/last machine layer/i);
 store.addMachineLayer('machine',{id:'filled',states:[{id:'filled_state',name:'Filled',type:'animation',timeline:ref('timeline','tl')}],initial:ref('machineState','filled_state')});
 assert.throws(()=>store.removeMachineLayer('machine','filled'),/non-empty machine layer/i);
 assert.throws(()=>store.removeMachineLayer('machine',only),/compatibility machine layer|last machine layer/i);
}

{
 const store=new VeyraStore(normalizeDocument(legacy()));
 store.addMachineLayer('machine',{id:'overlay',name:'Overlay',enabled:false});
 const summary=createSceneSummary(store.document);
 const machine=summary.stateMachines.find(x=>x.ref.id==='machine');
 assert.deepEqual(machine.layers.map(x=>x.ref.kind),['machineLayer','machineLayer']);
 assert.equal(machine.layers[1].enabled,false);
 assert.ok(machine.capabilities.graph.includes('add-layer'));
}

{
 const doc=normalizeDocument(legacy());
 const machine=doc.stateMachines[0];
 const before={layer:machine.layers[0].id,state:machine.layers[0].states[0].id};
 machine.layers[0].name='Anything';
 machine.layers[0].graph={x:999,y:-42};
 const after=normalizeDocument(doc).stateMachines[0];
 assert.equal(after.layers[0].id,before.layer);
 assert.equal(after.layers[0].states[0].id,before.state);
}

console.log('Veyra M9 layered schema + legacy migration tests: PASS');
