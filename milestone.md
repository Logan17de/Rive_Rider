# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, semantics, name-independent resolution, canonical control plane, dependency/ownership graph, preview/dispatch/verify and machine-readable interaction surfaces are verified. |
| Core editor / engine foundation | **~82–85%** | M0–M4 are verified. M5 is largely implemented but is not counted as accepted until the viewport/artboard corrections below pass. |
| Modern Rive editor/runtime feature parity | **~43–47%** | Current vector/animation/rig/state-machine/interaction loop is verified; most major modern Rive feature families remain. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~41–44%** | Architecture remains ahead of raw Rive feature breadth. |
| Remaining full-target work | **~56–59%** | Primarily Components/artboards, Data Binding/View Models, full state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent layer. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED**.
- `plan.md` **M1 — Close current interaction loop:** **VERIFIED**.
- **Current interstitial milestone:** M5 Workspace UX Stabilization — **CORRECTIONS REQUIRED**.
- `plan.md` **M2 — Multi-artboard, Components and project graph:** remains next after M5 verification.

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not count an unverified milestone as completed progress.

---

# MILESTONE M5 — Workspace UX Stabilization — CORRECTION PASS

**Roadmap mapping:** interstitial editor-quality gate between verified `plan.md` M1 and `plan.md` M2  
**Status:** `CORRECTIONS REQUIRED`

## Verification result

The main M5 implementation is accepted **in principle** and should not be rewritten unnecessarily. The following pieces exist and passed the current automated suite:

- right/middle/Space canvas pan routing;
- cursor-anchored wheel zoom helpers;
- Fit Artboard / Fit Selection / Focus Selection / 100% commands;
- stable-ref object focus controls;
- hierarchy visibility controls;
- left/right/bottom splitters and collapse persistence;
- object move/resize transaction support;
- semantic theme tokens and Neutral Dark default;
- editor viewport API exposure;
- M4 render/hit-test integration remains green;
- latest pre-correction `main` Tests workflow is green.

However, independent UI verification exposed two workspace-mechanics blockers. M5 must remain open until they are corrected.

---

## Correction 1 — Panel/window resize must NOT change graph/canvas zoom mechanics

### Observed problem

Resizing the left/right panels changes the visible scale/mechanics of the graph/artboard. The current renderer viewBox is derived from artboard dimensions and zoom, while the SVG uses `preserveAspectRatio="xMidYMid meet"`. When the CSS viewport aspect/size changes, the browser therefore changes pixels-per-world-unit even though the editor zoom value did not change.

A panel resize must change **available screen area only**. It must not silently behave like zoom/fit.

### Required contract

Viewport state must have stable editor semantics:

- `zoom` represents a stable screen-space scale, not a value whose visual meaning changes with panel width/height;
- changing left/right/bottom panel size preserves `zoom`, `centerX`, and `centerY` unless an explicit fit/focus command is invoked;
- changing browser/window size preserves the same viewport state;
- distance in CSS pixels between two world points at a fixed zoom remains invariant when only the viewport dimensions change;
- the visible amount of surrounding workspace may increase/decrease as panels move, but artwork itself must not grow/shrink;
- no automatic `Fit Artboard`/recenter is allowed during panel resize;
- panel resize never mutates authored document/history;
- renderer and M4 hit testing must consume the **same** updated viewport dimensions and the same world↔screen transform;
- 100% zoom must have one documented, deterministic meaning across viewport sizes.

### Architectural direction

Fix the shared viewport contract rather than compensating in CSS.

The renderer/viewBox and DOM-free `createSvgViewBoxScreenTransform()` must derive from one canonical editor-camera model that includes the actual viewport width/height. Avoid a second panel-specific scale correction.

If zoom semantics change from the older artboard-relative behavior, migrate/update all dependent fit/zoom/hit-test tests together and document the new invariant explicitly.

### Mandatory tests

1. Start with a fixed document, viewport center and zoom. Change viewport width only: world-to-screen scale is unchanged.
2. Change viewport height only: world-to-screen scale is unchanged.
3. Simulate left panel 250→450px and right panel 310→220px: renderer zoom/center remain identical.
4. Same world-point pair has the same CSS-pixel distance before/after panel resize.
5. M4 hit testing still selects the rendered point after each viewport resize.
6. Panel resize does not change serialized document, revision or history.
7. `Fit Artboard` is the operation that intentionally recomputes zoom to fit the new viewport.
8. `Focus Selection` is the operation that intentionally recomputes center/zoom.
9. Repeated resize/expand/collapse cannot produce NaN/Infinity or lose the scene.

---

## Correction 2 — Artboard resizing must work from ANY edge/corner, without permanent corner handles

### User requirement

Do not require the visible bottom-right corner resize handle.

The artboard itself must behave like a normal design-tool frame:

- hover near **left/right edge** → `ew-resize`;
- hover near **top/bottom edge** → `ns-resize`;
- hover near **top-left/bottom-right corner zone** → `nwse-resize`;
- hover near **top-right/bottom-left corner zone** → `nesw-resize`;
- pointer-down + drag in that border zone resizes the artboard;
- no permanent bright corner resize block is required.

### Screen-space hit zone

- use a deterministic screen-space border tolerance, e.g. roughly 5–8 CSS px;
- the grab zone must remain easy to hit at every zoom level;
- edge/corner classification must be derived from pointer position relative to the rendered artboard frame, not from tiny DOM handles;
- corner zones take priority over single-edge zones;
- cursor updates on hover before pointer-down.

### Gesture isolation

When the pointer is in an artboard-resize border zone:

- resize wins over canvas pan, object selection/move, and runtime preview listeners;
- pointer capture keeps resizing active outside the edge until release/cancel;
- `pointercancel`, `lostpointercapture`, and Escape restore the pre-resize authored state;
- one completed resize gesture creates exactly one undoable transaction;
- a click near an edge without meaningful movement creates no history entry.

### Edge semantics

The implementation must explicitly define all eight directions:

`left`, `right`, `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`.

Do not keep the current special case where top/left borders are canvas-pan handles and only right/bottom can resize.

For left/top resizing, preserve the opposite rendered edge/corner and do **not** mutate/move child artwork merely to fake an anchored resize. If the current single-artboard model cannot represent the required frame origin cleanly, introduce the smallest explicit artboard-frame/origin contract needed and make its persistence/migration semantics precise; do not hide it as accidental viewport drift. Keep this bounded so it can migrate cleanly into future multi-artboard work.

### Mandatory tests

1. Hover classification/cursor for all 4 edges + 4 corners.
2. Classification is identical at 10%, 100%, and 800% zoom for the same final CSS-pixel distance from the border.
3. Right edge changes width only.
4. Bottom edge changes height only.
5. Left edge keeps the opposite edge anchored and does not move authored artwork.
6. Top edge keeps the opposite edge anchored and does not move authored artwork.
7. All corner drags resize both axes with the correct anchored corner.
8. Minimum artboard size clamps deterministically; no negative/NaN/Infinity dimensions.
9. Cancel/lost capture/Escape restores exact pre-gesture serialization.
10. Completed drag is one undoable transaction.
11. Artboard resize does not dispatch M4 runtime listener intents.
12. Right-click canvas pan still works immediately outside the artboard resize border zone.
13. Permanent bottom-right resize block/handle is removed from the normal UI.

---

## Correction 3 — Regression gate for panel ↔ viewport ↔ artboard interactions

These behaviors must be tested together rather than as isolated helpers:

- resize/collapse/expand a side panel while zoomed and panned;
- verify graph scale and viewport center do not change;
- resize the artboard from an edge;
- verify panel sizes do not change;
- resize a panel again;
- verify the newly resized artboard remains at the same camera scale;
- run hit testing at the rendered object center;
- focus an object, then resize panels and verify focus is not implicitly recomputed;
- `Fit Artboard` after panel resize intentionally recomputes the camera and succeeds.

Use production viewport/artboard functions in the regression suite; do not create parallel test-only math.

---

## Do not regress accepted M5 work

The correction pass must preserve:

- right-button drag canvas pan;
- middle + Space pan;
- explicit fit/focus commands;
- hierarchy focus/eye controls;
- panel splitter/collapse persistence;
- authored object move/resize transactions;
- Neutral Dark + semantic theme system;
- full document non-mutation for viewport/panel/theme operations;
- all M0–M4 tests and contracts.

Do not start multi-artboards/components, View Models/Data Binding, layered state machines, Text/Layout, scripting/WGSL, MCP/headless or export ecosystem work in this correction pass.

---

## Acceptance criteria

M5 is VERIFIED only when:

- side/bottom panel resizing never changes graph/artwork scale at a fixed zoom;
- viewport center/zoom survive panel and window resize unchanged;
- renderer and hit testing remain aligned after arbitrary panel geometry changes;
- artboard border proximity exposes correct resize cursor on every edge/corner;
- artboard can be resized from every side/corner without permanent corner handles;
- resize gesture isolation/cancel/undo behavior is correct;
- existing M5 navigation/focus/visibility/panel/theme/object-resize behavior remains green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Viewport scale-invariance proof:
- Panel resize/collapse proof:
- Renderer/hit-test parity proof:
- Artboard edge/corner classification proof:
- Artboard resize transaction/cancel proof:
- Right-click pan regression proof:
- Document/history non-mutation proof:
- Progress snapshot update:
- Suggestions added to `suggestions`:
- Known limitations:
```
