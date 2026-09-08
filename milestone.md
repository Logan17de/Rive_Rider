# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, semantics, name-independent resolution, canonical control plane, dependency/ownership graph, preview/dispatch/verify and machine-readable interaction surfaces are verified. |
| Core editor / engine foundation | **~82–85%** | M0–M4 are verified. Most of M5 is implemented and the stable camera is accepted, but M5 is not counted until the final artboard-origin correction below passes. |
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

# MILESTONE M5 — Workspace UX Stabilization — FINAL CORRECTION PASS

**Roadmap mapping:** interstitial editor-quality gate between verified `plan.md` M1 and `plan.md` M2  
**Status:** `CORRECTIONS REQUIRED`

## Independent verification result

The correction at `25684873a7efb42aa8d66300fd30686f43441d7a` successfully fixes the **stable camera** contract:

- `zoom` now has stable CSS-pixel/world-unit meaning;
- panel/window resize changes visible extent without changing camera scale;
- renderer and M4 hit testing share the same viewport transform;
- 100% means `1 world unit = 1 CSS pixel`;
- all eight screen-space artboard edge/corner zones exist;
- permanent artboard resize-handle DOM is removed;
- cancel/undo and pointer-capture plumbing are substantially in place;
- final `main` CI at `262791be19d859a73179223fddb952ca341ba6d8` is green.

One correctness blocker remains before M5 can be accepted.

---

## Final blocker — left/top artboard resize must move the ARTBOARD FRAME, not the CAMERA

### Current bug

For left/top resize, `createArtboardResizeGesture()` currently returns `anchorShiftX` / `anchorShiftY`, and the browser applies those values by changing the editor camera center.

That keeps the opposite artboard edge visually fixed, but it also moves **all artwork on screen** because camera motion affects the entire world.

The existing regression only proves that child **serialized coordinates** are unchanged. It does not prove that the child's **rendered screen position** is unchanged.

Example at fixed zoom:

```text
before left-edge resize:
artboard 0 -------------------------- 800
            artwork @ x=200

user drags LEFT edge right by 40 world units

required:
artboard 40 ------------------------- 800
            artwork stays at the same world/screen position

current implementation effectively stores:
artboard 0 -------------------------- 760
+ shifts camera to fake the old right edge
=> artwork visibly moves even though its JSON did not change
```

This violates the M5 requirement that left/top artboard resizing preserve the opposite frame edge **without moving child artwork**.

It also does not survive document semantics cleanly: the current document stores only artboard width/height, so after save/load there is no persistent information saying that the left/top edge moved.

### Required correction

Introduce the smallest explicit persistent single-artboard frame-origin contract now, designed to migrate cleanly into M2 multi-artboards.

Recommended model:

```js
artboard: {
  x: 0,
  y: 0,
  width: 960,
  height: 640,
  background: '#...'
}
```

Equivalent explicit `originX` / `originY` naming is acceptable if used consistently, but **camera state must not represent authored artboard position**.

Legacy documents without origin fields must normalize deterministically to `x: 0`, `y: 0`.

### Direction semantics

At fixed artwork/world coordinates:

- **right**: increase/decrease `width`; `x` unchanged;
- **bottom**: increase/decrease `height`; `y` unchanged;
- **left**: change `x` and `width` so the previous right edge `x + width` remains fixed;
- **top**: change `y` and `height` so the previous bottom edge `y + height` remains fixed;
- corners compose the corresponding horizontal + vertical rules.

The editor camera (`zoom`, `centerX`, `centerY`) must remain unchanged during an artboard-frame resize unless the user separately invokes pan/fit/focus.

### Required integration

All production surfaces that assume an artboard starts at `(0,0)` must consume the explicit origin consistently, including at minimum:

- model creation/normalization/validation/migration;
- serialization/load round trip;
- evaluated scene artboard metadata;
- renderer artboard background/frame;
- `syncArtboardFrame()`;
- Fit Artboard camera calculation;
- artboard edge/corner screen classification;
- SVG/export viewBox/background behavior where applicable;
- project/AI read surface if artboard dimensions/position are exposed;
- undo/redo for artboard resize.

Do **not** implement full multi-artboards/components in this correction pass. This is only the minimal persistent origin needed to make the current single artboard resize semantically correct.

---

## Mandatory adversarial tests

M5 cannot pass without tests proving all of the following using production math:

1. left-edge resize keeps the old **right world edge** fixed;
2. top-edge resize keeps the old **bottom world edge** fixed;
3. top-left / top-right / bottom-left / bottom-right compose correctly;
4. camera `{ zoom, centerX, centerY }` is bit-for-bit unchanged through every artboard resize direction;
5. a child object's **world position** is unchanged through every artboard resize direction;
6. a child's **CSS screen position** is unchanged during left/top resize at fixed camera;
7. right/bottom resize does not move the artboard origin;
8. legacy file without origin loads as `(0,0)`;
9. save → reload after left/top resize preserves the same artboard frame edges and artwork relationship;
10. undo restores exact `x/y/width/height` and redo reapplies them;
11. cancel / Escape / pointercancel / lost capture restores exact pre-resize serialization and camera;
12. sub-threshold border click creates no history entry;
13. edge/corner classification still uses the 7 CSS-pixel zone at 10%, 100%, and 800%;
14. renderer + M4 hit testing remain aligned after left/top resize;
15. panel/window resize after a left/top artboard resize still preserves camera scale/center;
16. `Fit Artboard` correctly centers/fits an artboard whose origin is not `(0,0)`;
17. no permanent corner handle returns;
18. all existing M0–M5 tests remain green.

### Specific regression that must fail on the current implementation

Create a child at a fixed world position, capture its screen point, resize the artboard from the **left** while keeping the same camera, and assert the screen point is identical afterward.

The current camera-shift implementation must not be accepted by weakening this test.

---

## Do not regress accepted M5 work

Preserve:

- stable CSS-pixel camera semantics;
- panel/window resize scale invariance;
- right/middle/Space canvas pan;
- explicit fit/focus commands;
- hierarchy focus/eye controls;
- panel splitter/collapse persistence;
- authored object move/resize transactions;
- Neutral Dark + semantic theme system;
- all eight 7px artboard resize zones and cursors;
- runtime-listener isolation;
- full document non-mutation for viewport/panel/theme operations;
- all M0–M4 contracts.

---

## Acceptance criteria

M5 is VERIFIED only when:

- stable camera behavior remains correct and green;
- artboard has a real persistent origin/frame position rather than a camera workaround;
- every edge/corner resize has correct anchored-frame semantics;
- artwork does not move visually or structurally when only the artboard frame is resized;
- save/load/undo/redo preserve artboard-origin semantics;
- renderer/hit testing/export/focus consume the same artboard frame contract;
- all prior M5 UX features remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes on the final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Persistent artboard-origin proof:
- Left/top opposite-edge proof:
- Artwork world/screen stationarity proof:
- Camera non-mutation proof:
- Save/load migration proof:
- Undo/redo/cancel proof:
- Renderer/hit-test/export integration:
- Existing M5 regression proof:
- Latest main CI:
- Suggestions added to `suggestions`:
- Known limitations:
```
