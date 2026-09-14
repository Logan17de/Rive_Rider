import {
  cloneValue,
  machineById,
  timelineById,
  VEYRA_MACHINE_BUILTIN_RUNTIME_VALUES,
} from './model.js';
import { createReference, referenceId } from './references.js';
import { evaluateTimelines, applyEasing, interpolateValue } from './animation.js';
import { readProperty } from './properties.js';
import { createVeyraDataRuntime, createDataRuntimeScope } from './dataGraph.js';

export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
  'machine-action',
]);

export const VEYRA_MACHINE_CAPABILITIES = Object.freeze({
  inputTypes: Object.freeze(['number', 'bool', 'trigger']),
  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend', 'additiveBlend']),
  conditionSources: Object.freeze(['machineInput', 'data', 'artboard', 'runtime']),
  actionTypes: Object.freeze(['data-set', 'data-fire', 'input-set', 'input-fire', 'emit', 'timeline']),
  actionPhases: Object.freeze(['state-start', 'state-end', 'transition-start', 'transition-end']),
  randomizeExit: Object.freeze({ weighted: true, seeded: true, source: 'runtime-option', globalRandom: false }),
  graph: Object.freeze([
    'set-name', 'set-initial',
    'add-layer', 'update-layer', 'remove-layer', 'reorder-layer',
    'add-input', 'remove-input', 'update-input',
    'add-state', 'update-state', 'remove-state',
    'add-transition', 'update-transition', 'remove-transition',
  ]),
  // Additive machine graph operations live in a separate capability list so
  // legacy readers that deep-compare `graph` retain their original contract.
  graphExtended: Object.freeze([
    'set-name', 'set-initial',
    'add-layer', 'update-layer', 'remove-layer', 'reorder-layer',
    'add-input', 'remove-input', 'update-input',
    'add-state', 'update-state', 'remove-state',
    'add-transition', 'update-transition', 'remove-transition',
    'reconnect-transition', 'move-state',
    'add-blend-child', 'update-blend-child', 'remove-blend-child', 'reorder-blend-child',
    'add-condition', 'update-condition', 'remove-condition', 'reorder-condition',
    'add-action', 'update-action', 'remove-action', 'reorder-action',
  ]),
  runtime: Object.freeze(['set-input', 'fire', 'step', 'scrub', 'reset', 'evaluate']),
});

export const VEYRA_MACHINE_INVALIDATION_EVENT = 'runtime-invalidated';
const NO_MACHINE = 'no-machine';
const UINT32_RANGE = 0x100000000;

function hashSeed(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function normalizeRandomSeed(value, machineId) {
  if (value == null) return hashSeed(`veyra-machine:${machineId}`);
  const number = Number(value);
  if (!Number.isInteger(number)) throw new TypeError('randomSeed must be an unsigned 32-bit integer.');
  if (number < 0 || number > 0xffffffff) throw new RangeError('randomSeed must be an unsigned 32-bit integer.');
  return number >>> 0;
}

function advanceRandomState(state) {
  const next = (Math.imul(state >>> 0, 1664525) + 1013904223) >>> 0;
  return { state: next, sample: next / UINT32_RANGE };
}

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

function normalizeRuntimeValue(name, value) {
  const key = String(name || '');
  if (!VEYRA_MACHINE_BUILTIN_RUNTIME_VALUES.includes(key)) {
    throw new TypeError(`Unknown machine runtime value "${key}".`);
  }
  if (key === 'playing') {
    if (typeof value !== 'boolean') throw new TypeError('Machine runtime value "playing" must be a boolean.');
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Machine runtime value "${key}" must be a finite number.`);
  }
  return { key, value: cloneValue(value) };
}

function layerWeight(layer) {
  const value = Number(layer?.weight ?? 1);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function blendLayerValue(document, current, next, weight, address) {
  if (weight >= 1) return cloneValue(next);
  if (weight <= 0) return current;
  let base = current;
  if (base === undefined) {
    try { base = readProperty(document, address); } catch { base = next; }
  }
  return interpolateValue(base, next, weight);
}

function machineSignature(machine, document = null) {
  if (!machine) return NO_MACHINE;
  const timelineIds = new Set();
  for (const layer of machine.layers || []) for (const state of layer.states || []) {
    const timelineId = referenceId(state.timeline, 'timeline');
    if (timelineId) timelineIds.add(timelineId);
    for (const child of state.children || []) {
      const childTimelineId = referenceId(child.timeline, 'timeline');
      if (childTimelineId) timelineIds.add(childTimelineId);
    }
  }
  const timelineSignature = [...timelineIds].sort().map((id) => {
    const timeline = (document?.timelines || []).find((candidate) => candidate.id === id);
    return [id, timeline ? [timeline.duration, timeline.fps, timeline.loop, timeline.workStart, timeline.workEnd, (timeline.tracks || []).map((track) => [track.id, track.address, (track.keyframes || []).map((keyframe) => [keyframe.id, keyframe.frame, keyframe.value, keyframe.easing, keyframe.easingParams || null])])] : null];
  });
  return JSON.stringify([
    referenceId(machine.compatibilityLayer, 'machineLayer'),
    (machine.inputs || []).map(input => [input.id, input.type]),
    orderedLayers(machine).map(layer => [
      layer.id,
      layer.initial ? referenceId(layer.initial, 'machineState') : null,
      (layer.states || []).map(state => [state.id, state.type, referenceId(state.timeline, 'timeline'), state.speed, state.input || null, state.children || [], Boolean(state.randomizeExit), state.actions || []]),
      (layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.exitTime || null, Boolean(transition.pauseSource), Boolean(transition.allowExitDuringTransition), transition.randomWeight ?? null, transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, condition.input ? referenceId(condition.input, 'machineInput') : null, condition.source || null, condition.op, condition.value, condition.compare || null]), transition.actions || []]),
    ]),
    timelineSignature,
  ]);
}

// Runtime invalidation is intentionally narrower than evaluation-cache
// invalidation. Timeline retargets/keyframe edits should refresh rendered
// values without pretending that the state-machine graph moved or resetting a
// host's graph debugger. This signature captures graph/runtime structure while
// excluding timeline contents and the direct timeline pointer on animation
// states; `machineSignature` above still catches those for cache refresh.
function machineStructureSignature(machine) {
  if (!machine) return NO_MACHINE;
  return JSON.stringify([
    referenceId(machine.compatibilityLayer, 'machineLayer'),
    (machine.inputs || []).map(input => [input.id, input.type]),
    orderedLayers(machine).map(layer => [
      layer.id,
      layer.enabled !== false,
      layer.weight,
      layer.initial ? referenceId(layer.initial, 'machineState') : null,
      (layer.states || []).map(state => [state.id, state.type, state.speed, state.input || null, state.children || [], Boolean(state.randomizeExit), state.actions || []]),
      (layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.exitTime || null, Boolean(transition.pauseSource), Boolean(transition.allowExitDuringTransition), transition.randomWeight ?? null, transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, condition.input ? referenceId(condition.input, 'machineInput') : null, condition.source || null, condition.op, condition.value, condition.compare || null]), transition.actions || []]),
    ]),
  ]);
}

function resolveInput(machine, nameOrId) {
  const key = String(nameOrId || '');
  return (machine?.inputs || []).find(input => input.id === key || input.name === key) || null;
}

function evaluateCondition(condition, inputsById, readData) {
  const inputValue = condition.source
    ? readData(condition.source)
    : inputsById.get(referenceId(condition.input, 'machineInput'));
  const compareValue = condition.compare ? readData(condition.compare) : condition.value;
  switch (condition.op) {
    case '<': return inputValue < compareValue;
    case '<=': return inputValue <= compareValue;
    case '>': return inputValue > compareValue;
    case '>=': return inputValue >= compareValue;
    case '==': return inputValue === compareValue || JSON.stringify(inputValue) === JSON.stringify(compareValue);
    case '!=': return !(inputValue === compareValue || JSON.stringify(inputValue) === JSON.stringify(compareValue));
    case 'fired': return inputValue === true;
    case '!fired': return inputValue !== true;
    default: throw new TypeError(`Unsupported condition operator: ${condition.op}`);
  }
}

function transitionMatch(transition, stateTime, inputsById, readData) {
  if (transition.enabled === false) return { matched: false, triggerSources: [] };
  if (transition.after != null && stateTime < transition.after) return { matched: false, triggerSources: [] };
  const triggerSources = [];
  for (const condition of transition.conditions || []) {
    if (!evaluateCondition(condition, inputsById, readData)) return { matched: false, triggerSources: [] };
    // Legacy machine triggers intentionally keep their established one-step
    // broadcast behavior. Only M8 queued data events participate in exact
    // consume-on-selected-transition semantics.
    if (condition.op === 'fired' && condition.source) triggerSources.push(cloneValue(condition.source));
  }
  return { matched: true, triggerSources };
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

function statePlaybackDurationSeconds(document, state) {
  if (!state) return null;
  const speed = Math.abs(stateSpeed(state));
  if (!(speed > 0)) return null;
  if (state.type === 'animation' && state.timeline) {
    return timelineEndSeconds(document, referenceId(state.timeline, 'timeline')) / speed;
  }
  if (state.type === 'blend1d' || state.type === 'directBlend' || state.type === 'additiveBlend') {
    const durations = (state.children || []).map(child => {
      const childSpeed = Math.abs(speed * Number(child.speed ?? 1));
      return childSpeed > 0 ? timelineEndSeconds(document, referenceId(child.timeline, 'timeline')) / childSpeed : 0;
    });
    return durations.length ? Math.max(...durations) : null;
  }
  return null;
}

function transitionExitTimeSatisfied(document, transition, state, stateTime) {
  if (!transition?.exitTime) return true;
  if (transition.exitTime.unit === 'seconds') return stateTime + 1e-9 >= transition.exitTime.value;
  const duration = statePlaybackDurationSeconds(document, state);
  return duration != null && stateTime + 1e-9 >= duration * transition.exitTime.value;
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
    weight: layerWeight(layer),
    order: layer.order,
    stateId: runtime.stateId,
    stateName: state?.name || null,
    stateType: state?.type || null,
    stateTime: runtime.stateTime,
    settled: Boolean(runtime.settled),
    error: runtime.error || null,
    transition,
  };
}

function transitionProgress(transition, stateTime) {
  if (!transition) return { raw: 0, eased: 0 };
  const elapsed = stateTime - transition.startedAt;
  const raw = transition.duration > 0 ? Math.min(1, Math.max(0, elapsed / transition.duration)) : 1;
  return { raw, eased: applyEasing(raw, transition.easing || 'linear', transition.easingParams) };
}

function transitionView(runtime) {
  if (!runtime?.transition) return null;
  const { transitionId, fromId, toId, duration, easing, easingParams, exitTime, pauseSource, allowExitDuringTransition } = runtime.transition;
  const progress = transitionProgress(runtime.transition, runtime.stateTime);
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    exitTime: cloneValue(exitTime || null),
    pauseSource: Boolean(pauseSource),
    allowExitDuringTransition: Boolean(allowExitDuringTransition),
    sourceKind: Array.isArray(runtime.transition.sourceSnapshot) ? 'snapshot' : 'state',
    interruptedFromTransitionId: runtime.transition.interruptedFromTransitionId || null,
    randomDecision: cloneValue(runtime.transition.randomDecision || null),
    easing: easing || 'linear',
    ...(easingParams ? { easingParams: cloneValue(easingParams) } : {}),
    rawProgress: progress.raw,
    progress: progress.eased,
  };
}

function createLayerRuntime(layer) {
  const state = initialState(layer);
  return { stateId: state?.id || null, stateTime: 0, transition: null, stateStartPending: false, settled: false, cachedContributions: null, cachedOverrides: null, error: null };
}

function cloneLayerRuntime(value) {
  return {
    stateId: value.stateId,
    stateTime: value.stateTime,
    transition: cloneValue(value.transition),
    stateStartPending: Boolean(value.stateStartPending),
    settled: Boolean(value.settled),
    cachedContributions: cloneValue(value.cachedContributions),
    cachedOverrides: cloneValue(value.cachedOverrides),
    error: value.error || null,
  };
}

export class MachineRuntime {
  #documentOrGetter = null;
  #machineId = null;
  #overrideValues = new Map();
  // Keep the authored input type that an override was validated against. If
  // an input is retyped in the document, the old value must not leak across
  // reconciliation (for example, number 42 becoming bool true).
  #overrideTypes = new Map();
  #layers = new Map();
  #dataRuntime = null;
  #runtimeScopePath = [];
  #runtimeValues = new Map();
  #randomSeed = 0;
  #randomState = 0;
  #signature = NO_MACHINE;
  #structureSignature = NO_MACHINE;
  #invalidateListeners = new Set();
  #stats = {
    evaluations: 0,
    layerEvaluations: 0,
    stateEvaluations: 0,
    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    builtinConditionReads: 0,
    triggerPulsesConsumed: 0,
    actionsExecuted: 0,
    actionErrors: 0,
    randomDecisions: 0,
    randomCandidatesEvaluated: 0,
    timelineEvaluations: 0,
    compositionApplications: 0,
    inactiveLayerSkips: 0,
    zeroMachineFastPaths: 0,
    layerErrors: 0,
    sleepHits: 0,
  };

  constructor(documentOrGetter, machineId, options = {}) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(documentOrGetter);
    this.#runtimeScopePath = createDataRuntimeScope(options.runtimeScopePath ?? options.scopePath ?? []).path;
    if (options.runtimeValues && typeof options.runtimeValues === 'object' && !Array.isArray(options.runtimeValues)) {
      for (const [key, value] of Object.entries(options.runtimeValues)) {
        const normalized = normalizeRuntimeValue(key, value);
        this.#runtimeValues.set(normalized.key, normalized.value);
      }
    }
    this.#randomSeed = normalizeRandomSeed(options.randomSeed, this.#machineId);
    this.#randomState = this.#randomSeed;
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
    if (!machine) throw new TypeError(`State machine ${machineId} was not found in the document.`);
    this.#resetRuntime(machine);
  }

  get #document() { return resolveDocument(this.#documentOrGetter); }
  get machine() { return machineById(this.#document, this.#machineId); }
  get machineId() { return this.#machineId; }
  get stats() { return cloneValue(this.#stats); }

  fork() {
    const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId, { dataRuntime: this.#dataRuntime.fork(), runtimeScopePath: this.#runtimeScopePath, randomSeed: this.#randomSeed });
    snapshot.#randomState = this.#randomState;
    snapshot.#overrideValues = new Map([...this.#overrideValues].map(([key, value]) => [key, cloneValue(value)]));
    snapshot.#overrideTypes = new Map(this.#overrideTypes);
    snapshot.#runtimeValues = new Map([...this.#runtimeValues].map(([key, value]) => [key, cloneValue(value)]));
    snapshot.#layers = new Map([...this.#layers].map(([id, value]) => [id, cloneLayerRuntime(value)]));
    snapshot.#signature = this.#signature;
    snapshot.#structureSignature = this.#structureSignature;
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

  #readDataCondition(endpoint) {
    if (endpoint?.kind === 'data') {
      this.#stats.dataConditionReads += 1;
      return this.#dataRuntime.getEndpointValue(endpoint, { scopePath: this.#runtimeScopePath });
    }
    this.#stats.builtinConditionReads += 1;
    return this.#readBuiltinCondition(endpoint);
  }

  #readBuiltinCondition(source) {
    const property = String(source?.property || '');
    // Hosts can publish pointer/scroll/viewport values without mutating the
    // authored document. Explicit runtime values take precedence over the
    // deterministic defaults below.
    if (this.#runtimeValues.has(property)) return cloneValue(this.#runtimeValues.get(property));
    if (source?.kind === 'artboard') {
      const id = source.artboard?.id || this.#document.artboards?.[0]?.id;
      const artboard = (this.#document.artboards || []).find((candidate) => candidate.id === id);
      if (!artboard) return undefined;
      if (property === 'x' || property === 'y' || property === 'width' || property === 'height') return Number(artboard[property] || 0);
      if (property === 'aspect') return Number(artboard.height) ? Number(artboard.width) / Number(artboard.height) : 0;
      if (property === 'area') return Number(artboard.width || 0) * Number(artboard.height || 0);
      return undefined;
    }
    const runtime = this.#compatibilityRuntime();
    const state = runtime?.stateId ? stateById(this.machine && compatibilityLayer(this.machine), runtime.stateId) : null;
    const stateTime = Number(runtime?.stateTime || 0);
    if (property === 'stateTime' || property === 'time') return stateTime;
    if (property === 'speed') return Number(state?.speed ?? 1);
    if (property === 'playing') return Boolean(runtime?.stateId && !runtime?.settled);
    if (property === 'transitionProgress') return transitionView(runtime)?.progress ?? 0;
    const duration = statePlaybackDurationSeconds(this.#document, state);
    if (property === 'stateProgress' || property === 'progress') return duration && duration > 0 ? Math.max(0, Math.min(1, stateTime / duration)) : 0;
    if (property === 'frame') {
      const timeline = state?.timeline ? timelineById(this.#document, referenceId(state.timeline, 'timeline')) : null;
      return stateTime * Number(timeline?.fps || 1);
    }
    // Pointer/scroll/viewport values default to zero until a host publishes a
    // value through setRuntimeValue(). This keeps conditions deterministic and
    // avoids reaching into DOM globals from the runtime.
    if (['pointerX', 'pointerY', 'scrollX', 'scrollY', 'viewportWidth', 'viewportHeight'].includes(property)) return 0;
    return undefined;
  }

  #transitionMatch(transition, stateTime, inputsById) {
    return transitionMatch(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
  }

  #numericSourceValue(source, inputsById) {
    if (source?.kind === 'data' || source?.kind === 'artboard' || source?.kind === 'runtime') return Number(this.#readDataCondition(source));
    const id = referenceId(source, 'machineInput');
    return Number(inputsById.get(id) ?? 0);
  }

  #consumeTransitionTriggers(match) {
    const seen = new Set();
    for (const endpoint of match?.triggerSources || []) {
      const key = JSON.stringify(endpoint);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.#dataRuntime.consumeEndpointTrigger(endpoint, { scopePath: this.#runtimeScopePath })) {
        this.#stats.triggerPulsesConsumed += 1;
      }
    }
  }

  #executeAction(action, phase, layer, inputsById, events, context = {}) {
    this.#stats.actionsExecuted += 1;
    const base = {
      type: 'machine-action',
      status: 'success',
      machineId: this.#machineId,
      layerId: layer.id,
      actionId: action.id,
      actionType: action.type,
      phase,
      authoredMutation: false,
      stateId: context.stateId || null,
      transitionId: context.transitionId || null,
    };
    try {
      let effect = null, request = null;
      if (action.type === 'data-set' || action.type === 'data-fire') {
        const resolved = this.#dataRuntime.resolveDataEndpoint(action.target, { scopePath: this.#runtimeScopePath });
        if (action.type === 'data-set') {
          const changed = this.#dataRuntime.setValue(resolved.instance.id, resolved.property.id, cloneValue(action.value), {
            scopePath: this.#runtimeScopePath,
            source: 'machine-action',
            provenance: { machine: createReference('stateMachine', this.#machineId), action: createReference('machineAction', action.id), phase },
          });
          effect = { kind: 'data-set', target: cloneValue(action.target), effectiveInstance: cloneValue(resolved.instance), effectiveProperty: cloneValue(resolved.property), value: cloneValue(action.value), changed: Boolean(changed), mutation: 'runtime-only' };
        } else {
          const sequence = this.#dataRuntime.fire(resolved.instance.id, resolved.property.id, {
            scopePath: this.#runtimeScopePath,
            source: 'machine-action',
            provenance: { machine: createReference('stateMachine', this.#machineId), action: createReference('machineAction', action.id), phase },
          });
          effect = { kind: 'data-fire', target: cloneValue(action.target), effectiveInstance: cloneValue(resolved.instance), effectiveProperty: cloneValue(resolved.property), sequence, mutation: 'runtime-only' };
        }
      } else if (action.type === 'input-set') {
        const inputId = referenceId(action.input, 'machineInput');
        this.#overrideValues.set(inputId, cloneValue(action.value));
        const input = (this.machine?.inputs || []).find((candidate) => candidate.id === inputId);
        if (input) this.#overrideTypes.set(inputId, input.type);
        inputsById.set(inputId, cloneValue(action.value));
        effect = { kind: 'input-set', input: cloneValue(action.input), value: cloneValue(action.value), mutation: 'runtime-only' };
      } else if (action.type === 'input-fire') {
        const inputId = referenceId(action.input, 'machineInput');
        this.#overrideValues.set(inputId, true);
        const input = (this.machine?.inputs || []).find((candidate) => candidate.id === inputId);
        if (input) this.#overrideTypes.set(inputId, input.type);
        inputsById.set(inputId, true);
        effect = { kind: 'input-fire', input: cloneValue(action.input), value: true, mutation: 'runtime-only' };
      } else if (action.type === 'emit') {
        effect = { kind: 'emit', event: action.event, payload: cloneValue(action.payload ?? null), mutation: 'none' };
      } else if (action.type === 'timeline') {
        request = { kind: 'timeline', timeline: cloneValue(action.timeline), operation: action.operation, ...(action.operation === 'seek' ? { time: action.time } : {}) };
        effect = { kind: 'timeline-request', mutation: 'none' };
      } else {
        throw new TypeError(`Unsupported machine action type ${action.type}.`);
      }
      events.push({ ...base, ...(effect ? { effect } : {}), ...(request ? { request } : {}) });
    } catch (cause) {
      this.#stats.actionErrors += 1;
      events.push({ ...base, status: 'error', error: String(cause?.message || cause) });
    }
  }

  #runActions(owner, phase, layer, inputsById, events, context = {}) {
    for (const action of owner?.actions || []) {
      if (action.phase === phase) this.#executeAction(action, phase, layer, inputsById, events, context);
    }
  }

  #resetRuntime(machine) {
    this.#overrideValues = new Map();
    this.#overrideTypes = new Map();
    this.#layers = new Map();
    this.#randomState = this.#randomSeed;
    for (const layer of orderedLayers(machine)) this.#layers.set(layer.id, createLayerRuntime(layer));
    this.#signature = machineSignature(machine, this.#document);
    this.#structureSignature = machineStructureSignature(machine);
    const inputs = new Map((machine?.inputs || []).map(input => [input.id, input.value]));
    for (const layer of orderedLayers(machine)) {
      const runtime = this.#layers.get(layer.id);
      this.#resolveImmediatePseudo(layer, runtime, inputs, [], { lifecycle: false });
      const state = stateById(layer, runtime.stateId);
      runtime.stateStartPending = Boolean(state && !['entry', 'any', 'exit'].includes(state.type));
    }
  }

  #reconcile() {
    const machine = this.machine;
    const signature = machineSignature(machine, this.#document);
    if (signature === this.#signature) return machine;
    const previous = this.#signature;
    const previousStructure = this.#structureSignature;
    if (!machine) {
      this.#layers = new Map();
      this.#overrideValues = new Map();
      this.#overrideTypes = new Map();
      this.#randomState = this.#randomSeed;
      this.#signature = NO_MACHINE;
      this.#structureSignature = NO_MACHINE;
      this.#notifyInvalidated('machine-removed');
      return machine;
    }

    // Reconcile by stable layer/state/transition identity. Cosmetic edits and
    // unrelated layer changes must not rewind an active clock; only a deleted
    // or structurally invalid runtime record is reinitialized in isolation.
    const previousLayers = this.#layers;
    const nextOverrides = new Map();
    const nextOverrideTypes = new Map();
    const inputs = new Map((machine.inputs || []).map((input) => {
      const overrideType = this.#overrideTypes.get(input.id);
      const override = this.#overrideValues.get(input.id);
      // Unknown legacy overrides are treated as stale. Overrides created by
      // this runtime always carry a validation type and survive cosmetic or
      // authored-value edits only while that type remains compatible.
      if (override !== undefined && overrideType === input.type) {
        nextOverrides.set(input.id, override);
        nextOverrideTypes.set(input.id, overrideType);
      }
      return [input.id, override !== undefined && overrideType === input.type ? override : input.value];
    }));
    const nextLayers = new Map();
    for (const layer of orderedLayers(machine)) {
      const prior = previousLayers.get(layer.id);
      const currentState = prior ? stateById(layer, prior.stateId) : null;
      let runtime = prior && currentState ? cloneLayerRuntime(prior) : createLayerRuntime(layer);
      runtime.error = null;
      runtime.settled = false;
      runtime.cachedContributions = null;
      runtime.cachedOverrides = null;
      if (runtime.transition) {
        const active = (layer.transitions || []).find((candidate) => candidate.id === runtime.transition.transitionId);
        const fromExists = stateById(layer, runtime.transition.fromId);
        const toExists = stateById(layer, runtime.transition.toId);
        if (!active || !fromExists || !toExists) runtime.transition = null;
      }
      if (!runtime.stateId || !stateById(layer, runtime.stateId)) {
        runtime = createLayerRuntime(layer);
        this.#resolveImmediatePseudo(layer, runtime, inputs, [], { lifecycle: false });
        const state = stateById(layer, runtime.stateId);
        runtime.stateStartPending = Boolean(state && !['entry', 'any', 'exit'].includes(state.type));
      }
      nextLayers.set(layer.id, runtime);
    }
    this.#layers = nextLayers;
    this.#overrideValues = nextOverrides;
    this.#overrideTypes = nextOverrideTypes;
    this.#signature = signature;
    const nextStructure = machineStructureSignature(machine);
    this.#structureSignature = nextStructure;
    if (previous === NO_MACHINE || previousStructure !== nextStructure) {
      this.#notifyInvalidated(previous === NO_MACHINE ? 'machine-restored' : 'structural');
    }
    return machine;
  }

  #transitionCandidates(layer, stateId) {
    const anyIds = new Set((layer.states || []).filter(state => state.type === 'any').map(state => state.id));
    return (layer.transitions || []).filter(transition => {
      const fromId = referenceId(transition.from, 'machineState');
      return fromId === stateId || anyIds.has(fromId);
    });
  }

  #weightedTransitionChoice(matches) {
    if (matches.length === 1) return { ...matches[0], randomDecision: null };
    const candidates = matches.map(item => ({ transitionId: item.transition.id, weight: Number(item.transition.randomWeight ?? 1) }));
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    const advanced = advanceRandomState(this.#randomState);
    this.#randomState = advanced.state;
    this.#stats.randomDecisions += 1;
    this.#stats.randomCandidatesEvaluated += matches.length;
    let cursor = advanced.sample * total;
    let selectedIndex = matches.length - 1;
    for (let index = 0; index < candidates.length; index += 1) {
      cursor -= candidates[index].weight;
      if (cursor < 0) { selectedIndex = index; break; }
    }
    const selected = matches[selectedIndex];
    return {
      ...selected,
      randomDecision: {
        seed: this.#randomSeed,
        draw: this.#stats.randomDecisions,
        sample: advanced.sample,
        candidates,
        selected: selected.transition.id,
      },
    };
  }

  #eligibleTransitionForState(layer, stateId, stateTime, inputsById) {
    const sourceState = stateById(layer, stateId);
    const candidates = this.#transitionCandidates(layer, stateId);
    if (sourceState?.randomizeExit) {
      const directMatches = [];
      for (const transition of candidates) {
        if (referenceId(transition.from, 'machineState') !== stateId) continue;
        this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
        if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, stateTime)) continue;
        const match = this.#transitionMatch(transition, stateTime, inputsById);
        if (match.matched) directMatches.push({ transition, match });
      }
      if (directMatches.length) return this.#weightedTransitionChoice(directMatches);
      // Any-state routes are not paths leaving this state and therefore stay a
      // deterministic fallback outside the Randomize Exit weighted pool.
      for (const transition of candidates) {
        if (referenceId(transition.from, 'machineState') === stateId) continue;
        this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
        if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, stateTime)) continue;
        const match = this.#transitionMatch(transition, stateTime, inputsById);
        if (match.matched) return { transition, match, randomDecision: null };
      }
      return null;
    }
    for (const transition of candidates) {
      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, stateTime)) continue;
      const match = this.#transitionMatch(transition, stateTime, inputsById);
      if (!match.matched) continue;
      return { transition, match, randomDecision: null };
    }
    return null;
  }

  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    this.#consumeTransitionTriggers(options.match);
    runtime.stateStartPending = false;
    const source = stateById(layer, sourceStateId);
    const toId = referenceId(transition.to, 'machineState');
    const target = stateById(layer, toId);
    this.#runActions(source, 'state-end', layer, inputsById, events, { stateId: sourceStateId, transitionId: transition.id });
    events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id, ...(options.randomDecision ? { randomDecision: cloneValue(options.randomDecision) } : {}) });
    this.#runActions(transition, 'transition-start', layer, inputsById, events, { stateId: sourceStateId, transitionId: transition.id });
    if (target && !['entry', 'any', 'exit'].includes(target.type)) {
      this.#runActions(target, 'state-start', layer, inputsById, events, { stateId: target.id, transitionId: transition.id });
    }
    if (transition.duration > 0 && target?.type !== 'entry' && target?.type !== 'any') {
      runtime.stateId = sourceStateId;
      runtime.stateTime = sourceStateTime;
      runtime.transition = {
        transitionId: transition.id,
        fromId: sourceStateId,
        toId,
        duration: transition.duration,
        startedAt: sourceStateTime,
        sourceTimeAtStart: sourceStateTime,
        exitTime: cloneValue(transition.exitTime || null),
        pauseSource: Boolean(transition.pauseSource),
        allowExitDuringTransition: Boolean(transition.allowExitDuringTransition),
        easing: transition.easing || 'linear',
        ...(transition.easingParams ? { easingParams: cloneValue(transition.easingParams) } : {}),
        ...(Array.isArray(options.sourceSnapshot) ? { sourceSnapshot: cloneValue(options.sourceSnapshot) } : {}),
        ...(options.interruptedFromTransitionId ? { interruptedFromTransitionId: options.interruptedFromTransitionId } : {}),
        ...(options.randomDecision ? { randomDecision: cloneValue(options.randomDecision) } : {}),
      };
      return;
    }
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.stateTime = 0;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
    this.#runActions(transition, 'transition-end', layer, inputsById, events, { stateId: runtime.stateId, transitionId: transition.id });
    this.#resolveImmediatePseudo(layer, runtime, inputsById, events);
  }

  #interruptTransition(layer, runtime, inputsById, events) {
    const active = runtime.transition;
    if (!active?.allowExitDuringTransition) return false;
    const sourceStateId = active.toId;
    const sourceStateTime = runtime.stateTime - active.startedAt;
    const selected = this.#eligibleTransitionForState(layer, sourceStateId, sourceStateTime, inputsById);
    if (!selected) return false;
    const { transition: next, match, randomDecision } = selected;
    const sourceSnapshot = this.#stateTimelineContributions(layer, runtime, inputsById);
    events.push({
      type: 'transition-end',
      transitionId: active.transitionId,
      fromId: active.fromId,
      toId: active.toId,
      layerId: layer.id,
      interrupted: true,
      interruptedBy: next.id,
    });
    const interruptedTransition = (layer.transitions || []).find(candidate => candidate.id === active.transitionId) || null;
    this.#runActions(interruptedTransition, 'transition-end', layer, inputsById, events, { stateId: sourceStateId, transitionId: active.transitionId });
    this.#beginTransition(layer, runtime, next, sourceStateId, sourceStateTime, inputsById, events, {
      match,
      randomDecision,
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
    });
    return true;
  }

  #resolveImmediatePseudo(layer, runtime, inputsById, events, options = {}) {
    const lifecycle = options.lifecycle !== false;
    const seen = new Set();
    for (let hops = 0; hops <= (layer.states?.length || 0) + 1; hops += 1) {
      const state = stateById(layer, runtime.stateId);
      if (!state || !['entry', 'any'].includes(state.type)) return;
      if (seen.has(state.id)) { runtime.stateId = null; runtime.transition = null; return; }
      seen.add(state.id);
      let selected = null;
      for (const candidate of layer.transitions || []) {
        if (referenceId(candidate.from, 'machineState') !== state.id) continue;
        const match = this.#transitionMatch(candidate, runtime.stateTime, inputsById);
        if (match.matched) { selected = { transition: candidate, match }; break; }
      }
      if (!selected) return;
      const { transition, match } = selected;
      this.#consumeTransitionTriggers(match);
      const toId = referenceId(transition.to, 'machineState');
      const target = stateById(layer, toId);
      events.push({ type: 'transition-start', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
      if (lifecycle) this.#runActions(transition, 'transition-start', layer, inputsById, events, { stateId: state.id, transitionId: transition.id });
      if (target?.type === 'exit') {
        runtime.stateId = null; runtime.stateTime = 0; runtime.transition = null;
        events.push({ type: 'transition-end', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
        if (lifecycle) this.#runActions(transition, 'transition-end', layer, inputsById, events, { stateId: null, transitionId: transition.id });
        return;
      }
      runtime.stateId = toId; runtime.stateTime = 0; runtime.transition = null;
      if (lifecycle && target && !['entry', 'any', 'exit'].includes(target.type)) {
        this.#runActions(target, 'state-start', layer, inputsById, events, { stateId: target.id, transitionId: transition.id });
      }
      events.push({ type: 'transition-end', transitionId: transition.id, fromId: state.id, toId, layerId: layer.id });
      if (lifecycle) this.#runActions(transition, 'transition-end', layer, inputsById, events, { stateId: runtime.stateId, transitionId: transition.id });
      if (!target || !['entry', 'any'].includes(target.type)) return;
    }
  }

  #completeTransition(layer, runtime, inputsById, events) {
    const { transitionId, fromId, toId, startedAt } = runtime.transition;
    runtime.stateTime = runtime.stateTime - startedAt;
    const target = stateById(layer, toId);
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId, fromId, toId, layerId: layer.id });
    const transition = (layer.transitions || []).find(candidate => candidate.id === transitionId) || null;
    this.#runActions(transition, 'transition-end', layer, inputsById, events, { stateId: runtime.stateId, transitionId });
  }

  #stepLayer(layer, runtime, delta, inputsById, events) {
    if (layer.enabled === false) return;
    if (!runtime.stateId && !runtime.transition) return;
    runtime.error = null;
    if (runtime.settled) {
      const selected = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
      if (selected) {
        runtime.settled = false;
        this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match, randomDecision: selected.randomDecision });
      } else this.#stats.sleepHits += 1;
      return;
    }
    if (runtime.stateStartPending) {
      const state = stateById(layer, runtime.stateId);
      runtime.stateStartPending = false;
      this.#runActions(state, 'state-start', layer, inputsById, events, { stateId: runtime.stateId });
    }
    if (runtime.transition) {
      runtime.stateTime += delta;
      if (runtime.stateTime - runtime.transition.startedAt >= runtime.transition.duration - 1e-9) {
        this.#completeTransition(layer, runtime, inputsById, events);
        return;
      }
      this.#interruptTransition(layer, runtime, inputsById, events);
      return;
    }
    runtime.stateTime += delta;
    const selected = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (selected) this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match, randomDecision: selected.randomDecision });
    if (!selected) {
      const state = stateById(layer, runtime.stateId);
      const timeline = state?.timeline ? timelineById(this.#document, referenceId(state.timeline, 'timeline')) : null;
      if (state?.type === 'animation' && timeline?.loop === 'none') {
        const duration = statePlaybackDurationSeconds(this.#document, state);
        if (duration != null && runtime.stateTime >= duration - 1e-9) runtime.settled = true;
      }
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
      for (const layer of orderedLayers(machine)) {
        const runtime = this.#layers.get(layer.id) || createLayerRuntime(layer);
        try {
          this.#stepLayer(layer, runtime, delta, inputsById, events);
        } catch (error) {
          runtime.error = String(error?.message || error);
          runtime.settled = true;
          this.#stats.layerErrors += 1;
          events.push({ type: 'error', machineId: this.#machineId, layerId: layer.id, error: runtime.error });
        }
      }
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
    this.#overrideTypes.set(input.id, input.type);
    for (const runtime of this.#layers.values()) { runtime.settled = false; runtime.cachedContributions = null; runtime.cachedOverrides = null; }
    return normalized;
  }

  /** Publish an ephemeral host/runtime value for built-in transition sources. */
  setRuntimeValue(name, value) {
    const normalized = normalizeRuntimeValue(name, value);
    this.#runtimeValues.set(normalized.key, normalized.value);
    for (const runtime of this.#layers.values()) { runtime.settled = false; runtime.cachedContributions = null; runtime.cachedOverrides = null; }
    return cloneValue(normalized.value);
  }

  getRuntimeValue(name) { return cloneValue(this.#runtimeValues.get(String(name || ''))); }

  fire(nameOrId) {
    const machine = this.#reconcile();
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type !== 'trigger') throw new TypeError(`Input "${input.name || input.id}" is not a trigger; use setInput() for ${input.type} inputs.`);
    this.#overrideValues.set(input.id, true);
    this.#overrideTypes.set(input.id, input.type);
    for (const runtime of this.#layers.values()) { runtime.settled = false; runtime.cachedContributions = null; runtime.cachedOverrides = null; }
    return true;
  }

  #steadyStateContributions(state, elapsed, inputsById) {
    if (!state) return [];
    const document = this.#document;
    if (state.type === 'animation' && state.timeline) {
      return [{ timelineId: referenceId(state.timeline, 'timeline'), time: timelineTimeForState(document, state, elapsed), weight: 1, effectiveWeight: 1, stateId: state.id }];
    }
    if (state.type === 'blend1d') {
      const value = this.#numericSourceValue(state.input, inputsById);
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
    if (state.type === 'directBlend' || state.type === 'additiveBlend') {
      const active=(state.children||[]).map(child=>({child,raw:Math.max(0,this.#numericSourceValue(child.input, inputsById))})).filter(item=>Number.isFinite(item.raw)&&item.raw>0);
      const total=active.reduce((sum,item)=>sum+item.raw,0);
      if (!(total>0)) return [];
      let cumulative=0;
      return active.map((item,index)=>{
        const {child,raw}=item; cumulative+=raw;
        // Additive Blend keeps each branch's authored contribution instead of
        // normalizing the sum to one. The canonical compositor still receives
        // bounded weights, while ownership/evidence exposes the raw additive
        // factor for explainability.
        const normalized = state.type === 'additiveBlend' ? Math.min(1, raw) : raw / total;
        return {timelineId:referenceId(child.timeline,'timeline'),time:timelineTimeForBlendChild(document,state,child,elapsed),weight:state.type === 'additiveBlend' ? normalized : (index===0?1:raw/cumulative),effectiveWeight:normalized,stateId:state.id,blendChildId:child.id, ...(state.type === 'additiveBlend' ? { additive: true, rawWeight: raw } : {})};
      });
    }
    return [];
  }

  #composeWeightedContributions(items) {
    const desired = items
      .map(item => ({ ...item, effectiveWeight: Math.max(0, Math.min(1, Number(item.effectiveWeight ?? item.weight ?? 0))) }))
      .filter(item => item.effectiveWeight > 1e-12);
    const regular = desired.filter(item => !item.additive);
    const additive = desired.filter(item => item.additive).map(item => ({ ...item, weight: item.effectiveWeight }));
    const total = regular.reduce((sum,item)=>sum+item.effectiveWeight,0);
    const base = Math.max(0, 1-total);
    let cumulative = base;
    const composed = regular.map(item => {
      cumulative += item.effectiveWeight;
      return { ...item, weight: cumulative > 0 ? item.effectiveWeight / cumulative : 0 };
    });
    // Additive branches are applied after the absolute blend and retain their
    // delta weights; normalizing them with absolute contributors would erase
    // the very semantics that distinguishes Additive Blend.
    return [...composed, ...additive];
  }

  #stateTimelineContributions(layer, runtime, inputsById) {
    if (runtime.transition) {
      const { fromId, toId, startedAt } = runtime.transition;
      const elapsed = runtime.stateTime - startedAt;
      const progress = transitionProgress(runtime.transition, runtime.stateTime).eased;
      const outgoingTime = runtime.transition.pauseSource ? runtime.transition.sourceTimeAtStart : runtime.stateTime;
      const outgoingBase = Array.isArray(runtime.transition.sourceSnapshot)
        ? cloneValue(runtime.transition.sourceSnapshot)
        : this.#steadyStateContributions(stateById(layer, fromId), outgoingTime, inputsById);
      const outgoing = outgoingBase
        .map(item => ({
          ...item,
          effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress),
          transitionRole: Array.isArray(runtime.transition.sourceSnapshot) ? 'interrupted-snapshot' : 'outgoing',
        }));
      const incoming = this.#steadyStateContributions(stateById(layer, toId), elapsed, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * progress, transitionRole: 'incoming' }));
      return this.#composeWeightedContributions([...outgoing, ...incoming]);
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
      let contributions;
      let layerOverrides;
      try {
        contributions = runtime.settled && runtime.cachedContributions
          ? cloneValue(runtime.cachedContributions)
          : this.#stateTimelineContributions(layer, runtime, inputsById);
        if (runtime.stateId) this.#stats.stateEvaluations += 1;
        if (runtime.settled && runtime.cachedOverrides) {
          this.#stats.sleepHits += 1;
          layerOverrides = cloneValue(runtime.cachedOverrides);
        } else {
          this.#stats.timelineEvaluations += contributions.length;
          layerOverrides = evaluateTimelines(this.#document, contributions);
          runtime.cachedContributions = cloneValue(contributions);
          runtime.cachedOverrides = cloneValue(layerOverrides);
        }
        runtime.error = null;
      } catch (error) {
        runtime.error = String(error?.message || error);
        runtime.settled = true;
        this.#stats.layerErrors += 1;
        result.layers.push({ ...runtimeLayerSnapshot(layer, runtime), transition: transitionView(runtime), evaluatedTimelines: [], error: runtime.error });
        result.diagnostics = result.diagnostics || [];
        result.diagnostics.push({ code: 'machine-layer-error', layerId: layer.id, error: runtime.error });
        continue;
      }
      const layerEvidence = contributions.map(item => ({ timeline: createReference('timeline', item.timelineId), state: createReference('machineState', item.stateId), time: item.time, weight: item.weight, effectiveWeight: item.effectiveWeight ?? item.weight, ...(item.additive ? { additive: true, rawWeight: item.rawWeight ?? item.effectiveWeight ?? item.weight } : {}), blendChild: item.blendChildId ? createReference('machineBlendChild', item.blendChildId) : null }));
      const weight = layerWeight(layer);
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
          effective: weight > 0,
          layerWeight: weight,
        });
        result.ownership[address] = previous;
        result.overrides[address] = blendLayerValue(this.#document, result.overrides[address], value, weight, address);
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
      dataConditionReads: 0,
      builtinConditionReads: 0,
      triggerPulsesConsumed: 0,
      actionsExecuted: 0,
      actionErrors: 0,
      randomDecisions: 0,
      randomCandidatesEvaluated: 0,
      timelineEvaluations: 0,
      compositionApplications: 0,
      inactiveLayerSkips: 0,
      zeroMachineFastPaths: 0,
      layerErrors: 0,
      sleepHits: 0,
    };
    this.#resetRuntime(machine);
  }

  scrub(seconds) {
    this.reset();
    this.step(Number(seconds));
    return cloneValue(this.evaluate());
  }
}

export function createMachineRuntime(documentOrGetter, machineId, options = {}) {
  return new MachineRuntime(documentOrGetter, machineId, options);
}
