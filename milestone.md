# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count only **independently verified capability** and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Stable typed identity, universal semantics, name-independent resolver, one control plane, ownership/dependency graph, project/component refs and nested runtime scopes are verified for the current feature graph. |
| Core editor / engine foundation | **~90–92%** | M0–M6 foundations are verified, including stable camera/client anchoring, exact current interaction loop, multi-artboards, Components, rigged instance evaluation and isolated nested runtime scopes. |
| Modern Rive editor/runtime feature parity | **~50–54%** | Components/multi-artboards and current rig/runtime integration are now counted. Large remaining families include View Models/Data Binding, layered state machines, layout, text/assets/effects, richer animation authoring, scripting/WGSL and production runtimes. |
| Lottie / dotLottie / Creator ecosystem parity | **~25–30%** | Current native vector/timeline/state/component foundations overlap with Lottie authoring, but formal Lottie/dotLottie import/export, masks/mattes, Motion Tokens, broad compatibility and package/runtime work remain substantial. |
| Full Veyra superset target | **~43–47%** | Target now explicitly means Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while staying modular/lightweight. |
| Remaining full-target work | **~53–57%** | Current vector-authoring UX, then Data Binding/View Models, full state-machine/animation parity, layout/text/effects/assets, interchange, scripting/plugins, runtimes/SDKs, collaboration, accessibility, compatibility certification and AI/MCP productization. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Close current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED**.
- `plan.md` M2 / implementation M6 — Multi-Artboard, Components & Project Graph: **VERIFIED**.
- **Current milestone M7 — Vector Authoring, Multi-Selection & Grouping UX: AWAITING VERIFICATION.**
- After M7, resume `plan.md` M3 — View Models / Data Binding / Property Groups / Enums / Converters / Lists.

### M6 verification record

M6 was independently accepted on `main` implementation/handoff head `8532775e05cdca6247fede9846189d2b491579f8`.

Verified:

- persisted Component timeline/state-machine selection/remap/mix behavior;
- legal nested Component transform composition;
- rigged Component nodes/bones/meshes/controls/constraints in host evaluation;
- client-space graph anchoring across panel resize/collapse;
- authored stroke scaling with zoom while editor overlays remain screen-space UI;
- full typed nested Component runtime-scope isolation;
- runtime scopes/evaluated identities remain ephemeral;
- existing M0–M6 contracts remain green;
- standard GitHub `Tests` on the exact handoff head: **40/40 syntax checks, 35/35 suites**.

### Progress maintenance rule

Every future milestone verification or advance must refresh this Progress snapshot in the same `milestone.md` commit. Do not count unverified work as completed progress.

---

# MILESTONE M7 — Vector Authoring, Multi-Selection & Grouping UX

**Status:** `AWAITING VERIFICATION`

## Goal

Make Veyra feel like a real daily-use vector animation editor for drawing and manipulating artwork, while keeping every operation stable-ID based, undoable, AI-addressable, deterministic and lightweight.

After M7, users must be able to:

```text
see exact stage coordinates
→ draw a persistent path naturally
→ create/edit Bezier curves
→ add/remove/edit vertices
→ multi-select artwork
→ marquee select
→ Ctrl/Cmd+G group
→ Ctrl/Cmd+Shift+G ungroup
→ preserve world transforms and draw order
```

The implementation must preserve all M0–M6 contracts and `QUALITY.md`.

---

## Mandatory rules

1. **Never discard a valid user drawing silently.** A valid Pen draft must finalize deterministically when the user finishes or changes tools.
2. **Persistent geometry uses stable typed identity.** Path vertices are not addressed only by array index.
3. **Human UI and AI use the same canonical commands.** Do not add UI-only group/path mutations.
4. **Selection is editor state.** Multi-selection/marquee state is not serialized into `.veyra` unless a future explicit collaboration/presence contract says otherwise.
5. **Grouping must preserve appearance.** Child world transforms, draw order, artboard ownership and semantic identity survive group/ungroup.
6. **No name dependence.** Group/path operations use refs, not display-name lookup.
7. **No runtime tax for editor-only UX.** Coordinate HUD, marquee visuals, editing handles and shortcut UI remain editor-only.
8. **No second geometry model.** Renderer, hit testing, path editor and export consume the canonical path representation.
9. **Zoom/UI correctness remains a release gate.** Test 10%–800% zoom and nested transforms.
10. `npm run check`, `npm test`, and final-head GitHub `Tests` must pass.

---

## Task 1 — Stage coordinates and position readout

Add a clear coordinate surface for the active artboard.

### Requirements

- Pointer movement over the stage shows canonical world `X / Y`.
- Coordinates use the exact same client↔world transform used by renderer/hit testing.
- Selected object Inspector clearly exposes authored transform X/Y.
- For evaluated/derived values, label authored vs evaluated instead of overwriting authored numbers.
- Multi-selection shows selection bounds/center as derived editor information; it must not invent a shared authored X/Y property.
- Coordinate readout remains correct after pan, zoom, panel resize/collapse, artboard origin changes and HiDPI/browser resize.

---

## Task 2 — Rive-style Pen / Draw Path lifecycle

The current draft-path behavior is not acceptable because changing tools/Escape can erase valid work.

### Required behavior

- Click places a straight vertex.
- Click + drag creates a vertex with Bezier handles immediately.
- A valid draft with **2+ vertices** must be committed/finalized when:
  - the user presses `Esc`;
  - the user switches to another tool;
  - the user explicitly chooses Done/Finish;
  - the user closes the path by targeting the first vertex.
- A one-point incomplete draft may cancel on `Esc`.
- Closing the path sets canonical `geometry.closed` rather than faking a duplicate endpoint.
- Final path creation is one authored, undoable canonical command/transaction.
- Draft overlays remain editor-only and are never serialized.
- Tool switching must never race with commit and produce duplicate/half-created paths.

---

## Task 3 — Edit Vertices mode and Bezier handles

### Entry/exit

- `Enter` on a selected editable path enters Edit Vertices mode.
- `Esc` / visible **Done Editing** exits vertex editing when no Pen draft is active.
- Selection and mode transitions are deterministic and keyboard accessible.

### Vertex editing

- Drag a vertex to move it.
- Drag incoming/outgoing handles to reshape the curve.
- Zero-length handles must have a discoverable way to become smooth/curved from the canvas; do not leave an invisible ungrabbable capability gap.
- Support explicit handle modes compatible with Rive-style concepts:
  - straight/corner;
  - mirrored;
  - asymmetric/aligned;
  - detached/free.
- Ctrl/Cmd+click vertex toggles the documented straight/smooth behavior where applicable.
- Ctrl/Cmd+click handle removes that handle.
- Alt/Option+click or equivalent detaches a handle pair.
- Handle mode and geometry survive save/load and undo/redo.

### Corner radius

- Straight vertices expose deterministic corner radius where supported.
- Radius is editable in Inspector and with a direct stage affordance.
- Define how rounded corners compile to explicit curve geometry for rendering/export without destroying the authored editable intent unnecessarily.

---

## Task 4 — Canonical path topology commands

Add stable command-registry operations for at least:

```text
addVertex
removeVertex
moveVertex
moveBezierHandle
setVertexHandleMode
setVertexCornerRadius
openPath
closePath
reversePath
```

Requirements:

- command parameters use stable node/pathVertex refs where possible;
- adding/removing vertices gives deterministic persistent IDs;
- removing/reordering a vertex does not re-identify surviving vertices;
- animation/property-address references either remap safely or fail closed with dependency evidence;
- preview/dispatch/verify/history/provenance parity follows the existing control-plane contract;
- browser/global adapter remains thin over the same commands.

---

## Task 5 — Multi-selection foundation

Upgrade editor selection from a single selected entity to a deterministic ordered set of stable typed refs while preserving a primary selection for Inspector compatibility.

### Required behavior

- Shift+click toggles membership.
- Clicking empty stage clears selection unless modifier behavior says otherwise.
- Hierarchy selection and canvas selection converge on the same selection model.
- Selection order is deterministic and never based on display names.
- Locked/hidden entities obey explicit selection policy.
- Selecting nested/grouped content supports a deliberate deep-selection gesture without breaking ordinary parent selection.
- Existing single-selection APIs remain compatible or migrate explicitly.

Selection state stays editor-only.

---

## Task 6 — Marquee / box selection

- Drag on empty stage in Select mode creates a screen-space marquee.
- Convert marquee bounds through the canonical viewport transform.
- Select entities using evaluated geometry/bounds, not hierarchy row coordinates.
- Define contain-vs-intersect behavior and modifier semantics explicitly.
- Work at 10%–800% zoom, rotated/nested transforms and non-zero artboard origins.
- Marquee visuals remain editor-only.

---

## Task 7 — Group / ungroup

### Shortcuts

- Windows/Linux: `Ctrl+G` group.
- macOS: `Cmd+G` group.
- `Ctrl/Cmd+Shift+G` ungroup.

### Grouping contract

Grouping the selected entities must:

- create a real persistent group node with a fresh stable ID;
- preserve every selected child's rendered world transform;
- preserve relative draw order;
- preserve artboard ownership;
- reject incompatible cross-artboard selections fail-closed;
- preserve semantics, animation bindings, rig/dependency references and stable child IDs;
- select the new group after success;
- be one undoable transaction.

### Ungrouping contract

Ungroup must:

- reparent children to the group's parent;
- preserve each child's rendered world transform;
- preserve deterministic draw order at the removal position;
- leave child IDs unchanged;
- cleanly remove the group and its semantic/dependency records according to canonical deletion rules;
- be one undoable transaction.

Nested groups and rotated/non-uniformly-scaled parents require adversarial tests.

---

## Task 8 — Semantic shortcut command layer

Do not implement new keyboard behavior as scattered raw key checks only.

Introduce/extend semantic editor command IDs for this milestone, e.g.:

```text
editor.path.pen
editor.path.finish
editor.path.editVertices
editor.selection.group
editor.selection.ungroup
editor.selection.selectAll
editor.view.cleanPreview
```

Keyboard bindings are adapters over those semantic commands.

This should make later Veyra/Rive/Lottie/Custom keymap profiles possible without changing document logic.

---

## Task 9 — Clean artwork / overlay control

M6 added a low-zoom rig-overlay policy. M7 should make inspection intentional rather than implicit only.

At minimum add a deterministic editor-only control for hiding/showing relevant editor overlays (selection/rig/handles as appropriate) or a clean Preview mode.

Requirements:

- final artwork never changes;
- export never includes editor overlays;
- interaction-test mode and editing mode remain distinct;
- overlay visibility is workspace state, not authored animation data.

---

## Task 10 — AI/read/manifest parity

AI must be able to discover and perform everything added here without using screen coordinates or names.

Expose/query:

- selected stable refs and primary selection through an editor-state read surface where appropriate;
- group hierarchy and ownership;
- path vertices, handle modes, corner radius and closed/open state;
- canonical topology/group commands and schemas;
- dependency warnings before destructive topology/group operations.

Do not serialize ephemeral selection/marquee/hover state into the project manifest as authored data; expose it only through explicit editor-state surfaces.

---

## Task 11 — Lightweight and quality gates

This milestone must preserve `QUALITY.md`.

Specific M7 rules:

- coordinate HUD, marquee, editing handles and shortcut UI are editor-only;
- do not add a heavy runtime dependency to implement editor geometry UX;
- grouping should reuse existing nodes/geometry instead of cloning artwork;
- Pen/edit operations invalidate only affected path geometry/tessellation caches where such caches exist;
- no full-document rebuild should be introduced into pointermove hot paths without evidence and bounded behavior;
- save files must not contain temporary draft/marquee/selection data;
- rendering/export semantics remain identical for the same authored path.

---

## Mandatory adversarial tests

Prove at least:

1. pointer X/Y readout matches client↔world mapping after pan/zoom/panel changes;
2. Pen `Esc` commits a 2+ vertex path;
3. switching tools commits a valid Pen draft once and only once;
4. one-point draft cancellation leaves history/document clean;
5. click-drag creates usable Bezier handles;
6. zero-handle straight vertex can become curved from canvas UX;
7. handle modes survive save/load/undo/redo;
8. add/remove vertex preserves surviving vertex IDs;
9. open/close/reverse path are deterministic and undoable;
10. Shift+click multi-selection works with duplicate/misleading names;
11. marquee works under non-zero artboard origin, zoom and nested transforms;
12. Ctrl/Cmd+G preserves each child's world matrix and draw order;
13. Ctrl/Cmd+Shift+G restores children without visual movement;
14. group/ungroup under rotated + non-uniformly-scaled parent preserves geometry within tolerance;
15. cross-artboard grouping fails without document/revision/history mutation;
16. dependency-bound path topology changes fail closed or remap explicitly;
17. clean-preview/overlay state never changes serialization/history;
18. browser/UI mutation paths match canonical command catalog;
19. name randomization/duplicates do not alter command targets;
20. 10%–800% zoom does not change authored geometry semantics.

---

## Explicit non-goals

Do not expand M7 into:

- View Models/Data Binding/Property Groups/Enums/Converters/Lists;
- full Graph Editor/easing/value curves;
- Shape Builder/boolean geometry;
- masks/mattes/blend-mode expansion;
- text/layout systems;
- scripting/WGSL;
- Lottie/dotLottie import/export;
- Rust/WASM runtime rewrite;
- MCP/headless CLI.

Those remain roadmap work after this bounded editor-authoring milestone.

---

## M7 acceptance

M7 is VERIFIED only when:

- valid Pen drawings no longer disappear on Escape/tool switch;
- Rive-style vertex/Bezier editing is usable from the stage;
- topology mutations have stable canonical commands;
- multi-selection + marquee are real editor primitives;
- Ctrl/Cmd+G and ungroup preserve world transforms/draw order;
- stage coordinates are canonical and accurate;
- editor overlays can be inspected/hidden without affecting authored output;
- UI/AI command parity and name-independence hold;
- `QUALITY.md` gates are preserved;
- M0–M6 tests remain green;
- `npm run check` passes;
- `npm test` passes;
- latest standard GitHub `Tests` passes on the exact final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: 3e22fe2cbbf5bd72dfb07161805e0c6c8a6008af (main M7 implementation) + 6959a0e6cc158b9468c5fcf1a37f1becc6072957 (final path-safety/canonical-hit correction).
- Changed files: src/veyra/editorAuthoring.js; src/veyra/model.js; src/veyra/capabilities.js; src/veyra/geometry.js; src/veyra/hitTest.js; src/veyra/store.js; src/veyra/commands.js; src/veyra/controlPlane.js; src/veyra/serviceRegistry.js; src/veyra/renderer.js; src/index.js; veyra.js; veyra.html; veyra.css; tests/veyra-m7-authoring.test.mjs; tests/veyra-manifest.test.mjs; tests/veyra-renderer-interaction.test.mjs.
- Tests added/changed: tests/veyra-m7-authoring.test.mjs now carries 22 adversarial checks (the 20 mandatory M7 gates plus non-contiguous sibling draw-order failure and canonical rounded-path render/export/hit-test parity); manifest action-count expectation migrated for the additive 11 M7 persistent commands; legacy renderer path interaction fixture migrated from vertex indexes to stable pathVertex IDs.
- npm test: PASS — 36/36 suites on the final M7 correction runner; all M0–M6 suites remained green.
- npm run check: PASS — 41/41 source files on the final M7 correction runner.
- Coordinate/readout proof: stage pointer readout uses renderer.clientPoint(), the same client↔world CTM/viewBox mapping used by rendering/hit testing; authored local Transform X/Y remain editable while evaluated world X/Y and multi-selection bounds are labeled read-only derived editor data; adversarial mapping checks cover 10%/100%/800%, changed viewport sizes/centers and non-zero artboard origins.
- Pen lifecycle proof: click places a straight draft vertex; click-drag emits mirrored Bezier handles immediately; a 2+ vertex draft finalizes once through the canonical add command on Esc, tool switch, visible Done/Finish, or first-vertex close; close authors geometry.closed with no duplicate endpoint; a one-point draft clears without document/revision/history mutation.
- Vertex/Bezier editing proof: Enter/Edit Vertices and Done/Esc mode transitions are semantic editor commands; vertex/handle drags target stable pathVertex IDs; Ctrl/Cmd-click toggles straight↔smooth, Ctrl/Cmd-click handle removes that handle, Alt/Option supports handle detachment/straight→curve creation; straight/mirrored/aligned/detached modes persist; corner radius is inspector/stage editable and compiles to explicit derived quadratic path segments. Renderer/export and hit testing now consume the same pathSegments() compiler.
- Topology/stable-ID proof: canonical command actions addVertex/removeVertex/moveVertex/moveBezierHandle/setVertexHandleMode/setVertexCornerRadius/openPath/closePath/reversePath use stable node/pathVertex identity; implicit new vertex IDs are deterministic under the existing preview/dispatch snapshot generator; removing a dependency-bound vertex fails closed with evidence; reversePath preserves vertex IDs and remaps matching inX↔outX/inY↔outY timeline/Component-override property addresses.
- Multi-selection/marquee proof: EditorSelectionState is an ordered stable-ref set with a primary selection and remains editor-only; Shift toggles membership from hierarchy/canvas; ordinary grouped selection targets the parent while deliberate deep selection is supported; marquee converts screen drag endpoints through renderer.clientPoint(), uses evaluated geometry/bounds, supports intersect vs Ctrl/Cmd contain and Shift additive behavior, and is tested with nested transforms/non-zero artboard origin.
- Group/ungroup transform + draw-order proof: groupNodes/ungroupNode are one canonical undoable Store commands; grouping creates a fresh deterministic stable group ID, keeps child IDs/semantics/dependencies/artboard ownership, preserves world matrices and relative draw order, and selects the result; ungroup folds the group's matrix into children and restores them at the group removal position. Rotated + non-uniform parent cases are tested. Cross-artboard, cross-parent and non-contiguous sibling selections fail before mutation so appearance/coordinate domains/stacking cannot silently change.
- Shortcut command-layer proof: editor.path.pen, editor.path.finish, editor.path.editVertices, editor.selection.group, editor.selection.ungroup, editor.selection.selectAll and editor.view.cleanPreview are semantic editor command IDs; keyboard/button bindings are adapters over that dispatcher rather than document mutations hidden in raw key handlers.
- Overlay/clean-preview proof: selection/vertex/rig/guide overlay visibility is renderer/editor workspace state only; clean Preview changes no authored serialization/history and export remains derived solely from authored/evaluated artwork.
- UI/AI/manifest parity proof: the command catalog grows additively to 76 actions with 11 M7 persistent path/group mutations; browser persistent helpers route through dispatchCompatibilityCommand/controlPlane; global getEditorState exposes selected stable refs, primary selection, tool, pointer readout, clean-preview state, draft count and overlay state without serializing them; resolver/property-address surfaces already expose pathVertex ownership and canonical node geometry properties.
- Lightweight/performance impact: no external/heavy runtime dependency was added; selection, marquee, coordinate HUD, handles, Pen draft and shortcut state stay editor-only; grouping reparents existing nodes instead of cloning artwork; pointer drags use the existing bounded Store transaction/live-geometry seam; canonical derived pathSegments() is shared by render/export/hit-test rather than introducing another geometry model.
- Persistence/history proof: handleMode/cornerRadius/open/closed/topology survive normalize/save/load; path/group authored operations are one undoable command each; rejected topology/group operations preserve serialization/revision/history; selection, marquee, hover, clean-preview and Pen draft never enter .veyra serialization.
- Name-independence proof: duplicate/randomized display-name adversarial checks still target stable refs/addresses correctly; no M7 persistent command resolves by display name.
- Existing M0–M6 regression proof: final M7 correction runner reported 36/36 suites PASS, including M4 interaction/hit tests, M5 camera/artboard/workspace, and all M6 project-graph/Component/runtime-scope suites.
- Progress snapshot update: verified-only percentages intentionally remain AI 94–96%, core 90–92%, Rive parity 50–54%, Lottie/dotLottie 25–30%, full Veyra 43–47%, remaining 53–57% until independent acceptance.
- Suggestions added to `suggestions`: none.
- Known limitations: M7 grouping deliberately accepts only a same-artboard, same-parent, contiguous sibling range. Broader arbitrary-parent/interleaved grouping is fail-closed because preserving only the picture would otherwise alter local animation/property coordinate domains or stacking relative to unselected siblings. Any future expansion needs explicit binding/reparent remap semantics and is outside this milestone.
```
