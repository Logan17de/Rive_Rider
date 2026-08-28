# Veyra state machine contract

Status: implemented as Phase 3.1 (core) in `.veyra` version 3.

State machines are authored data stored in the document's root
`stateMachines` registry. A machine selects and blends the timelines already
in place — it never duplicates animation data. Runtime state (current state,
state time, input values, active transition) lives outside the document in a
per-machine `MachineRuntime`, so the document stays a pure description and
every runtime decision is reproducible by re-simulating.

This is an additive schema: legacy documents without `stateMachines`
normalize to `stateMachines: []` and keep version 3.

## State machine records

A state machine has a stable `id`, human-readable `name`, an optional
`initial` state reference, and three ordered registries — `inputs`,
`states`, `transitions`:

```json
{
  "id": "machine_button",
  "name": "Button",
  "initial": { "kind": "machineState", "id": "state_idle" },
  "inputs": [],
  "states": [],
  "transitions": []
}
```

`initial` may be `null`; the first state in the array is then the initial
state. Machines without states are legal (they evaluate to nothing).

### Inputs

Inputs are the machine's external surface. Types:

| Type      | Value  | Set how                                          |
| --------- | ------ | ------------------------------------------------ |
| `number`  | finite number | `setInput` (or authored `value` at reset)  |
| `bool`    | boolean   | `setInput` (or authored `value` at reset)        |
| `trigger` | boolean   | `fire()` only — armed until consumed by a step   |

```json
{
  "id": "input_hover",
  "name": "Hover",
  "type": "trigger",
  "value": false
}
```

Input `name`s must be unique within a machine (they are the human- and
AI-friendly address); ids are the canonical reference target. Conditions may
reference an input by id or by unique name — normalization always stores the
resolved id reference.

### States

A state has a stable `id`, `name`, a `type`, and (for `animation` states) a
required `timeline` reference into the document's `timelines` registry:

```json
{
  "id": "state_idle",
  "name": "Idle",
  "type": "animation",
  "timeline": { "kind": "timeline", "id": "timeline_idle" }
}
```

The only supported state type today is `animation`; `type` is validated
against a frozen list so entry/exit/any states can be added later without a
schema break. A state machine cannot reference a timeline that is not in the
document.

### Transitions

A transition connects two states of the same machine:

```json
{
  "id": "transition_hover",
  "from": { "kind": "machineState", "id": "state_idle" },
  "to": { "kind": "machineState", "id": "state_hovered" },
  "duration": 0.5,
  "after": null,
  "conditions": [
    { "id": "condition_hover", "input": { "kind": "machineInput", "id": "input_hover" }, "op": "fired" }
  ]
]
```

- `duration` is in **seconds** and must be ≥ 0. `0` cuts immediately with no
  blend.
- `after` (seconds, or `null`) gates the transition until the current state
  has been active for at least that long.
- `conditions` is a list of input conditions, satisfied when **all** hold.

Condition operators:

| Op        | Applies to        | Semantics                                   |
| --------- | ----------------- | ------------------------------------------- |
| `<` `<=` `>` `>=` `==` `!=` | number / bool | compare current input value to `value` |
| `fired`   | trigger only      | trigger is armed (fired since last step)    |
| `!fired`  | trigger only      | trigger is not armed                        |

`fired`/`!fired` on a non-trigger input is a validation error. Comparisons
require a `value`.

## Validation

`normalizeDocument` enforces, with the usual per-index error paths:

- unique machine ids across the document;
- unique input ids and unique non-empty input names per machine;
- unique state ids and unique transition ids per machine;
- `from`/`to`/`initial` must reference states in the same machine, and
  `from` ≠ `to`;
- condition inputs must reference an input in the same machine;
- state timelines must reference a timeline in the document;
- `duration` in `[0, 10000]`, `after` in `[0, 100000]`.

Deleting a timeline that a machine state uses is blocked by the store with a
named list of the blocking states (`store.removeTimeline` throws); deleting a
machine state cascade-removes transitions that reference it and clears
`initial` if it pointed there.

## Runtime semantics

`MachineRuntime` (created with `createMachineRuntime(documentOrGetter,
machineId)`) owns runtime state only. It re-reads the machine from the
document on every call, so pass a getter (`() => store.document`) to stay
current across edits and undo/redo.

Time is in seconds. `step(deltaSeconds)`:

1. advances state time;
2. if a blend is active and its elapsed time reaches the authored duration,
   completes it — the incoming state becomes current and **keeps the elapsed
   time it accumulated during the blend**, so its timeline continues
   seamlessly;
3. otherwise (only when no blend is active) scans outgoing transitions of
   the current state in authored order and takes the **first satisfied**
   one; `duration > 0` starts a blend, `duration === 0` cuts (state time
   resets to 0);
4. clears every armed trigger at the end of the step, whether or not a
   transition consumed one. A `fire()` is therefore single-shot: it arms the
   trigger until the next `step()`.

Transitions are sampled once per step, after the time advance; a large step
that overshoots a blend completes the blend and drops the remainder (the
machine does not re-enter transition detection inside the same step).
Determinism is per step pattern: the same step sizes and input sequence from
the same starting state always produce the same state.

### Blending

While a blend of progress `p` is active, `evaluate()` builds a timeline-state
list for `evaluateTimelines`:

- the outgoing state's timeline at full state time with weight 1;
- the incoming state's timeline at blend-elapsed time with weight `p`.

Consequences, per property address:

- driven by **both**: crossfaded `lerp(out, in, p)`;
- driven by **outgoing only**: holds the outgoing value through the blend;
- driven by **incoming only**: ramps in against its authored value with
  weight `p`.

At `p = 1` the incoming state owns every address it drives.

### API

```js
const runtime = createMachineRuntime(() => store.document, machineId);
runtime.stateId;       // current state id (null for stateless machines)
runtime.state;         // state record
runtime.stateTime;     // seconds the current state has been active
runtime.transition;    // { id, fromId, toId, duration, progress } or null
runtime.inputs;        // [{ id, name, type, value }]
runtime.setInput(nameOrId, value); // number/bool inputs
runtime.fire(nameOrId);            // arms a trigger until the next step()
runtime.step(deltaSeconds);        // → events: transition-start / transition-end
runtime.evaluate();     // → { stateId, stateName, stateTime, transition, inputs, overrides }
runtime.reset();        // initial state, authored input values, time 0
runtime.scrub(seconds); // reset + step(seconds) — deterministic re-simulation
```

`evaluate().overrides` uses the same property-address keys as
`evaluateTimelines`, so it plugs straight into
`evaluateDocument(document, { animation: overrides })` with ownership
reported as `animation`.

## AI surface

The browser editor exposes, on `globalThis.veyra` (script-source commands):

```js
veyra.getMachines();
veyra.getMachine(machineId);
veyra.createMachine({ name, inputs, states, transitions, initial });
veyra.deleteMachine(machineId);
veyra.addMachineInput(machineId, { name, type, value });
veyra.addMachineState(machineId, { name, timelineId });
veyra.removeMachineState(machineId, stateId);
veyra.addMachineTransition(machineId, { from, to, duration, after, conditions });
veyra.removeMachineTransition(machineId, transitionId);
veyra.setMachineInput(machineId, nameOrId, value);
veyra.fireMachineInput(machineId, nameOrId);
veyra.stepMachine(machineId, deltaSeconds);
veyra.getMachineState(machineId);
veyra.resetMachine(machineId);
veyra.scrubMachine(machineId, seconds);
```

`createSceneSummary` includes every machine with inputs, states, transitions,
and conditions, so an AI can plan edits from the summary alone; every
mutation goes through the transactional store, is undoable, and is recorded
in the command history with its source (`user` / `ai` / `script` /
`import`).

## Known limitations (next phases)

- Single-layer machines: no parallel layers or additive/override layer
  mixing yet.
- No entry/exit/any states (the state-type list is already reserved).
- Transitions out of the incoming state are only sampled after the blend
  completes; there is no "during transition" evaluation.
- The editor UI surface (state graph panel, input panel, per-state preview)
  is not built yet — the machine is fully addressable through the API and
  summary before that surface exists.
