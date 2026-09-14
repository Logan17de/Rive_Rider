from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def exact(path,old,new):
    text=path.read_text(); count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match, found {count}')
    path.write_text(text.replace(old,new,1))

model=ROOT/'src/veyra/model.js'
text=model.read_text()

marker="export function createMachineTransition(overrides = {}) {"
helper='''function normalizeTransitionExitTimeValue(value, path = 'transition.exitTime') {
  if (value == null || value === false) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object with unit and value.`);
  const unit = String(value.unit || '');
  if (!['seconds', 'percent'].includes(unit)) throw new TypeError(`${path}.unit must be seconds or percent.`);
  const normalized = unit === 'percent'
    ? bounded(value.value, `${path}.value`, 0, 1)
    : bounded(value.value, `${path}.value`, 0, 100000);
  return { unit, value: normalized };
}

'''
if text.count(marker)!=1: raise SystemExit('createMachineTransition marker missing')
text=text.replace(marker,helper+marker,1)

old="""    enabled: overrides.enabled !== false,
    duration,
    after: overrides.after == null ? null : finite(overrides.after, 'transition.after'),
    easing,
"""
new="""    enabled: overrides.enabled !== false,
    duration,
    after: overrides.after == null ? null : finite(overrides.after, 'transition.after'),
    exitTime: normalizeTransitionExitTimeValue(overrides.exitTime),
    pauseSource: Boolean(overrides.pauseSource),
    easing,
"""
if text.count(old)!=1: raise SystemExit('creator transition fields missing')
text=text.replace(old,new,1)

old="""  const after = transition.after == null ? null : bounded(transition.after, `${path}.after`, 0, 100000);
  const easing = String(transition.easing || 'linear');
"""
new="""  const after = transition.after == null ? null : bounded(transition.after, `${path}.after`, 0, 100000);
  const exitTime = normalizeTransitionExitTimeValue(transition.exitTime, `${path}.exitTime`);
  const pauseSource = Boolean(transition.pauseSource);
  const easing = String(transition.easing || 'linear');
"""
if text.count(old)!=1: raise SystemExit('normalizer transition timing fields missing')
text=text.replace(old,new,1)
old="return { id, from, to, enabled: transition.enabled !== false, duration, after, easing, ...(easingParams?{easingParams}:{}), conditions };"
new="return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, easing, ...(easingParams?{easingParams}:{}), conditions };"
if text.count(old)!=1: raise SystemExit('normalize transition return missing')
text=text.replace(old,new,1)

old="""  const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById));
  for(const transition of transitions){
"""
new="""  const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById));
  const statesById=new Map(states.map(state=>[state.id,state]));
  for(const transition of transitions){
    const source=statesById.get(referenceId(transition.from,'machineState'));
    if(transition.exitTime && source && ['entry','any','exit'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id}.exitTime is not meaningful for ${source.type} pseudo-states.`);
"""
if text.count(old)!=1: raise SystemExit('machine layer transition loop missing')
text=text.replace(old,new,1)
model.write_text(text)

runtime=ROOT/'src/veyra/stateMachine.js'
text=runtime.read_text()

old="""function timelineEndSeconds(document, timelineId) {
  const timeline = timelineById(document, timelineId);
  if (!timeline) return 0;
  return Number(timeline.workEnd ?? timeline.duration) / Number(timeline.fps || 1);
}
"""
new=old+'''\nfunction statePlaybackDurationSeconds(document, state) {
  if (!state) return null;
  const speed = Math.abs(stateSpeed(state));
  if (!(speed > 0)) return null;
  if (state.type === 'animation' && state.timeline) {
    return timelineEndSeconds(document, referenceId(state.timeline, 'timeline')) / speed;
  }
  if (state.type === 'blend1d' || state.type === 'directBlend') {
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
'''
if text.count(old)!=1: raise SystemExit('timelineEndSeconds block missing')
text=text.replace(old,new,1)

old="""  const { transitionId, fromId, toId, duration, easing, easingParams } = runtime.transition;
  const progress = transitionProgress(runtime.transition, runtime.stateTime);
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    easing: easing || 'linear',
"""
new="""  const { transitionId, fromId, toId, duration, easing, easingParams, exitTime, pauseSource } = runtime.transition;
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
if text.count(old)!=1: raise SystemExit('transitionView metadata block missing')
text=text.replace(old,new,1)

old="""      (layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])]),
"""
new="""      (layer.transitions || []).map(transition => [transition.id, referenceId(transition.from, 'machineState'), referenceId(transition.to, 'machineState'), transition.enabled !== false, transition.duration, transition.after, transition.exitTime || null, Boolean(transition.pauseSource), transition.easing || 'linear', transition.easingParams || null, (transition.conditions || []).map(condition => [condition.id, referenceId(condition.input, 'machineInput'), condition.op, condition.value])]),
"""
if text.count(old)!=1: raise SystemExit('machine signature transition entry missing')
text=text.replace(old,new,1)

old="""      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      if (!transitionSatisfied(transition, runtime.stateTime, inputsById)) continue;
      const fromId = runtime.stateId;
"""
new="""      this.#stats.transitionConditionEvaluations += (transition.conditions || []).length;
      const sourceState = stateById(layer, runtime.stateId);
      if (!transitionExitTimeSatisfied(this.#document, transition, sourceState, runtime.stateTime)) continue;
      if (!transitionSatisfied(transition, runtime.stateTime, inputsById)) continue;
      const fromId = runtime.stateId;
"""
if text.count(old)!=1: raise SystemExit('stepLayer candidate gate missing')
text=text.replace(old,new,1)

old="runtime.transition = { transitionId: transition.id, fromId, toId, duration: transition.duration, startedAt: runtime.stateTime, easing: transition.easing || 'linear', ...(transition.easingParams ? { easingParams: cloneValue(transition.easingParams) } : {}) };"
new="runtime.transition = { transitionId: transition.id, fromId, toId, duration: transition.duration, startedAt: runtime.stateTime, sourceTimeAtStart: runtime.stateTime, exitTime: cloneValue(transition.exitTime || null), pauseSource: Boolean(transition.pauseSource), easing: transition.easing || 'linear', ...(transition.easingParams ? { easingParams: cloneValue(transition.easingParams) } : {}) };"
if text.count(old)!=1: raise SystemExit('timed transition assignment missing')
text=text.replace(old,new,1)

old="""      const outgoing = this.#steadyStateContributions(stateById(layer, fromId), runtime.stateTime, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress), transitionRole: 'outgoing' }));
"""
new="""      const outgoingTime = runtime.transition.pauseSource ? runtime.transition.sourceTimeAtStart : runtime.stateTime;
      const outgoing = this.#steadyStateContributions(stateById(layer, fromId), outgoingTime, inputsById)
        .map(item => ({ ...item, effectiveWeight: Number(item.effectiveWeight ?? item.weight ?? 1) * (1-progress), transitionRole: 'outgoing' }));
"""
if text.count(old)!=1: raise SystemExit('outgoing transition contributions missing')
text=text.replace(old,new,1)
runtime.write_text(text)
print('M9 exit-time/pause-source patch applied')
