# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They measure verified capability against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, universal semantics, name-independent resolver, canonical control plane, dependency/ownership graph, preview/dispatch/verify, and machine-readable interaction surfaces are substantially in place. |
| Core editor / engine foundation | **~82–85%** | Model/store/history/timeline/rig/interaction foundations are strong; workspace usability and several advanced authoring/runtime families remain. |
| Modern Rive editor/runtime feature parity | **~43–47%** | Current vector/animation/rig/state-machine/interaction loop is verified, but most large modern Rive feature families remain. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~41–44%** | Architecture remains ahead of raw feature breadth. |
| Remaining full-target work | **~56–59%** | Primarily Components/artboards, Data Binding/View Models, full state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent layer. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED**.
- `plan.md` **M1 — Close current interaction loop:** **VERIFIED**.
- **Current interstitial milestone:** Workspace UX Stabilization before starting `plan.md` M2.
- `plan.md` **M2 — Multi-artboard, Components and project graph:** next major feature-family milestone after this UX stabilization pass.

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not leave stale percentages after a milestone is accepted or materially re-scoped.

---

# MILESTONE M5 — Workspace UX Stabilization

**Roadmap mapping:** interstitial editor-quality gate between verified `plan.md` M1 and `plan.md` M2  
**Status:** `READY`

## Goal

Make the current editor pleasant and dependable for sustained authoring before adding large new Rive feature families.

The user must be able to navigate, locate, resize, hide/show, transform and inspect artwork without fighting the workspace. Panel layout and theme behavior must feel like one coherent editor rather than fixed chrome around a canvas.

This milestone is **editor UX stabilization**, not a new document-model feature family. It must preserve the verified M0–M4 architecture and route authored changes through existing canonical Store/command/control-plane boundaries.

## Mandatory agent rules

1. Preserve all verified M0–M4 identity, validation, control-plane, interaction, hit-test and runtime contracts.
2. Human names remain display metadata only. Object focus/visibility/selection uses stable refs/IDs.
3. Viewport/panel/theme state is editor state, not authored Veyra document content unless explicitly specified otherwise.
4. UI convenience must not introduce a second mutation model. Authored property changes use existing Store/command paths.
5. Right/middle/space-drag navigation must never accidentally move/select artwork or dispatch preview listeners.
6. Authoring drag/resize operations must remain undoable and must use the existing transaction boundary.
7. Panel resize/collapse must immediately keep renderer viewport and M4 hit-test mapping in sync.
8. Theme switching must not mutate document artwork colors or exported content.
9. Do not start Components/multi-artboards, View Models/Data Binding, layered state-machine parity, Text, Layout, scripting/WGSL, MCP/headless, runtime SDK/export or collaboration work here.
10. Do not weaken existing tests or capability declarations.
11. Run `npm test` and `npm run check` before handoff.

---

## Task 1 — Rebuild canvas navigation feel

### Pan gestures

Support all of these navigation gestures consistently:

- **right mouse button + drag = pan the canvas/graph**;
- middle mouse button + drag = pan;
- Space + left-drag = pan;
- existing Pan tool remains usable.

### Right-click contract

Right-button panning is mandatory.

Requirements:

- pointerdown with the right button starts a potential pan without selecting or moving artwork;
- dragging pans the viewport smoothly in screen-space motion;
- no authored Store transaction/history entry is created;
- no pointer listener/preview interaction fires from the pan gesture;
- right-button release ends pan cleanly even when released outside the original shape;
- pointer capture/cancel/lost-capture is handled deterministically;
- suppress the browser context menu for a recognized canvas right-drag pan;
- a plain right click without meaningful drag may keep the normal context-menu behavior unless the editor intentionally provides its own canvas context menu;
- do not globally disable right-click outside the canvas;
- cursor changes to an appropriate grab/grabbing state during pan.

### Zoom and wheel/trackpad behavior

- cursor-anchored zoom where appropriate;
- smooth predictable wheel/trackpad zoom steps;
- separate pan/scroll sensitivity from zoom sensitivity;
- explicit min/max zoom;
- avoid large jumps from high-resolution trackpads;
- preserve the intended world point under the cursor during anchored zoom;
- viewport center remains stable through editor/panel/window resizing.

### Navigation commands

Add:

- `Fit Artboard`;
- `Fit Selection`;
- `100%`;
- `Focus Selection`;
- useful keyboard shortcuts/tooltips where appropriate.

Users must be able to recover from extreme pan/zoom without manually hunting for the artboard.

---

## Task 2 — Per-object Focus / Locate controls

Every supported persistent drawable hierarchy row must have a focus/target affordance.

Clicking it must:

1. resolve the object by stable ref;
2. select it;
3. compute evaluated world bounds;
4. center the viewport on those bounds;
5. choose a useful zoom that keeps the entire object visible with padding.

Requirements:

- works after arbitrary pan/zoom;
- works after rename/reorder;
- repeated focus is deterministic;
- groups focus evaluated descendant bounds, not an invented filled group rectangle;
- hidden objects can still be located while staying hidden unless separately unhidden;
- degenerate/tiny geometry uses sensible minimum focus scale;
- focus operation is exposed through a clean editor viewport API so future AI/runtime tools can request the same non-authored view action.

---

## Task 3 — Hierarchy eye / visibility controls

Every supported drawable hierarchy row must expose an eye icon.

Requirements:

- visible and hidden states are visually distinct;
- clicking the eye changes only the canonical `visible` property;
- authored visibility mutation uses the normal mutation/command path;
- parent and child visibility remain separate authored values;
- hidden objects remain present/discoverable in hierarchy;
- visibility is not conflated with opacity or M4 `pointerEvents`;
- undo/redo works;
- stable ID drives the action, never display text.

---

## Task 4 — Resizable and collapsible editor panels

The workspace must not be fixed to hard-coded left/right/bottom dimensions.

Add draggable splitters for:

- hierarchy ↔ canvas;
- canvas ↔ inspector;
- canvas ↔ bottom timeline.

Add collapse/expand controls for:

- left hierarchy;
- right inspector;
- bottom timeline.

Requirements:

- sensible min/max dimensions;
- splitter target is easy to grab without being visually heavy;
- panel collapse preserves the previous expanded size;
- double-click splitter or explicit reset action may restore defaults;
- panel sizes/collapsed state persist locally across reloads;
- resizing panels does not mutate the Veyra document;
- renderer/canvas dimensions and M4 viewport mapping update immediately;
- no stale hit-test coordinates after resize;
- timeline remains usable at minimum supported height;
- small-screen responsive fallback remains usable;
- keyboard-accessible collapse controls.

---

## Task 5 — Fix object drag / resize authoring

Audit existing on-canvas transform behavior first, then stabilize it.

### Move/drag

- no pointer-offset jump when drag begins;
- transformed/parented objects move in the correct coordinate space;
- one gesture creates one undoable transaction;
- pointercancel/Escape restores the pre-drag authored state;
- tool isolation remains intact.

### Resize

Add dependable on-canvas resize handles for currently supported drawable nodes.

Requirements:

- corner resize;
- edge resize where meaningful;
- explicit aspect-lock modifier behavior;
- explicit center-resize modifier behavior if supported;
- rotation/non-uniform scale/parent transforms/pivots do not cause jumps or unexpected inversion;
- geometry cannot accidentally become NaN/Infinity;
- minimum practical geometry size is deterministic;
- define group resize behavior explicitly rather than guessing;
- one resize gesture = one undoable authored transaction;
- M4 runtime preview listeners are suppressed during authoring resize gestures.

Do not expand into future Layout/Component resizing semantics.

---

## Task 6 — Full semantic-token theme overhaul

The current pink/magenta-heavy theme is not an acceptable default and the theme selector currently changes only part of the application.

Replace ad-hoc palette overrides with semantic UI tokens covering the **entire editor**:

- app background;
- top bar;
- hierarchy/inspector/timeline panels;
- canvas workspace;
- artboard frame;
- borders/dividers/splitters;
- buttons/tool states;
- hierarchy selected/hover/focus states;
- inspector fields;
- timeline grid/playhead/selection;
- text/muted/quiet text;
- selection/focus colors;
- rig controls/handles;
- warning/error/success states;
- overlays/tooltips/modals where present.

Requirements:

- selecting a theme updates the whole editor consistently;
- remove hard-coded magenta/pink UI colors outside theme-token definitions unless semantically intentional;
- default theme becomes a coherent **Neutral Dark** rather than pink-heavy chrome;
- provide at least: Neutral Dark, Graphite/Blue, Deep Teal, Warm Dark, Light Neutral;
- contrast remains readable across selected/hover/focus states;
- selected theme persists locally;
- theme switch does not mutate authored Veyra document or artwork paint values;
- theme change updates any canvas/editor chrome that depends on tokens without requiring reload.

---

## Task 7 — Workspace visual consistency pass

After behavior is correct:

- reduce unnecessary visual noise;
- normalize icon sizes;
- normalize control/button heights;
- normalize panel headers, spacing, radii and dividers;
- make canvas the visual center of the editor;
- reserve strong accent color for meaningful state/action;
- make hierarchy selection/hover/focus obvious without excessive saturation;
- ensure bottom timeline remains readable at multiple heights;
- ensure splitters/collapse affordances are discoverable without dominating the UI.

Do not turn this into an unrelated full product redesign.

---

## Task 8 — Deterministic UX regression suite

Tests must cover at least:

1. right-button drag pans and does not select/move artwork;
2. right-button pan does not execute runtime listeners;
3. right-button release/cancel/lost capture ends pan cleanly;
4. context menu suppression is scoped correctly to recognized canvas right-drag behavior;
5. middle-drag and Space+left-drag pan;
6. cursor-anchored zoom preserves the intended world point;
7. zoom/pan never produces NaN/invalid viewBox state;
8. `Fit Artboard` restores the full artboard;
9. `Fit Selection`/Focus finds the correct stable ref after extreme pan/zoom;
10. focus remains correct after rename/reorder;
11. hidden object can be located without silently becoming visible;
12. hierarchy eye changes only visibility and is undoable;
13. left/right/bottom splitter sizes clamp to valid ranges;
14. panel collapse/expand restores previous size;
15. panel resize keeps renderer and M4 hit-test mapping aligned;
16. drag move has no pointer-offset jump and creates one undoable transaction;
17. resize handles create one undoable transaction and remain stable under transformed parents;
18. theme switching changes all defined semantic UI tokens while document serialization is unchanged;
19. selected theme and panel layout persist/reload correctly;
20. all existing M0–M4 suites remain green.

Where DOM behavior is involved, extract small deterministic viewport/workspace state functions so logic can be tested without duplicating production behavior.

---

## Explicit non-goals

Do not implement in M5:

- Components/multi-artboards;
- View Models/Data Binding/Property Groups;
- full layered state-machine parity;
- future full listener/event/accessibility system;
- advanced paint/effect parity;
- Text/media/Layout;
- scripting/WGSL;
- headless Node API / CLI;
- MCP;
- runtime SDK/export ecosystem;
- collaboration.

---

## Acceptance criteria

M5 is complete only when:

- right-click drag can pan the canvas/graph naturally and safely;
- middle/Space pan and zoom behavior feel consistent and deterministic;
- user can always recover the artboard/selection via focus/fit commands;
- every supported hierarchy drawable has reliable focus and eye controls;
- left/right/bottom panels are resizable, collapsible and persistent;
- panel resizing preserves renderer/hit-test correctness;
- current move/resize authoring no longer jumps or fights transforms;
- theme selector changes the whole editor and Neutral Dark is coherent as the default;
- editor visual hierarchy is consistent enough for sustained use;
- authored document is unchanged by viewport/panel/theme operations;
- authored visibility/transform operations remain validated and undoable;
- all M0–M4 tests remain green;
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
- Right-click/middle/Space pan proof:
- Zoom/fit/focus proof:
- Object focus/locate proof:
- Hierarchy visibility proof:
- Panel resize/collapse/persistence proof:
- Drag/resize authoring proof:
- Theme-system proof:
- Document non-mutation proof:
- M4 viewport/hit-test regression proof:
- Suggestions added to `suggestions`:
- Known limitations:
```
