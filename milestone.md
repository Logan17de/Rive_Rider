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
- `plan.md` **M1 — Close current interaction loop:** **~95% complete**, currently blocked only by the focused M4 correction pass below.
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
**Status:** `CORRECTIONS REQUIRED`

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
- latest `main` Tests workflow is green.

Do **not** rebuild those systems. Fix only the correctness gaps below.

---

## Correction 1 — Hit-test screen mapping must match the SVG renderer at arbitrary canvas sizes

### Problem

`hitTestPoint()` currently converts world points to screen points approximately as:

```js
screenX = (worldX - centerX) * zoom + viewport.width / 2
screenY = (worldY - centerY) * zoom + viewport.height / 2
```

That only matches the renderer when the CSS viewport dimensions happen to correspond 1:1 with the artboard/viewBox scale.

The real editor SVG fills the available stage (`width: 100%; height: 100%`) and the renderer changes its `viewBox`. SVG's preserve-aspect-ratio mapping can therefore introduce a uniform scale and letterbox offsets whenever the canvas aspect ratio differs from the viewBox/artboard aspect ratio.

Result: the rendered object and the runtime hit target can disagree in the actual editor even though tests using a 960×640 viewport against a 960×640 artboard pass.

### Required behavior

Use one renderer-consistent mapping contract.

Acceptable directions include:

- a DOM-free equivalent of the SVG viewBox + preserveAspectRatio transform passed into `hitTestPoint()`; or
- an explicit world-to-screen matrix produced by the host/renderer and consumed by the DOM-free hit tester.

Requirements:

- exact same world->screen mapping for rendering and runtime hits;
- correct centered letterboxing/pillarboxing behavior;
- pan/view-center and zoom remain correct;
- transformed paths/polygons/stars/rectangles/ellipses remain correct;
- non-scaling stroke distances remain measured in final screen pixels;
- DOM-free tests can construct the mapping deterministically without browser layout.

### Mandatory tests

1. artboard and viewport with identical aspect ratio;
2. wider viewport than artboard;
3. taller viewport than artboard;
4. non-1 zoom plus non-default view center;
5. a point at the visually rendered center hits in all cases;
6. a point in letterbox/pillarbox space does not become a false geometry hit;
7. transformed path/stroke hit boundary still matches after aspect-ratio mapping.

---

## Correction 2 — SVG ellipse and rounded-rectangle hits must obey the documented screen-space accuracy contract

### Problem

The renderer draws current rectangles/ellipses using SVG geometry, but `hitTest.js` currently approximates them with fixed polygon counts:

- ellipse: 72 segments;
- rounded rectangle: 8 segments per quarter corner.

Those counts do not depend on radius, transform scale, or editor zoom. At large object sizes / zoom, the screen-space error grows well beyond `VEYRA_HIT_TEST_TOLERANCE_PX = 0.35`.

So M4 currently claims exact evaluated rectangle/ellipse hit behavior while near curved boundaries can produce false negatives relative to the rendered SVG.

### Required behavior

Use renderer-equivalent math or adaptive screen-space approximation whose maximum error is bounded by the documented tolerance.

Preferred where practical:

- analytical ellipse containment/distance in an appropriate coordinate space;
- analytical rounded-rectangle containment/distance;

or a proven adaptive tessellation bounded in final screen pixels.

Requirements:

- fill and stroke behavior agree with current SVG geometry;
- rotation / non-uniform scale / parent transforms are supported;
- non-scaling stroke remains screen-space correct;
- accuracy does not degrade with zoom or large geometry;
- tolerance is centralized and documented rather than being a magic fixed segment count.

### Mandatory tests

1. large ellipse at max/current high editor zoom with points just inside/outside a curved boundary;
2. highly non-uniformly scaled ellipse;
3. large rounded rectangle with a large corner radius at high zoom;
4. rotated/scaled rounded rectangle;
5. stroke-only ellipse/rounded rectangle where applicable;
6. prove boundary error remains within the documented screen-space tolerance.

---

## Correction 3 — Pointer lifecycle state must not encode stable IDs with `:` delimiters

### Problem

The current model accepts any non-empty string as a node ID.

`createListenerResolver()` currently stores hover state in a string similar to:

```text
<nodeId>:<listenerRevision>:<sceneRevision>
```

and recovers the previous target using:

```js
hoverKey.split(':')[0]
```

A valid node ID such as:

```text
button:primary
```

is therefore read back as `button`.

This can make pointerenter repeat while staying on the same target, prevent the correct pointerleave target from being identified, and generally makes interaction identity depend on an undocumented ID character restriction.

### Required behavior

Keep hover/down lifecycle identity structured rather than delimiter-parsed.

For example:

```js
{
  target: { kind: 'node', id: 'button:primary' },
  listenerRevision: '...',
  sceneRevision: 12
}
```

or another deterministic representation that never reparses the stable ID text.

Requirements:

- no display names involved;
- no undocumented forbidden characters introduced merely for pointer state;
- existing simple IDs behave identically;
- listener/scene revision metadata may remain advisory for invalidation, but target equality uses the full stable ref/ID;
- reset/document replacement/down-target behavior remains deterministic.

### Mandatory tests

1. node ID containing `:`;
2. node ID containing URL/property-address-like punctuation where the model permits it;
3. moving repeatedly inside the same such target emits pointerenter only once;
4. moving away emits exactly one pointerleave for the full original ID;
5. down/up on the same punctuated ID still qualifies click;
6. down on one punctuated ID and up on another does not qualify click;
7. rename/display-name changes remain irrelevant.

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
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Renderer/hit-test screen mapping proof:
- Aspect-ratio/letterbox proof:
- Ellipse boundary proof:
- Rounded-rectangle boundary proof:
- Stable-ID pointer lifecycle proof:
- Existing polygon/star/path/stroke regression proof:
- Pointer -> listener -> machine regression proof:
- Runtime non-mutation proof:
- Suggestions added to `suggestions`:
- Known limitations:
```
