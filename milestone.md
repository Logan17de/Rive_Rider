# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They measure verified capability against the current `plan.md` target and should be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92%** | Stable typed identity, universal semantics, name-independent resolver, canonical control plane, dependency/ownership graph, preview/dispatch/verify are substantially in place. |
| Core editor / engine foundation | **~78–82%** | Strong model/store/history/timeline/rig/interaction foundation; several advanced authoring/runtime families are still missing. |
| Modern Rive editor/runtime feature parity | **~40–44%** | Current vector/animation/rig/state-machine/interaction core exists, but most large modern Rive feature families remain. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~39–42%** | Architecture is ahead of raw feature breadth. |
| Remaining full-target work | **~58–61%** | Primarily Components/artboards, Data Binding/View Models, full state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent layer. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED / essentially complete**.
- `plan.md` **M1 — Close current interaction loop:** **implementation complete; awaiting independent verification** after the focused M4 correctness pass below.
- `plan.md` **M2–M14:** not yet completed as primary roadmap milestones; some prerequisite capabilities already exist from the current engine.

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not leave stale percentages after a milestone is accepted or materially re-scoped.

## Mandatory agent rules

1. Preserve the validation boundary and all accepted M0–M4 architecture.
2. Human names are display metadata only; stable typed refs/IDs remain authoritative.
3. Do not rewrite listener CRUD, machine runtime bridging, command/control-plane integration, or interaction transport that already passed review.
4. Runtime interaction remains ephemeral and must not mutate authored document/history.
5. Hit testing must agree with the actual SVG renderer in **screen space**, including renderer viewBox/preserve-aspect-ratio behavior and non-scaling strokes.
6. Exact/current geometry must not become more approximate as artboard size, transform scale, or editor zoom increases.
7. Stable IDs are arbitrary non-empty strings under the current model. Do not parse identity by undocumented delimiter conventions.
8. Do not weaken existing M0–M4 tests or capability declarations.
9. Run `npm test` and `npm run check` before handoff.

---

# MILESTONE M4 — Close the Current Interaction Loop — CORRECTION PASS

**Roadmap mapping:** `plan.md` M1 — Close current interaction loop  
**Status:** `AWAITING VERIFICATION`

## Verification result

The main M4 implementation is accepted in principle:

- persistent listener CRUD exists through Store / command / control plane;
- listener topology and machine/input type validation are implemented;
- listener dependencies remain machine-readable and name-independent;
- persistent machine runtime bridging for `setInput` / `fire` exists;
- timeline `play` / `stop` / `seek` transport remains working;
- pointer enter/leave/down/up/click lifecycle is centralized in one resolver;
- pointer participation is explicit and opacity-independent;
- polygon/star/custom-path hits no longer use broad bounding-box fallbacks;
- adaptive cubic-path flattening, implicit fill closure, and non-scaling stroke testing exist;
- pointer -> listener -> machine -> evaluated animation is covered end to end;
- minimal listener UI authoring exists;
- latest pre-correction `main` Tests workflow was green.

The focused correctness gaps below are now implemented and are awaiting independent verification.

---

## Correction 1 — Hit-test screen mapping must match the SVG renderer at arbitrary canvas sizes

### Problem

`hitTestPoint()` previously converted world points to screen points approximately as:

```js
screenX = (worldX - centerX) * zoom + viewport.width / 2
screenY = (worldY - centerY) * zoom + viewport.height / 2
```

That only matched the renderer when CSS viewport dimensions happened to correspond 1:1 with the artboard/viewBox scale.

### Correction implemented

Renderer and hit testing now share the same canonical SVG viewport contract in `src/veyra/viewport.js`:

- `createSvgViewBox()` defines the renderer pan/zoom viewBox;
- `createSvgViewBoxScreenTransform()` defines the DOM-free world→screen affine transform;
- both explicitly use `preserveAspectRatio="xMidYMid meet"`;
- centered pillarbox/letterbox offsets are part of the transform;
- hit testing composes this transform with each evaluated node world matrix;
- non-scaling stroke distances remain measured in final CSS screen pixels.

The SVG renderer itself now consumes `createSvgViewBox()` and explicitly sets the same preserve-aspect-ratio contract, removing duplicated renderer/hit-test viewport math.

### Tests added

- identical artboard/viewport aspect ratio;
- wider viewport than artboard;
- taller viewport than artboard;
- letterbox/pillarbox miss regions;
- non-1 zoom plus non-default view center;
- transformed path/non-scaling-stroke boundary under aspect-ratio mapping.

---

## Correction 2 — SVG ellipse and rounded-rectangle hits must obey the documented screen-space accuracy contract

### Problem

Ellipse and rounded-rectangle hit geometry previously used fixed polygon counts, so approximation error grew with object size, transform scale and editor zoom.

### Correction implemented

- ellipse fill containment is now analytical in exact local SVG geometry after inverse screen/world transform;
- rounded-rectangle fill containment is now analytical in exact local SVG geometry after inverse screen/world transform;
- curved stroke centerlines use adaptive screen-space tessellation instead of fixed segment counts;
- tessellation count is derived from a conservative second-derivative interpolation-error bound in final screen pixels;
- public hit tolerance remains `VEYRA_HIT_TEST_TOLERANCE_PX = 0.35`;
- curve tessellation consumes only `0.0875px` of that budget (`VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX`), with the remaining allowance reserved for stroke hit tolerance;
- rounded-corner arc endpoints are explicit so straight tangents and curved segments remain independently represented;
- rotation, non-uniform scale, parent/evaluated transforms and zoom are handled through the composed affine matrix.

### Tests added

- ~800px rendered ellipse radius at zoom 8 with 0.1px inside/outside fill checks;
- highly non-uniformly scaled/rotated ellipse;
- large rounded rectangle with large corner radius at zoom 8;
- rotated/non-uniform rounded rectangle;
- stroke-only ellipse and rounded rectangle near the final-pixel tolerance boundary;
- centralized tolerance-budget assertions.

---

## Correction 3 — Pointer lifecycle state must not encode stable IDs with `:` delimiters

### Problem

Hover identity previously encoded `<nodeId>:<listenerRevision>:<sceneRevision>` and recovered the node ID using delimiter parsing, corrupting valid IDs such as `button:primary`.

### Correction implemented

- hover state is now a structured typed node identity object carrying `kind`, full `id`, `listenerRevision`, and `sceneRevision`;
- down-target state is stored as a structured typed node ref;
- target equality compares the complete stable ID;
- listener revision metadata is an opaque JSON tuple serialization and is never reparsed into identity;
- legacy string hover input, if supplied externally, is treated as the complete ID rather than split by punctuation;
- document replacement/reset still clears hover/down state deterministically;
- display names remain irrelevant.

### Tests added

- colon-containing ID `button:primary`;
- URL/property-address-like punctuation ID;
- repeated pointermove inside same punctuated target emits one enter only;
- moving between/away emits exactly one correct leave/enter sequence;
- same punctuated down/up target qualifies click;
- different punctuated down/up targets do not qualify click;
- hostile display-name rename does not affect identity.

---

## Acceptance criteria

M4 is VERIFIED only when:

- all original M4 listener/runtime/control-plane/UI behavior remains green;
- hit testing uses the same screen mapping as the SVG renderer for arbitrary viewport aspect ratios;
- ellipse and rounded-rectangle curved boundaries satisfy the documented final-screen tolerance rather than fixed-segment approximation error;
- polygon/star/path/Bézier/non-scaling-stroke regressions remain green;
- pointer lifecycle preserves the complete stable ID without delimiter parsing;
- pointer -> listener -> machine -> evaluated render remains end-to-end green;
- runtime interaction still leaves authored serialization/history unchanged;
- all M0–M3 tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: 991ea2f514f3fc5c0c458ff1844ba6557b0b5c24; bdd720efc4297f88832d7fb40bce7ba0ef0e4dc3; a47bd9bce38083be892194342526dfe745000b1d; 3f7d5bff6444b12f74c24cacf06c625f437e76bc; final gated integration 8c6e7e515966f5264e000e266dcaff3a7e041084
- Changed files: src/veyra/viewport.js, src/veyra/hitTest.js, src/veyra/listenersRuntime.js, src/veyra/renderer.js, src/index.js, tests/veyra-m4-corrections.test.mjs, milestone.md
- Tests added/changed: dedicated M4 correctness adversarial suite covering aspect-ratio mapping, curved fill/stroke boundaries, and punctuation-safe pointer lifecycle
- npm test: PASS — 29/29 suites in gated correction workflow
- npm run check: PASS — 37/37 source files in gated correction workflow
- Renderer/hit-test screen mapping proof: renderer uses createSvgViewBox(); hit tester uses paired createSvgViewBoxScreenTransform(); both explicitly share xMidYMid meet semantics
- Aspect-ratio/letterbox proof: same/wider/taller viewport tests verify visual-center hits, centered offsets, letterbox/pillarbox misses, pan/view-center and zoom
- Ellipse boundary proof: analytical fill containment plus adaptive final-screen stroke tessellation; high-zoom and non-uniform affine tests pass
- Rounded-rectangle boundary proof: analytical fill containment plus adaptive final-screen corner-arc tessellation; high-zoom/rotated/non-uniform/stroke-only tests pass
- Stable-ID pointer lifecycle proof: hover/down identities are structured typed refs; colon and URL-like IDs retain full identity through enter/leave/click lifecycle
- Existing polygon/star/path/stroke regression proof: original veyra-hittest, M4 interaction-loop, shell bridge/integration and listener runtime suites remain green
- Pointer -> listener -> machine regression proof: original M4 end-to-end interaction-loop suite remains green unchanged
- Runtime non-mutation proof: original M4 serialization/history non-mutation assertions remain green unchanged
- Suggestions added to `suggestions`: none
- Known limitations: correction remains within current M4 legacy interaction scope; clipping/layout/components/accessibility/data-binding behavior remains deferred by the milestone non-goals
```
