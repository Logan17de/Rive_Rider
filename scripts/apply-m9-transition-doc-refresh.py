from pathlib import Path

p=Path('milestone.md')
t=p.read_text()

def one(old,new):
    global t
    if t.count(old)!=1: raise SystemExit(f'missing/nonunique marker: {old[:90]!r} count={t.count(old)}')
    t=t.replace(old,new,1)

one(
"- Blend transitions are deliberately rejected until the richer transition compositor is implemented; Additive Blend, M8/View Model blend sources and canonical blend-child CRUD commands remain open. Therefore the full Task 2 blend checkboxes remain unchecked.\n- Worker Actions run `34810521222`, job `103870774356`: syntax PASS, **49/49 suites PASS**, diff hygiene PASS.\n",
"- Blend-state transitions now use the canonical transition compositor: animation↔blend and blend↔blend timed transitions compose outgoing/incoming child contributions with deterministic normalized effective weights. Additive Blend, M8/View Model blend sources and canonical blend-child CRUD commands remain open. Therefore the full Task 2 blend checkboxes remain unchecked.\n- Blend steady-state worker Actions run `34810521222`, job `103870774356`: syntax PASS, **49/49 suites PASS**, diff hygiene PASS. Transition-compositor worker run `34812631038`, job `103876831686`: **50/50 syntax checks + 50/50 suites PASS**; exact-main standard Tests #186 (`34812754122`, job `103877176194`) also PASS on `00f85fff5a92284efb343bb316bf531469ca182c`.\n"
)
one("- [ ] transitions/blends from multiple layers compose without mutating authored source values;","- [x] transitions/blends from multiple layers compose without mutating authored source values;")

for old,new in [
("- [ ] legacy machine inputs;","- [x] legacy machine inputs;"),
("- [ ] comparison against fixed values;","- [x] comparison against fixed values;"),
("- [ ] transition duration;","- [x] transition duration;"),
("- [ ] exit time;","- [x] exit time;"),
("- [ ] pause source;","- [x] pause source;"),
("- [ ] interpolation/easing;","- [x] interpolation/easing;"),
("- [ ] enabled/disabled transition;","- [x] enabled/disabled transition;"),
("- [ ] Any-state routing;","- [x] Any-state routing;"),
("- [ ] Entry/Exit routing;","- [x] Entry/Exit routing;"),
("- [ ] pause/exit-time behavior;","- [x] pause/exit-time behavior;"),
]: one(old,new)

marker="Randomized transitions need an explicit deterministic runtime RNG/seed contract for tests/replays. Never use a hidden global random source that makes verification nondeterministic.\n"
insert=marker+"""
### M9 transition implementation evidence — compositor + timing slice

- Production `00f85fff5a92284efb343bb316bf531469ca182c` lifts the previous fail-closed blend-transition restriction. The same canonical compositor handles animation→blend, blend→animation and blend→blend timed transitions by converting absolute outgoing/incoming contributions into deterministic sequential timeline weights.
- Transition interpolation now persists `enabled`, `easing` and bounded cubic-bezier parameters; runtime/debug evidence exposes both raw and eased progress. Structural machine invalidation includes the transition behavior rather than relying on stale runtime state.
- Permanent `tests/veyra-m9-transition-compositor.test.mjs` covers animation→1D Blend, 1D Blend→Direct Blend, eased composition and invalid interpolation authoring. Worker run `34812631038`, job `103876831686`: **50/50 syntax + 50/50 suites PASS**. Standard Tests #186 (`34812754122`, job `103877176194`) is SUCCESS on that exact production SHA.
- Production `fb0bfb1c90452a477833f36757ee3e3b3fe76dab` adds canonical Exit Time with `{unit: seconds|percent, value}`, speed-aware percent gating, and Pause Source behavior that freezes the exact outgoing source time captured when a transition starts while the incoming state continues.
- Exit Time rejects invalid units/ranges and meaningless pseudo-state source usage. The legacy `after` gate remains a separate condition; the two contracts are not silently conflated.
- Permanent `tests/veyra-m9-transition-exit-pause.test.mjs` covers seconds, percent, speed-adjusted percentage, paused-vs-live source clocks and invalid authored values. Worker run `34812931703`, job `103877684445`: syntax/full-suite/diff gates PASS. Standard exact-main Tests #187 is the required promotion gate for this SHA.
- Compatibility boundary: `allow exit during transition` remains deliberately open because interruption needs a snapshot-safe source/target composition contract; start/end actions, View Model/data-bound conditions, deterministic Randomize Exit and Additive Blend also remain open.
"""
one(marker,insert)

p.write_text(t)
print('milestone M9 transition evidence refreshed')
