from pathlib import Path

p = Path('milestone.md')
text = p.read_text()

replacements = {
"- [ ] state start actions and state end actions.": "- [x] state start actions and state end actions.",
"- [ ] View Model property conditions;": "- [x] View Model property conditions;",
"- [ ] compatible events/triggers;": "- [x] compatible events/triggers;",
"- [ ] comparison against compatible data-bound values;": "- [x] comparison against compatible data-bound values;",
"- [ ] allow exit during transition;": "- [x] allow exit during transition;",
"- [ ] transition start actions;": "- [x] transition start actions;",
"- [ ] transition end actions;": "- [x] transition end actions;",
"- [ ] Randomize Exit with weighted outgoing paths.": "- [x] Randomize Exit with weighted outgoing paths.",
"- [ ] exact trigger/event consumption policy;": "- [x] exact trigger/event consumption policy;",
"- [ ] start/end actions fire exactly once;": "- [x] start/end actions fire exactly once;",
"- [ ] Randomize Exit chooses once per decision and is replayable under a seed;": "- [x] Randomize Exit chooses once per decision and is replayable under a seed;",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'expected exactly one milestone checkbox: {old!r}; found {text.count(old)}')
    text = text.replace(old, new, 1)

old = "- Compatibility boundary: `allow exit during transition` remains deliberately open because interruption needs a snapshot-safe source/target composition contract; start/end actions, View Model/data-bound conditions, deterministic Randomize Exit and Additive Blend also remain open."
new = "- Compatibility boundary after the later runtime slices: Additive Blend and built-in artboard/runtime-value condition sources remain open; View Model/data-bound conditions, exact event consumption, interruption, lifecycle actions and deterministic Randomize Exit are now implemented and regression-covered."
if text.count(old) != 1:
    raise SystemExit('stale transition compatibility note not found')
text = text.replace(old, new, 1)

anchor = "## Task 5 — Unified conditions, actions and data sources\n"
evidence = """### M9 transition/data/lifecycle implementation evidence — advanced runtime slice

- Production `db024269faf013db6254941053ce38499a4604f8` implements snapshot-safe **Allow Exit During Transition**. An interrupted transition captures the exact composed source pose, supports repeated interruption/Any routing, preserves target-clock Exit Time semantics and keeps forks isolated. Standard Tests #189 is SUCCESS on that exact SHA.
- Production `5c9c700ec956df0d05f73b116c17a730be2d38c8` connects M8 View Model/data endpoints to transition conditions, including nested reference retargeting, strict nominal typing, data-bound comparisons and trigger observation. Standard Tests #190 is SUCCESS.
- Production `2d22041a984894ae170655b1305074fc35f8a4ca` defines exact M8 event consumption: queued data triggers consume one pulse only on the selected transition; failed candidates, time gates, reads and forks conserve live pulses. Legacy machine triggers retain their verified one-step broadcast compatibility behavior. Worker gates: **50/50 syntax + 54/54 suites PASS**; Tests #191 is SUCCESS.
- Production `3d9b71c7430e6636366c2c62c270016ba8f910a4` adds stable `machineAction` identity and the bounded action registry (`data-set`, `data-fire`, `input-set`, `input-fire`, `emit`, `timeline`) across state-start/state-end/transition-start/transition-end phases. Effects are runtime-only or emitted requests; authored documents are never directly mutated. Exactly-once lifecycle behavior covers initial activation, zero/timed transitions, interruption and forks. Worker gates: **50/50 syntax + 55/55 suites PASS**; Tests #192 is SUCCESS.
- Production `f68c3980930f42bd012a26be4773353cdeaa72d8` adds weighted state-level **Randomize Exit** with positive path weights and an internal seeded unsigned-32-bit PRNG. Same seed replays identically, reset/scrub restart the seed, forks clone current PRNG state, global `Math.random()` is never used, and chosen transitions expose seed/draw/sample/candidate evidence. Worker gates: **50/50 syntax + 56/56 suites PASS**; Tests #193 is SUCCESS.
- Capability honesty: persistent actions are currently supported on normal playable states and normal transitions. Entry/Any pseudo-routing does not expose authored lifecycle actions yet, built-in artboard/runtime-value condition sources remain open, and Additive Blend is the next major state-family gap. M9 remains **IN PROGRESS**.

"""
if text.count(anchor) != 1:
    raise SystemExit('Task 5 anchor missing')
text = text.replace(anchor, evidence + anchor, 1)

anchor = "Unsupported future action types must fail with capabilities/diagnostics rather than being silently ignored.\n"
evidence = """

### M9 unified source/action registry evidence

- M8 View Model endpoints and legacy machine inputs share the same transition evaluator; data-bound comparisons use canonical nominal M8 descriptors rather than coercion.
- M8 trigger queues are first-class event sources with selected-transition consumption; legacy trigger semantics remain a compatibility adapter.
- Persistent `machineAction` records have stable typed identity, explicit phases and JSON-safe parameters. Data/input effects mutate runtime state only; `emit` and `timeline` actions surface typed runtime effects/requests for host integration.
- Machine action failures are bounded runtime events/counters rather than hidden authored mutation or unbounded exceptions through unrelated layers.
- Built-in artboard/runtime-value sources remain open, so Task 5 is advanced but not claimed as fully closed.
"""
if text.count(anchor) != 1:
    raise SystemExit('Task 5 action anchor missing')
text = text.replace(anchor, anchor + evidence, 1)

anchor = "## Task 7 — Visual graph editor\n"
evidence = """### M9 runtime lifecycle evidence — advanced Task 6

- Snapshot-safe interruption, exact M8 trigger consumption, exactly-once state/transition lifecycle actions and deterministic weighted Randomize Exit now compose in the same layered evaluator.
- Random decisions are runtime-only and replayable from an explicit seed; no random choice, action execution, transition progress or trigger queue leaks into authored serialization.
- Standard Tests #189 through #193 are SUCCESS on their exact production SHAs, with the latest worker reaching **56/56 repository suites PASS**.
- Remaining Task 6 gaps are structural-edit reconciliation coverage, per-layer runtime error isolation, and deeper inactive/settled-layer sleeping evidence.

"""
if text.count(anchor) != 1:
    raise SystemExit('Task 7 anchor missing')
text = text.replace(anchor, evidence + anchor, 1)

p.write_text(text)
print('M9 runtime milestone refresh applied')
