from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def once(path,old,new):
    text=path.read_text(); count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match, got {count}: {old[:100]}')
    path.write_text(text.replace(old,new,1))

model=ROOT/'src/veyra/model.js'
once(model,
"""  return {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    type,
    timeline,
  };
""",
"""  return {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    type,
    timeline,
    speed: bounded(overrides.speed ?? 1, 'state.speed', -100, 100),
    caption: String(overrides.caption ?? ''),
    graph: overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)
      ? { x: finite(overrides.graph.x ?? 0, 'state.graph.x'), y: finite(overrides.graph.y ?? 0, 'state.graph.y') }
      : { x: 0, y: 0 },
  };
""
)
once(model,
"""  const timeline = requiredReference(state?.timeline ?? state?.timelineId, 'timeline', `${path}.timeline`);
  if (!timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  return { id, name: String(state.name || ''), type, timeline };
""",
"""  const timeline = requiredReference(state?.timeline ?? state?.timelineId, 'timeline', `${path}.timeline`);
  if (!timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  const speed = bounded(state?.speed ?? 1, `${path}.speed`, -100, 100);
  const graph = state?.graph && typeof state.graph === 'object' && !Array.isArray(state.graph)
    ? { x: finite(state.graph.x ?? 0, `${path}.graph.x`), y: finite(state.graph.y ?? 0, `${path}.graph.y`) }
    : { x: 0, y: 0 };
  return { id, name: String(state.name || ''), type, timeline, speed, caption: String(state?.caption ?? ''), graph };
""
)

sm=ROOT/'src/veyra/stateMachine.js'
once(sm,
"import { cloneValue, machineById } from './model.js';",
"import { cloneValue, machineById, timelineById } from './model.js';"
)
# State identity now includes playback direction/rate? Speed is deliberately not
# structural: live edits apply immediately without resetting state/transition time.
once(sm,
"""function transitionSatisfied(transition, stateTime, inputsById) {
  if (transition.after != null && stateTime < transition.after) return false;
  for (const condition of transition.conditions) {
    if (!evaluateCondition(condition, inputsById)) return false;
  }
  return true;
}
""",
"""function transitionSatisfied(transition, stateTime, inputsById) {
  if (transition.after != null && stateTime < transition.after) return false;
  for (const condition of transition.conditions) {
    if (!evaluateCondition(condition, inputsById)) return false;
  }
  return true;
}

function stateTimelineTime(document, state, elapsedSeconds) {
  const speed = Number(state?.speed ?? 1);
  if (!Number.isFinite(speed)) return elapsedSeconds;
  if (speed >= 0) return elapsedSeconds * speed;
  const timeline = state?.timeline ? timelineById(document, referenceId(state.timeline, 'timeline')) : null;
  if (!timeline) return 0;
  const durationSeconds = timeline.fps > 0 ? timeline.duration / timeline.fps : 0;
  return durationSeconds + elapsedSeconds * speed;
}
""
)
once(sm,
"""          timelineId: referenceId(outgoing.timeline, 'timeline'),
          time: this.#stateTime,
          weight: 1,
""",
"""          timelineId: referenceId(outgoing.timeline, 'timeline'),
          time: stateTimelineTime(this.#document, outgoing, this.#stateTime),
          weight: 1,
""
)
once(sm,
"""          timelineId: referenceId(incoming.timeline, 'timeline'),
          time: elapsed,
          weight: progress,
""",
"""          timelineId: referenceId(incoming.timeline, 'timeline'),
          time: stateTimelineTime(this.#document, incoming, elapsed),
          weight: progress,
""
)
once(sm,
"""          timelineId: referenceId(current.timeline, 'timeline'),
          time: this.#stateTime,
          weight: 1,
""",
"""          timelineId: referenceId(current.timeline, 'timeline'),
          time: stateTimelineTime(this.#document, current, this.#stateTime),
          weight: 1,
""
)

summary=ROOT/'src/veyra/summary.js'
once(summary,
"""        type: state.type,
        timeline: state.timeline
          ? createTimelineRef(referenceId(state.timeline, 'timeline'))
          : null,
""",
"""        type: state.type,
        speed: state.speed,
        caption: state.caption,
        graph: cloneValue(state.graph),
        timeline: state.timeline
          ? createTimelineRef(referenceId(state.timeline, 'timeline'))
          : null,
""
)

print('M9 state speed/reverse patch applied')
