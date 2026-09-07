from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'milestone.md'
text = path.read_text(encoding='utf-8')
text = text.replace('**Status:** `READY`', '**Status:** `AWAITING VERIFICATION`', 1)
old = '''Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Index/query proof:
- Resolver proof:
- Structural evidence proof:
- Ambiguity/fail-closed proof:
- Name-independence proof:
- Browser/manifest integration:
- Persistence impact:
- Suggestions added to `suggestions`:
- Known limitations:
'''
new = '''Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: 20a621aebd2570b2748aedc03c1b27b9cee795a6 (resolver/index core), 815bf2d54cc0533bb34c99b2be6cfa2685bc7c1b (canonical read-surface integration), cd96b5bd4a96bb74d1b093517b15bc5da23c52eb (adversarial M2 suite)
- Changed files: src/veyra/resolver.js, src/veyra/manifest.js, src/index.js, veyra.js, tests/veyra-resolver.test.mjs, milestone.md
- Tests added/changed: tests/veyra-resolver.test.mjs covers exact refs, semantic aliases/roles/tags/relations, rig/animation/machine/listener graph evidence, explicit display-name mode, deterministic ambiguity, rename/reorder/save-load invariance, stable-ref plans, and read-only Store invariants
- npm test: PASS, including the dedicated M2 resolver/index suite and all existing M0/M1 suites
- npm run check: PASS
- Index/query proof: buildSemanticIndex() is DOM-free, bounded, deterministically ordered, and indexes all current first-class typed entities with semantics, capabilities, ownership, spatial descriptors, and graph relationships; queryEntities() filters by typed ref/kind/type/capability/semantics/relations/spatial evidence and only uses names when displayName is explicit
- Resolver proof: resolveSemantic() returns resolved/ambiguous/notFound with stable typed refs, deterministic score/confidence, machine-readable evidence, and ranked alternatives; public scoring constants document exact evidence weights
- Structural evidence proof: hierarchy/ownership, evaluated bounds and relative side, conservative mirrored pairs, bone hierarchy, mesh weights, constraints/controls, timeline-track-property-keyframe ownership, state-machine state/transition/condition/input wiring, listeners, paint/assets, and M1 semantic relations are indexed without name lookup
- Ambiguity/fail-closed proof: exact missing/wrong-kind refs return precise notFound results; duplicate display-name matches and equally plausible symmetric unlabeled candidates remain ambiguous instead of selecting by order
- Name-independence proof: confirmed right-eye semantics remain authoritative through misleading, duplicate, empty, random, renamed, and reordered human names; display names have zero score unless the caller explicitly supplies displayName, which is reported as display-name-hint evidence
- Browser/manifest integration: manifest advertises indexed-query/deterministic-resolution/name-independent capabilities plus the resolver/scoring contract; globalThis.veyra.getSemanticIndex/queryEntities/resolveSemantic are thin adapters over the same DOM-free module; src/index.js exports the same public functions for future adapters
- Persistence impact: none; M2 is read-only and introduces no persisted schema or migration. Stable refs and existing M1 semantic records remain authoritative across serialize/load
- Suggestions added to `suggestions`: none
- Known limitations: structural inference is intentionally conservative; geometry alone does not invent anatomical meaning, and genuinely symmetric unlabeled structures remain ambiguous until semantic or explicit human criteria disambiguate them
'''
if old not in text:
    raise RuntimeError('M2 handoff placeholder not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
