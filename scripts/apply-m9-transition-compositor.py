from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def exact(path,old,new):
    text=path.read_text()
    count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one exact match, found {count}')
    path.write_text(text.replace(old,new,1))

model=ROOT/'src/veyra/model.js'
text=model.read_text()

# Creator: persist enabled + interpolation metadata while preserving legacy defaults.
pattern=re.compile(r"export function createMachineTransition\(overrides = \{\}\) \{.*?\n\}\n\nexport function createStateMachine",re.S)
replacement='''export function createMachineTransition(overrides = {}) {
  const from = normalizeReference(overrides.from, 'machineState', 'transition.from');
  const to = normalizeReference(overrides.to, 'machineState', 'transition.to');
  if (!from || !to) throw new TypeError('transitions require from and to state references.');
  if (from.id === to.id) throw new TypeError('transitions cannot target the same state.');
  const duration = finite(overrides.duration ?? 0, 'transition.duration');
  if (duration < 0) throw new RangeError('transition.duration must be zero or positive.');
  const easing = String(overrides.easing || 'linear');
  if (!VEYRA_EASING_TYPES.includes(easing)) throw new TypeError(`transition.easing must be one of ${VEYRA_EASING_TYPES.join(', ')}.`);
  const transition = {
    id: overrides.id || createId('machineTransition'),
    from,
    to,
    enabled: overrides.enabled !== false,
    duration,
    after: overrides.after == null ? null : finite(overrides.after, 'transition.after'),
    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
  if (easing === 'cubic-bezier') {
    if (!Array.isArray(overrides.easingParams) || overrides.easingParams.length !== 4) throw new TypeError('transition.easingParams must contain four values for cubic-bezier.');
    transition.easingParams = overrides.easingParams.map((value,index)=>bounded(value,`transition.easingParams[${index}]`,0,1));
  }
  if (transition.after !== null && transition.after < 0) {
    throw new RangeError('transition.after must be zero or positive.');
  }
  return transition;
}

export function createStateMachine'''
text,count=pattern.subn(replacement,text,count=1)
if count!=1: raise SystemExit(f'{model}: createMachineTransition block not found')

# Canonical normalization uses the same interpolation contract.
pattern=re.compile(r"function normalizeMachineTransition\(transition, index, layerPath, stateIds, inputsById\) \{.*?\n\}\n\nfunction normalizeMachineLayer",re.S)
replacement='''function normalizeMachineTransition(transition, index, layerPath, stateIds, inputsById) {
  const path = `${layerPath}.transitions[${index}]`;
  const id = String(transition?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const from = requiredReference(transition?.from, 'machineState', `${path}.from`);
  const to = requiredReference(transition?.to, 'machineState', `${path}.to`);
  for (const reference of [from,to]) if (!stateIds.has(referenceId(reference,'machineState'))) throw new TypeError(`${path} references missing machine state ${referenceId(reference,'machineState')}.`);
  if (from.id === to.id) throw new TypeError(`${path} cannot target the same state.`);
  const duration = bounded(transition.duration ?? 0, `${path}.duration`, 0, 10000);
  const after = transition.after == null ? null : bounded(transition.after, `${path}.after`, 0, 100000);
  const easing = String(transition.easing || 'linear');
  if (!VEYRA_EASING_TYPES.includes(easing)) throw new TypeError(`${path}.easing must be one of ${VEYRA_EASING_TYPES.join(', ')}.`);
  let easingParams;
  if (easing === 'cubic-bezier') {
    if (!Array.isArray(transition.easingParams) || transition.easingParams.length !== 4) throw new TypeError(`${path}.easingParams must contain four values for cubic-bezier.`);
    easingParams=transition.easingParams.map((value,i)=>bounded(value,`${path}.easingParams[${i}]`,0,1));
  }
  if (transition.conditions !== undefined && transition.conditions !== null && !Array.isArray(transition.conditions)) throw new TypeError(`${path}.conditions must be an array of conditions.`);
  const conditions=(Array.isArray(transition.conditions)?transition.conditions:[]).map((condition,i)=>normalizeMachineCondition(condition,`${path}.conditions[${i}]`,inputsById));
  return { id, from, to, enabled: transition.enabled !== false, duration, after, easing, ...(easingParams?{easingParams}:{}), conditions };
}

function normalizeMachineLayer'''
text,count=pattern.subn(replacement,text,count=1)
if count!=1: raise SystemExit(f'{model}: normalizeMachineTransition block not found')

# The compositor now supports animation <-> blend and blend <-> blend transitions.
text,count=re.subn(r"\n  const blendIds=new Set\(states\.filter\(state=>\['blend1d','directBlend'\]\.includes\(state\.type\)\)\.map\(state=>state\.id\)\);\n  for\(const transition of transitions\) if\(blendIds\.has\(referenceId\(transition\.from,'machineState'\)\) \|\| blendIds\.has\(referenceId\(transition\.to,'machineState'\)\)\) throw new TypeError\(`\$\{path\} transitions to/from blend states are not yet supported by the canonical transition compositor\.`\);",'',text,count=1)
if count!=1: raise SystemExit(f'{model}: blend transition restriction not found')
model.write_text(text)

runtime=ROOT/'src/veyra/stateMachine.js'
exact(runtime,"import { evaluateTimelines } from './animation.js';","import { evaluateTimelines, applyEasing } from './animation.js';")
text=runtime.read_text()

# Transition debugging exposes raw and eased progress.
pattern=re.compile(r"function transitionView\(runtime\) \{.*?\n\}",re.S)
replacement='''function transitionProgress(transition, stateTime) {
  if (!transition) return { raw: 0, eased: 0 };
  const elapsed = stateTime - transition.startedAt;
  const raw = transition.duration > 0 ? Math.min(1, Math.max(0, elapsed / transition.duration)) : 1;
  return { raw, eased: applyEasing(raw, transition.easing || 'linear', transition.easingParams) };
}

function transitionView(runtime) {
  if (!runtime?.transition) return null;
  const { transitionId, fromId, toId, duration, easing, easingParams } = runtime.transition;
  const progress = transitionProgress(runtime.transition, runtime.stateTime);
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    easing: easing || 'linear',
    ...(easingParams ? { easingParams: cloneValue(easingParams) } : {}),
    rawProgress: progress.raw,
    progress: progress.eased,
  };
}'''
text,count=pattern.subn(replacement,text,count=1)
if count!=1: raise SystemExit(f'{runtime}: transitionView block not found')

# Store interpolation metadata when a timed transition starts.
old="runtime.transition = { transitionId: transition.id, fromId, toId, duration: transition.duration, startedAt: runtime.stateTime };"
new="runtime.transition = { transitionId: transition.id, fromId, toId, duration: transition.duration, startedAt: runtime.stateTime, easing: transition.easing || 'linear', ...(transition.easingParams ? { easingParams: cloneValue(transition.easingParams) } : {}) };"
if text.count(old)!=1: raise SystemExit(f'{runtime}: timed transition assignment not found')
text=text.replace(old,new,1)

# Authored edits to transition behavior invalidate runtime state deterministically.
old="(layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState')]),"
new="(layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])]),"
if text.count(old)!=1: raise SystemExit(f'{runtime}: machine signature transition entry not found')
text=text.replace(old,new,1)

# Convert desired absolute weights into the sequential interpolation weights used
# by evaluateTimelines. This works for N->M blend transitions and for fading to
# authored values when one side contributes no timeline.
marker="  #stateTimelineContributions(layer, runtime, inputsById) {"
if marker not in text: raise SystemExit(f'{runtime}: state contribution marker not found')
helper='''  #composeWeightedContributions(items) {
    const desired = items
      .map(item => ({ ...item, effectiveWeight: Math.max(0, Math.min(1, Number(item.effectiveWeight ?? item.weight ?? 0))) }))
      .filter(item => item.effectiveWeight > 1e-12);
    const total = desired.reduce((sum,item)=>sum+item.effectiveWeight,0);
    const base = Math.max(0, 1-total);
    let cumulative = base;
    return desired.map(item => {
      cumulative += item.effectiveWeight;
      return { ...item, weight: cumulative > 0 ? item.effectiveWeight / cumulative : 0 };
    });
  }

'''
text=text.replace(marker,helper+marker,1)

pattern=re.compile(r"  #stateTimelineContributions\(layer, runtime, inputsById\) \{.*?\n  \}\n\n  evaluate\(\)",re.S)
replacement='''  #stateTimelineContributions(layer, runtime, inputsById) {
    if (runtime.transition) {
      const { fromId, toId, startedAt } = runtime.transition;
      const elapsed = runtime.stateTime - startedAt;
      const progress = transitionProgress(runtime.transition, runtime.stateTime).eased;
      const outgoing = this.#steadyStateContributions(stateById(layer, fromId), runtime.stateTime, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress), transitionRole: 'outgoing' }));
      const incoming = this.#steadyStateContributions(stateById(layer, toId), elapsed, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * progress, transitionRole: 'incoming' }));
      return this.#composeWeightedContributions([...outgoing, ...incoming]);
    }
    return this.#steadyStateContributions(stateById(layer, runtime.stateId), runtime.stateTime, inputsById);
  }

  evaluate()'''
text,count=pattern.subn(replacement,text,count=1)
if count!=1: raise SystemExit(f'{runtime}: #stateTimelineContributions block not found')

runtime.write_text(text)
print('M9 transition compositor patch applied')
