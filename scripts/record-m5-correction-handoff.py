from pathlib import Path

p = Path('milestone.md')
text = p.read_text()
text = text.replace('**Current interstitial milestone:** M5 Workspace UX Stabilization — **CORRECTIONS REQUIRED**.', '**Current interstitial milestone:** M5 Workspace UX Stabilization — **AWAITING VERIFICATION**.', 1)
text = text.replace('**Status:** `CORRECTIONS REQUIRED`', '**Status:** `AWAITING VERIFICATION`', 1)
old = '''```text
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
```'''
new = '''```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: 25684873a7efb42aa8d66300fd30686f43441d7a — Fix M5 stable camera and artboard border resizing [m5-correction]
- Changed files: src/veyra/viewport.js, src/veyra/workspace.js, src/veyra/gestures.js, src/veyra/renderer.js, src/index.js, veyra.js, veyra.html, veyra.css, tests/veyra-m4-corrections.test.mjs, tests/veyra-m5-camera-artboard-corrections.test.mjs
- Tests added/changed: dedicated M5 camera/artboard correction suite; migrated M4 high-zoom fixture to the stable CSS-pixel zoom definition
- npm test: PASS — 31/31 suites in gated correction integration
- npm run check: PASS — 38/38 source files in gated correction integration
- Viewport scale-invariance proof: canonical camera now defines zoom as CSS pixels per world unit; viewBox width/height are actual host viewport CSS dimensions divided by zoom, so panel/window changes preserve zoom + center and only reveal more/less world; 100% = exactly 1 CSS px per world unit
- Panel resize/collapse proof: workspace layout remains editor-only state; applyWorkspaceLayout and ResizeObserver call renderer.syncViewport() after CSS geometry changes without changing camera center/zoom; repeated arbitrary viewport dimensions keep the same mapping scale and finite matrices
- Renderer/hit-test parity proof: renderer createSvgViewBox and DOM-free createSvgViewBoxScreenTransform consume the same width/height/zoom/center camera contract; M4 hit testing remains aligned at rendered object centers across changed viewport sizes
- Artboard edge/corner classification proof: classifyArtboardResizeZone uses a 7 CSS-pixel screen-space tolerance with corner priority and all eight directions; cursors map to ew/ns/nwse/nesw; classification has no zoom input and is invariant at 10%, 100%, and 800%
- Artboard resize transaction/cancel proof: createArtboardResizeGesture supports all eight directions, begins only after movement threshold, commits one Store transaction, exposes camera-only anchor shifts for left/top, clamps minimum dimensions, and cancel restores exact authored serialization; browser pointercancel/lost capture/Escape route to cancel
- Right-click pan regression proof: resize classification runs only for left-button border proximity before pan routing; right-button pan remains unchanged immediately outside resize zones and the correction suite plus all prior shell/workspace tests are green
- Document/history non-mutation proof: panel/window/camera operations remain outside authored Store state; left/top artboard resize never moves child artwork; only width/height are authored during an actual resize gesture, with no history entry for a sub-threshold click
- Progress snapshot update: verified percentages intentionally remain at the verifier-reset M0–M4 values until M5 is independently accepted; this correction pass does not self-count unverified progress
- Suggestions added to `suggestions`: none
- Known limitations: the current single-artboard document still stores width/height only; left/top opposite-edge anchoring is represented by an editor-camera shift during the gesture rather than a persisted artboard origin. Child artwork is never mutated. A future explicit artboard origin belongs with the planned multi-artboard/component model, not this bounded correction pass.
```'''
if old not in text:
    raise SystemExit('handoff template not found')
text = text.replace(old, new, 1)
p.write_text(text)
print('M5 correction handoff recorded')
