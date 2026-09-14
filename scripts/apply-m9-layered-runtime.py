from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    text=path.read_text()
    count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match for {old[:60]!r}, found {count}')
    path.write_text(text.replace(old,new,1))

model=ROOT/'src/veyra/model.js'
replace_once(model,
    "export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['animation']);",
    "export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['entry', 'exit', 'any', 'animation']);")

text=model.read_text()
create_pattern=re.compile(r"export function createMachineState\(overrides = \{\}\) \{.*?\n\}\n\nexport function createMachineTransition", re.S)
create_replacement='''export function createMachineState(overrides = {}) {
  const type = String(overrides.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`Unsupported machine state type: ${type}`);
  const timelineValue = overrides.timeline ?? overrides.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : normalizeReference(timelineValue, 'timeline', 'state.timeline');
  if (type === 'animation' && !timeline) throw new TypeError('animation states require a timeline reference.');
  if (['entry', 'exit', 'any'].includes(type) && timeline) throw new TypeError(`${type} pseudo-states cannot own a timeline.`);
  const speed = finite(overrides.speed ?? 1, 'state.speed');
  if (speed === 0) throw new TypeError('state.speed cannot be zero.');
  const graph = overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)
    ? { x: finite(overrides.graph.x ?? 0, 'state.graph.x'), y: finite(overrides.graph.y ?? 0, 'state.graph.y') }
    : { x: 0, y: 0 };
  return {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    displayNameAdvisory: true,
    caption: String(overrides.caption ?? ''),
    type,
    ...(timeline ? { timeline } : {}),
    speed,
    graph,
  };
}

export function createMachineTransition'''
text,count=create_pattern.subn(create_replacement,text,count=1)
if count!=1: raise SystemExit('createMachineState block not found')
model.write_text(text)

text=model.read_text()
normalize_pattern=re.compile(r"function normalizeMachineState\(state, index, layerPath, timelineIds\) \{.*?\n\}\n\nfunction normalizeMachineTransition", re.S)
normalize_replacement='''function normalizeMachineState(state, index, layerPath, timelineIds) {
  const path = `${layerPath}.states[${index}]`;
  const id = String(state?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const type = String(state?.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`${path}.type must be a valid machine state type.`);
  const timelineValue = state?.timeline ?? state?.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : requiredReference(timelineValue, 'timeline', `${path}.timeline`);
  if (type === 'animation' && !timeline) throw new TypeError(`${path}.timeline is required for animation states.`);
  if (timeline && !timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  if (['entry', 'exit', 'any'].includes(type) && timeline) throw new TypeError(`${path}.${type} pseudo-state cannot own a timeline.`);
  const speed = finite(state?.speed ?? 1, `${path}.speed`);
  if (speed === 0) throw new TypeError(`${path}.speed cannot be zero.`);
  const graph = state?.graph && typeof state.graph === 'object' && !Array.isArray(state.graph)
    ? { x: finite(state.graph.x ?? 0, `${path}.graph.x`), y: finite(state.graph.y ?? 0, `${path}.graph.y`) }
    : { x: 0, y: 0 };
  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph };
  if (timeline) result.timeline = timeline;
  return result;
}

function normalizeMachineTransition'''
text,count=normalize_pattern.subn(normalize_replacement,text,count=1)
if count!=1: raise SystemExit('normalizeMachineState block not found')
model.write_text(text)

# Existing M0-M8 creator assertion is superseded by M9 state-family support;
# preserve its intent by checking a genuinely unsupported type instead.
test=ROOT/'tests/veyra-statemachine.test.mjs'
replace_once(test,
    "  assert.throws(() => createMachineState({ name: 'Weird', type: 'entry' }), /Unsupported machine state type/);",
    "  assert.deepStrictEqual(createMachineState({ id: 'entry_state', name: 'Entry', type: 'entry' }).type, 'entry');\n  assert.throws(() => createMachineState({ name: 'Weird', type: 'unsupported' }), /Unsupported machine state type/);")

runtime=ROOT/'src/veyra/stateMachine.js'
replace_once(runtime,
    "  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend', 'additiveBlend']),",
    "  stateTypes: Object.freeze(['entry', 'exit', 'any', 'animation']),")
replace_once(runtime,
'''  reset() {
    const machine = this.#reconcile();
    if (machine) this.#resetRuntime(machine);
  }
''',
'''  reset() {
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
''')

print('M9 layered runtime model/runtime patch applied')
