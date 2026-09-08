from pathlib import Path

path = Path('milestone.md')
text = path.read_text(encoding='utf-8')
old = '- Implementation commits: workflow-gated M4 interaction-loop implementation; final SHA recorded after CI commit'
new = '- Implementation commits: b593291a707df7259515f167902755f11ace2e55 — Implement M4 current interaction loop [m4-applied]'
if old not in text:
    raise SystemExit('M4 handoff implementation-commit placeholder not found')
text = text.replace(old, new, 1)
text = text.replace('- npm test: PASS in workflow gate', '- npm test: PASS — 28/28 suites in workflow gate', 1)
text = text.replace('- npm run check: PASS in workflow gate', '- npm run check: PASS — 36/36 source files in workflow gate', 1)
path.write_text(text, encoding='utf-8')
