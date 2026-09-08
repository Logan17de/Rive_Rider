from pathlib import Path

path = Path('milestone.md')
text = path.read_text(encoding='utf-8')

replacements = {
"| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, universal semantics, name-independent resolver, canonical control plane, dependency/ownership graph, preview/dispatch/verify, and machine-readable interaction surfaces are substantially in place. |":
"| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, universal semantics, name-independent resolver, canonical control plane, dependency/ownership graph, preview/dispatch/verify, machine-readable interaction surfaces, and a non-authored viewport API are substantially in place. |",
"| Core editor / engine foundation | **~82–85%** | Model/store/history/timeline/rig/interaction foundations are strong; workspace usability and several advanced authoring/runtime families remain. |":
"| Core editor / engine foundation | **~86–89%** | Model/store/history/timeline/rig/interaction foundations are strong; M5 adds dependable navigation, focus, panel layout, transform resize, and whole-editor theme behavior. |",
"| Modern Rive editor/runtime feature parity | **~43–47%** | Current vector/animation/rig/state-machine/interaction loop is verified, but most large modern Rive feature families remain. |":
"| Modern Rive editor/runtime feature parity | **~44–48%** | Current vector/animation/rig/state-machine/interaction loop plus sustained-use workspace UX are in place; most large modern Rive feature families remain. |",
"| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~41–44%** | Architecture remains ahead of raw feature breadth. |":
"| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture remains ahead of raw feature breadth; M5 closes a meaningful editor-usability gap without claiming new Rive feature-family parity. |",
"| Remaining full-target work | **~56–59%** | Primarily Components/artboards, Data Binding/View Models, full state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent layer. |":
"| Remaining full-target work | **~55–58%** | Primarily Components/artboards, Data Binding/View Models, full state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent layer. |",
"- **Current interstitial milestone:** Workspace UX Stabilization before starting `plan.md` M2.":
"- **Current interstitial milestone:** M5 Workspace UX Stabilization — **AWAITING VERIFICATION**.",
"**Status:** `READY`": "**Status:** `AWAITING VERIFICATION`",
}
for old, new in replacements.items():
    if old not in text:
        raise RuntimeError(f'missing milestone replacement: {old}')
    text = text.replace(old, new, 1)

old_handoff = '''```text
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
```'''
new_handoff = '''```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: c03d414f611836f7bca21c2b548e649437abdd2e — Implement M5 workspace UX stabilization [m5-applied]
- Changed files: src/veyra/workspace.js, src/veyra/renderer.js, src/veyra/shellBridge.js, src/veyra/serviceRegistry.js, src/index.js, veyra.js, veyra.html, veyra.css, tests/veyra-workspace-ux.test.mjs, milestone.md
- Tests added/changed: dedicated M5 deterministic workspace UX suite covering navigation, anchored zoom, focus bounds, visibility/history, panel layout/persistence, transformed resize, theme state, browser wiring, and M4 viewport/hit-test alignment
- npm test: PASS — 30/30 suites in gated integration
- npm run check: PASS — 38/38 source files in gated integration
- Right-click/middle/Space pan proof: one capture-phase navigation path classifies right/middle/Space+left/Pan-tool/Alt gestures; right-drag suppresses only its recognized canvas context menu; cancel/lost capture cleanly ends pan; panGesture blocks M4 preview dispatch
- Zoom/fit/focus proof: bounded high-resolution wheel deltas, cursor-anchored SVG-meet zoom math, Fit Artboard, Fit Selection, 100%, Focus Selection, F/Shift+F shortcuts, and public editor viewport helpers all use shared deterministic workspace math
- Object focus/locate proof: stable refs drive hierarchy focus; evaluated world bounds include hidden nodes and group descendants; rename/reorder/display names are irrelevant; tiny/degenerate bounds receive bounded focus zoom
- Hierarchy visibility proof: nodes plus supported bone/mesh/control rows expose eye controls; writes target only canonical visible properties through existing Store/property mutation paths and remain undoable
- Panel resize/collapse/persistence proof: left/right/bottom splitters clamp sizes, double-click resets defaults, collapse preserves expanded size, localStorage persists state, desktop/mobile recovery controls remain available, and resize schedules artboard/hit-test synchronization
- Drag/resize authoring proof: move keeps parent-space pointer offset; renderer capture now handles cancel/lost capture/Escape; eight edge/corner handles use one Store transaction with Shift aspect lock, Alt center resize, finite/min-scale guards, and transformed-parent anchor tests; groups intentionally remain move/focus-only
- Theme-system proof: whole-editor semantic tokens provide Neutral Dark, Graphite/Blue, Deep Teal, Warm Dark, Light Neutral; legacy theme values migrate; selected theme persists locally; pink-heavy chrome is no longer the default
- Document non-mutation proof: viewport/panel/theme state lives outside the Veyra document; theme regression compares serialization unchanged; focus/pan/zoom/layout helpers do not use authored Store mutation paths
- M4 viewport/hit-test regression proof: arbitrary panel-driven viewport dimensions still use the canonical SVG viewBox screen mapping; transformed rendered center and runtime hit target remain aligned; resize-handle authoring events are explicitly excluded from preview listeners
- Suggestions added to `suggestions`: none
- Known limitations: group resize is intentionally not implemented because M5 forbids guessing future Layout/Component semantics; viewport/panel/theme persistence is browser-local editor state; no M2 Components/multi-artboard work was started
```'''
if old_handoff not in text:
    raise RuntimeError('handoff block missing')
text = text.replace(old_handoff, new_handoff, 1)
path.write_text(text, encoding='utf-8')
