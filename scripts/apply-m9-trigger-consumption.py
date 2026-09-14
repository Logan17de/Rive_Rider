from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# ---- dataGraph.js ----
data = ROOT / 'src/veyra/dataGraph.js'
text = data.read_text()
needle = """  getEndpointValue(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput, 'runtime data endpoint');
    if (endpoint.kind !== 'data') throw new TypeError('getEndpointValue requires a data endpoint.');
    // No triggerReads set is supplied: this is a non-consuming observation of
    // the current endpoint value, including nested View Model retargeting.
    return this.#dataEndpointValue(endpoint, scopeKey(options.scopePath), new Map(), null, null);
  }
"""
replacement = needle + """  consumeEndpointTrigger(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput, 'runtime trigger endpoint');
    if (endpoint.kind !== 'data') throw new TypeError('consumeEndpointTrigger requires a data endpoint.');
    const scopePathValue = createDataRuntimeScope(options.scopePath ?? options.runtimeScopePath ?? []).path;
    const resolved = this.resolveDataEndpoint(endpoint, { scopePath: scopePathValue });
    if (resolved.type !== 'trigger') throw new TypeError(`[data-trigger-type] ${bindingEndpointKey(endpoint)} is ${resolved.type}, not trigger.`);
    const triggerReads = new Set();
    const value = this.#dataEndpointValue(endpoint, scopeKey(scopePathValue), new Map(), triggerReads, null);
    if (!value || !triggerReads.size) return false;
    let consumed = false;
    for (const key of triggerReads) {
      const count = this.#triggers.get(key) || 0;
      if (!count) continue;
      if (count > 1) this.#triggers.set(key, count - 1); else this.#triggers.delete(key);
      this.#stats.triggerPulsesConsumed += 1;
      this.#invalidateDependency(key);
      consumed = true;
    }
    return consumed;
  }
"""
if text.count(needle) != 1:
    raise SystemExit('data getEndpointValue block not found')
text = text.replace(needle, replacement, 1)
data.write_text(text)

# ---- stateMachine.js ----
runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()

# Match conditions and collect only fired trigger sources from a fully satisfied transition.
pattern = re.compile(r"function evaluateCondition\(condition, inputsById, readData\) \{.*?\n\}\n\nfunction transitionSatisfied\(transition, stateTime, inputsById, readData\) \{.*?\n\}", re.S)
replacement = '''function evaluateCondition(condition, inputsById, readData) {
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
    if (condition.op !== 'fired') continue;
    if (condition.source) triggerSources.push({ kind: 'data', endpoint: cloneValue(condition.source) });
    else triggerSources.push({ kind: 'machineInput', id: referenceId(condition.input, 'machineInput') });
  }
  return { matched: true, triggerSources };
}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('condition/transition matcher block not found')

# Machine-side consumption work accounting.
needle = """    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    timelineEvaluations: 0,
"""
replacement = """    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    triggerPulsesConsumed: 0,
    timelineEvaluations: 0,
"""
if text.count(needle) != 2:
    raise SystemExit(f'expected machine stats blocks twice, found {text.count(needle)}')
text = text.replace(needle, replacement)

# Replace boolean transition predicate with match evidence + exact consumption.
needle = """  #transitionSatisfied(transition, stateTime, inputsById) {
    return transitionSatisfied(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
  }

  #resetRuntime(machine) {
"""
replacement = """  #transitionMatch(transition, stateTime, inputsById) {
    return transitionMatch(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
  }

  #consumeTransitionTriggers(match, inputsById) {
    const seen = new Set();
    for (const source of match?.triggerSources || []) {
      const key = source.kind === 'machineInput'
        ? `machineInput:${source.id}`
        : `data:${JSON.stringify(source.endpoint)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (source.kind === 'machineInput') {
        if (inputsById.get(source.id) !== true) continue;
        inputsById.set(source.id, false);
        this.#overrideValues.set(source.id, false);
        this.#stats.triggerPulsesConsumed += 1;
      } else if (this.#dataRuntime.consumeEndpointTrigger(source.endpoint, { scopePath: this.#runtimeScopePath })) {
        this.#stats.triggerPulsesConsumed += 1;
      }
    }
  }

  #resetRuntime(machine) {
"""
if text.count(needle) != 1:
    raise SystemExit('transition predicate/reset block not found')
text = text.replace(needle, replacement, 1)

# Eligible transition returns both transition and match evidence.
pattern = re.compile(r"  #eligibleTransitionForState\(layer, stateId, stateTime, inputsById\) \{.*?\n  \}", re.S)
replacement = '''  #eligibleTransitionForState(layer, stateId, stateTime, inputsById) {
    const sourceState = stateById(layer, stateId);
    for (const transition of this.#transitionCandidates(layer, stateId)) {
      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, stateTime)) continue;
      const match = this.#transitionMatch(transition, stateTime, inputsById);
      if (!match.matched) continue;
      return { transition, match };
    }
    return null;
  }'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('eligible transition block not found')

# Begin transition consumes matched pulses before state/events mutate.
old = """  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    const toId = referenceId(transition.to, 'machineState');
"""
new = """  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    this.#consumeTransitionTriggers(options.match, inputsById);
    const toId = referenceId(transition.to, 'machineState');
"""
if text.count(old) != 1:
    raise SystemExit('begin transition header missing')
text = text.replace(old, new, 1)

# Interruption carries match evidence into the selected transition.
old = """    const next = this.#eligibleTransitionForState(layer, sourceStateId, sourceStateTime, inputsById);
    if (!next) return false;
    const sourceSnapshot = this.#stateTimelineContributions(layer, runtime, inputsById);
"""
new = """    const selected = this.#eligibleTransitionForState(layer, sourceStateId, sourceStateTime, inputsById);
    if (!selected) return false;
    const { transition: next, match } = selected;
    const sourceSnapshot = this.#stateTimelineContributions(layer, runtime, inputsById);
"""
if text.count(old) != 1:
    raise SystemExit('interrupt selection block missing')
text = text.replace(old, new, 1)
old = """    this.#beginTransition(layer, runtime, next, sourceStateId, sourceStateTime, inputsById, events, {
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
    });
"""
new = """    this.#beginTransition(layer, runtime, next, sourceStateId, sourceStateTime, inputsById, events, {
      match,
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
    });
"""
if text.count(old) != 1:
    raise SystemExit('interrupt beginTransition block missing')
text = text.replace(old, new, 1)

# Pseudo routing selects with full match evidence and consumes only the chosen transition.
old = """      const transition = (layer.transitions || []).find(candidate => referenceId(candidate.from, 'machineState') === state.id && this.#transitionSatisfied(candidate, runtime.stateTime, inputsById));
      if (!transition) return;
      const toId = referenceId(transition.to, 'machineState');
"""
new = """      let selected = null;
      for (const candidate of layer.transitions || []) {
        if (referenceId(candidate.from, 'machineState') !== state.id) continue;
        const match = this.#transitionMatch(candidate, runtime.stateTime, inputsById);
        if (match.matched) { selected = { transition: candidate, match }; break; }
      }
      if (!selected) return;
      const { transition, match } = selected;
      this.#consumeTransitionTriggers(match, inputsById);
      const toId = referenceId(transition.to, 'machineState');
"""
if text.count(old) != 1:
    raise SystemExit('pseudo transition selection block missing')
text = text.replace(old, new, 1)

# Normal step unwraps selection and forwards the match evidence.
old = """    const transition = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (transition) this.#beginTransition(layer, runtime, transition, runtime.stateId, runtime.stateTime, inputsById, events);
"""
new = """    const selected = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (selected) this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match });
"""
if text.count(old) != 1:
    raise SystemExit('normal step transition selection missing')
text = text.replace(old, new, 1)

# Pulses are no longer globally cleared at every step: only selected fired conditions consume.
old = """    this.#clearTriggers();
    return events;
  }

  #clearTriggers() {
    for (const input of this.machine?.inputs || []) if (input.type === 'trigger' && (this.#overrideValues.get(input.id) ?? input.value)) this.#overrideValues.set(input.id, false);
  }

  setInput(nameOrId, value) {
"""
new = """    return events;
  }

  setInput(nameOrId, value) {
"""
if text.count(old) != 1:
    raise SystemExit('global trigger clear block missing')
text = text.replace(old, new, 1)

runtime.write_text(text)
print('M9 exact trigger consumption patch applied')
