from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def one(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

# ---- model.js --------------------------------------------------------------
model = ROOT / 'src/veyra/model.js'
text = model.read_text()

# Creator: optional state-level Randomize Exit flag, forbidden on pseudo states.
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
  const actions = (overrides.actions || []).map(createMachineAction);
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
    ...(overrides.randomizeExit ? { randomizeExit: true } : {}),
  };
  if (result.randomizeExit && ['entry', 'exit', 'any'].includes(type)) throw new TypeError(`${type} pseudo-states cannot enable Randomize Exit.`);
  const actions = (overrides.actions || []).map(createMachineAction);
"""
text = one(text, old, new, 'create state randomize flag')

# Creator: optional positive transition weight.
old = """    pauseSource: Boolean(overrides.pauseSource),
    allowExitDuringTransition: Boolean(overrides.allowExitDuringTransition),
    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
"""
new = """    pauseSource: Boolean(overrides.pauseSource),
    allowExitDuringTransition: Boolean(overrides.allowExitDuringTransition),
    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
  if (overrides.randomWeight != null) {
    const randomWeight = finite(overrides.randomWeight, 'transition.randomWeight');
    if (!(randomWeight > 0)) throw new RangeError('transition.randomWeight must be positive.');
    transition.randomWeight = randomWeight;
  }
"""
text = one(text, old, new, 'create transition random weight')

# Normalizer: persist state flag only when enabled and reject pseudo states.
old = """  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph };
  if (timeline) result.timeline = timeline;
"""
new = """  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph, ...(state.randomizeExit ? { randomizeExit: true } : {}) };
  if (result.randomizeExit && ['entry', 'exit', 'any'].includes(type)) throw new TypeError(`${path}.${type} pseudo-state cannot enable Randomize Exit.`);
  if (timeline) result.timeline = timeline;
"""
text = one(text, old, new, 'normalize state randomize flag')

# Normalizer: optional positive finite weight.
old = """  const pauseSource = Boolean(transition.pauseSource);
  const allowExitDuringTransition = Boolean(transition.allowExitDuringTransition);
  const easing = String(transition.easing || 'linear');
"""
new = """  const pauseSource = Boolean(transition.pauseSource);
  const allowExitDuringTransition = Boolean(transition.allowExitDuringTransition);
  let randomWeight;
  if (transition.randomWeight != null) {
    randomWeight = finite(transition.randomWeight, `${path}.randomWeight`);
    if (!(randomWeight > 0)) throw new RangeError(`${path}.randomWeight must be positive.`);
  }
  const easing = String(transition.easing || 'linear');
"""
text = one(text, old, new, 'normalize transition random weight declaration')
old = "return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, easing, ...(easingParams?{easingParams}:{}), conditions, ...(actions.length?{actions}: {}) };"
new = "return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, ...(randomWeight != null ? { randomWeight } : {}), easing, ...(easingParams?{easingParams}:{}), conditions, ...(actions.length?{actions}: {}) };"
text = one(text, old, new, 'normalize transition random weight return')

model.write_text(text)

# ---- stateMachine.js -------------------------------------------------------
runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()

# Stable seed utilities: no global random source.
needle = "const NO_MACHINE = 'no-machine';\n"
insert = """const NO_MACHINE = 'no-machine';
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
"""
if text.count(needle) != 1:
    raise SystemExit('NO_MACHINE seed insertion point missing')
text = text.replace(needle, insert, 1)

# Signature tracks Randomize Exit and path weights.
old = "(layer.states || []).map(state => [state.id, state.type, state.actions || []]),"
new = "(layer.states || []).map(state => [state.id, state.type, Boolean(state.randomizeExit), state.actions || []]),"
text = one(text, old, new, 'randomize state signature')
old = "Boolean(transition.allowExitDuringTransition), transition.easing || 'linear'"
new = "Boolean(transition.allowExitDuringTransition), transition.randomWeight ?? null, transition.easing || 'linear'"
text = one(text, old, new, 'random weight signature')

# Capabilities advertise deterministic Randomize Exit.
old = """  actionPhases: Object.freeze(['state-start', 'state-end', 'transition-start', 'transition-end']),
  graph: Object.freeze([
"""
new = """  actionPhases: Object.freeze(['state-start', 'state-end', 'transition-start', 'transition-end']),
  randomizeExit: Object.freeze({ weighted: true, seeded: true, source: 'runtime-option', globalRandom: false }),
  graph: Object.freeze([
"""
text = one(text, old, new, 'randomize capability')

# Runtime PRNG fields/counters.
old = """  #dataRuntime = null;
  #runtimeScopePath = [];
  #signature = NO_MACHINE;
"""
new = """  #dataRuntime = null;
  #runtimeScopePath = [];
  #randomSeed = 0;
  #randomState = 0;
  #signature = NO_MACHINE;
"""
text = one(text, old, new, 'random runtime fields')
old = """    actionErrors: 0,
    timelineEvaluations: 0,
"""
new = """    actionErrors: 0,
    randomDecisions: 0,
    randomCandidatesEvaluated: 0,
    timelineEvaluations: 0,
"""
text = one(text, old, new, 'initial random counters')
old = """      actionErrors: 0,
      timelineEvaluations: 0,
"""
new = """      actionErrors: 0,
      randomDecisions: 0,
      randomCandidatesEvaluated: 0,
      timelineEvaluations: 0,
"""
text = one(text, old, new, 'reset random counters')

# Constructor initializes configured seed before runtime reset.
old = """    this.#machineId = String(machineId || '');
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(documentOrGetter);
    this.#runtimeScopePath = createDataRuntimeScope(options.runtimeScopePath ?? options.scopePath ?? []).path;
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
"""
new = """    this.#machineId = String(machineId || '');
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(documentOrGetter);
    this.#runtimeScopePath = createDataRuntimeScope(options.runtimeScopePath ?? options.scopePath ?? []).path;
    this.#randomSeed = normalizeRandomSeed(options.randomSeed, this.#machineId);
    this.#randomState = this.#randomSeed;
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
"""
text = one(text, old, new, 'random seed constructor')

# Fork clones seed and current PRNG state.
old = """    const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId, { dataRuntime: this.#dataRuntime.fork(), runtimeScopePath: this.#runtimeScopePath });
    snapshot.#overrideValues = new Map([...this.#overrideValues].map(([key, value]) => [key, cloneValue(value)]));
"""
new = """    const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId, { dataRuntime: this.#dataRuntime.fork(), runtimeScopePath: this.#runtimeScopePath, randomSeed: this.#randomSeed });
    snapshot.#randomState = this.#randomState;
    snapshot.#overrideValues = new Map([...this.#overrideValues].map(([key, value]) => [key, cloneValue(value)]));
"""
text = one(text, old, new, 'fork random state')

# Random choice helper before transition candidate selection.
needle = """  #transitionCandidates(layer, stateId) {
    const anyIds = new Set((layer.states || []).filter(state => state.type === 'any').map(state => state.id));
    return (layer.transitions || []).filter(transition => {
      const fromId = referenceId(transition.from, 'machineState');
      return fromId === stateId || anyIds.has(fromId);
    });
  }

"""
insert = needle + """  #weightedTransitionChoice(matches) {
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

"""
if text.count(needle) != 1:
    raise SystemExit('weighted choice insertion point missing')
text = text.replace(needle, insert, 1)

# Eligible transition selection: state-specific weighted paths; Any remains deterministic fallback.
pattern = re.compile(r"  #eligibleTransitionForState\(layer, stateId, stateTime, inputsById\) \{.*?\n  \}\n\n  #beginTransition", re.S)
replacement = '''  #eligibleTransitionForState(layer, stateId, stateTime, inputsById) {
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

  #beginTransition'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('eligible transition randomization replacement failed')

# Transition start evidence carries deterministic decision; timed transition retains it.
old = """    events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
    this.#runActions(transition, 'transition-start', layer, inputsById, events, { stateId: sourceStateId, transitionId: transition.id });
"""
new = """    events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id, ...(options.randomDecision ? { randomDecision: cloneValue(options.randomDecision) } : {}) });
    this.#runActions(transition, 'transition-start', layer, inputsById, events, { stateId: sourceStateId, transitionId: transition.id });
"""
text = one(text, old, new, 'transition random decision event')
old = """        ...(options.interruptedFromTransitionId ? { interruptedFromTransitionId: options.interruptedFromTransitionId } : {}),
      };
"""
new = """        ...(options.interruptedFromTransitionId ? { interruptedFromTransitionId: options.interruptedFromTransitionId } : {}),
        ...(options.randomDecision ? { randomDecision: cloneValue(options.randomDecision) } : {}),
      };
"""
text = one(text, old, new, 'timed transition random decision state')

# Interruptions and normal starts forward decision evidence.
old = """    const { transition: next, match } = selected;
    const sourceSnapshot = this.#stateTimelineContributions(layer, runtime, inputsById);
"""
new = """    const { transition: next, match, randomDecision } = selected;
    const sourceSnapshot = this.#stateTimelineContributions(layer, runtime, inputsById);
"""
text = one(text, old, new, 'interrupt random decision destructure')
old = """      match,
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
"""
new = """      match,
      randomDecision,
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
"""
text = one(text, old, new, 'interrupt random decision forward')
old = "if (selected) this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match });"
new = "if (selected) this.#beginTransition(layer, runtime, selected.transition, runtime.stateId, runtime.stateTime, inputsById, events, { match: selected.match, randomDecision: selected.randomDecision });"
text = one(text, old, new, 'normal random decision forward')

# Transition view exposes retained decision during timed transitions.
old = """    interruptedFromTransitionId: runtime.transition.interruptedFromTransitionId || null,
    easing: easing || 'linear',
"""
new = """    interruptedFromTransitionId: runtime.transition.interruptedFromTransitionId || null,
    randomDecision: cloneValue(runtime.transition.randomDecision || null),
    easing: easing || 'linear',
"""
text = one(text, old, new, 'transition view random evidence')

# Reset/reconcile replay contract restarts PRNG at configured seed.
old = """  #resetRuntime(machine) {
    this.#overrideValues = new Map();
    this.#layers = new Map();
"""
new = """  #resetRuntime(machine) {
    this.#overrideValues = new Map();
    this.#layers = new Map();
    this.#randomState = this.#randomSeed;
"""
text = one(text, old, new, 'reset random state')

runtime.write_text(text)
print('M9 deterministic Randomize Exit patch applied')
