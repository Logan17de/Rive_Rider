from pathlib import Path

p = Path('milestone.md')
t = p.read_text()

roadmap_old = '**Current milestone M7 — Vector Authoring, Multi-Selection & Grouping UX: READY.**'
roadmap_new = '**Current milestone M7 — Vector Authoring, Multi-Selection & Grouping UX: AWAITING VERIFICATION.**'
if roadmap_old not in t:
    raise SystemExit('missing M7 roadmap status anchor')
t = t.replace(roadmap_old, roadmap_new, 1)

status_old = '**Status:** `READY`'
status_new = '**Status:** `AWAITING VERIFICATION`'
if status_old not in t:
    raise SystemExit('missing M7 status anchor')
t = t.replace(status_old, status_new, 1)

handoff_old = '''```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Coordinate/readout proof:
- Pen lifecycle proof:
- Vertex/Bezier editing proof:
- Topology/stable-ID proof:
- Multi-selection/marquee proof:
- Group/ungroup transform + draw-order proof:
- Shortcut command-layer proof:
- Overlay/clean-preview proof:
- UI/AI/manifest parity proof:
- Lightweight/performance impact:
- Persistence/history proof:
- Name-independence proof:
- Existing M0–M6 regression proof:
- Progress snapshot update: keep verified-only percentages unchanged until independent acceptance
- Suggestions added to `suggestions`:
- Known limitations:
```'''

handoff_new = '''```text
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
```'''

if handoff_old not in t:
    raise SystemExit('missing M7 handoff template')
t = t.replace(handoff_old, handoff_new, 1)
p.write_text(t)
print('M7 handoff recorded as AWAITING VERIFICATION')
