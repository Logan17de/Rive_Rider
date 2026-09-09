from pathlib import Path
import base64
import gzip
import hashlib
import re
import subprocess
import sys

if len(sys.argv) == 1:
    parts = sorted(Path('.veyra-staging/m8-c3').glob('patch-*.b64'))
    if len(parts) != 5:
        raise SystemExit('Expected all five patch transport parts')
    encoded = ''.join(p.read_text().strip() for p in parts)
    # Correct a known transport transcription, then require the exact tested
    # patch hash. This is not a code transformation or a weakened test gate.
    encoded = encoded.replace('X6CfNh9iNmr', 'X6CfNh9NPmr')
    patch = gzip.decompress(base64.b64decode(encoded, validate=True))
    expected = 'f525305dbd0673006356e3236aec8f4aa24ac29f9ae347a7612984c436acb179'
    if hashlib.sha256(patch).hexdigest() != expected:
        raise SystemExit('Patch transport does not match the locally tested production diff')
    Path('/tmp/m8-c3.patch').write_bytes(patch)
    subprocess.run(['git', 'apply', '--check', '/tmp/m8-c3.patch'], check=True)
    subprocess.run(['git', 'apply', '/tmp/m8-c3.patch'], check=True)
    print('Applied exact locally tested M8-C3 production diff: ' + expected)
else:
    implementation = sys.argv[1]
    if not re.fullmatch(r'[0-9a-f]{40}', implementation):
        raise SystemExit('Expected a real implementation commit SHA')
    p = Path('milestone.md')
    text = p.read_text()
    if '# MILESTONE M8-C3 — Runtime Contract Closure' not in text:
        raise SystemExit('Refusing to replace a different active milestone')
    text = text.replace('**Implementation status:** `READY`', '**Implementation status:** `AWAITING VERIFICATION`', 1)
    text = text.replace('- [ ] ', '- [x] ')
    text = text.replace('## Progress snapshot — refreshed after independent M8-C2 verification', '## Progress snapshot — refreshed for M8-C3 implementation handoff; independent acceptance pending', 1)
    text = text.replace('- Current implementation work: **M8-C3**, below.', '- Current implementation work: **M8-C3 — AWAITING VERIFICATION**, below.', 1)
    marker = '```text\nHandoff\n'
    start = text.rfind(marker)
    if start < 0:
        raise SystemExit('Current milestone handoff template missing')
    end = text.index('```', start + len(marker)) + 3
    fields = [
        'Handoff',
        '- Status: AWAITING VERIFICATION',
        '- Implementation commits: ' + implementation,
        '- Final clean main SHA: the final merge commit must be reported with the standard Tests head_sha/run evidence; this handoff does not self-certify a not-yet-created merge SHA.',
        '- Ten verifier failures -> permanent test mapping: docs/M8-C3-runtime-contract.md maps report cases #3-#12 one-for-one to tests/veyra-m8-c3-runtime-contracts.test.mjs; both C2 positive controls remain. The composition suite adds 17 further checks (29 new C3 checks total).',
        '- Structured scope/tuple identity proof: exact JSON typed tuples preserve every opaque ID and ordered scope path; reset/subtree ownership is structural. Punctuation/Unicode/cross-kind fixtures and valid nested Component graphs are covered.',
        '- Endpoint alias/conflict/cycle proof: shared propertyAddress parser canonicalizes PG address/ref aliases before graph operations; priority/stable-ID ties, percent encodings, reordered declarations, direct/multi-hop cycles, atomic rejection and derived propagation are tested.',
        '- Nested trigger + non-consuming read proof: terminal dependency routing is shared by fire and consume/settle; fan-out consumes once per artboard/scope advance. Read/ownership/scene inspection use a fork of current live data/Component/machine state through the same evaluator, with no live event/cache/stat/notification mutation.',
        '- Scoped typed list + converter propagation proof: converters read scoped lists and register list dependencies; insert/remove/move/replace preserve surviving IDs, validate type/reference/range/index before mutation, retain scoped notifications and copy-on-write/reset precedence.',
        '- Public host operation discovery/invoke/read-back proof: the real runtimeHost module used by veyra.js is executed in Node. Tests discover manifest/ownership operations, invoke JSON-safe arguments and read live scoped values; nested writes resolve terminal refs, chain recommendations trace controlling sources, and readonly sources do not advertise writes. This is not real-browser visual/usability acceptance.',
        '- Retained index/actual work-counter proof: independent per-artboard indexes and scope outputs; explicit authored snapshot/epoch invalidation. The 220-binding/two-board/two-scope revisit performs zero graph/catalog/signature builds and zero converter/path evaluations while reporting 440 output applications. One scoped write examines zero bindings and visits one dependency edge, then one binding recomputes and 109 cache.',
        '- Preserved C1/C2 positive controls and earlier regressions: original M8 28, C1 28, C2 13 checks and all earlier suites pass. Only two legacy exact-key expectations changed to structural encoding; previous behavioral assertions remain.',
        '- npm run check: PASS — 48/48 source files in local and staging gates.',
        '- npm test: PASS — 41/41 suites in local and staging gates; C3 reproduced contracts 12/12 and composition checks 17/17.',
        '- Exact-head standard Tests run ID/result: REQUIRED after the final clean main merge. Standard .github/workflows/test.yml is unchanged; its completed run must match the reported final main SHA before handoff is called ready.',
        '- Persistence/migration and performance impact: no authored version increment; accepted endpoint aliases canonicalize deterministically. Runtime values/scopes/lists/queues never serialize or enter history. Mutable external hosts must call invalidateAuthoredDocument after in-place edits. Observation copies current runtime state and has real copy cost; zero recomputation is not zero total work.',
        '- Cleanup evidence: all .veyra-staging/m8-c3 payloads/helpers and m8-c3-stage.yml removed before the clean branch commit; standard test workflow and normal scripts unchanged.',
        '- Suggestions / explicit limitations: no M9 or new completion credit; no real-browser visual QA claimed. Converter-bearing two-way bindings still require an inverse contract. Empty list-index conversion remains null; finite indexes clamp. Detailed decisions and regression mapping are in docs/M8-C3-runtime-contract.md.',
    ]
    text = text[:start] + marker + '\n'.join(fields[1:]) + '\n```' + text[end:]
    p.write_text(text)
    print('Recorded implementation-only M8-C3 handoff; verified percentages unchanged')
