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

- `duration` is in **seconds** and must be ≥ 0 (bounded 0–10000). `0` cuts
  immediately with no blend.
- `after` (seconds, or `null`) gates the transition until the current state
  has been active for at least that long (bounded 0–100000).
- `conditions` is a list of input conditions, satisfied when **all** hold.
  A present but non-array `conditions` value is a validation error — it is
  never silently emptied, because that would turn a gated transition into an
  unconditional one with no trace.

Condition operators and the **operator/type matrix**:

| Op        | Applies to        | Value rule                                        |
| --------- | ----------------- | ------------------------------------------------- |
| `<` `<=` `>` `>=` | number only | finite number `value` — on a `bool` or `trigger` input this is a validation error |
| `==` `!=` | number or bool    | `value` must match the input's own type (`bool` for a bool input, finite number for a number input) — never coerced |
| `fired`   | trigger only      | trigger is armed (fired since last step); carries no `value` |
| `!fired`  | trigger only      | trigger is not armed; carries no `value`          |

No comparison operator may gate a `trigger` input (a trigger self-clears
every step, so an equality test on one is a timing trap); `fired`/`!fired`
on a non-trigger input is a validation error; comparisons require a
`value`. Violations **throw at normalization** with the condition path, op,
and input type — a `.veyra` file can never load into a transition that can
provably never fire, and an authored value is never silently rewritten
(the old `0.5 → true` coercion is gone). The same rule is exported as
`machineConditionViolation(op, value, inputType)` from `model.js` and
reused by the store's edit commands, so loader and editor cannot drift.

## Validation

`normalizeDocument` enforces, with the usual per-index error paths:

- unique machine ids across the document;
- unique input ids and unique non-empty input names per machine;
- unique state ids and unique transition ids per machine;
- `from`/`to`/`initial` must reference states in the same machine, and
  `from` ≠ `to`;
- condition inputs must reference an input in the same machine;
- state timelines must reference a timeline in the document;
- `duration` in `[0, 10000]`, `after` in `[0, 100000]`;
- the condition operator/type matrix (table above): ordering ops against
  non-number inputs, any comparison against `trigger` inputs,
  `fired`/`!fired` against non-triggers, missing comparison values, and
  values whose type does not match the input type all throw at load;
- `conditions`, when present, must be an array — a malformed value throws
  rather than silently becoming an unconditional transition.

Deleting a timeline that a machine state uses is blocked by the store with a
named list of the blocking states (`store.removeTimeline` throws); deleting a
machine state cascade-removes transitions that reference it and clears
`initial` if it pointed there.

The in-place edit commands refuse destructive work with a named blocker list
in the same style rather than silently repairing it — because cascade-pruning
a condition makes transitions fire *more easily* than authored:

- `removeMachineInput` throws while any transition condition references the
  input (each blocker named: condition id, transition id, op);
- `updateMachineInput` throws when a `type` change would make an existing
  dependent condition illegal under the operator/type matrix;
- `updateMachineState` throws for a `timelineId` that does not exist.

All edit commands mutate **in place by stable id** (ids and transition
endpoints are immutable), so unrelated runtime positions survive cosmetic
edits, and a refused command leaves the document, revision, and command
history untouched (`execute()` rollback; refusals also pre-flight before any
mutation).

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

### Reconciliation

The runtime tracks a **structural signature** of its machine: the `initial`
reference, input ids and types, state ids, and transition ids with their
endpoints. Before every public read or mutation it re-reads the machine and
compares signatures:

- a **structural** change (anything the position is expressed in) resets the
  runtime to a valid position derived from the current record — never a
  throw, so a live preview loop survives edits, undo, and redo — and emits
  exactly one `runtime-invalidated` event per effective change;
- a **cosmetic** change (names, authored values, blend durations, `after`
  gates, condition payloads) does **not** reset the position; those parts
  are read live on every evaluation anyway;
- edits to any other part of the document never disturb this machine's
  preview;
- runtime overrides exist only for inputs explicitly set via `setInput`/
  `fire` since the last reset, so a clean input always reports its authored
  document value — `getMachine()` and `getMachineState()` can never disagree
  about an unchanged input;
- an active blend is captured as value primitives, so deleting a blend's
  endpoint states can never land the runtime on a dangling id;
- `onInvalidate(listener)` returns an unsubscribe function, and
  reconciliation never mutates the document.

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
runtime.onInvalidate(listener); // subscribe to structural resets; → unsubscribe fn
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
veyra.updateMachineInput(machineId, inputId, { name?, type?, value? });
veyra.removeMachineInput(machineId, inputId);
veyra.addMachineState(machineId, { name, timelineId });
veyra.updateMachineState(machineId, stateId, { name?, timelineId? });
veyra.removeMachineState(machineId, stateId);
veyra.addMachineTransition(machineId, { from, to, duration, after, conditions });
veyra.updateMachineTransition(machineId, transitionId, { duration?, after?, conditions? });
veyra.removeMachineTransition(machineId, transitionId);
veyra.setMachineInput(machineId, nameOrId, value);
veyra.fireMachineInput(machineId, nameOrId);
veyra.stepMachine(machineId, deltaSeconds);
veyra.getMachineState(machineId);
veyra.resetMachine(machineId);
veyra.scrubMachine(machineId, seconds);
```

`createSceneSummary` includes every machine with its `capabilities` (the
single `VEYRA_MACHINE_CAPABILITIES` source in `stateMachine.js`, shared with
the project manifest so the two catalogs cannot drift) plus inputs, states,
transitions, and conditions, so an AI can plan edits from the summary alone;
every mutation goes through the transactional store, is undoable, and is
recorded in the command history with its source (`user` / `ai` / `script` /
`import`). The same edit commands are dispatchable as actions on the
serializable command bus (`dispatchVeyraCommand`), which is how AI callers
reach them.

## Known limitations (next phases)

- Single-layer machines: no parallel layers or additive/override layer
  mixing yet.
- No entry/exit/any states (the state-type list is already reserved).
- Transitions out of the incoming state are only sampled after the blend
  completes; there is no "during transition" evaluation.
- The editor UI surface (state graph panel, input panel, per-state preview)
  is not built yet — the machine is fully addressable through the API and
  summary before that surface exists.
