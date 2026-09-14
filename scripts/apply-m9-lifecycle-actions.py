from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def one(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# model.js — persistent bounded action registry + canonical validation
# ---------------------------------------------------------------------------
model = ROOT / 'src/veyra/model.js'
text = model.read_text()

needle = """export const VEYRA_CONDITION_OPS = Object.freeze([
  '<',
  '<=',
  '>',
  '>=',
  '==',
  '!=',
  'fired',
  '!fired',
]);
"""
replacement = needle + """export const VEYRA_MACHINE_ACTION_PHASES = Object.freeze([
  'state-start', 'state-end', 'transition-start', 'transition-end',
]);
export const VEYRA_MACHINE_ACTION_TYPES = Object.freeze([
  'data-set', 'data-fire', 'input-set', 'input-fire', 'emit', 'timeline',
]);
"""
text = one(text, needle, replacement, 'machine action constants')

needle = "function normalizeMachineDataEndpoint(value, path) {\n"
insert = r'''function machineJsonSafeClone(value, path = 'machineAction.value') {
  const seen = new Set();
  const visit = (item, at) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError(`${at} must contain only finite JSON numbers.`);
      return item;
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new TypeError(`${at} must be acyclic JSON data.`);
      seen.add(item);
      const result = item.map((entry, index) => visit(entry, `${at}[${index}]`));
      seen.delete(item);
      return result;
    }
    if (item && typeof item === 'object') {
      const proto = Object.getPrototypeOf(item);
      if (proto !== Object.prototype && proto !== null) throw new TypeError(`${at} must be plain JSON data.`);
      if (seen.has(item)) throw new TypeError(`${at} must be acyclic JSON data.`);
      seen.add(item);
      const result = {};
      for (const [key, entry] of Object.entries(item)) {
        if (entry === undefined || ['function', 'symbol', 'bigint'].includes(typeof entry)) throw new TypeError(`${at}.${key} is not JSON-safe.`);
        result[key] = visit(entry, `${at}.${key}`);
      }
      seen.delete(item);
      return result;
    }
    throw new TypeError(`${at} is not JSON-safe.`);
  };
  return visit(value, path);
}

export function createMachineAction(overrides = {}) {
  const type = String(overrides.type || '');
  const phase = String(overrides.phase || '');
  if (!VEYRA_MACHINE_ACTION_TYPES.includes(type)) throw new TypeError(`Unsupported machine action type: ${type || '(empty)'}.`);
  if (!VEYRA_MACHINE_ACTION_PHASES.includes(phase)) throw new TypeError(`Unsupported machine action phase: ${phase || '(empty)'}.`);
  const action = { id: String(overrides.id || createId('machineAction')), type, phase };
  if (type === 'data-set' || type === 'data-fire') {
    action.target = normalizeMachineDataEndpoint(overrides.target ?? overrides.endpoint, 'machineAction.target');
    if (type === 'data-set') {
      if (overrides.value === undefined) throw new TypeError('machineAction.value is required for data-set.');
      action.value = machineJsonSafeClone(overrides.value);
    }
    return action;
  }
  if (type === 'input-set' || type === 'input-fire') {
    const input = normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'machineAction.input');
    if (!input) throw new TypeError('machineAction.input is required.');
    action.input = input;
    if (type === 'input-set') {
      if (overrides.value === undefined) throw new TypeError('machineAction.value is required for input-set.');
      action.value = machineJsonSafeClone(overrides.value);
    }
    return action;
  }
  if (type === 'emit') {
    action.event = String(overrides.event || '');
    if (!action.event) throw new TypeError('machineAction.event is required for emit.');
    action.payload = machineJsonSafeClone(overrides.payload ?? null, 'machineAction.payload');
    return action;
  }
  const timeline = normalizeReference(overrides.timeline ?? overrides.timelineId, 'timeline', 'machineAction.timeline');
  if (!timeline) throw new TypeError('machineAction.timeline is required.');
  const operation = String(overrides.operation || 'play');
  if (!['play', 'stop', 'seek'].includes(operation)) throw new TypeError('machineAction.operation must be play, stop, or seek.');
  action.timeline = timeline;
  action.operation = operation;
  if (operation === 'seek') {
    const time = Number(overrides.time ?? overrides.value);
    if (!Number.isFinite(time) || time < 0) throw new TypeError('machineAction.time must be a non-negative finite number for seek.');
    action.time = time;
  }
  return action;
}

'''
if text.count(needle) != 1:
    raise SystemExit('normalizeMachineDataEndpoint insertion point missing')
text = text.replace(needle, insert + needle, 1)

# Creator: persist state actions with owner-phase validation.
old = """  const result = {
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
"""
new = """  const result = {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    displayNameAdvisory: true,
    caption: String(overrides.caption ?? ''),
    type,
    ...(timeline ? { timeline } : {}),
    speed,
    graph,
  };
  const actions = (overrides.actions || []).map(createMachineAction);
  if (actions.some(action => !['state-start', 'state-end'].includes(action.phase))) throw new TypeError('State lifecycle action phase must be state-start or state-end.');
  if (['entry', 'exit', 'any'].includes(type) && actions.length) throw new TypeError(`${type} pseudo-states cannot own lifecycle actions.`);
  if (actions.length) result.actions = actions;
  if (type === 'blend1d') {
"""
text = one(text, old, new, 'createMachineState actions')

# Creator: persist transition actions.
old = """    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
"""
new = """    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
  const actions = (overrides.actions || []).map(createMachineAction);
  if (actions.some(action => !['transition-start', 'transition-end'].includes(action.phase))) throw new TypeError('Transition lifecycle action phase must be transition-start or transition-end.');
  if (actions.length) transition.actions = actions;
"""
text = one(text, old, new, 'createMachineTransition actions')

# Add action normalizer before state normalization.
needle = "function normalizeMachineState(state, index, layerPath, timelineIds, inputsById) {\n"
insert = r'''function normalizeMachineAction(action, index, ownerPath, ownerKind, timelineIds, inputsById) {
  const path = `${ownerPath}.actions[${index}]`;
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new TypeError(`${path} must be an action object.`);
  const id = String(action.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const result = createMachineAction({ ...action, id });
  const allowed = ownerKind === 'state' ? ['state-start', 'state-end'] : ['transition-start', 'transition-end'];
  if (!allowed.includes(result.phase)) throw new TypeError(`${path}.phase must be ${allowed.join(' or ')}.`);
  if (result.type === 'input-set' || result.type === 'input-fire') {
    const key = referenceId(result.input, 'machineInput');
    const input = inputsById.get(key) || [...inputsById.values()].find(candidate => candidate.name === key) || null;
    if (!input) throw new TypeError(`${path}.input references missing machine input ${key}.`);
    result.input = createReference('machineInput', input.id);
    if (result.type === 'input-fire' && input.type !== 'trigger') throw new TypeError(`${path}.input must be a trigger input for input-fire.`);
    if (result.type === 'input-set') {
      if (input.type === 'trigger') throw new TypeError(`${path}.input is a trigger; use input-fire.`);
      if (input.type === 'number') {
        if (typeof result.value !== 'number' || !Number.isFinite(result.value)) throw new TypeError(`${path}.value must be finite for number input ${input.id}.`);
      } else if (typeof result.value !== 'boolean') throw new TypeError(`${path}.value must be boolean for bool input ${input.id}.`);
    }
  }
  if (result.type === 'timeline' && !timelineIds.has(referenceId(result.timeline, 'timeline'))) {
    throw new TypeError(`${path}.timeline references missing timeline ${referenceId(result.timeline, 'timeline')}.`);
  }
  return result;
}

'''
if text.count(needle) != 1:
    raise SystemExit('normalizeMachineState insertion point missing')
text = text.replace(needle, insert + needle, 1)

# State normalizer actions.
old = """  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph };
  if (timeline) result.timeline = timeline;
  if (type === 'blend1d' || type === 'directBlend') {
"""
new = """  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph };
  if (timeline) result.timeline = timeline;
  if (state.actions !== undefined && state.actions !== null && !Array.isArray(state.actions)) throw new TypeError(`${path}.actions must be an array.`);
  const actions = (Array.isArray(state.actions) ? state.actions : []).map((action,i)=>normalizeMachineAction(action,i,path,'state',timelineIds,inputsById));
  if (['entry', 'exit', 'any'].includes(type) && actions.length) throw new TypeError(`${path}.${type} pseudo-state cannot own lifecycle actions.`);
  if (actions.length) result.actions = actions;
  if (type === 'blend1d' || type === 'directBlend') {
"""
text = one(text, old, new, 'normalize state actions')

# Transition normalizer receives timeline IDs and normalizes actions.
text = one(
    text,
    "function normalizeMachineTransition(transition, index, layerPath, stateIds, inputsById) {",
    "function normalizeMachineTransition(transition, index, layerPath, stateIds, inputsById, timelineIds) {",
    'transition normalizer signature',
)
old = """  if (transition.conditions !== undefined && transition.conditions !== null && !Array.isArray(transition.conditions)) throw new TypeError(`${path}.conditions must be an array of conditions.`);
  const conditions=(Array.isArray(transition.conditions)?transition.conditions:[]).map((condition,i)=>normalizeMachineCondition(condition,`${path}.conditions[${i}]`,inputsById));
  return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, easing, ...(easingParams?{easingParams}:{}), conditions };
}
"""
new = """  if (transition.conditions !== undefined && transition.conditions !== null && !Array.isArray(transition.conditions)) throw new TypeError(`${path}.conditions must be an array of conditions.`);
  const conditions=(Array.isArray(transition.conditions)?transition.conditions:[]).map((condition,i)=>normalizeMachineCondition(condition,`${path}.conditions[${i}]`,inputsById));
  if (transition.actions !== undefined && transition.actions !== null && !Array.isArray(transition.actions)) throw new TypeError(`${path}.actions must be an array.`);
  const actions=(Array.isArray(transition.actions)?transition.actions:[]).map((action,i)=>normalizeMachineAction(action,i,path,'transition',timelineIds,inputsById));
  return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, easing, ...(easingParams?{easingParams}:{}), conditions, ...(actions.length?{actions}: {}) };
}
"""
text = one(text, old, new, 'normalize transition actions')
text = one(
    text,
    "const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById));",
    "const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById,timelineIds));",
    'layer transition normalization call',
)

# Avoid constructor/reset ambiguity: Entry/Any routing transitions cannot own actions yet.
old = """    const source=statesById.get(referenceId(transition.from,'machineState'));
    if(transition.exitTime && source && ['entry','any','exit'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id}.exitTime is not meaningful for ${source.type} pseudo-states.`);
"""
new = """    const source=statesById.get(referenceId(transition.from,'machineState'));
    if(transition.exitTime && source && ['entry','any','exit'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id}.exitTime is not meaningful for ${source.type} pseudo-states.`);
    if((transition.actions || []).length && source && ['entry','any'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id} from ${source.type} pseudo-state cannot own lifecycle actions.`);
"""
text = one(text, old, new, 'pseudo transition action guard')

# Validate M8 action targets after data graph normalization.
needle = "function validateMachineDataConditions(document) {\n"
# Keep function in place; append validator after its closing block by matching the block before resolveMachineNumberInput.
pattern = re.compile(r"(function validateMachineDataConditions\(document\) \{.*?\n\}\n)\nfunction resolveMachineNumberInput", re.S)
match = pattern.search(text)
if not match:
    raise SystemExit('validateMachineDataConditions block not found')
validator = r'''
function validateMachineDataActions(document) {
  for (const machine of document.stateMachines || []) for (const layer of machine.layers || []) {
    const owners = [
      ...(layer.states || []).map(state => ({ kind: 'state', id: state.id, actions: state.actions || [] })),
      ...(layer.transitions || []).map(transition => ({ kind: 'transition', id: transition.id, actions: transition.actions || [] })),
    ];
    for (const owner of owners) for (const action of owner.actions) {
      if (action.type !== 'data-set' && action.type !== 'data-fire') continue;
      const label = `stateMachine ${machine.id}/layer ${layer.id}/${owner.kind} ${owner.id}/action ${action.id}`;
      const descriptor = machineDataEndpointDescriptor(document, action.target, `${label}.target`);
      const property = graphDataPropertyById(document, action.target.path.at(-1).id);
      if (!property?.writable) throw new TypeError(`[machine-action-readonly] ${label} targets a read-only data property.`);
      if (action.type === 'data-fire') {
        if (descriptor.type !== 'trigger') throw new TypeError(`[machine-action-type] ${label} data-fire requires a trigger target.`);
        continue;
      }
      if (descriptor.type === 'trigger') throw new TypeError(`[machine-action-type] ${label} cannot data-set a trigger; use data-fire.`);
      const value = machineLiteralDescriptor(document, action.value, descriptor);
      if (!dataTypeAccepts(descriptor, value)) throw new TypeError(`[machine-action-type] ${label} value is incompatible with ${JSON.stringify(descriptor)}.`);
      if (descriptor.type === 'number') {
        if (typeof action.value !== 'number' || !Number.isFinite(action.value)) throw new TypeError(`[machine-action-type] ${label} requires a finite number.`);
        if (descriptor.min != null && action.value < descriptor.min || descriptor.max != null && action.value > descriptor.max) throw new RangeError(`[machine-action-range] ${label} is outside the data property range.`);
      }
    }
  }
}
'''
text = text[:match.end(1)] + validator + "\nfunction resolveMachineNumberInput" + text[match.end():]

# Call data action validation next to data condition validation.
old = """  const dataDocument = normalizeDataGraphDocument(input, projectDocument);
  validateMachineDataConditions(dataDocument);
  validateStableIdentities(dataDocument);
"""
new = """  const dataDocument = normalizeDataGraphDocument(input, projectDocument);
  validateMachineDataConditions(dataDocument);
  validateMachineDataActions(dataDocument);
  validateStableIdentities(dataDocument);
"""
text = one(text, old, new, 'post-data machine action validation')

# Stable action identity.
old = """      layer.states.forEach((state, stateIndex) => register('machineState', state.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}]`));
      layer.transitions.forEach((transition, transitionIndex) => {
        register('machineTransition', transition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}]`);
        transition.conditions.forEach((condition, conditionIndex) => register('machineCondition', condition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`));
      });
"""
new = """      layer.states.forEach((state, stateIndex) => {
        register('machineState', state.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}]`);
        (state.actions || []).forEach((action, actionIndex) => register('machineAction', action.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}].actions[${actionIndex}]`));
      });
      layer.transitions.forEach((transition, transitionIndex) => {
        register('machineTransition', transition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}]`);
        transition.conditions.forEach((condition, conditionIndex) => register('machineCondition', condition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`));
        (transition.actions || []).forEach((action, actionIndex) => register('machineAction', action.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].actions[${actionIndex}]`));
      });
"""
text = one(text, old, new, 'stable machine action identities')

model.write_text(text)


# ---------------------------------------------------------------------------
# stateMachine.js — exactly-once lifecycle execution, runtime-only effects
# ---------------------------------------------------------------------------
runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()

text = one(
    text,
    """export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
]);
""",
    """export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
  'machine-action',
]);
""",
    'machine event types',
)
text = one(
    text,
    """  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend']),
  graph: Object.freeze([
""",
    """  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend']),
  actionTypes: Object.freeze(['data-set', 'data-fire', 'input-set', 'input-fire', 'emit', 'timeline']),
  actionPhases: Object.freeze(['state-start', 'state-end', 'transition-start', 'transition-end']),
  graph: Object.freeze([
""",
    'machine action capabilities',
)

# Signature must invalidate when persistent actions change.
text = one(
    text,
    "(layer.states || []).map(state => [state.id, state.type]),",
    "(layer.states || []).map(state => [state.id, state.type, state.actions || []]),",
    'state action signature',
)
old = "(transition.conditions || []).map(condition => [condition.id, condition.input ? referenceId(condition.input, 'machineInput') : null, condition.source || null, condition.op, condition.value, condition.compare || null])])"
new = "(transition.conditions || []).map(condition => [condition.id, condition.input ? referenceId(condition.input, 'machineInput') : null, condition.source || null, condition.op, condition.value, condition.compare || null]), transition.actions || []])"
text = one(text, old, new, 'transition action signature')

# Per-layer startup state-start pending flag.
text = one(
    text,
    "return { stateId: state?.id || null, stateTime: 0, transition: null };",
    "return { stateId: state?.id || null, stateTime: 0, transition: null, stateStartPending: false };",
    'layer runtime startup flag',
)
text = one(
    text,
    "return { stateId: value.stateId, stateTime: value.stateTime, transition: cloneValue(value.transition) };",
    "return { stateId: value.stateId, stateTime: value.stateTime, transition: cloneValue(value.transition), stateStartPending: Boolean(value.stateStartPending) };",
    'clone layer runtime startup flag',
)

# Work counters.
text = one(
    text,
    """    triggerPulsesConsumed: 0,
    timelineEvaluations: 0,
""",
    """    triggerPulsesConsumed: 0,
    actionsExecuted: 0,
    actionErrors: 0,
    timelineEvaluations: 0,
""",
    'initial action counters',
)
# Reset block uses deeper indentation.
text = one(
    text,
    """      triggerPulsesConsumed: 0,
      timelineEvaluations: 0,
""",
    """      triggerPulsesConsumed: 0,
      actionsExecuted: 0,
      actionErrors: 0,
      timelineEvaluations: 0,
""",
    'reset action counters',
)

# Action executor inserted after trigger consumption helper.
needle = """  #consumeTransitionTriggers(match) {
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

"""
insert = needle + r'''  #executeAction(action, phase, layer, inputsById, events, context = {}) {
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
        inputsById.set(inputId, cloneValue(action.value));
        effect = { kind: 'input-set', input: cloneValue(action.input), value: cloneValue(action.value), mutation: 'runtime-only' };
      } else if (action.type === 'input-fire') {
        const inputId = referenceId(action.input, 'machineInput');
        this.#overrideValues.set(inputId, true);
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

'''
if text.count(needle) != 1:
    raise SystemExit('action executor insertion point missing')
text = text.replace(needle, insert, 1)

# Reset resolves pseudo states without side effects, then arms the final real state start.
old = """    const inputs = new Map((machine?.inputs || []).map(input => [input.id, input.value]));
    for (const layer of orderedLayers(machine)) this.#resolveImmediatePseudo(layer, this.#layers.get(layer.id), inputs, []);
  }
"""
new = """    const inputs = new Map((machine?.inputs || []).map(input => [input.id, input.value]));
    for (const layer of orderedLayers(machine)) {
      const runtime = this.#layers.get(layer.id);
      this.#resolveImmediatePseudo(layer, runtime, inputs, [], { lifecycle: false });
      const state = stateById(layer, runtime.stateId);
      runtime.stateStartPending = Boolean(state && !['entry', 'any', 'exit'].includes(state.type));
    }
  }
"""
text = one(text, old, new, 'reset lifecycle arming')

# Begin transition lifecycle.
pattern = re.compile(r"  #beginTransition\(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = \{\}\) \{.*?\n  \}\n\n  #interruptTransition", re.S)
replacement = r'''  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    this.#consumeTransitionTriggers(options.match);
    runtime.stateStartPending = false;
    const source = stateById(layer, sourceStateId);
    const toId = referenceId(transition.to, 'machineState');
    const target = stateById(layer, toId);
    this.#runActions(source, 'state-end', layer, inputsById, events, { stateId: sourceStateId, transitionId: transition.id });
    events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
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

  #interruptTransition'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('beginTransition lifecycle replacement failed')

# Interruption closes the interrupted transition lifecycle once before next transition begins.
old = """    events.push({
      type: 'transition-end',
      transitionId: active.transitionId,
      fromId: active.fromId,
      toId: active.toId,
      layerId: layer.id,
      interrupted: true,
      interruptedBy: next.id,
    });
    this.#beginTransition(layer, runtime, next, sourceStateId, sourceStateTime, inputsById, events, {
"""
new = """    events.push({
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
"""
text = one(text, old, new, 'interruption transition-end actions')

# Pseudo resolver: runtime lifecycle only; reset path stays side-effect-free.
pattern = re.compile(r"  #resolveImmediatePseudo\(layer, runtime, inputsById, events\) \{.*?\n  \}\n\n  #completeTransition", re.S)
replacement = r'''  #resolveImmediatePseudo(layer, runtime, inputsById, events, options = {}) {
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

  #completeTransition'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('pseudo lifecycle replacement failed')

# Completion transition-end action once.
old = """  #completeTransition(layer, runtime, events) {
    const { transitionId, fromId, toId, startedAt } = runtime.transition;
    runtime.stateTime = runtime.stateTime - startedAt;
    const target = stateById(layer, toId);
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId, fromId, toId, layerId: layer.id });
  }
"""
new = """  #completeTransition(layer, runtime, inputsById, events) {
    const { transitionId, fromId, toId, startedAt } = runtime.transition;
    runtime.stateTime = runtime.stateTime - startedAt;
    const target = stateById(layer, toId);
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId, fromId, toId, layerId: layer.id });
    const transition = (layer.transitions || []).find(candidate => candidate.id === transitionId) || null;
    this.#runActions(transition, 'transition-end', layer, inputsById, events, { stateId: runtime.stateId, transitionId });
  }
"""
text = one(text, old, new, 'complete transition actions')

# Flush pending initial state-start per layer before that layer evaluates.
old = """  #stepLayer(layer, runtime, delta, inputsById, events) {
    if (layer.enabled === false) return;
    if (!runtime.stateId && !runtime.transition) return;
    if (runtime.transition) {
"""
new = """  #stepLayer(layer, runtime, delta, inputsById, events) {
    if (layer.enabled === false) return;
    if (!runtime.stateId && !runtime.transition) return;
    if (runtime.stateStartPending) {
      const state = stateById(layer, runtime.stateId);
      runtime.stateStartPending = false;
      this.#runActions(state, 'state-start', layer, inputsById, events, { stateId: runtime.stateId });
    }
    if (runtime.transition) {
"""
text = one(text, old, new, 'pending state start actions')
text = one(
    text,
    "this.#completeTransition(layer, runtime, events);",
    "this.#completeTransition(layer, runtime, inputsById, events);",
    'complete transition call',
)

runtime.write_text(text)
print('M9 lifecycle action patch applied')
