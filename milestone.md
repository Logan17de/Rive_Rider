# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Pre-M6 identity, semantics, resolver, control-plane and dependency/ownership contracts are independently verified. |
| Core editor / engine foundation | **~87–90%** | M0–M5 were independently verified on their accepted heads. Current live testing on the M6 head exposed a stricter client-space camera requirement and authored-stroke zoom bug that must be corrected before M6 can preserve the workspace contract. |
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

The original M6 implementation plus the focused Component-runtime correction are substantial. The latest Component correction at `25d95e0d8cd7bdd691a586eaed84f3dc4177e9eb` claims fixes for the three previously identified Component blockers:

1. persisted runtime selection/remap/mix behavior;
2. nested Component transform composition;
3. rigged Component evaluated content.

Those three remain subject to independent verification, but live editor testing has now exposed an additional current-head workspace/rendering blocker that must be fixed before M6 can be accepted.

Do not advance to the next roadmap family until **all four** areas are green on the same final `main` head.

---

## Previously identified Component correction areas to preserve and verify

### A — Runtime selection/remap/mix
- persisted runtime timeline/stateMachine selection must affect evaluation;
- remap must change the effective source controller or be rejected as unsupported;
- mix must have explicit deterministic semantics;
- per-instance runtime state must remain isolated;
- manifest/dependency claims must equal behavior.

### B — Nested Component transforms
- outer mapping is applied exactly once;
- descendant local matrices remain parent-relative;
- parent.world × child.local equals child.world;
- renderer/hit testing agree;
- evaluated identities never enter authored persistence.

### C — Rigged Component content
- current supported source nodes, bones, weighted meshes, controls and constraints must survive Component evaluation into the host scene;
- evaluated identities are instance-scoped/non-persistent with source provenance;
- source authored rig content remains unchanged;
- per-instance runtime/overrides do not leak.

Keep the dedicated M6 Component correction tests green while implementing the workspace correction below.

---

# BLOCKER 4 — Workspace chrome still moves the graph + authored strokes distort under zoom

Live browser testing showed both issues clearly.

## 4A — Panel resize/collapse must preserve client-space artwork position

The current camera preserves world `zoom`, `centerX`, and `centerY` when left/right/bottom panels change size. That is not sufficient for the user's expected editor mechanic, because the SVG viewport itself changes its **browser client rectangle**. The same world point therefore moves to a different physical screen pixel when editor chrome changes.

### Required user-visible contract

Dragging, collapsing, or expanding side/bottom panels must change only how much workspace is exposed. It must not visually drag the existing graph/artwork around the monitor.

### Required implementation

- Measure the stage viewport client rect before a panel resize/collapse update and after layout settles.
- Preserve a deterministic client-space anchor across the change. The world point that occupied the chosen anchor client pixel before the layout change must remain at that same client pixel after the change when geometrically possible.
- Compute the required `centerX/centerY` compensation from the old/new viewport client-rect center delta and current zoom/world transform.
- Do **not** mutate artboard/object coordinates.
- Do **not** silently invoke Fit Artboard / Fit Selection.
- Keep `zoom` unchanged.
- Continuous splitter dragging must not accumulate numerical drift.
- Collapse → expand back to the same layout must restore the same world→client mapping within tolerance.
- Renderer, `worldToClient`, `clientPoint`, hit testing, focus commands and pointer interaction must all agree after the compensation.
- Workspace/camera changes remain editor state and must not alter `.veyra` serialization, Store revision or command history.

### Mandatory tests

1. left splitter resize keeps a chosen world point at the same **absolute client X/Y**;
2. right splitter resize does the same;
3. bottom splitter resize does the same;
4. left/right collapse→expand round-trip produces no drift;
5. arbitrary sequence of splitter changes does not change zoom;
6. hit test of a rendered point still succeeds after the layout change;
7. focus-selection/focus-object uses the corrected viewport afterward;
8. document serialization/revision/history remain unchanged.

---

## 4B — Authored artwork strokes must scale with zoom

Current renderer code applies SVG `vector-effect="non-scaling-stroke"` to actual scene shapes and mesh triangles. This keeps authored stroke width roughly constant in screen pixels while the underlying geometry shrinks/grows, which visibly changes artwork proportions at low zoom.

### Required user-visible contract

Zooming the camera must scale the **whole artwork** uniformly. Editor controls may remain usable screen-sized overlays, but authored lines are part of the artwork and must visually scale with it.

### Required implementation

- Remove unconditional `vector-effect="non-scaling-stroke"` from authored scene-node and authored mesh rendering.
- Authored stroke width follows world units × camera zoom.
- If Veyra later supports an explicit authored non-scaling-stroke property, implement it as a separate real property/capability; do not make it the global default.
- Keep editor-only overlays separate: selection boxes, resize handles, vertex points, Bezier handles, bone/control hit areas and guides may use bounded screen-space sizes.
- Editor overlays must never affect export/final artwork geometry.
- At very low zoom, rig/editor overlays must not make the artwork unreadable. Provide a deterministic overlay visibility policy or a view/final-playback toggle so the user can inspect clean artwork.
- Editor render and SVG export must agree on authored stroke semantics.

### Mandatory tests

At a stable viewport, a 4-world-unit authored stroke should measure approximately:

```text
zoom 0.10 → 0.4 CSS px
zoom 0.50 → 2 CSS px
zoom 1.00 → 4 CSS px
zoom 2.00 → 8 CSS px
```

Allow raster/antialias tolerance, but the relationship must be linear. Also prove 10%–800% zoom preserves authored fill/stroke proportions while editor handles remain interaction-usable and non-authored.

---

## Explicit non-goals for this correction pass

Do **not** add the newly requested Pen/Edit Vertices/multi-selection/grouping features inside M6. They are now queued in `suggestions` as the next interstitial milestone after M6.

That queued milestone includes:

- active-artboard pointer/world X/Y readout and clear selected-object position;
- Rive-style Pen lifecycle where Esc finishes a valid path rather than discarding it;
- click+drag Bezier creation;
- Edit Vertices mode;
- straight / mirrored / detached / asymmetric handles;
- corner-radius editing;
- canonical add/remove vertex commands;
- multi-selection + marquee;
- Ctrl/Cmd+G grouping and Ctrl/Cmd+Shift+G ungrouping while preserving world transforms.

---

## Preserve existing verified behavior

Do not regress M0–M5 identity, semantics, command, history, hit testing, right-click pan, stable artboard frame origin, visibility/focus controls, resizable/collapsible panels, theme contracts, interaction runtime, or the existing M6 project graph and Component correction tests.

---

## M6 acceptance

M6 is VERIFIED only when:

- Component runtime/remap/mix behavior passes independent review;
- nested Component hierarchy transforms pass independent review;
- rigged Component evaluated content passes independent review;
- panel resize/collapse no longer visibly moves anchored graph content;
- authored strokes scale uniformly with zoom;
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
- Hit-test/render alignment proof after panel changes:
- Existing M0–M6 regression proof:
- Manifest/capability proof:
- Persistence/history proof:
- Suggestions added to suggestions:
- Known limitations:
```
