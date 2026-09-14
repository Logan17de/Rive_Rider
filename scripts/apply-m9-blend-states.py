from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
def replace_once(path,old,new):
    t=path.read_text(); c=t.count(old)
    if c!=1: raise SystemExit(f'{path}: expected one match, found {c}: {old[:70]}')
    path.write_text(t.replace(old,new,1))

model=ROOT/'src/veyra/model.js'
replace_once(model,
"export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['entry', 'exit', 'any', 'animation']);",
"export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend']);")

text=model.read_text()
pat=re.compile(r"export function createMachineState\(overrides = \{\}\) \{.*?\n\}\n\nexport function createMachineTransition",re.S)
rep='''export function createMachineBlendChild(overrides = {}) {
  const timeline = normalizeReference(overrides.timeline ?? overrides.timelineId, 'timeline', 'blendChild.timeline');
  if (!timeline) throw new TypeError('blend children require a timeline reference.');
  const speed = finite(overrides.speed ?? 1, 'blendChild.speed');
  if (speed === 0) throw new TypeError('blendChild.speed cannot be zero.');
  const child = {
    id: overrides.id || createId('machineBlendChild'),
    timeline,
    speed,
  };
  if (overrides.threshold != null) child.threshold = finite(overrides.threshold, 'blendChild.threshold');
  if (overrides.input != null || overrides.inputId != null) child.input = normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'blendChild.input');
  return child;
}

export function createMachineState(overrides = {}) {
  const type = String(overrides.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`Unsupported machine state type: ${type}`);
  const timelineValue = overrides.timeline ?? overrides.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : normalizeReference(timelineValue, 'timeline', 'state.timeline');
  if (type === 'animation' && !timeline) throw new TypeError('animation states require a timeline reference.');
  if (['entry', 'exit', 'any', 'blend1d', 'directBlend'].includes(type) && timeline) throw new TypeError(`${type} states cannot own a direct timeline.`);
  const speed = finite(overrides.speed ?? 1, 'state.speed');
  if (speed === 0) throw new TypeError('state.speed cannot be zero.');
  const graph = overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)
    ? { x: finite(overrides.graph.x ?? 0, 'state.graph.x'), y: finite(overrides.graph.y ?? 0, 'state.graph.y') }
    : { x: 0, y: 0 };
  const result = {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    displayNameAdvisory: true,
    caption: String(overrides.caption ?? ''),
    type,
    ...(timeline ? { timeline } : {}),
    speed,
    graph,
  };
  if (type === 'blend1d') {
    result.input = normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'state.input');
    if (!result.input) throw new TypeError('blend1d states require a numeric machine input reference.');
    result.children = (overrides.children || []).map(createMachineBlendChild);
    if (result.children.length < 2) throw new TypeError('blend1d states require at least two children.');
  } else if (type === 'directBlend') {
    result.children = (overrides.children || []).map(createMachineBlendChild);
    if (!result.children.length) throw new TypeError('directBlend states require at least one child.');
    if (result.children.some(child => !child.input)) throw new TypeError('directBlend children require numeric machine input references.');
  }
  if (result.children) {
    const ids = new Set();
    for (const child of result.children) {
      if (ids.has(child.id)) throw new TypeError(`Duplicate machine blend child id ${child.id}.`);
      ids.add(child.id);
    }
  }
  return result;
}

export function createMachineTransition'''
text,c=pat.subn(rep,text,count=1)
if c!=1: raise SystemExit('createMachineState block not found')
model.write_text(text)

text=model.read_text()
pat=re.compile(r"function normalizeMachineState\(state, index, layerPath, timelineIds\) \{.*?\n\}\n\nfunction normalizeMachineTransition",re.S)
rep='''function resolveMachineNumberInput(value, path, inputsById) {
  const ref = requiredReference(value, 'machineInput', path);
  const key = referenceId(ref, 'machineInput');
  const input = inputsById.get(key) || [...inputsById.values()].find(candidate => candidate.name === key) || null;
  if (!input) throw new TypeError(`${path} references missing machine input ${key}.`);
  if (input.type !== 'number') throw new TypeError(`${path} requires a number input.`);
  return { kind: 'machineInput', id: input.id };
}

function normalizeBlendChild(child, index, path, timelineIds, inputsById, type) {
  const childPath = `${path}.children[${index}]`;
  const id = String(child?.id || '');
  if (!id) throw new TypeError(`${childPath}.id is required.`);
  const timeline = requiredReference(child?.timeline ?? child?.timelineId, 'timeline', `${childPath}.timeline`);
  const timelineId = referenceId(timeline, 'timeline');
  if (!timelineIds.has(timelineId)) throw new TypeError(`${childPath}.timeline references missing timeline ${timelineId}.`);
  const speed = finite(child?.speed ?? 1, `${childPath}.speed`);
  if (speed === 0) throw new TypeError(`${childPath}.speed cannot be zero.`);
  const result = { id, timeline, speed };
  if (type === 'blend1d') result.threshold = finite(child?.threshold, `${childPath}.threshold`);
  if (type === 'directBlend') result.input = resolveMachineNumberInput(child?.input ?? child?.inputId, `${childPath}.input`, inputsById);
  return result;
}

function normalizeMachineState(state, index, layerPath, timelineIds, inputsById) {
  const path = `${layerPath}.states[${index}]`;
  const id = String(state?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const type = String(state?.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`${path}.type must be a valid machine state type.`);
  const timelineValue = state?.timeline ?? state?.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : requiredReference(timelineValue, 'timeline', `${path}.timeline`);
  if (type === 'animation' && !timeline) throw new TypeError(`${path}.timeline is required for animation states.`);
  if (timeline && !timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  if (['entry', 'exit', 'any', 'blend1d', 'directBlend'].includes(type) && timeline) throw new TypeError(`${path}.${type} state cannot own a direct timeline.`);
  const speed = finite(state?.speed ?? 1, `${path}.speed`);
  if (speed === 0) throw new TypeError(`${path}.speed cannot be zero.`);
  const graph = state?.graph && typeof state.graph === 'object' && !Array.isArray(state.graph)
    ? { x: finite(state.graph.x ?? 0, `${path}.graph.x`), y: finite(state.graph.y ?? 0, `${path}.graph.y`) }
    : { x: 0, y: 0 };
  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph };
  if (timeline) result.timeline = timeline;
  if (type === 'blend1d' || type === 'directBlend') {
    if (!Array.isArray(state?.children)) throw new TypeError(`${path}.children must be an array.`);
    result.children = state.children.map((child,i)=>normalizeBlendChild(child,i,path,timelineIds,inputsById,type));
    const childIds = new Set();
    for (const child of result.children) {
      if (childIds.has(child.id)) throw new TypeError(`Duplicate machine blend child id ${child.id} in ${path}.`);
      childIds.add(child.id);
    }
    if (type === 'blend1d') {
      if (result.children.length < 2) throw new TypeError(`${path}.blend1d requires at least two children.`);
      result.input = resolveMachineNumberInput(state?.input ?? state?.inputId, `${path}.input`, inputsById);
      for (let i=1;i<result.children.length;i+=1) if (!(result.children[i].threshold > result.children[i-1].threshold)) {
        throw new TypeError(`${path}.blend1d child thresholds must be strictly increasing in authored order.`);
      }
    } else if (!result.children.length) throw new TypeError(`${path}.directBlend requires at least one child.`);
  }
  return result;
}

function normalizeMachineTransition'''
text,c=pat.subn(rep,text,count=1)
if c!=1: raise SystemExit('normalizeMachineState block not found')
text=text.replace("normalizeMachineState(state,i,path,timelineIds)","normalizeMachineState(state,i,path,timelineIds,inputsById)",1)
# Until the richer transition compositor lands, blends are steady-state/initial only.
needle="  const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById));\n"
insert=needle+"  const blendIds=new Set(states.filter(state=>['blend1d','directBlend'].includes(state.type)).map(state=>state.id));\n  for(const transition of transitions) if(blendIds.has(referenceId(transition.from,'machineState')) || blendIds.has(referenceId(transition.to,'machineState'))) throw new TypeError(`${path} transitions to/from blend states are not yet supported by the canonical transition compositor.`);\n"
if needle not in text: raise SystemExit('layer transition marker missing')
text=text.replace(needle,insert,1)
model.write_text(text)

runtime=ROOT/'src/veyra/stateMachine.js'
replace_once(runtime,
"  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation']),",
"  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend']),")

text=runtime.read_text()
# Add child clock helper after timelineTimeForState.
needle='''function timelineTimeForState(document, state, elapsed) {
  const speed = stateSpeed(state);
  if (!state?.timeline) return elapsed;
  const id = referenceId(state.timeline, 'timeline');
  if (speed >= 0) return elapsed * speed;
  return timelineEndSeconds(document, id) + elapsed * speed;
}
'''
addition=needle+'''\nfunction timelineTimeForBlendChild(document, state, child, elapsed) {
  const timelineId = referenceId(child.timeline, 'timeline');
  const speed = stateSpeed(state) * Number(child.speed ?? 1);
  if (speed >= 0) return elapsed * speed;
  return timelineEndSeconds(document, timelineId) + elapsed * speed;
}
'''
if needle not in text: raise SystemExit('timelineTimeForState marker missing')
text=text.replace(needle,addition,1)
pat=re.compile(r"  #stateTimelineContributions\(layer, runtime\) \{.*?\n  \}\n\n  evaluate\(\) \{",re.S)
rep='''  #steadyStateContributions(state, elapsed, inputsById) {
    if (!state) return [];
    const document = this.#document;
    if (state.type === 'animation' && state.timeline) {
      return [{ timelineId: referenceId(state.timeline, 'timeline'), time: timelineTimeForState(document, state, elapsed), weight: 1, effectiveWeight: 1, stateId: state.id }];
    }
    if (state.type === 'blend1d') {
      const value = Number(inputsById.get(referenceId(state.input, 'machineInput')) ?? 0);
      const children = state.children || [];
      if (!children.length) return [];
      if (value <= children[0].threshold) {
        const child=children[0]; return [{timelineId:referenceId(child.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,child,elapsed),weight:1,effectiveWeight:1,stateId:state.id,blendChildId:child.id}];
      }
      if (value >= children.at(-1).threshold) {
        const child=children.at(-1); return [{timelineId:referenceId(child.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,child,elapsed),weight:1,effectiveWeight:1,stateId:state.id,blendChildId:child.id}];
      }
      for (let i=0;i<children.length-1;i+=1) {
        const low=children[i], high=children[i+1];
        if (value < low.threshold || value > high.threshold) continue;
        const t=(value-low.threshold)/(high.threshold-low.threshold);
        return [
          {timelineId:referenceId(low.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,low,elapsed),weight:1,effectiveWeight:1-t,stateId:state.id,blendChildId:low.id},
          {timelineId:referenceId(high.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,high,elapsed),weight:t,effectiveWeight:t,stateId:state.id,blendChildId:high.id},
        ];
      }
      return [];
    }
    if (state.type === 'directBlend') {
      const active=(state.children||[]).map(child=>({child,raw:Math.max(0,Number(inputsById.get(referenceId(child.input,'machineInput')) ?? 0))})).filter(item=>Number.isFinite(item.raw)&&item.raw>0);
      const total=active.reduce((sum,item)=>sum+item.raw,0);
      if (!(total>0)) return [];
      let cumulative=0;
      return active.map((item,index)=>{
        const {child,raw}=item; cumulative+=raw;
        return {timelineId:referenceId(child.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,child,elapsed),weight:index===0?1:raw/cumulative,effectiveWeight:raw/total,stateId:state.id,blendChildId:child.id};
      });
    }
    return [];
  }

  #stateTimelineContributions(layer, runtime, inputsById) {
    if (runtime.transition) {
      const { fromId, toId, startedAt, duration } = runtime.transition;
      const elapsed = runtime.stateTime - startedAt;
      const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
      const outgoing = stateById(layer, fromId), incoming = stateById(layer, toId);
      const contributions = this.#steadyStateContributions(outgoing, runtime.stateTime, inputsById);
      // Blend states are currently rejected as transition endpoints by model
      // validation, so the legacy incoming animation scaling remains exact.
      for (const item of this.#steadyStateContributions(incoming, elapsed, inputsById)) contributions.push({ ...item, weight: item.weight * progress, effectiveWeight: item.effectiveWeight * progress });
      return contributions;
    }
    return this.#steadyStateContributions(stateById(layer, runtime.stateId), runtime.stateTime, inputsById);
  }

  evaluate() {'''
text,c=pat.subn(rep,text,count=1)
if c!=1: raise SystemExit('state contribution block not found')
# Calculate inputs once and pass to each layer evaluator.
needle="    let activeLayers = 0, inactiveLayers = 0;\n"
if needle not in text: raise SystemExit('evaluate layer marker missing')
text=text.replace(needle,needle+"    const inputsById = this.#inputsById();\n",1)
text=text.replace("const contributions = this.#stateTimelineContributions(layer, runtime);","const contributions = this.#stateTimelineContributions(layer, runtime, inputsById);",1)
# ownership should expose normalized/effective blend weights rather than internal sequential alpha.
text=text.replace("weight: item.weight }));","weight: item.weight, effectiveWeight: item.effectiveWeight ?? item.weight, blendChild: item.blendChildId ? createReference('machineBlendChild', item.blendChildId) : null }));",1)
runtime.write_text(text)

print('M9 1D/direct blend patch applied')
