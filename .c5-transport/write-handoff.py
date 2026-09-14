from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: write-handoff.py <test_sha> <impl_sha>')
test_sha, impl_sha = sys.argv[1:]
p = Path('milestone.md')
text = p.read_text()
marker = '# MILESTONE M8-C5 — Effective Reverse Writes & Safe Visual Outputs'
start = text.index(marker)
prefix, body = text[:start], text[start:]
body = body.replace('**Implementation status:** `READY`', '**Implementation status:** `AWAITING VERIFICATION`', 1)
body = body.replace('- [ ] ', '- [x] ')
handoff = f'''```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: test-first {test_sha}; production correction {impl_sha}
- Final clean main SHA / exact standard Tests run: pending clean promotion; exact final-main SHA and unchanged standard Tests run will be recorded on the PR after merge without moving the tested head.
- Five verifier failures -> permanent test mapping: `tests/veyra-m8-c5-effective-output.test.mjs` permanently carries the verifier fixtures. The initial test-only commit reproduces 5 positive controls PASS / 5 verifier regressions FAIL. The final suite expands to 18 checks covering all five failures plus retarget/order/converter/Component/event/downstream/cache combinations.
- Effective two-way terminal / pending retarget / Component-scope proof: data-source reverse writes resolve on a non-consuming fork of the canonical binding evaluator using current scoped virtual values, then mutate only the proven effective terminal. Cold/warm, reversed binding IDs, successive retargets, converter-derived references, immediate pre-render retargets and repeated nested Component paths are covered; null/invalid effective paths fail before live mutation.
- Event/notification/history non-mutation during resolution proof: effective-terminal resolution occurs on a runtime fork. Failed resolution changes no runtime value, event queue, notification stream, authored serialization, revision or history. A successful reverse write emits only the intended live mutation notification and preserves authored state.
- Canonical ordinary-property value validation proof: new dependency-light `propertyValueContract.js` supplies the same finite/bounded/integer/color primitives and named limits used by authored model normalization and ordinary runtime property targets. Invalid opacity, paint/color and discrete geometry values are diagnosed before virtual publication/override/event commitment; runtime stats count actual property-value validations.
- Invalid-branch isolation / event delivery / valid replacement proof: invalid visual bindings are suppressed with stable `binding-runtime-value` / upstream diagnostics while independent outputs remain available. A trigger whose own visual publication is invalid stays pending; after a valid replacement it is delivered and consumed exactly once. Live host observation is non-consuming; explicit advance returns the deliverable event. Valid replacements recover without discarding unrelated scoped runtime values and the next settled frame caches again.
- Preview/dispatch/converter failure consistency proof: C5 uses the milestone-permitted safe diagnostic-acceptance policy for broad runtime-dependent authored graphs. Preview/dispatch no longer create a graph that throws raw during canonical scene evaluation; actual invalid runtime values are bounded, diagnosed and isolated. Statically valid conversions remain supported, including the existing nullable empty-list-index contract.
- All prior suites / syntax checks: clean implementation gate requires `npm run check` 50/50 and `npm test` 46/46. Original M8/C1/C2, C3, C4 (all 54 checks) and all M0-M7 suites remain green.
- Actual validation/resolution/output work and size impact: runtime stats add `runtimePropertyValuesValidated`, `effectiveWriteResolutions`, and `effectiveWriteBindingsEvaluated`. Settled frames report zero repeated property validations for cached bindings; effective reverse writes explicitly report their forked graph-resolution work. No full-project normalization per binding, no dependency added, and no authored schema/version change.
- Cleanup / compatibility / browser-acceptance limitations: temporary `.c5-transport` payloads/workflow are excluded from the clean product branch and will be deleted from the transport branch after promotion. Valid IDs/types/nested/two-way forms stay supported. Real-browser visual/usability acceptance is not claimed. M9 is not started.
```'''
body = re.sub(r'```text\nHandoff\n.*?\n```\s*$', handoff + '\n', body, count=1, flags=re.S)
p.write_text(prefix + body)
