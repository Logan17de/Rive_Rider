# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary. Invalid listener refs/actions, machine targets, hit-test inputs, and interaction topology must fail before authored state is committed.
2. Human names are display metadata only. Listener targeting, machine interaction, hit testing, dependencies, and tests use stable refs/IDs and evaluated structure.
3. Persistent listener authoring must use the canonical M3 control plane / command bus. Do not create an interaction-only mutation path.
4. Runtime machine inputs/triggers/playback are ephemeral runtime state. Do not write runtime output back into authored document state or persistent history.
5. Hit testing must use the evaluated scene and the renderer's geometry semantics. Do not use display names or bounding-box guesses where this milestone requires exact geometry.
6. Pointer participation is independent from visual opacity. Do not make opacity implicitly disable hit participation unless an explicit interaction rule says so.
7. Preview/read/query services remain read-only. Pointer simulation used for tests must not mutate authored state unless a validated persistent command is explicitly dispatched.
8. Preserve editor-tool isolation: canvas authoring gestures and runtime interaction events must not accidentally trigger each other.
9. Keep current legacy machine inputs for compatibility, but do not expand them into the future data architecture. View Models/Data Binding come later.
10. Do not implement Components/multi-artboards, View Models/Data Binding, layered state-machine parity, accessibility/event parity, Text, Layout, scripting/WGSL, MCP/headless transport, or collaboration in this milestone.
11. Do not weaken M0–M3 tests, name-independence rules, control-plane drift tests, or capability declarations.
12. Run `npm test` and `npm run check` before handoff.

---

# MILESTONE M4 — Close the Current Interaction Loop

**Roadmap mapping:** `plan.md` M1 — Close current interaction loop  
**Status:** `READY`

## Goal

Finish the interaction system that already exists in partial form so a current Veyra project can reliably execute this complete loop:

```text
pointer input
  -> evaluated hit target
  -> listener resolution
  -> listener action
  -> timeline or persistent machine runtime input/trigger
  -> state transition/runtime evaluation
  -> evaluated animation frame
  -> visible render
```

At the end of M4, current listeners must be fully authorable through the same Store/command/control-plane contracts as other persistent features, machine listener intents must actually execute in the editor host, and supported current shapes/paths must participate in deterministic evaluated hit testing rather than broad bounding-box guesses.

This milestone closes the **current legacy interaction branch**. It does not attempt the later full Rive Listener/Event/Data Binding architecture.

---

## Task 1 — Complete current listener authored CRUD parity

Audit the current listener model first, then complete create/read/update/delete for the listener capabilities Veyra already supports.

Current compatibility scope includes pointer listeners and the existing action families such as:

```text
play
stop
seek
setInput
fire
```

### Requirements

- stable listener IDs remain authoritative;
- listener target/timeline/machine/input references are typed ID-backed refs where applicable;
- add/update/remove listener operations exist in `VeyraStore`;
- equivalent JSON-safe `VEYRA_COMMAND_TABLE` actions exist;
- supplied command provenance reaches history;
- manifest/actions/capabilities advertise only behavior that actually works;
- dependency graph includes listener target/action dependencies in both directions;
- semantic query/index continues to expose listener relationships without relying on names;
- serialization/normalization validates dangling targets/actions before commit;
- deleting referenced entities follows an explicit deterministic listener cleanup/blocking policy with tests;
- undo/redo and preview work through the canonical control plane.

Do not implement the later full Rive multi-action/data-bound listener system unless a minimal schema normalization is genuinely required for correctness of the current model.

---

## Task 2 — Implement the machine-listener host bridge

The current runtime can resolve machine-oriented listener intents, but the editor host must actually apply them.

Implement the host bridge for current machine actions:

```text
setInput(machineRef, inputRef, value)
fire(machineRef, inputRef)
```

### Requirements

- machine and input are resolved by stable IDs, never display names;
- use one persistent runtime instance per active machine/document context rather than constructing an unrelated runtime for every pointer event;
- `setInput` validates input type/value through the runtime's existing contract;
- `fire` follows trigger semantics exactly once per intended event;
- runtime mutations do not create authored Store history entries;
- deleting/replacing a machine invalidates stale runtime instances deterministically;
- unsupported/missing runtime targets return structured diagnostics rather than being silently ignored;
- manifest/host availability must stop claiming `unsupported` once the bridge is actually available;
- direct timeline `play`/`stop`/`seek` interaction behavior must remain working.

---

## Task 3 — Define deterministic pointer and `click` lifecycle semantics

Complete the current pointer event model and add explicit `click` behavior.

At minimum support the current interaction lifecycle for:

```text
pointerenter
pointerleave
pointermove
pointerdown
pointerup
click
```

### Required behavior

Define and test, rather than leaving browser accident as the contract:

- evaluated hit target selection and draw-order precedence;
- enter/leave changes when the top eligible target changes;
- down/up dispatch ordering;
- `click` only when the down/up lifecycle qualifies under the documented Veyra rule;
- pointer movement between down and up;
- overlapping targets;
- hidden/non-interactive/pass-through participation;
- ancestor visibility/interaction participation;
- interaction participation independent of opacity;
- pointer runtime must not interfere with active editor drawing/vertex/rig gestures.

If an explicit current `pointerEvents`/interaction-participation property is needed, add it through the full feature completeness path for the affected current entity kind: model, property address/capability, command path, manifest, UI where appropriate, serialization, tests, and name independence.

---

## Task 4 — Exact evaluated hit testing for current geometry

Replace approximate bounds-only interaction hits for the current supported geometry where exact behavior is required.

Cover at least:

- rectangle;
- ellipse;
- polygon;
- star;
- editable/custom path fills;
- current strokes where the renderer treats them as interactive geometry.

### Path/geometry requirements

- operate on evaluated geometry/world transforms;
- deterministic Bézier/path flattening or equivalent exact-enough mathematical test with a documented tolerance;
- implicit closure for filled open paths must match rendered fill semantics;
- stroke-width participation must match current transformed stroke behavior, including non-scaling behavior if the current renderer supports it;
- transformed/rotated/scaled shapes must hit in the correct world position;
- near-boundary tests must be deterministic;
- no broad bounding-box fallback may report a hit outside the rendered current polygon/star/path merely because the point lies inside its bounds;
- group/container behavior must follow child/evaluated geometry rather than inventing filled group rectangles.

Clipping, Layout and Component-aware hit testing are explicitly deferred until those feature families exist, but the API should remain extensible for them.

---

## Task 5 — Integrate pointer → listener → runtime → evaluated render

Wire the interaction transport so resolved intents are consumed by the correct host subsystem.

Required current routing:

```text
listener play/stop/seek -> timeline playback bridge
listener setInput/fire  -> persistent machine runtime bridge
```

Then ensure machine runtime output can affect the evaluated/rendered scene through the existing machine/timeline evaluation path.

### Requirements

- one event must not be executed twice because both resolver and transport observe it;
- runtime step timing is deterministic in tests;
- transition conditions react to the updated machine input/trigger;
- state changes select/evaluate the expected timeline;
- crossfade/current existing transition behavior remains valid;
- render invalidation occurs when runtime output changes;
- authored document serialization is unchanged by runtime-only interaction;
- stopping/resetting/replacing runtime context does not leave stale evaluated overrides.

---

## Task 6 — Canonical control-plane and machine-readable exposure

Bring interaction authoring/inspection under the M3 contracts.

At minimum:

- listener CRUD commands are in the canonical command table;
- manifest listener capabilities/action schemas are generated from real current support;
- dependency graph reports listener targets and runtime uses;
- `read()` can inspect current listener entities through stable refs;
- `previewCommand()` can preview listener authored changes with zero side effects;
- `verifyChange()` can assert listener existence/reference topology through existing entity/dependency assertions, extending the assertion vocabulary only if genuinely needed;
- browser compatibility mutation helpers, if added, route through the canonical dispatcher;
- runtime-only interaction APIs are explicitly marked runtime-only rather than persistent commands.

Do not add an AI-only listener editing surface.

---

## Task 7 — Minimal human editor listener authoring parity

Current listeners must not be code/AI-only authored objects.

Provide a bounded editor UI for the current listener model that can at least:

- inspect listeners attached to the selected supported target;
- create a supported pointer listener;
- choose the supported event;
- configure the supported current action and its typed target/value fields;
- update it;
- remove it;
- show precise validation when a referenced machine/input/timeline is incompatible or missing.

The UI may be utilitarian; correctness and shared command/model semantics matter more than visual polish in this milestone.

Where continuous or selection-only UI operations cannot sensibly use a command descriptor, keep the existing audited Store transaction/read ports rather than inventing a second mutation system.

---

## Task 8 — End-to-end and adversarial interaction suite

Add dedicated tests covering at least:

1. listener add/update/remove through Store + command + control-plane preview/dispatch + undo/redo;
2. listener refs survive rename/reorder/serialize-load unchanged;
3. invalid/dangling listener targets/actions fail before commit;
4. pointer hit outside polygon/star/path geometry but inside its bounding box does **not** hit;
5. path fill implicit closure behaves consistently with renderer semantics;
6. stroke near-boundary hit tests are deterministic under transforms;
7. opacity change alone does not remove interaction participation;
8. hidden/non-interactive/pass-through rules behave exactly as documented;
9. pointer enter/leave/down/up/click lifecycle is deterministic;
10. overlapping targets use documented evaluated draw-order precedence;
11. listener `setInput` changes the intended machine runtime input by stable ref;
12. listener `fire` triggers exactly the intended trigger lifecycle;
13. pointer -> listener -> machine transition -> evaluated timeline property produces the expected visible/evaluated value;
14. the same full loop still works after all relevant human names are randomized/misleading;
15. runtime interaction does not change serialized authored document/history;
16. authoring tool gestures do not accidentally dispatch runtime listeners;
17. timeline listener `play`/`stop`/`seek` regressions remain green;
18. all M0–M3 tests remain green.

Where practical, add a golden interaction fixture that contains overlapping shapes, a custom path, a listener, a machine, inputs, transitions and timelines so the whole loop is exercised against one realistic graph.

---

## Explicit non-goals

Do not implement in M4:

- headless Node API / CLI transport;
- MCP server;
- path topology authoring commands such as `addVertex` / `removeVertex` unless strictly required to repair existing hit-test correctness;
- multi-artboards / Components;
- View Models / Data Binding / Property Groups / converters / lists;
- full layered state-machine parity or visual graph editor;
- full future Rive listener sources/actions, data-bound listener parameters, accessibility semantics or general event system;
- clipping/layout/component-aware hit testing before those systems exist;
- Text;
- scripting/WGSL;
- collaboration/runtime SDK/export work.

Follow-up ideas stay in `suggestions`.

---

## Acceptance criteria

M4 is complete only when:

- current listener CRUD is fully persistent, validated, undoable and available through Store/command/control-plane/manifest/UI;
- machine listener `setInput` and `fire` intents execute against the correct persistent runtime by stable refs;
- timeline listener actions remain functional;
- deterministic `click` and pointer lifecycle semantics are implemented;
- current polygon/star/path/fill/stroke interaction hits use evaluated geometry rather than broad bounds guesses;
- relevant Bézier/path/transform/boundary regressions are covered;
- interaction participation is not implicitly coupled to opacity;
- pointer -> listener -> runtime/state transition -> evaluated frame/render works end to end;
- runtime-only interaction does not mutate authored document/history;
- dependency/manifest/control-plane surfaces truthfully describe listener/runtime support;
- all targeting remains name-independent;
- all existing tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Listener CRUD/control-plane proof:
- Listener validation/lifecycle proof:
- Machine runtime bridge proof:
- Pointer/click lifecycle proof:
- Exact evaluated hit-test proof:
- Bézier/stroke/transform proof:
- Pointer -> listener -> machine -> evaluated render proof:
- Runtime non-mutation proof:
- Manifest/dependency/control-plane proof:
- Human UI listener authoring proof:
- Name-independence proof:
- Suggestions added to `suggestions`:
- Known limitations:
```
