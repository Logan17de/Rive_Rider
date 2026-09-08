from pathlib import Path
import re

path = Path('milestone.md')
text = path.read_text(encoding='utf-8')

text = text.replace(
    '- **Current interstitial milestone:** M5 Workspace UX Stabilization — **CORRECTIONS REQUIRED**.',
    '- **Current interstitial milestone:** M5 Workspace UX Stabilization — **AWAITING VERIFICATION**.',
    1,
)
text = text.replace('**Status:** `CORRECTIONS REQUIRED`', '**Status:** `AWAITING VERIFICATION`', 1)

handoff = '''## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: ae2c7e814484a03da559b15e965433efdf169119 — Fix M5 persistent artboard frame origin [m5-final-correction]
- Changed files: src/veyra/model.js, src/veyra/io.js, src/veyra/viewport.js, src/veyra/workspace.js, src/veyra/gestures.js, src/veyra/renderer.js, src/veyra/hitTest.js, src/veyra/shellBridge.js, src/veyra/geometry.js, veyra.js, tests/veyra-gestures.test.mjs, tests/veyra-m5-camera-artboard-corrections.test.mjs, tests/veyra-m5-artboard-origin-final.test.mjs, milestone.md
- Tests added/changed: dedicated final M5 artboard-origin adversarial suite plus migrated gesture/camera-artboard regressions; covers all 8 resize directions, camera and child screen-position stationarity, migration, round-trip persistence, undo/redo, cancel/no-op behavior, hit-test parity, Fit Artboard and SVG export
- npm test: PASS — 32/32 suites in gated final correction integration
- npm run check: PASS — 38/38 source files in gated final correction integration
- Persistent artboard-origin proof: normalized documents now expose finite authored artboard.x/y with legacy defaults of 0/0; non-zero origins serialize and reload exactly while zero-origin legacy fixtures remain canonical
- Left/top stationarity proof: left/top resize authors x/y plus width/height so the opposite world edge stays fixed; camera zoom/center are unchanged and child world coordinates plus final CSS screen coordinates remain unchanged
- All-direction resize proof: left/right/top/bottom and all four corners compose deterministically from the authored frame; right/bottom preserve x/y; minimum-size clamping cannot produce negative/NaN/Infinity values
- Save/load + undo/redo proof: non-zero frame origin survives .veyra serialize/parse round-trip; one completed resize creates one history transaction; undo restores exact x/y/width/height and redo reapplies them
- Cancel/isolation proof: cancel returns exact pre-gesture serialization without changing camera; sub-threshold border clicks create no history; existing 7 CSS-pixel border classification and no-permanent-handle UI remain intact
- Renderer/hit-test/export proof: renderer background and overlay frame use artboard x/y; M4 hit testing uses the same stable camera mapping after origin changes and panel/window changes; SVG export uses the authored x/y/width/height as viewBox/frame bounds
- Fit Artboard proof: Fit Artboard centers on x + width/2 and y + height/2 for non-zero origins and intentionally computes zoom from current host dimensions
- Progress snapshot update: verified-only percentages intentionally remain unchanged at AI ~92–94%, core ~82–85%, Rive parity ~43–47%, full Veyra ~41–44% until independent M5 verification
- Suggestions added to `suggestions`: none
- Known limitations: this is still the bounded single-artboard model required by M5; artboard.x/y is the minimal persistent frame-position contract and no multi-artboard/component work was started
```
'''

pattern = r'## Handoff\n\n```text\nHandoff\n.*?\n```\n?'
if not re.search(pattern, text, flags=re.S):
    raise SystemExit('could not find M5 handoff block')
text = re.sub(pattern, handoff, text, count=1, flags=re.S)
path.write_text(text, encoding='utf-8')
print('M5 final artboard-origin handoff recorded')
