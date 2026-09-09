from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: write-m8-c2-handoff.py <implementation-sha>')
impl = sys.argv[1].strip()
if len(impl) != 40:
    raise SystemExit('implementation SHA must be full length')

p = Path('milestone.md')
text = p.read_text()
marker = '# MILESTONE M8-C2 — Warm Runtime Cache & Authored/Runtime Boundary'
if marker not in text:
    raise SystemExit('M8-C2 milestone marker missing')
start = text.index(marker)
prefix, body = text[:start], text[start:]
if '**Status:** `READY`' not in body:
    raise SystemExit('M8-C2 status is not READY')
body = body.replace('**Status:** `READY`', '**Status:** `AWAITING VERIFICATION`', 1)

handoff = f'''## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction implementation commits: {impl}
- Changed files: src/veyra/dataGraph.js, src/veyra/controlPlane.js, tests/veyra-m8-c1-corrections.test.mjs, tests/veyra-m8-c2-warm-runtime.test.mjs
- Tests added/changed: dedicated M8-C2 warm-runtime suite adds 13 adversarial checks; M8-C1 Property Group two-way assertion is updated to the corrected runtime-only boundary.
- Nested-path invalidation proof: terminal View Model property changes traverse stable-ref nested source paths in the active runtime scope and dirty only bindings whose data path touches the changed `(instance,property)` pair; unrelated warm branches remain cache hits.
- Warm-cache authored-change proof: a deterministic authored runtime signature covers binding/converter structure, View Model property defaults/schema, instance initial values/nested refs, Property Group capability schema and authored lists; a signature change invalidates the scope once, preserves live runtime overrides, then returns to sleeping.
- Converter/source/target cache-generation proof: same-ID converter config, source, target, priority/winner and remove/recreate changes cannot reuse old binding-cache output.
- Default/initial-value invalidation proof: authored defaults and instance initial values refresh warm bindings when no runtime override exists; explicit runtime values keep precedence until reset.
- Property Group two-way boundary proof: normal two-way interaction writes scoped ephemeral Property Group runtime state, never serialized `property.value`; Store revision/history/serialization remain unchanged, reset restores authored value, and ownership reports the runtime mutation port.
- Component-scope isolation proof: nested View Model and Property Group runtime writes are keyed by the full typed Component scope path; repeated outer/inner scopes do not leak.
- Settled/zero-binding performance proof: one authored/runtime invalidation wakes required work once; the next unchanged frame returns to `evaluatedBindings === 0`; zero-binding remains the O(1) early return.
- npm run check: PASS — 45/45 source files in the clean promotion tree.
- npm test: PASS — 39/39 suites in the clean promotion tree; M8-C2 13 checks green, M8-C1 28 checks green, original M8 28/28 green.
- Exact-final-head standard GitHub Tests: REQUIRED to succeed on the exact final clean `main` head after handoff; the standard `Tests` run attached to that head is authoritative.
- Existing M0–M8-C1 regression proof: all prior suites green in the clean promotion gate.
- Persistence/history impact: no schema/version change; runtime Property Group reverse writes are ephemeral and excluded from serialization/history unless a caller intentionally uses the existing canonical authored command surface.
- Suggestions added to `suggestions`: none.
- Known limitations: converter-bearing two-way bindings still require a future inverse-converter contract; no M9/layered-state-machine work included.
```
'''
pattern = r'## Handoff\n\n```text\nHandoff\n.*?\n```\s*$'
next_body, count = re.subn(pattern, handoff.rstrip() + '\n', body, count=1, flags=re.S)
if count != 1:
    raise SystemExit('M8-C2 handoff block replacement failed')
p.write_text(prefix + next_body)
print(f'M8-C2 handoff recorded for {impl}')
