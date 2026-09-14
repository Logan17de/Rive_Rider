from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_one(path, old, new, label):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    path.write_text(text.replace(old, new, 1))


# ---- dataGraph.js: add an explicit one-pulse consuming port for M8 trigger queues ----
data = ROOT / 'src/veyra/dataGraph.js'
old = """  getEndpointValue(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput, 'runtime data endpoint');
    if (endpoint.kind !== 'data') throw new TypeError('getEndpointValue requires a data endpoint.');
    // No triggerReads set is supplied: this is a non-consuming observation of
    // the current endpoint value, including nested View Model retargeting.
    return this.#dataEndpointValue(endpoint, scopeKey(options.scopePath), new Map(), null, null);
  }
"""
new = old + """  consumeEndpointTrigger(endpointInput, options = {}) {
    const endpoint = normalizeBindingEndpoint(endpointInput, 'runtime trigger endpoint');
    if (endpoint.kind !== 'data') throw new TypeError('consumeEndpointTrigger requires a data endpoint.');
    const scopePathValue = createDataRuntimeScope(options.scopePath ?? options.runtimeScopePath ?? []).path;
    const resolved = this.resolveDataEndpoint(endpoint, { scopePath: scopePathValue });
    if (resolved.type !== 'trigger') throw new TypeError(`[data-trigger-type] ${bindingEndpointKey(endpoint)} is ${resolved.type}, not trigger.`);
    const triggerReads = new Set();
    const value = this.#dataEndpointValue(endpoint, scopeKey(scopePathValue), new Map(), triggerReads, null);
    if (!value || !triggerReads.size) return false;
    for (const key of triggerReads) {
      const count = this.#triggers.get(key) || 0;
      if (!count) continue;
      if (count > 1) this.#triggers.set(key, count - 1); else this.#triggers.delete(key);
      this.#stats.triggerPulsesConsumed += 1;
      this.#invalidateDependency(key);
      return true;
    }
    return false;
  }
"""
replace_one(data, old, new, 'data trigger consume port')


# ---- stateMachine.js: carry match evidence and spend only selected M8 events ----
runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()

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
    // Legacy machine triggers intentionally keep their established one-step
    // broadcast behavior. Only M8 queued data events participate in exact
    // consume-on-selected-transition semantics.
    if (condition.op === 'fired' && condition.source) triggerSources.push(cloneValue(condition.source));
  }
  return { matched: true, triggerSources };
}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('condition matcher block not found')

init_old = """    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    timelineEvaluations: 0,
"""
init_new = """    transitionConditionEvaluations: 0,
    dataConditionReads: 0,
    triggerPulsesConsumed: 0,
    timelineEvaluations: 0,
"""
if text.count(init_old) != 1:
    raise SystemExit(f'initial stats block count {text.count(init_old)}')
text = text.replace(init_old, init_new, 1)

reset_old = """      transitionConditionEvaluations: 0,
      dataConditionReads: 0,
      timelineEvaluations: 0,
"""
reset_new = """      transitionConditionEvaluations: 0,
      dataConditionReads: 0,
      triggerPulsesConsumed: 0,
      timelineEvaluations: 0,
"""
if text.count(reset_old) != 1:
    raise SystemExit(f'reset stats block count {text.count(reset_old)}')
text = text.replace(reset_old, reset_new, 1)

old = """  #transitionSatisfied(transition, stateTime, inputsById) {
    return transitionSatisfied(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
  }

  #resetRuntime(machine) {
"""
new = """  #transitionMatch(transition, stateTime, inputsById) {
    return transitionMatch(transition, stateTime, inputsById, endpoint => this.#readDataCondition(endpoint));
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

  #resetRuntime(machine) {
"""
if text.count(old) != 1:
    raise SystemExit('transition predicate block missing')
text = text.replace(old, new, 1)

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
    raise SystemExit('eligible transition block missing')

old = """  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    const toId = referenceId(transition.to, 'machineState');
"""
new = """  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    this.#consumeTransitionTriggers(options.match);
    const toId = referenceId(transition.to, 'machineState');
"""
if text.count(old) != 1:
    raise SystemExit('begin transition header missing')
text = text.replace(old, new, 1)

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
    raise SystemExit('interrupt begin block missing')
text = text.replace(old, new, 1)

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
      this.#consumeTransitionTriggers(match);
      const toId = referenceId(transition.to, 'machineState');
"""
if text.count(old) != 1:
    raise SystemExit('pseudo transition block missing')
text = text.replace(old, new, 1)

old = """    const transition = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (transition) this.#beginTransition(layer, runtime, transition, runtime.stateId, runtime.stateTime, inputsById, events);
"""
new = """    const selected = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (selected) this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match });
"""
if text.count(old) != 1:
    raise SystemExit('normal transition step block missing')
text = text.replace(old, new, 1)

runtime.write_text(text)


# Existing data-source test moves from observation-only to the now-defined exact
# M8 event-consumption policy. Plain endpoint reads and forks remain non-consuming.
test = ROOT / 'tests/veyra-m9-data-condition-sources.test.mjs'
text = test.read_text()
text = text.replace(
    '// M8 trigger properties are legal machine event sources. This slice observes the\n// queued pulse non-destructively; exact machine consumption is deliberately a later M9 contract.',
    '// M8 trigger properties are legal machine event sources. A selected transition now\n// consumes exactly one queued pulse; plain endpoint reads and forks remain non-consuming.',
)
old = "assert.equal(dataRuntime.getValue('inst_main', 'p_trigger'), true, 'machine observation must not silently consume an M8 trigger yet');"
new = "assert.equal(dataRuntime.getValue('inst_main', 'p_trigger'), false, 'selected transition must consume exactly one M8 trigger pulse');"
if text.count(old) != 1:
    raise SystemExit('existing M8 trigger assertion missing')
test.write_text(text.replace(old, new, 1))

print('M9 exact M8 trigger-consumption patch applied')
