from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

def once(path, old, new):
    text=path.read_text(); count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match, got {count}: {old[:80]}')
    path.write_text(text.replace(old,new,1))

refs=ROOT/'src/veyra/references.js'
once(refs, "  'stateMachine',\n  'machineState',", "  'stateMachine',\n  'machineLayer',\n  'machineState',")
once(refs, "export function createStateMachineRef(id) { return createReference('stateMachine', id); }\nexport function createMachineStateRef", "export function createStateMachineRef(id) { return createReference('stateMachine', id); }\nexport function createMachineLayerRef(id) { return createReference('machineLayer', id); }\nexport function createMachineStateRef")

model=ROOT/'src/veyra/model.js'
once(model, "export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['animation']);", "export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['animation']);\nexport const VEYRA_MACHINE_LAYER_VERSION = 1;")

create_marker="""export function createMachineState(overrides = {}) {\n"""
layer_code="""export function createMachineLayer(overrides = {}) {\n  const states = (overrides.states || []).map((state) => createMachineState(state));\n  const transitions = (overrides.transitions || []).map((transition) => createMachineTransition(transition));\n  return {\n    id: overrides.id || createId('machineLayer'),\n    name: String(overrides.name || 'Layer'),\n    displayNameAdvisory: true,\n    enabled: overrides.enabled !== false,\n    order: Number.isFinite(Number(overrides.order)) ? Math.trunc(Number(overrides.order)) : 0,\n    initial: overrides.initial == null ? null : normalizeReference(overrides.initial, 'machineState', 'machineLayer.initial'),\n    states,\n    transitions,\n    graph: overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)\n      ? { x: finite(overrides.graph.x ?? 0, 'machineLayer.graph.x'), y: finite(overrides.graph.y ?? 0, 'machineLayer.graph.y') }\n      : { x: 0, y: 0 },\n  };\n}\n\n"""
once(model, create_marker, layer_code+create_marker)

old_create="""export function createStateMachine(overrides = {}) {\n  return {\n    id: overrides.id || createId('machine'),\n    name: String(overrides.name || 'State Machine'),\n    initial: overrides.initial == null\n      ? null\n      : normalizeReference(overrides.initial, 'machineState', 'machine.initial'),\n    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),\n    states: (overrides.states || []).map((state) => createMachineState(state)),\n    transitions: (overrides.transitions || []).map((transition) => createMachineTransition(transition)),\n  };\n}\n"""
new_create="""export function createStateMachine(overrides = {}) {\n  const id = overrides.id || createId('machine');\n  const rawLayers = Array.isArray(overrides.layers) && overrides.layers.length\n    ? overrides.layers\n    : [{\n      id: `machineLayer_${id}_default`, name: 'Base Layer', order: 0, enabled: true,\n      initial: overrides.initial ?? null, states: overrides.states || [], transitions: overrides.transitions || [], graph: { x: 0, y: 0 },\n    }];\n  const layers = rawLayers.map((layer, index) => createMachineLayer({ ...layer, order: layer.order ?? index }));\n  layers.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));\n  layers.forEach((layer,index)=>{ layer.order=index; });\n  const primary = layers[0];\n  return {\n    id,\n    name: String(overrides.name || 'State Machine'),\n    layerVersion: VEYRA_MACHINE_LAYER_VERSION,\n    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),\n    layers,\n    // Compatibility aliases intentionally point at the first layer in-memory.\n    initial: primary.initial, states: primary.states, transitions: primary.transitions,\n  };\n}\n"""
once(model, old_create, new_create)

# Replace state/transition normalizers with layer-aware versions while preserving legacy aliases.
start=model.read_text()
pattern=re.compile(r"function normalizeMachineState\(state, index, machinePath, timelineIds\) \{.*?\nfunction normalizeListener", re.S)
replacement=r'''function normalizeMachineState(state, index, layerPath, timelineIds) {
  const path = `${layerPath}.states[${index}]`;
  const id = String(state?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const type = String(state?.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`${path}.type must be a valid machine state type.`);
  const timeline = requiredReference(state?.timeline ?? state?.timelineId, 'timeline', `${path}.timeline`);
  if (!timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  return { id, name: String(state.name || ''), type, timeline };
}

function normalizeMachineTransition(transition, index, layerPath, stateIds, inputsById) {
  const path = `${layerPath}.transitions[${index}]`;
  const id = String(transition?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const from = requiredReference(transition?.from, 'machineState', `${path}.from`);
  const to = requiredReference(transition?.to, 'machineState', `${path}.to`);
  for (const reference of [from,to]) if (!stateIds.has(referenceId(reference,'machineState'))) throw new TypeError(`${path} references missing machine state ${referenceId(reference,'machineState')}.`);
  if (from.id === to.id) throw new TypeError(`${path} cannot target the same state.`);
  const duration = bounded(transition.duration ?? 0, `${path}.duration`, 0, 10000);
  const after = transition.after == null ? null : bounded(transition.after, `${path}.after`, 0, 100000);
  if (transition.conditions !== undefined && transition.conditions !== null && !Array.isArray(transition.conditions)) throw new TypeError(`${path}.conditions must be an array of conditions.`);
  const conditions=(Array.isArray(transition.conditions)?transition.conditions:[]).map((condition,i)=>normalizeMachineCondition(condition,`${path}.conditions[${i}]`,inputsById));
  return { id, from, to, duration, after, conditions };
}

function normalizeMachineLayer(layer, index, machinePath, timelineIds, inputsById, globalStateIds, globalTransitionIds) {
  const path=`${machinePath}.layers[${index}]`;
  const id=String(layer?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const states=(Array.isArray(layer?.states)?layer.states:[]).map((state,i)=>normalizeMachineState(state,i,path,timelineIds));
  const stateIds=new Set();
  for(const state of states){
    if(stateIds.has(state.id) || globalStateIds.has(state.id)) throw new TypeError(`Duplicate machine state id ${state.id} in ${machinePath}.`);
    stateIds.add(state.id); globalStateIds.add(state.id);
  }
  const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById));
  for(const transition of transitions){
    if(globalTransitionIds.has(transition.id)) throw new TypeError(`Duplicate machine transition id ${transition.id} in ${machinePath}.`);
    globalTransitionIds.add(transition.id);
  }
  const initial=normalizeReference(layer?.initial,'machineState',`${path}.initial`);
  if(initial && !stateIds.has(referenceId(initial,'machineState'))) throw new TypeError(`${path}.initial references missing machine state ${referenceId(initial,'machineState')}.`);
  const graph=layer?.graph && typeof layer.graph==='object' && !Array.isArray(layer.graph)
    ? {x:finite(layer.graph.x ?? 0,`${path}.graph.x`),y:finite(layer.graph.y ?? 0,`${path}.graph.y`)} : {x:0,y:0};
  return {id,name:String(layer?.name || ''),displayNameAdvisory:true,enabled:layer?.enabled!==false,order:Number.isFinite(Number(layer?.order))?Math.trunc(Number(layer.order)):index,initial,states,transitions,graph};
}

function normalizeStateMachine(machine, index, timelineIds) {
  const machinePath=`stateMachines[${index}]`;
  const id=String(machine?.id || '');
  if(!id) throw new TypeError(`${machinePath}.id is required.`);
  const inputs=(Array.isArray(machine?.inputs)?machine.inputs:[]).map((input,i)=>normalizeMachineInput(input,i,machinePath));
  const inputsById=new Map(), inputNames=new Set();
  for(const input of inputs){
    if(inputsById.has(input.id)) throw new TypeError(`Duplicate machine input id ${input.id} in ${machinePath}.`);
    if(input.name && inputNames.has(input.name)) throw new TypeError(`Duplicate machine input name "${input.name}" in ${machinePath}.`);
    inputsById.set(input.id,input); if(input.name) inputNames.add(input.name);
  }
  let rawLayers;
  if(Array.isArray(machine?.layers) && machine.layers.length){
    rawLayers=machine.layers.map((layer,i)=>({...cloneValue(layer),order:layer.order ?? i}));
    // Existing flat-store commands target compatibility aliases. Fold those edits
    // back into the first layer before normalization so M0-M8 callers remain valid.
    rawLayers[0]={...rawLayers[0],
      ...(Array.isArray(machine.states)?{states:machine.states}:{}),
      ...(Array.isArray(machine.transitions)?{transitions:machine.transitions}:{}),
      ...(Object.prototype.hasOwnProperty.call(machine,'initial')?{initial:machine.initial}:{}),
    };
  } else {
    rawLayers=[{id:`machineLayer_${id}_default`,name:'Base Layer',enabled:true,order:0,initial:machine?.initial ?? null,states:Array.isArray(machine?.states)?machine.states:[],transitions:Array.isArray(machine?.transitions)?machine.transitions:[],graph:{x:0,y:0}}];
  }
  const layerIds=new Set(), globalStateIds=new Set(), globalTransitionIds=new Set();
  const layers=rawLayers.map((layer,i)=>normalizeMachineLayer(layer,i,machinePath,timelineIds,inputsById,globalStateIds,globalTransitionIds));
  for(const layer of layers){ if(layerIds.has(layer.id)) throw new TypeError(`Duplicate machine layer id ${layer.id} in ${machinePath}.`); layerIds.add(layer.id); }
  layers.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)); layers.forEach((layer,i)=>{layer.order=i;});
  const primary=layers[0];
  return {id,name:String(machine.name || ''),layerVersion:VEYRA_MACHINE_LAYER_VERSION,inputs,layers,initial:primary.initial,states:primary.states,transitions:primary.transitions};
}

function normalizeListener'''
text,count=pattern.subn(replacement,start,count=1)
if count!=1: raise SystemExit(f'{model}: failed replacing machine normalizers')
model.write_text(text)

# stable IDs include layers and every nested member across layers.
text=model.read_text()
old="""  document.stateMachines.forEach((machine, machineIndex) => {\n    register('stateMachine', machine.id, `stateMachines[${machineIndex}]`);\n    machine.inputs.forEach((input, inputIndex) => register('machineInput', input.id, `stateMachines[${machineIndex}].inputs[${inputIndex}]`));\n    machine.states.forEach((state, stateIndex) => register('machineState', state.id, `stateMachines[${machineIndex}].states[${stateIndex}]`));\n    machine.transitions.forEach((transition, transitionIndex) => {\n      register('machineTransition', transition.id, `stateMachines[${machineIndex}].transitions[${transitionIndex}]`);\n      transition.conditions.forEach((condition, conditionIndex) => register(\n        'machineCondition', condition.id,\n        `stateMachines[${machineIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`,\n      ));\n    });\n"""
new="""  document.stateMachines.forEach((machine, machineIndex) => {\n    register('stateMachine', machine.id, `stateMachines[${machineIndex}]`);\n    machine.inputs.forEach((input, inputIndex) => register('machineInput', input.id, `stateMachines[${machineIndex}].inputs[${inputIndex}]`));\n    machine.layers.forEach((layer, layerIndex) => {\n      register('machineLayer', layer.id, `stateMachines[${machineIndex}].layers[${layerIndex}]`);\n      layer.states.forEach((state, stateIndex) => register('machineState', state.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}]`));\n      layer.transitions.forEach((transition, transitionIndex) => {\n        register('machineTransition', transition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}]`);\n        transition.conditions.forEach((condition, conditionIndex) => register('machineCondition', condition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`));\n      });\n    });\n"""
if old not in text: raise SystemExit('stable identity machine block not found')
model.write_text(text.replace(old,new,1))

# Add finders.
once(model, "export function machineTransitionById(document, machineId, transitionId) {\n  const machine = machineById(document, machineId);\n  return machine?.transitions.find((transition) => transition.id === transitionId) || null;\n}\n", "export function machineLayerById(document, machineId, layerId) {\n  return machineById(document, machineId)?.layers?.find((layer) => layer.id === layerId) || null;\n}\n\nexport function machineTransitionById(document, machineId, transitionId) {\n  const machine = machineById(document, machineId);\n  for (const layer of machine?.layers || []) { const found=layer.transitions.find((transition)=>transition.id===transitionId); if(found) return found; }\n  return null;\n}\n")
once(model, "export function machineConditionById(document, machineId, conditionId) {\n  const machine = machineById(document, machineId);\n  for (const transition of machine?.transitions || []) {\n    const condition = transition.conditions.find((candidate) => candidate.id === conditionId);\n    if (condition) return condition;\n  }\n  return null;\n}\n", "export function machineConditionById(document, machineId, conditionId) {\n  const machine = machineById(document, machineId);\n  for (const layer of machine?.layers || []) for (const transition of layer.transitions) {\n    const condition = transition.conditions.find((candidate) => candidate.id === conditionId);\n    if (condition) return condition;\n  }\n  return null;\n}\n")

# Store layer CRUD; canonical command wiring comes in M9 Task 8.
store=ROOT/'src/veyra/store.js'
insert="""
  addMachineLayer(machineId, overrides = {}, commandDescriptor = {}) {
    const machine = machineById(this.document, machineId); if (!machine) return null;
    const layer = createMachineLayer({ ...overrides, order: machine.layers.length });
    if (machine.layers.some((candidate) => candidate.id === layer.id)) throw new TypeError(`Machine layer ${layer.id} already exists.`);
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Add machine layer ${layer.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => { const target=machineById(document,machineId); target.layers.push(layer); target.layers.forEach((item,index)=>{item.order=index;}); });
    return layer.id;
  }

  updateMachineLayer(machineId, layerId, changes = {}, commandDescriptor = {}) {
    const machine=machineById(this.document,machineId), layer=machine?.layers?.find((candidate)=>candidate.id===layerId); if(!layer) return false;
    const descriptor=typeof commandDescriptor==='string'?{label:commandDescriptor}:{label:`Update machine layer ${layer.name||layer.id}`,source:'user',...commandDescriptor};
    this.execute(descriptor,(document)=>{const target=machineById(document,machineId).layers.find((candidate)=>candidate.id===layerId); if(changes.name!==undefined) target.name=String(changes.name); if(changes.enabled!==undefined) target.enabled=Boolean(changes.enabled); if(changes.graph!==undefined) target.graph=cloneValue(changes.graph);});
    return true;
  }

  reorderMachineLayer(machineId, layerId, index, commandDescriptor = {}) {
    const machine=machineById(this.document,machineId), from=machine?.layers?.findIndex((candidate)=>candidate.id===layerId) ?? -1; if(from<0) return false;
    const at=Math.max(0,Math.min(machine.layers.length-1,Math.trunc(Number(index)))); if(!Number.isFinite(Number(index))) throw new TypeError('Machine layer index must be finite.');
    const descriptor=typeof commandDescriptor==='string'?{label:commandDescriptor}:{label:`Reorder machine layer ${layerId}`,source:'user',...commandDescriptor};
    this.execute(descriptor,(document)=>{const target=machineById(document,machineId),pos=target.layers.findIndex((candidate)=>candidate.id===layerId),[moved]=target.layers.splice(pos,1);target.layers.splice(at,0,moved);target.layers.forEach((item,i)=>{item.order=i;});const primary=target.layers[0];target.initial=primary.initial;target.states=primary.states;target.transitions=primary.transitions;});
    return true;
  }

  removeMachineLayer(machineId, layerId, commandDescriptor = {}) {
    const machine=machineById(this.document,machineId), layer=machine?.layers?.find((candidate)=>candidate.id===layerId); if(!layer) return false;
    if(machine.layers.length===1) throw new TypeError('Cannot remove the last machine layer.');
    const descriptor=typeof commandDescriptor==='string'?{label:commandDescriptor}:{label:`Delete machine layer ${layer.name||layer.id}`,source:'user',...commandDescriptor};
    this.execute(descriptor,(document)=>{const target=machineById(document,machineId);target.layers=target.layers.filter((candidate)=>candidate.id!==layerId);target.layers.forEach((item,i)=>{item.order=i;});const primary=target.layers[0];target.initial=primary.initial;target.states=primary.states;target.transitions=primary.transitions;});
    return true;
  }

"""
once(store, "  get commandHistory() {\n", insert+"  get commandHistory() {\n")
# ensure createMachineLayer import present
text=store.read_text()
text=text.replace('createMachineInput,\n', 'createMachineInput,\n  createMachineLayer,\n',1) if 'createMachineLayer,' not in text else text
store.write_text(text)

# Capabilities advertise layer schema operations.
sm=ROOT/'src/veyra/stateMachine.js'
once(sm, "    'set-initial',\n    'add-input',", "    'set-initial',\n    'add-layer',\n    'update-layer',\n    'remove-layer',\n    'reorder-layer',\n    'add-input',")

# Summary includes layers and typed layer refs.
summary=ROOT/'src/veyra/summary.js'
once(summary, "  createMachineConditionRef,\n", "  createMachineConditionRef,\n  createMachineLayerRef,\n")
marker="""      inputs: machine.inputs.map((input) => ({\n        ref: createMachineInputRef(input.id),\n        name: input.name,\n        type: input.type,\n        value: input.value,\n      })),\n"""
addition=marker+"""      layers: machine.layers.map((layer) => ({\n        ref: createMachineLayerRef(layer.id),\n        name: layer.name, displayNameAdvisory: true, enabled: layer.enabled, order: layer.order, graph: cloneValue(layer.graph),\n        initial: layer.initial ? createMachineStateRef(referenceId(layer.initial, 'machineState')) : null,\n        states: layer.states.map((state) => createMachineStateRef(state.id)),\n        transitions: layer.transitions.map((transition) => createMachineTransitionRef(transition.id)),\n      })),\n"""
once(summary, marker, addition)

# Public exports.
index=ROOT/'src/index.js'
# machine creators are exported elsewhere in model module? src/index doesn't export model. Find state machine exports section impossible, append focused exports.
index.write_text(index.read_text()+"\n// M9 layered state-machine schema primitives.\nexport { VEYRA_MACHINE_LAYER_VERSION, createMachineLayer, machineLayerById } from './veyra/model.js';\nexport { createMachineLayerRef } from './veyra/references.js';\n")

print('M9 layer schema patch applied')
