from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

def once(path, old, new):
    text=path.read_text(); count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match, got {count}: {old[:100]}')
    path.write_text(text.replace(old,new,1))

def regex_once(path, pattern, replacement):
    text=path.read_text(); next_text,count=re.subn(pattern,replacement,text,count=1,flags=re.S)
    if count!=1: raise SystemExit(f'{path}: regex expected one match, got {count}: {pattern[:100]}')
    path.write_text(next_text)

model=ROOT/'src/veyra/model.js'
# Stable compatibility-layer pointer keeps M0-M8 flat runtime behavior independent
# of new layer visual/order edits until the true layered runtime replaces the adapter.
once(model,
"""  const primary = layers[0];
  return {
    id,
    name: String(overrides.name || 'State Machine'),
    layerVersion: VEYRA_MACHINE_LAYER_VERSION,
    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),
    layers,
    // Temporary M0-M8 compatibility view over the primary layer. Runtime and
    // later M9 work can move to `layers` without breaking old public callers.
    initial: primary.initial, states: primary.states, transitions: primary.transitions,
  };
""",
"""  const compatibilityLayerId = overrides.compatibilityLayer?.id || overrides.compatibilityLayerId || layers[0].id;
  const compatibility = layers.find((layer) => layer.id === compatibilityLayerId);
  if (!compatibility) throw new TypeError(`State machine compatibility layer ${compatibilityLayerId} does not exist.`);
  return {
    id,
    name: String(overrides.name || 'State Machine'),
    layerVersion: VEYRA_MACHINE_LAYER_VERSION,
    compatibilityLayer: createReference('machineLayer', compatibility.id),
    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),
    layers,
    // Temporary M0-M8 compatibility view over one stable layer. Reordering
    // layers never changes legacy runtime behavior or stable authored identity.
    initial: compatibility.initial, states: compatibility.states, transitions: compatibility.transitions,
  };
""
)

old_norm="""  let rawLayers;
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
"""
new_norm="""  let rawLayers;
  if(Array.isArray(machine?.layers) && machine.layers.length){
    rawLayers=machine.layers.map((layer,i)=>({...cloneValue(layer),order:layer.order ?? i}));
  } else {
    rawLayers=[{id:`machineLayer_${id}_default`,name:'Base Layer',enabled:true,order:0,initial:machine?.initial ?? null,states:Array.isArray(machine?.states)?machine.states:[],transitions:Array.isArray(machine?.transitions)?machine.transitions:[],graph:{x:0,y:0}}];
  }
  const compatibilityInput = machine?.compatibilityLayer ?? machine?.compatibilityLayerId ?? rawLayers[0].id;
  const compatibilityRef = normalizeReference(compatibilityInput, 'machineLayer', `${machinePath}.compatibilityLayer`);
  const compatibilityLayerId = referenceId(compatibilityRef, 'machineLayer');
  const compatibilityIndex = rawLayers.findIndex((layer)=>String(layer.id||'')===compatibilityLayerId);
  if(compatibilityIndex<0) throw new TypeError(`${machinePath}.compatibilityLayer references missing machine layer ${compatibilityLayerId}.`);
  // Existing flat-store commands target compatibility aliases. Fold those edits
  // back into the stable compatibility layer, never whichever layer is first.
  rawLayers[compatibilityIndex]={...rawLayers[compatibilityIndex],
    ...(Array.isArray(machine.states)?{states:machine.states}:{}),
    ...(Array.isArray(machine.transitions)?{transitions:machine.transitions}:{}),
    ...(Object.prototype.hasOwnProperty.call(machine,'initial')?{initial:machine.initial}:{}),
  };
  const layerIds=new Set(), globalStateIds=new Set(), globalTransitionIds=new Set();
  const layers=rawLayers.map((layer,i)=>normalizeMachineLayer(layer,i,machinePath,timelineIds,inputsById,globalStateIds,globalTransitionIds));
  for(const layer of layers){ if(layerIds.has(layer.id)) throw new TypeError(`Duplicate machine layer id ${layer.id} in ${machinePath}.`); layerIds.add(layer.id); }
  layers.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)); layers.forEach((layer,i)=>{layer.order=i;});
  const compatibility=layers.find((layer)=>layer.id===compatibilityLayerId);
  return {id,name:String(machine.name || ''),layerVersion:VEYRA_MACHINE_LAYER_VERSION,compatibilityLayer:createReference('machineLayer',compatibilityLayerId),inputs,layers,initial:compatibility.initial,states:compatibility.states,transitions:compatibility.transitions};
"""
once(model,old_norm,new_norm)

store=ROOT/'src/veyra/store.js'
# Reordering changes layer priority/order only; it must not repoint the temporary
# compatibility view or reset legacy runtime state.
once(store,
"""    this.execute(descriptor,(document)=>{const target=machineById(document,machineId);const current=target.layers.findIndex((candidate)=>candidate.id===layerId);const [item]=target.layers.splice(current,1);target.layers.splice(at,0,item);target.layers.forEach((entry,i)=>{entry.order=i;});const primary=target.layers[0];target.initial=primary.initial;target.states=primary.states;target.transitions=primary.transitions;});
""",
"""    this.execute(descriptor,(document)=>{const target=machineById(document,machineId);const current=target.layers.findIndex((candidate)=>candidate.id===layerId);const [item]=target.layers.splice(current,1);target.layers.splice(at,0,item);target.layers.forEach((entry,i)=>{entry.order=i;});});
""
)
# Non-empty layers and the compatibility layer fail closed in this schema slice.
once(store,
"""    if(machine.layers.length===1) throw new TypeError('Cannot remove the last machine layer.');
    const descriptor=typeof commandDescriptor==='string'?{label:commandDescriptor}:{label:`Delete machine layer ${layer.name||layer.id}`,source:'user',...commandDescriptor};
    this.execute(descriptor,(document)=>{const target=machineById(document,machineId);target.layers=target.layers.filter((candidate)=>candidate.id!==layerId);target.layers.forEach((item,i)=>{item.order=i;});const primary=target.layers[0];target.initial=primary.initial;target.states=primary.states;target.transitions=primary.transitions;});
""",
"""    if(machine.layers.length===1) throw new TypeError('Cannot remove the last machine layer.');
    if(machine.compatibilityLayer?.id===layerId) throw new TypeError(`Cannot remove compatibility machine layer ${layerId} while the legacy runtime adapter is active.`);
    if(layer.states.length || layer.transitions.length) throw new TypeError(`Cannot remove non-empty machine layer ${layerId}; remove or move its states/transitions first.`);
    const descriptor=typeof commandDescriptor==='string'?{label:commandDescriptor}:{label:`Delete machine layer ${layer.name||layer.id}`,source:'user',...commandDescriptor};
    this.execute(descriptor,(document)=>{const target=machineById(document,machineId);target.layers=target.layers.filter((candidate)=>candidate.id!==layerId);target.layers.forEach((item,i)=>{item.order=i;});});
""
)

# Project graph duplication: layer ids and nested machine graph ids are scoped,
# duplicated and remapped exactly once. Deep reference remap handles endpoints
# and compatibilityLayer refs; this block rewrites persistent child identity.
project=ROOT/'src/veyra/projectGraph.js'
regex_once(project,
 r"  for \(const machine of document\.stateMachines\.filter\(\(item\) => item\.artboard\.id === artboardId\)\) \{.*?\n  \}\n  for \(const listener",
"""  for (const machine of document.stateMachines.filter((item) => item.artboard.id === artboardId)) {
    push('stateMachine', machine.id, 'machine');
    for (const input of machine.inputs) push('machineInput', input.id);
    for (const layer of machine.layers || []) {
      push('machineLayer', layer.id);
      for (const state of layer.states) push('machineState', state.id);
      for (const transition of layer.transitions) {
        push('machineTransition', transition.id);
        for (const condition of transition.conditions) push('machineCondition', condition.id);
      }
    }
  }
  for (const listener""")
regex_once(project,
 r"    \} else if \(kind === 'stateMachine'\) \{.*?\n    \} else if \(kind === 'componentInstance'\)",
"""    } else if (kind === 'stateMachine') {
      source.inputs.forEach((item, index) => { copy.inputs[index].id = mapped('machineInput', item.id); });
      (source.layers || []).forEach((layer, layerIndex) => {
        copy.layers[layerIndex].id = mapped('machineLayer', layer.id);
        layer.states.forEach((item, stateIndex) => { copy.layers[layerIndex].states[stateIndex].id = mapped('machineState', item.id); });
        layer.transitions.forEach((item, transitionIndex) => {
          copy.layers[layerIndex].transitions[transitionIndex].id = mapped('machineTransition', item.id);
          item.conditions.forEach((condition, conditionIndex) => { copy.layers[layerIndex].transitions[transitionIndex].conditions[conditionIndex].id = mapped('machineCondition', condition.id); });
        });
      });
      const compatibilityId = copy.compatibilityLayer?.id;
      const compatibility = copy.layers?.find((layer) => layer.id === compatibilityId) || copy.layers?.[0];
      if (compatibility) { copy.initial = compatibility.initial; copy.states = compatibility.states; copy.transitions = compatibility.transitions; }
    } else if (kind === 'componentInstance')""")

# Restore the original manifest test ratchet then only extend its expected graph
# capability list. The worker workflow restores the baseline file before this.
manifest_test=ROOT/'tests/veyra-manifest.test.mjs'
once(manifest_test,
"""assert.deepEqual(machine.capabilities.graph, [
  'set-name', 'set-initial', 'add-input', 'remove-input', 'update-input',
  'add-state', 'update-state', 'remove-state',
  'add-transition', 'update-transition', 'remove-transition',
]);
""",
"""assert.deepEqual(machine.capabilities.graph, [
  'set-name', 'set-initial', 'add-layer', 'update-layer', 'remove-layer', 'reorder-layer',
  'add-input', 'remove-input', 'update-input',
  'add-state', 'update-state', 'remove-state',
  'add-transition', 'update-transition', 'remove-transition',
]);
""
)

# Strengthen M9 migration tests around compatibility behavior and deletion safety.
test=ROOT/'tests/veyra-m9-layer-schema.test.mjs'
once(test,
""" store.reorderMachineLayer('machine','overlay',0);
 assert.deepEqual(store.document.stateMachines[0].layers.map(l=>l.id),['overlay',baseId]);
 assert.equal(store.document.stateMachines[0].layers[0].order,0);
 assert.equal(store.document.stateMachines[0].layers[1].order,1);
 assert.equal(store.document.stateMachines[0].layers[1].states[0].id,stateId,'reorder preserves state identity');
 store.removeMachineLayer('machine','overlay');
""",
""" store.reorderMachineLayer('machine','overlay',0);
 assert.deepEqual(store.document.stateMachines[0].layers.map(l=>l.id),['overlay',baseId]);
 assert.equal(store.document.stateMachines[0].layers[0].order,0);
 assert.equal(store.document.stateMachines[0].layers[1].order,1);
 assert.equal(store.document.stateMachines[0].layers[1].states[0].id,stateId,'reorder preserves state identity');
 assert.equal(store.document.stateMachines[0].compatibilityLayer.id,baseId,'reorder does not repoint legacy compatibility layer');
 assert.equal(new MachineRuntime(()=>store.document,'machine').stateId,stateId,'legacy runtime remains on compatibility layer after reorder');
 store.removeMachineLayer('machine','overlay');
""
)
once(test,
"""{
 const store=new VeyraStore(normalizeDocument(legacy()));
 const only=store.document.stateMachines[0].layers[0].id;
 assert.throws(()=>store.removeMachineLayer('machine',only),/last machine layer/i);
}
""",
"""{
 const store=new VeyraStore(normalizeDocument(legacy()));
 const only=store.document.stateMachines[0].layers[0].id;
 assert.throws(()=>store.removeMachineLayer('machine',only),/last machine layer/i);
 store.addMachineLayer('machine',{id:'filled',states:[{id:'filled_state',name:'Filled',type:'animation',timeline:ref('timeline','tl')}],initial:ref('machineState','filled_state')});
 assert.throws(()=>store.removeMachineLayer('machine','filled'),/non-empty machine layer/i);
 assert.throws(()=>store.removeMachineLayer('machine',only),/compatibility machine layer|last machine layer/i);
}
""
)

print('M9 layered schema follow-up patch applied')
