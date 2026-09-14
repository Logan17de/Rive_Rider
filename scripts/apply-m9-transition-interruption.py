from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def exact(path, old, new):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    path.write_text(text.replace(old, new, 1))


model = ROOT / 'src/veyra/model.js'
text = model.read_text()

old = """    exitTime: normalizeTransitionExitTimeValue(overrides.exitTime),
    pauseSource: Boolean(overrides.pauseSource),
    easing,
"""
new = """    exitTime: normalizeTransitionExitTimeValue(overrides.exitTime),
    pauseSource: Boolean(overrides.pauseSource),
    allowExitDuringTransition: Boolean(overrides.allowExitDuringTransition),
    easing,
"""
if text.count(old) != 1:
    raise SystemExit('creator transition timing fields missing')
text = text.replace(old, new, 1)

old = """  const exitTime = normalizeTransitionExitTimeValue(transition.exitTime, `${path}.exitTime`);
  const pauseSource = Boolean(transition.pauseSource);
  const easing = String(transition.easing || 'linear');
"""
new = """  const exitTime = normalizeTransitionExitTimeValue(transition.exitTime, `${path}.exitTime`);
  const pauseSource = Boolean(transition.pauseSource);
  const allowExitDuringTransition = Boolean(transition.allowExitDuringTransition);
  const easing = String(transition.easing || 'linear');
"""
if text.count(old) != 1:
    raise SystemExit('normalizer transition timing fields missing')
text = text.replace(old, new, 1)

old = "return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, easing, ...(easingParams?{easingParams}:{}), conditions };"
new = "return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, easing, ...(easingParams?{easingParams}:{}), conditions };"
if text.count(old) != 1:
    raise SystemExit('normalize transition return missing')
text = text.replace(old, new, 1)
model.write_text(text)

runtime = ROOT / 'src/veyra/stateMachine.js'
text = runtime.read_text()

old = "(layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.exitTime || null, Boolean(transition.pauseSource), transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])]),"
new = "(layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.exitTime || null, Boolean(transition.pauseSource), Boolean(transition.allowExitDuringTransition), transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])]),"
if text.count(old) != 1:
    raise SystemExit('machine signature transition entry missing')
text = text.replace(old, new, 1)

old = """  const { transitionId, fromId, toId, duration, easing, easingParams, exitTime, pauseSource } = runtime.transition;
  const progress = transitionProgress(runtime.transition, runtime.stateTime);
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    exitTime: cloneValue(exitTime || null),
    pauseSource: Boolean(pauseSource),
    easing: easing || 'linear',
"""
new = """  const { transitionId, fromId, toId, duration, easing, easingParams, exitTime, pauseSource, allowExitDuringTransition } = runtime.transition;
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
    easing: easing || 'linear',
"""
if text.count(old) != 1:
    raise SystemExit('transitionView metadata block missing')
text = text.replace(old, new, 1)

pattern = re.compile(r"  #transitionCandidates\(layer, runtime\) \{.*?\n  \}\n\n  #resolveImmediatePseudo", re.S)
replacement = '''  #transitionCandidates(layer, stateId) {
    const anyIds = new Set((layer.states || []).filter(state => state.type === 'any').map(state => state.id));
    return (layer.transitions || []).filter(transition => {
      const fromId = referenceId(transition.from, 'machineState');
      return fromId === stateId || anyIds.has(fromId);
    });
  }

  #eligibleTransitionForState(layer, stateId, stateTime, inputsById) {
    const sourceState = stateById(layer, stateId);
    for (const transition of this.#transitionCandidates(layer, stateId)) {
      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, stateTime)) continue;
      if (!transitionSatisfied(transition, stateTime, inputsById)) continue;
      return transition;
    }
    return null;
  }

  #beginTransition(layer, runtime, transition, sourceStateId, sourceStateTime, inputsById, events, options = {}) {
    const toId = referenceId(transition.to, 'machineState');
    const target = stateById(layer, toId);
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
      events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
      return;
    }
    events.push({ type: 'transition-start', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
    runtime.stateId = target?.type === 'exit' ? null : toId;
    runtime.stateTime = 0;
    runtime.transition = null;
    events.push({ type: 'transition-end', transitionId: transition.id, fromId: sourceStateId, toId, layerId: layer.id });
    this.#resolveImmediatePseudo(layer, runtime, inputsById, events);
  }

  #interruptTransition(layer, runtime, inputsById, events) {
    const active = runtime.transition;
    if (!active?.allowExitDuringTransition) return false;
    const sourceStateId = active.toId;
    const sourceStateTime = runtime.stateTime - active.startedAt;
    const next = this.#eligibleTransitionForState(layer, sourceStateId, sourceStateTime, inputsById);
    if (!next) return false;
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
    this.#beginTransition(layer, runtime, next, sourceStateId, sourceStateTime, inputsById, events, {
      sourceSnapshot,
      interruptedFromTransitionId: active.transitionId,
    });
    return true;
  }

  #resolveImmediatePseudo'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('transition candidate block missing')

pattern = re.compile(r"  #stepLayer\(layer, runtime, delta, inputsById, events\) \{.*?\n  \}\n\n  step\(deltaSeconds\)", re.S)
replacement = '''  #stepLayer(layer, runtime, delta, inputsById, events) {
    if (layer.enabled === false) return;
    if (!runtime.stateId && !runtime.transition) return;
    if (runtime.transition) {
      runtime.stateTime += delta;
      if (runtime.stateTime - runtime.transition.startedAt >= runtime.transition.duration - 1e-9) {
        this.#completeTransition(layer, runtime, events);
        return;
      }
      this.#interruptTransition(layer, runtime, inputsById, events);
      return;
    }
    runtime.stateTime += delta;
    const transition = this.#eligibleTransitionForState(layer, runtime.stateId, runtime.stateTime, inputsById);
    if (transition) this.#beginTransition(layer, runtime, transition, runtime.stateId, runtime.stateTime, inputsById, events);
  }

  step(deltaSeconds)'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('stepLayer block missing')

old = """      const outgoingTime = runtime.transition.pauseSource ? runtime.transition.sourceTimeAtStart : runtime.stateTime;
      const outgoing = this.#steadyStateContributions(stateById(layer, fromId), outgoingTime, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress), transitionRole: 'outgoing' }));
"""
new = """      const outgoingTime = runtime.transition.pauseSource ? runtime.transition.sourceTimeAtStart : runtime.stateTime;
      const outgoingBase = Array.isArray(runtime.transition.sourceSnapshot)
        ? cloneValue(runtime.transition.sourceSnapshot)
        : this.#steadyStateContributions(stateById(layer, fromId), outgoingTime, inputsById);
      const outgoing = outgoingBase
        .map(item => ({
          ...item,
          effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress),
          transitionRole: Array.isArray(runtime.transition.sourceSnapshot) ? 'interrupted-snapshot' : 'outgoing',
        }));
"""
if text.count(old) != 1:
    raise SystemExit('outgoing transition contribution block missing')
text = text.replace(old, new, 1)

runtime.write_text(text)
print('M9 allow-exit transition interruption patch applied')
