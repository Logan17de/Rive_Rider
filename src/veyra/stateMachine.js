import { cloneValue, machineById, timelineById } from './model.js';
import { createReference, referenceId } from './references.js';
import { evaluateTimelines } from './animation.js';

export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
]);

export const VEYRA_MACHINE_CAPABILITIES = Object.freeze({
  inputTypes: Object.freeze(['number', 'bool', 'trigger']),
  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend']),
  graph: Object.freeze([
    'set-name', 'set-initial',
    'add-layer', 'update-layer', 'remove-layer', 'reorder-layer',
    'add-input', 'remove-input', 'update-input',
    'add-state', 'update-state', 'remove-state',
    'add-transition', 'update-transition', 'remove-transition',
  ]),
  runtime: Object.freeze(['set-input', 'fire', 'step', 'scrub', 'reset', 'evaluate']),
});

export const VEYRA_MACHINE_INVALIDATION_EVENT = 'runtime-invalidated';
const NO_MACHINE = 'no-machine';

function resolveDocument(documentOrGetter) {
  if (typeof documentOrGetter === 'function') {
    const document = documentOrGetter();
    if (!document || typeof document !== 'object') throw new TypeError('Document getter must return a Veyra document.');
    return document;
  }
  if (!documentOrGetter || typeof documentOrGetter !== 'object') throw new TypeError('Machine runtime requires a Veyra document or document getter.');
  return documentOrGetter;
}

function compatibilityLayer(machine) {
  if (!machine) return null;
  const id = referenceId(machine.compatibilityLayer, 'machineLayer');
  return machine.layers?.find(layer => layer.id === id) || machine.layers?.[0] || null;
}

function orderedLayers(machine) {
  return [...(machine?.layers || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.id.localeCompare(b.id));
}

function machineSignature(machine) {
  if (!machine) return NO_MACHINE;
  return JSON.stringify([
    referenceId(machine.compatibilityLayer, 'machineLayer'),
    (machine.inputs || []).map(input => [input.id, input.type]),
    orderedLayers(machine).map(layer => [
      layer.id,
      layer.initial ? referenceId(layer.initial, 'machineState') : null,
      (layer.states || []).map(state => [state.id, state.type]),
      (layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState')]),
    ]),
  ]);
}

function resolveInput(machine, nameOrId) {
  const key = String(nameOrId || '');
  return (machine?.inputs || []).find(input => input.id === key || input.name === key) || null;
}

function evaluateCondition(condition, inputsById) {
  const inputValue = inputsById.get(referenceId(condition.input, 'machineInput'));
  switch (condition.op) {
    case '<': return inputValue < condition.value;
    case '<=': return inputValue <= condition.value;
    case '>': return inputValue > condition.value;
    case '>=': return inputValue >= condition.value;
    case '==': return inputValue === condition.value;
    case '!=': return inputValue !== condition.value;
    case 'fired': return inputValue === true;
    case '!fired': return inputValue !== true;
    default: throw new TypeError(`Unsupported condition operator: ${condition.op}`);
  }
}

function transitionSatisfied(transition, stateTime, inputsById) {
  if (transition.enabled === false) return false;
  if (transition.after != null && stateTime < transition.after) return false;
  return (transition.conditions || []).every(condition => evaluateCondition(condition, inputsById));
}

function initialState(layer) {
  const states = layer?.states || [];
  if (!states.length) return null;
  const initialId = referenceId(layer.initial, 'machineState');
  return states.find(state => state.id === initialId) || states.find(state => state.type !== 'any' && state.type !== 'exit') || states[0] || null;
}

function stateById(layer, id) {
  return (layer?.states || []).find(state => state.id === id) || null;
}

function stateSpeed(state) {
  const speed = Number(state?.speed ?? 1);
  return Number.isFinite(speed) ? speed : 1;
}

function timelineEndSeconds(document, timelineId) {
  const timeline = timelineById(document, timelineId);
  if (!timeline) return 0;
  return Number(timeline.workEnd ?? timeline.duration) / Number(timeline.fps || 1);
}

function timelineTimeForState(document, state, elapsed) {
  const speed = stateSpeed(state);
  if (!state?.timeline) return elapsed;
  const id = referenceId(state.timeline, 'timeline');
  if (speed >= 0) return elapsed * speed;
  return timelineEndSeconds(document, id) + elapsed * speed;
}

function timelineTimeForBlendChild(document, state, child, elapsed) {
  const timelineId = referenceId(child.timeline, 'timeline');
  const speed = stateSpeed(state) * Number(child.speed ?? 1);
  if (speed >= 0) return elapsed * speed;
  return timelineEndSeconds(document, timelineId) + elapsed * speed;
}

function runtimeLayerSnapshot(layer, runtime) {
  const state = runtime.stateId ? stateById(layer, runtime.stateId) : null;
  const transition = runtime.transition ? cloneValue(runtime.transition) : null;
  return {
    layer: createReference('machineLayer', layer.id),
    layerName: layer.name,
    enabled: layer.enabled !== false,
    order: layer.order,
    stateId: runtime.stateId,
    stateName: state?.name || null,
    stateType: state?.type || null,
    stateTime: runtime.stateTime,
    transition,
  };
}

function transitionView(runtime) {
  if (!runtime?.transition) return null;
  const { transitionId, fromId, toId, duration, startedAt } = runtime.transition;
  const elapsed = runtime.stateTime - startedAt;
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    progress: duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1,
  };
}

function createLayerRuntime(layer) {
  const state = initialState(layer);
  return { stateId: state?.id || null, stateTime: 0, transition: null };
}

function cloneLayerRuntime(value) {
  return { stateId: value.stateId, stateTime: value.stateTime, transition: cloneValue(value.transition) };
}

export class MachineRuntime {
  #documentOrGetter = null;
  #machineId = null;
  #overrideValues = new Map();
  #layers = new Map();
  #signature = NO_MACHINE;
  #invalidateListeners = new Set();
  #stats = {
    evaluations: 0,
    layerEvaluations: 0,
    stateEvaluations: 0,
    transitionConditionEvaluations: 0,
    timelineEvaluations: 0,
    compositionApplications: 0,
    inactiveLayerSkips: 0,
    zeroMachineFastPaths: 0,
  };

  constructor(documentOrGetter, machineId) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
    if (!machine) throw new TypeError(`State machine ${machineId} was not found in the document.`);
    this.#resetRuntime(machine);
  }

  get #document() { return resolveDocument(this.#documentOrGetter); }
  get machine() { return machineById(this.#document, this.#machineId); }
  get machineId() { return this.#machineId; }
  get stats() { return cloneValue(this.#stats); }

  fork() {
    const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId);
    snapshot.#overrideValues = new Map([...this.#overrideValues].map(([key, value]) => [key, cloneValue(value)]));
    snapshot.#layers = new Map([...this.#layers].map(([id, value]) => [id, cloneLayerRuntime(value)]));
    snapshot.#signature = this.#signature;
    snapshot.#stats = cloneValue(this.#stats);
    return snapshot;
  }

  onInvalidate(listener) {
    this.#invalidateListeners.add(listener);
    return () => this.#invalidateListeners.delete(listener);
  }

  #notifyInvalidated(reason) {
    const event = { type: VEYRA_MACHINE_INVALIDATION_EVENT, machineId: this.#machineId, reason };
    for (const listener of [...this.#invalidateListeners]) listener(event);
  }

  #compatibilityRuntime(machine = this.machine) {
    const layer = compatibilityLayer(machine);
    return layer ? this.#layers.get(layer.id) || null : null;
  }

  get stateId() { this.#reconcile(); return this.#compatibilityRuntime()?.stateId || null; }
  get state() {
    const machine = this.#reconcile();
    const layer = compatibilityLayer(machine);
    return layer ? stateById(layer, this.#layers.get(layer.id)?.stateId) : null;
  }
  get stateTime() { this.#reconcile(); return this.#compatibilityRuntime()?.stateTime || 0; }
  get transition() { this.#reconcile(); return transitionView(this.#compatibilityRuntime()); }

  get inputs() {
    const machine = this.#reconcile();
    return (machine?.inputs || []).map(input => ({ id: input.id, name: input.name, type: input.type, value: this.#overrideValues.get(input.id) ?? input.value }));
  }

  get layers() {
    const machine = this.#reconcile();
    return orderedLayers(machine).map(layer => ({ ...runtimeLayerSnapshot(layer, this.#layers.get(layer.id) || createLayerRuntime(layer)), transition: transitionView(this.#layers.get(layer.id)) }));
  }

  #inputsById() { return new Map(this.inputs.map(input => [input.id, input.value])); }

  #resetRuntime(machine) {
    this.#overrideValues = new Map();
    this.#layers = new Map();
    for (const layer of orderedLayers(machine)) this.#layers.set(layer.id, createLayerRuntime(layer));
    this.#signature = machineSignature(machine);
    const inputs = new Map((machine?.inputs || []).map(input => [input.id, input.value]));
    for (const layer of orderedLayers(machine)) this.#resolveImmediatePseudo(layer, this.#layers.get(layer.id), inputs, []);
  }

  #reconcile() {
    const machine = this.machine;
    const signature = machineSignature(machine);
    if (signature === this.#signature) return machine;
    const previous = this.#signature;
    this.#resetRuntime(machine);
    this.#notifyInvalidated(!machine ? 'machine-removed' : (previous === NO_MACHINE ? 'machine-restored' : 'structural'));
    return machine;
  }

  #transitionCandidates(layer, runtime) {
    const anyIds = new Set((layer.states || []).filter(state => state.type === 'any').map(state => state.id));
    return (layer.transitions || []).filter(transition => {
      const fromId = referenceId(transition.from, 'machineState');
      return fromId === runtime.stateId || anyIds.has(fromId);
    });
  }

  #resolveImmediatePseudo(layer, runtime, inputsById, events) {
    const seen = new Set();
    for (let hops = 0; hops <= (layer.states?.length || 0) + 1; hops += 1) {
      const state = stateById(layer, runtime.stateId);
      if (!state || !['entry', 'any'].includes(state.type)) return;
      if (seen.has(state.id)) { runtime.stateId = null; runtime.transition = null; return; }
      seen.add(state.id);
      const transition = (layer.transitions || []).find(candidate => referenceId(candidate.from, 'machineState') === state.id && transitionSatisfied(candidate, runtime.stateTime, inputsById));
      if (!transition) return;
      const toId = referenceId(transition.to, 'machineState');
      const target = stateById(layer, toId);
      events.push({ type: 'transition-start', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
      if (target?.type === 'exit') {
        runtime.stateId = null; runtime.stateTime = 0; runtime.transition = null;
        events.push({ type: 'transition-end', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
        return;
      }
      runtime.stateId = toId; runtime.stateTime = 0; runtime.transition = null;
      events.push({ type: 'transition-end', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
    }
  }

  #completeTransition(layer, runtime, events) {
    const { transitionId, fromId, toId, startedAt } = runtime.transition;
    runtime.stateTime = runtime.stateTime - startedAt;
    const target = stateById(layer, toId);
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId, fromId, toId, layerId: layer.id });
  }

  #stepLayer(layer, runtime, delta, inputsById, events) {
    if (layer.enabled === false) return;
    if (!runtime.stateId && !runtime.transition) return;
    if (runtime.transition) {
      runtime.stateTime += delta;
      if (runtime.stateTime - runtime.transition.startedAt >= runtime.transition.duration - 1e-9) this.#completeTransition(layer, runtime, events);
      return;
    }
    runtime.stateTime += delta;
    const candidates = this.#transitionCandidates(layer, runtime);
    for (const transition of candidates) {
      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      if (!transitionSatisfied(transition, runtime.stateTime, inputsById)) continue;
      const fromId = runtime.stateId;
      const toId = referenceId(transition.to, 'machineState');
      const target = stateById(layer, toId);
      if (transition.duration > 0 && target?.type !== 'entry' && target?.type !== 'any') {
        runtime.transition = { transitionId: transition.id, fromId, toId, duration: transition.duration, startedAt: runtime.stateTime };
        events.push({ type: 'transition-start', transitionId: transition.id, fromId, toId, layerId: layer.id });
      } else {
        events.push({ type: 'transition-start', transitionId: transition.id, fromId, toId, layerId: layer.id });
        runtime.stateId = target?.type === 'exit' ? null : toId;
        runtime.stateTime = 0;
        events.push({ type: 'transition-end', transitionId: transition.id, fromId, toId, layerId: layer.id });
        this.#resolveImmediatePseudo(layer, runtime, inputsById, events);
      }
      break;
    }
  }

  step(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta < 0) throw new TypeError('step() requires a finite, non-negative delta in seconds.');
    const events = [];
    const machine = this.#reconcile();
    if (!machine) { this.#stats.zeroMachineFastPaths += 1; return events; }
    const inputsById = this.#inputsById();
    if (delta > 0) {
      for (const layer of orderedLayers(machine)) this.#stepLayer(layer, this.#layers.get(layer.id), delta, inputsById, events);
    }
    this.#clearTriggers();
    return events;
  }

  #clearTriggers() {
    for (const input of this.machine?.inputs || []) if (input.type === 'trigger' && (this.#overrideValues.get(input.id) ?? input.value)) this.#overrideValues.set(input.id, false);
  }

  setInput(nameOrId, value) {
    const machine = this.#reconcile();
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type === 'trigger') throw new TypeError(`Input "${input.name || input.id}" is a trigger; use fire() to activate it.`);
    const normalized = input.type === 'number' ? Number(value) : Boolean(value);
    if (input.type === 'number' && !Number.isFinite(normalized)) throw new TypeError(`Input "${input.name || input.id}" requires a finite number.`);
    this.#overrideValues.set(input.id, normalized);
    return normalized;
  }

  fire(nameOrId) {
    const machine = this.#reconcile();
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type !== 'trigger') throw new TypeError(`Input "${input.name || input.id}" is not a trigger; use setInput() for ${input.type} inputs.`);
    this.#overrideValues.set(input.id, true);
    return true;
  }

  #steadyStateContributions(state, elapsed, inputsById) {
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

  evaluate() {
    const machine = this.#reconcile();
    this.#stats.evaluations += 1;
    const compatibility = compatibilityLayer(machine);
    const compatibilityRuntime = compatibility ? this.#layers.get(compatibility.id) : null;
    const result = {
      machineId: this.#machineId,
      stateId: compatibilityRuntime?.stateId || null,
      stateName: compatibility ? stateById(compatibility, compatibilityRuntime?.stateId)?.name || null : null,
      stateTime: compatibilityRuntime?.stateTime || 0,
      transition: transitionView(compatibilityRuntime),
      inputs: cloneValue(this.inputs),
      layers: [],
      overrides: {},
      ownership: {},
      evaluatedTimelines: [],
      stats: null,
    };
    if (!machine) {
      this.#stats.zeroMachineFastPaths += 1;
      result.stats = { activeLayers: 0, inactiveLayers: 0, ...cloneValue(this.#stats) };
      return result;
    }

    let activeLayers = 0, inactiveLayers = 0;
    const inputsById = this.#inputsById();
    for (const layer of orderedLayers(machine)) {
      const runtime = this.#layers.get(layer.id) || createLayerRuntime(layer);
      if (layer.enabled === false) {
        inactiveLayers += 1; this.#stats.inactiveLayerSkips += 1;
        result.layers.push({ ...runtimeLayerSnapshot(layer, runtime), transition: transitionView(runtime), evaluatedTimelines: [] });
        continue;
      }
      activeLayers += 1; this.#stats.layerEvaluations += 1;
      const contributions = this.#stateTimelineContributions(layer, runtime, inputsById);
      if (runtime.stateId) this.#stats.stateEvaluations += 1;
      this.#stats.timelineEvaluations += contributions.length;
      const layerOverrides = evaluateTimelines(this.#document, contributions);
      const layerEvidence = contributions.map(item => ({ timeline: createReference('timeline', item.timelineId), state: createReference('machineState', item.stateId), time: item.time, weight: item.weight, effectiveWeight: item.effectiveWeight ?? item.weight, blendChild: item.blendChildId ? createReference('machineBlendChild', item.blendChildId) : null }));
      for (const [address, value] of Object.entries(layerOverrides)) {
        const previous = result.ownership[address] || [];
        for (const item of previous) item.effective = false;
        const state = runtime.stateId ? stateById(layer, runtime.stateId) : null;
        previous.push({
          kind: 'machine-layer',
          machine: createReference('stateMachine', machine.id),
          layer: createReference('machineLayer', layer.id),
          state: state ? createReference('machineState', state.id) : null,
          order: layer.order,
          contributions: cloneValue(layerEvidence),
          effective: true,
        });
        result.ownership[address] = previous;
        result.overrides[address] = cloneValue(value);
        this.#stats.compositionApplications += 1;
      }
      result.evaluatedTimelines.push(...contributions.map(({ stateId, ...item }) => item));
      result.layers.push({ ...runtimeLayerSnapshot(layer, runtime), transition: transitionView(runtime), evaluatedTimelines: cloneValue(contributions) });
    }
    result.stats = { activeLayers, inactiveLayers, ...cloneValue(this.#stats) };
    return result;
  }

  reset() {
    const machine = this.#reconcile();
    if (!machine) return;
    // Work counters describe work since the current runtime reset. This keeps
    // deterministic scrub/replay evidence comparable to a fresh runtime while
    // still reporting all actual work performed during the replay itself.
    this.#stats = {
      evaluations: 0,
      layerEvaluations: 0,
      stateEvaluations: 0,
      transitionConditionEvaluations: 0,
      timelineEvaluations: 0,
      compositionApplications: 0,
      inactiveLayerSkips: 0,
      zeroMachineFastPaths: 0,
    };
    this.#resetRuntime(machine);
  }

  scrub(seconds) {
    this.reset();
    this.step(Number(seconds));
    return cloneValue(this.evaluate());
  }
}

export function createMachineRuntime(documentOrGetter, machineId) {
  return new MachineRuntime(documentOrGetter, machineId);
}
