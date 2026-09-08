# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Pre-M6 identity, semantics, resolver, control-plane and dependency/ownership contracts are independently verified. |
| Core editor / engine foundation | **~87–90%** | M0–M5 were independently verified on their accepted heads. Current M6-head live testing exposed stricter client-space camera and authored-stroke zoom requirements that must be corrected before M6 can preserve the workspace contract. |
| Modern Rive editor/runtime feature parity | **~44–48%** | M6 has substantial multi-artboard/Component implementation, but remains uncounted until the active corrections are independently accepted. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture remains ahead of raw Rive feature breadth. |
| Remaining full-target work | **~55–58%** | M6 correction/verification, queued vector-authoring + multi-selection/grouping UX, then Data Binding/View Models and later Rive feature families. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Close current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED on its accepted head**.
- **Current milestone M6 maps to `plan.md` M2 — Multi-artboard, Components and project graph: CORRECTIONS REQUIRED.**

### Progress maintenance rule

Every future milestone verification or milestone advance must update this Progress snapshot in the same `milestone.md` commit. Do not count an unverified milestone as completed progress.

---

# MILESTONE M6 — Multi-Artboard, Components & Project Graph — CORRECTION PASS

**Roadmap mapping:** `plan.md` M2 — Multi-artboard, Components and project graph  
**Status:** `CORRECTIONS REQUIRED`

## Current verification state

The original M6 implementation plus the focused Component-runtime correction are substantial. Current verification has established:

- **Runtime selection/remap/mix: PASS for normal top-level Component instances.** Persisted selection affects evaluation, remap changes the effective source controller, mix is deterministic and invalid source refs fail closed.
- **Nested transform composition: PASS.** Parent-relative local matrices and mapped world matrices satisfy deterministic hierarchy composition.
- **Basic rigged Component instancing: PASS.** Nodes, bones, weighted meshes, controls and constraints are expanded into instance-scoped evaluated content, and top-level sibling instances keep rig runtime output isolated.

M6 still cannot be accepted because three current-head failures remain:

1. panel resize/collapse changes the absolute client-space location of graph content;
2. authored node/mesh strokes still use global non-scaling-stroke rendering and distort artwork proportions while zooming;
3. nested Component runtime state is keyed only by the authored inner `instanceId`, so repeated evaluated copies of that inner instance can share runtime state across different outer Component instances.

Do not advance until **all five M6 verification areas** — the three already-passing Component areas plus Blockers 4 and 5 below — are green on the same final `main` head.

---

## Component areas that already passed and must remain green

### A — Runtime selection/remap/mix
- persisted runtime timeline/stateMachine selection affects evaluation;
- remap changes the effective source controller;
- mix has explicit deterministic semantics;
- invalid source refs fail closed;
- manifest/dependency claims equal behavior.

### B — Nested Component transforms
- outer mapping is applied exactly once;
- descendant local matrices remain parent-relative;
- `parent.world × child.local == child.world`;
- renderer/hit testing agree;
- evaluated identities never enter authored persistence.

### C — Rigged Component content
- source nodes, bones, weighted meshes, controls and constraints survive Component evaluation into the host scene;
- evaluated identities are instance-scoped/non-persistent with source provenance;
- source authored rig content remains unchanged;
- top-level sibling instance runtime/overrides do not leak.

Keep the dedicated M6 Component correction tests green while fixing the remaining blockers.

---

# BLOCKER 4 — Workspace chrome still moves the graph + authored strokes distort under zoom

## 4A — Panel resize/collapse must preserve client-space artwork position

Preserving only world `zoom`, `centerX`, and `centerY` is insufficient when the SVG viewport itself moves in browser client space. The same world point must not visibly move just because editor chrome changes.

### Required user-visible contract

Dragging, collapsing, or expanding left/right/bottom panels changes only how much workspace is exposed. Existing graph/artwork must remain visually anchored on the monitor whenever geometrically possible.

### Required implementation

- Measure the stage viewport client rect before a panel resize/collapse and after layout settles.
- Preserve a deterministic client-space anchor across the change.
- The world point occupying that client pixel before the layout change must remain at that same client pixel afterward.
- Compute camera compensation from old/new client-rect geometry and the canonical world/client transform.
- Keep `zoom` unchanged.
- Do **not** mutate artboard/object coordinates.
- Do **not** silently invoke Fit Artboard / Fit Selection.
- Continuous splitter dragging must not accumulate drift.
- Collapse → expand back to the same layout must restore the same world→client mapping within tolerance.
- Renderer, `worldToClient`, `clientPoint`, hit testing, focus and pointer interaction must all agree afterward.
- Workspace/camera changes remain editor state and do not alter `.veyra` serialization, Store revision or command history.

### Mandatory tests

1. left splitter resize preserves a chosen world point's absolute client X/Y;
2. right splitter resize does the same;
3. bottom splitter resize does the same;
4. left/right collapse→expand round-trip produces no drift;
5. arbitrary splitter sequences do not change zoom;
6. rendered-point hit testing still succeeds after layout changes;
7. focus-selection/focus-object uses the corrected viewport;
8. document serialization/revision/history remain unchanged.

---

## 4B — Authored artwork strokes must scale with zoom

Authored scene nodes and mesh triangles currently use unconditional SVG `vector-effect="non-scaling-stroke"`. This causes geometry to shrink/grow while authored line thickness does not, visibly changing the artwork at low/high zoom.

### Required user-visible contract

Camera zoom scales the **whole artwork** uniformly. Editor overlays may remain screen-sized for usability, but authored strokes are part of the artwork and scale with it.

### Required implementation

- Remove unconditional `vector-effect="non-scaling-stroke"` from authored node and authored mesh rendering.
- Authored stroke width follows world units × camera zoom.
- SVG export and editor render use the same authored stroke semantics.
- If an explicit authored non-scaling-stroke property is added later, make it a real opt-in property/capability rather than the global default.
- Keep editor-only overlays separate: selection boxes, resize handles, vertices, Bezier handles, bones, controls, hit targets and guides may use bounded screen-space sizes.
- At low zoom provide a deterministic way to inspect clean artwork without rig/editor overlays dominating the image.

### Mandatory tests

A 4-world-unit authored stroke should measure approximately:

```text
zoom 0.10 → 0.4 CSS px
zoom 0.50 → 2 CSS px
zoom 1.00 → 4 CSS px
zoom 2.00 → 8 CSS px
```

Allow raster/antialias tolerance, but require a linear relationship. Also prove 10%–800% zoom preserves authored fill/stroke proportions while editor handles remain usable and non-authored.

---

# BLOCKER 5 — Nested Component runtime isolation must be scoped by evaluated instance path

`ComponentRuntimeRegistry` currently buckets runtime state by the authored `componentInstance.id` only.

That works for distinct top-level authored instances, but it is insufficient for nested Components. If a source Component contains authored nested instance `inner-instance`, and that outer source Component is instantiated twice as `outer-A` and `outer-B`, both evaluated copies currently refer back to the same authored `inner-instance` ID. A registry keyed only by `inner-instance` therefore cannot represent independent nested runtime state for:

```text
outer-A → inner-instance
outer-B → inner-instance
```

This violates `nestedComponents: true` plus the M6 runtime-isolation contract.

## Required runtime identity contract

Introduce a deterministic **evaluated Component runtime scope** that distinguishes repeated nested copies without turning evaluated identities into authored persistent IDs.

Conceptually:

```text
runtime scope = [outer componentInstance ref, ..., nested componentInstance ref]
```

For example:

```text
[componentInstance:outer-A, componentInstance:inner-instance]
[componentInstance:outer-B, componentInstance:inner-instance]
```

These scopes are different runtime identities even though they terminate at the same authored source instance ID.

### Requirements

- Runtime bucket identity must include the complete evaluated instance path, not only the terminal authored `instanceId`.
- Use a structured/typed path contract internally and on machine-readable surfaces; do not rely on ambiguous ad-hoc string concatenation.
- Top-level runtime APIs may retain convenient `instanceId` addressing when unambiguous, but nested runtime control must have an explicit scoped/path address.
- Timeline clocks, state-machine runtimes, triggers, selected/remapped controllers and mix state must be isolated per evaluated instance path.
- `evaluateComponentInstances()` / nested recursion must pass the correct runtime scope into evaluation.
- Runtime source refs remain persistent source refs; the runtime scope is ephemeral evaluated context.
- Save/load must not serialize runtime buckets or evaluated instance paths into authored Component data unless a future explicit authored runtime-state feature requires it.
- Removing/pruning an outer instance must prune runtime buckets beneath that outer scope.
- Resetting one nested runtime scope must not reset a sibling or the same authored inner instance under another outer scope.
- Dependency/ownership/manifest capability language must distinguish authored Component instance identity from evaluated runtime-scope identity.
- If external/browser AI APIs expose nested runtime control, they must accept the same canonical structured scope rather than inventing a second addressing model.

### Mandatory adversarial tests

Build one source Component containing a runtime-driven nested Component instance, then instantiate the outer Component twice.

Prove:

1. `outer-A → inner-instance` and `outer-B → inner-instance` have distinct runtime scope identities;
2. advance/set/fire the nested runtime only in outer A;
3. outer A's evaluated nested output changes;
4. outer B's evaluated nested output remains unchanged;
5. authored source/nested instance data remains unchanged;
6. resetting outer A's nested scope does not reset outer B;
7. save/load contains no ephemeral runtime buckets/scoped evaluated IDs;
8. pruning/deleting outer A removes only A's nested runtime state;
9. timeline remap/machine remap/mix remain isolated per nested scope;
10. deterministic evaluation/order survives repeated runs and outer-instance rename/reorder.

This test is mandatory before M6 can return to `AWAITING VERIFICATION`.

---

## Explicit non-goals for this correction pass

Do **not** add the newly requested Pen/Edit Vertices/multi-selection/grouping features inside M6. They remain queued in `suggestions` as the next interstitial milestone after M6:

- active-artboard pointer/world X/Y readout and selected-object position;
- Rive-style Pen lifecycle where Esc finishes a valid path;
- click+drag Bezier creation;
- Edit Vertices mode;
- straight / mirrored / detached / asymmetric handles;
- corner-radius editing;
- canonical add/remove vertex commands;
- multi-selection + marquee;
- Ctrl/Cmd+G grouping and Ctrl/Cmd+Shift+G ungrouping while preserving world transforms.

---

## Preserve existing verified behavior

Do not regress M0–M5 identity, semantics, control plane, history, hit testing, right-click pan, persistent artboard frame origin, visibility/focus controls, resizable/collapsible panels, theme contracts, interaction runtime, or existing M6 project-graph/Component correction behavior.

---

## M6 acceptance

M6 is VERIFIED only when:

- top-level Component runtime/remap/mix behavior remains green;
- nested Component hierarchy transforms remain green;
- rigged Component evaluated content remains green;
- panel resize/collapse preserves anchored client-space graph content;
- authored strokes scale uniformly with zoom;
- nested runtime state is isolated by evaluated Component instance path;
- the mandatory two-outer-instance nested-runtime adversarial test passes;
- all existing M0–M6 tests remain green;
- `npm run check` passes;
- `npm test` passes;
- latest standard GitHub `Tests` passes on the final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Runtime/remap/mix proof:
- Nested Component transform proof:
- Rigged Component evaluation/render proof:
- Panel client-anchor proof:
- Authored stroke zoom-scaling proof:
- Nested runtime-scope isolation proof:
- Hit-test/render alignment proof after panel changes:
- Existing M0–M6 regression proof:
- Manifest/capability proof:
- Persistence/history proof:
- Suggestions added to suggestions:
- Known limitations:
```
