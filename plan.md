# Veyra — Completion Audit & Execution Plan

**Audit date:** 2026-09-07  
**Audited branch:** `main`  
**Audited HEAD:** `13494eb477d68c12d5b44401cca67326d6a7927c`  

> This is the current high-level project plan. `docs/plan.md` contains the earlier rolling interaction-milestone log; when its status conflicts with this audit, this file is newer.

## 1. Current completion estimate

Veyra is well past the prototype stage: the document/runtime/editor foundation is substantial and tested, but it is **not yet a complete Rive-class + AI-native platform**.

- **Core editor/engine foundation:** ~70–75% complete.
- **Full north-star platform** (Rive-class authoring + interactions + AI autonomy + distributable runtime + collaboration): ~40–45% complete.

These percentages are intentionally approximate. The remaining work contains several large product surfaces (state-machine UI, text/images/effects, runtime player, deep AI autonomy, cloud/collaboration), so counting files or APIs would overstate completion.

## 2. What is already completed

### A. Open Veyra document foundation — DONE
- Versioned `.veyra` JSON document model with stable IDs and deterministic serialization.
- Validation/migration support for earlier versions.
- Canonical transforms, typed references, property addresses, capabilities, scene evaluation, semantics and asset registry.
- Transactional store, undo/redo, command provenance and autosave.
- New/open/save `.veyra` and deterministic SVG export.

### B. Vector editor — STRONG CORE DONE
- Group, rectangle, ellipse, polygon, star and authored path nodes.
- Position/rotation/scale/skew/pivot/opacity.
- Hierarchy, visibility and locking.
- Solid fills, linear gradients, radial gradients, stable gradient stops and solid strokes.
- Property inspector, selection, path vertices/Bezier-handle editing and canvas navigation.

### C. Character rigging — CORE DONE
- Bone hierarchy and pose editing.
- Weighted meshes / linear blend skinning.
- Pose controls.
- Six constraint families: IK, distance, rotation, scale, transform and path.
- Weight normalization, symmetry and deformation diagnostics.

### D. Animation — CORE DONE
- Multiple timelines.
- Property-addressed tracks/keyframes.
- Linear/ease/step/hold/cubic-Bezier interpolation.
- Auto-key, scrub, play/pause/stop, looping and timeline zoom.
- Keyframe select/drag/delete and easing controls.
- Authored → animation → constraints evaluation pipeline.

### E. State-machine engine — CORE DONE
- State-machine registry in the document.
- Number/bool/trigger inputs.
- Animation states and condition transitions.
- Blend duration / `after` gates, trigger consumption and deterministic runtime stepping.
- Crossfade evaluation.
- Store commands and script/AI APIs for machine authoring and execution.

### F. Interactions — DIRECT TIMELINE PATH WORKS
- Listener schema and runtime resolver.
- Pointer hit testing and hover enter/leave state.
- Browser-shell pointer handlers are extracted and integration-tested.
- Preview pointer events can produce listener intents without mutating document/history.
- **Direct timeline listener intents (`play`, `stop`, `seek`) are now wired through `interactionTransport.js` into real editor playback in `veyra.js`.** This is newer than the status recorded in the older `docs/plan.md`.

### G. AI-readable control surface — GOOD FOUNDATION DONE
- `globalThis.veyra` exposes scene/property/rig/timeline/state-machine operations.
- Compact scene summaries and stable property addresses.
- Transactional commands with user/AI provenance.
- Project manifest exposes capabilities and derives command actions from the command registry.
- Listener/state-machine contracts are machine-readable, including whether the current host supports a transport.

### H. Tests / CI — HEALTHY FOUNDATION
- Test runner auto-discovers all `tests/*.test.mjs` suites rather than maintaining a manual list.
- Current tree contains roughly 20 Node test suites plus browser/WASM fixture checks.
- The latest `Tests` GitHub Actions run on merge commit `ff4ce5d` completed successfully.
- The custom Rive tools build also completed successfully and produced HEAD `13494eb` with `[skip ci]`; therefore the generated HEAD itself did not receive a fresh `Tests` workflow run after that bot commit.

## 3. What is missing — priority order

## P0 — Finish interactive state-machine authoring/runtime

This is the most important gap because it closes the loop from artwork → animation → interaction.

### 0.1 Machine-listener host bridge
**Missing now:** listener runtime can emit state-machine intents, but the editor host does not execute them. `interactionTransport.js` currently reports a diagnostic for `runtime` intents, and the manifest marks machine listener host availability as unsupported.

Build:
- Dispatch `setInput` and `fire` intents to the correct persistent `MachineRuntime`.
- Ensure runtime state survives ordinary pointer events and document revisions correctly.
- Re-render evaluated scene/timeline after a transition.
- Add missing-target / missing-machine diagnostics.
- Add exact end-to-end tests: pointer event → listener → runtime input → transition → visible evaluated animation.

**Definition of done:** a hover/click listener can visibly transition a state machine inside the real editor without calling the console API manually.

### 0.2 Visual state-machine editor
Build editor UI for:
- Machine list/create/delete/rename.
- Input list: number/bool/trigger.
- State graph nodes.
- Connect transitions visually.
- Condition builder.
- Blend duration and `after` settings.
- Per-state / live-machine preview.
- Selection, drag, delete, undo/redo and AI-command parity.

**Definition of done:** a human can build a complete interactive button/character state machine without touching JSON or the console.

### 0.3 Final shell integration proof
- Add a full-app browser boot test (or equivalent stronger seam) covering actual `veyra.js` registration + dispatcher + playback.
- Run `npm test` and `npm run check` on the settled HEAD after generated/runtime commits.
- Keep mutation/negative-control coverage so integration tests prove they can fail.

## P1 — Correct interaction geometry and finish editor polish

### 1.1 Exact hit testing
Current hit testing is exact for ellipses but otherwise largely bound-based. This means empty corners of a star/polygon/path bounding box may count as hits.

Build:
- Polygon/star point-in-polygon.
- Path fill hit testing.
- Stroke hit testing with tolerance.
- Clipping/mask-aware hit testing later.
- Tests under nested transforms, zoom/pan and deformed/animated geometry.

### 1.2 Timeline UX extensions
- Group/collapse tracks by object.
- Copy/paste keyframes.
- Box/multi-selection.
- Visual easing graph.
- Work-area in/out handles in the timeline UI.

### 1.3 API robustness
- Reject unknown resolver/options keys instead of silently ignoring likely caller mistakes.
- Keep manifest/action schemas synchronized automatically with command implementations.
- Add capability/version checks for AI callers.

## P1 — Visual feature gaps vs professional motion tools

Build next:
- Text objects and font handling.
- Image import/embedding and fit modes.
- Blend modes.
- Clipping and alpha masking.
- Trim-path and dash/path effects.
- Gradient strokes and on-canvas gradient handles.

These features are needed before Veyra can be considered a broadly complete visual-design tool.

## P2 — Advanced state machines/components/data

- State-machine layers (additive/override mixing).
- Entry / Exit / Any states.
- Better transition sampling / transition-time behavior.
- Keyboard interactions and pointer-follow mappings.
- Nested artboards/components and instance overrides.
- View models / typed data binding / converters / list data.

## P2 — Deep AI autonomy

The low-level AI-readable control surface exists; the high-level autonomous creator does not.

Build:
- `buildScene(sceneSpec)` batch/declarative scene builder.
- Reusable templates/style presets.
- Auto-rigging.
- Auto-animation/motion presets.
- Natural-language intent → plan → preview → validate → apply → verify loop.
- Conflict detection when animation/constraints/state machines own the same property.
- Complete machine-readable action docs/examples for every editor capability.

**Definition of done:** an AI can create artwork, rig it, animate it, add interactions, test the result and repair errors using the same underlying commands available to the editor.

## P3 — Runtime and export/distribution

- High-performance Canvas/WebGL playback renderer.
- Lightweight embeddable Veyra runtime/player.
- Compact runtime/binary export separate from editable `.veyra` source.
- Lottie-compatible subset export.
- Animated SVG and GIF/video/frame export.
- React integration first; native/mobile integrations later.

## P4 — Collaboration / cloud

Do after the single-user authoring/runtime product is solid:
- Cloud projects/storage.
- Version history.
- Shared asset/component library.
- Team permissions.
- CRDT/multi-user collaboration.

## 4. Recommended implementation sequence

- [ ] **M4.1** Wire machine listener intents (`setInput`, `fire`) into persistent machine runtimes.
- [ ] **M4.2** Add end-to-end listener → state transition → visible playback tests.
- [ ] **M4.3** Build the visual state-machine editor.
- [ ] **M4.4** Replace approximate interaction hit testing with shape/path-accurate hit testing.
- [ ] **M5.1** Add text + images.
- [ ] **M5.2** Add clipping/masks + blend modes + path effects.
- [ ] **M5.3** Finish timeline power-user UX.
- [ ] **M6.1** Add components/nesting + view-model/data binding.
- [ ] **M6.2** Build declarative scene construction, auto-rig and auto-animation APIs.
- [ ] **M6.3** Add natural-language planning/verification layer over the structured APIs.
- [ ] **M7.1** Build a dedicated runtime renderer/player and compact export.
- [ ] **M7.2** Add framework integrations and additional export formats.
- [ ] **M8** Add cloud/collaboration only after the runtime/editor contracts are stable.

## 5. Next milestone acceptance checklist

The next milestone should not close until all are true:

- [ ] Direct timeline interactions still work (`play` / `stop` / `seek`).
- [ ] Machine listener `setInput` works from real preview pointer input.
- [ ] Machine listener `fire` works from real preview pointer input.
- [ ] A listener-driven transition changes the visibly evaluated scene.
- [ ] Hover enter/leave remains stable across document replacement/edit/undo/redo.
- [ ] Preview interaction does not accidentally mutate authored document/history.
- [ ] Select/pan/pencil/bone/mesh/control/constraint tools are not hijacked by preview interactions.
- [ ] Missing timeline/machine/input references produce visible diagnostics.
- [ ] Standard `npm test` and `npm run check` are green on the final settled HEAD.

## 6. Product-level definition of “Veyra v1 complete”

For a practical first major release, Veyra does **not** need collaboration or every Rive feature. A strong V1 can be called complete when it has:

1. Reliable vector/path editing, paint, hierarchy and files.
2. Rigging + animation authoring.
3. State-machine visual authoring and listener-driven runtime behavior.
4. Text and images plus clipping/masks/basic effects.
5. AI parity with every human editor action through structured commands/manifest.
6. A lightweight embeddable player/export path.
7. Stable tests, migration and deterministic serialization contracts.

At that point Veyra becomes a coherent AI-native interactive-motion product rather than only a powerful editor core.