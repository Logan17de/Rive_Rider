# Veyra — Current Milestone

`plan.md` is the product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This is the **only active implementation milestone**. Earlier/deferred implementation evidence may remain in this file for context, but it does not create a second active milestone.

Complete only the tasks below. Follow-up ideas belong in `suggestions`. Implementers stop at `AWAITING VERIFICATION` with reproducible commit/test evidence; they do not mark their own work VERIFIED.

## Progress snapshot — refreshed after exact-head M9/M10 integration CI and sequencing review

These are approximate engineering planning estimates, not vendor-certified parity scores, line-count metrics or test-pass percentages. The verified estimates remain anchored to the independently accepted M0–M8 baseline. M9 has advanced materially on `main`, and a broader feature-graph/player/interchange implementation has also landed, but **M9 is still `IN PROGRESS` and has not had independent milestone acceptance**. Per `QUALITY.md` and the milestone workflow, none of that unverified work increases verified completion percentages or advances the active roadmap milestone.

| Area | Verified estimate | Current interpretation |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~96–97%** | Stable typed identity, universal semantics, canonical UI/AI control, ownership/dependency evidence, Components and the M8 data graph are independently verified. M9/M10-labeled machine/feature-graph work is implemented and regression-tested but remains outside verified progress until its milestone gates are independently accepted. |
| Core editor / engine foundation | **~95–96%** | Workspace, authoring, Components, interaction loop, data runtime, incremental caches and authored/evaluated boundaries are verified. Layered machines, player and newer feature records are present on `main` but are not yet independently accepted as milestone completion. |
| Modern Rive editor/runtime parity | **~59–63%** | Components and View Models/Data Binding are accepted. Substantial layered-machine and graph-editor code is now on `main`, but no Rive-parity increase is claimed until M9 passes independent acceptance. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | New Lottie/dotLottie code has landed and passes standard CI, but it is post-M9 work and has not had an independently accepted interchange milestone; it therefore receives no verified progress credit yet. |
| Full Veyra superset target | **~50–54%** | Target = Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while remaining modular/lightweight. |
| Remaining full-target work | **~46–50%** | Verified remaining work is unchanged until M9 and later feature families pass their own acceptance boundaries. |

### Roadmap position

- Implementation M0–M7: **VERIFIED**.
- `plan.md` M3 / implementation M8 — View Models & Data Binding: **VERIFIED**.
- M8-C1 through M8-C5 corrections: **VERIFIED as part of M8**; preserve their regression suites and contracts.
- **Current active implementation work: M9 — State Machine parity + visual graph editor. Status: `IN PROGRESS`; independent acceptance remains open.**
- The feature-graph/player/interchange change labeled M10 has landed on `main` and is recorded below as **deferred implementation evidence only**. It is not the active milestone and is not VERIFIED because M9 has not passed its acceptance boundary.
- `plan.md` M5+ remains queued until M9 is independently accepted. Do not start or credit another roadmap milestone merely because later-family code already exists on `main`.

Every verification/correction/advance must refresh this snapshot. Selected probe counts are not completion percentages.

## Latest main-head evidence and sequencing blocker

- Current integration baseline before this milestone-only correction: `abf62f61c2e6121a64afc5c31c37f6da9dd54c20`.
- Standard repository `Tests` #195, run `34866362425`, job `104051088061`: **SUCCESS on that exact SHA** with **55/55 source syntax checks PASS and 59/59 suites PASS**.
- The green suite includes all existing M0–M8 regressions, the current M9 suites, `tests/veyra-m9-c1-layers.test.mjs`, `tests/veyra-m9-layer-schema.test.mjs`, and `tests/veyra-m10-features.test.mjs`.
- The post-M9 implementation commit `1c371fa5ea498bb1a3d4a4ed1c4a9dee67fc0bde` and its follow-up docs were merged into `main`; standard exact-head CI therefore proves the integrated tree is green, **not** that M9 or the later feature families are independently accepted.
- No independent M9 verifier branch/evidence was found in the repository during this review. M9 still has open acceptance gates below, including Additive Blend, built-in runtime-value transition sources, complete ownership/dependency/name-invariance evidence, Component-scoped machine runtime isolation, bounded per-layer runtime errors, settled-layer sleeping/performance gates, and real browser visual-graph acceptance.
- Sequencing blocker: the landed feature-graph/player/Lottie work touches later roadmap families that M9 explicitly lists as non-goals. Keep it regression-covered, but do not treat it as a second active milestone or verified progress. Finish and independently accept M9 first.

## Independent M8 acceptance evidence

Production acceptance baseline:

- Final production SHA: `602a62ef929f1fc73c3c15dcedc65abc9b9ea19b`.
- Production Git tree: `b3fde9fbbaf310f56fc6dfee8304a8f6b157e671`.
- Standard repository `Tests` #180, run `34797590046`, job `103833588196`: **SUCCESS on that exact production SHA**.
- Exact-head standard log: **50/50 source syntax checks PASS; 46/46 repository suites PASS**.
- Original M8 and C1/C2/C3/C4/C5 suites remain in normal discovery and all passed on the same production tree.

Independent verifier replay:

- Evidence branch: `verify/m8-c5-602a62e` based on the exact production SHA.
- Independent Actions run `34798416681`, job `103835957436`: **SUCCESS**.
- An unchanged-production diff/tree guard passed before tests.
- The verifier independently reran **50/50 syntax checks and 46/46 suites**.
- Additional independent M8-C5 composition probes: **6/6 PASS**:
  1. direct derived-reference reverse write targets the current terminal without advancing the live runtime;
  2. converter-derived references can retarget repeatedly and reverse writes follow the latest terminal;
  3. an unresolved effective reverse write fails before touching the previous child;
  4. an invalid ordinary-property binding suppresses its downstream consumer while independent outputs survive;
  5. a trigger feeding an invalid visual branch remains queued until that branch becomes publishable, then consumes exactly once;
  6. ordinary visual value constraints isolate/recover from invalid scale output.
- Scope: executed Node runtime/control-plane/public-host verification. This does **not** claim real-browser visual/usability acceptance for future visual editor work.

M8 acceptance preserves the documented contracts from C1–C5: canonical capability validation, nominal typed data definitions, scope-safe nested Components, collision-free runtime identity, retained incremental indexes, non-consuming observations, scoped typed lists, resolved nested endpoint identity, effective controller ownership, current-terminal two-way writes, safe ordinary visual output validation, event conservation, and authored/runtime separation.

---

# MILESTONE M9 — Layered State Machine Parity + Visual Graph Editor

**Roadmap mapping:** `plan.md` M4 — State Machine parity + visual graph editor  
**Status:** `IN PROGRESS`

## Goal

Upgrade Veyra's current single-flat-machine animation-state runtime into a Rive-class layered state-machine system that is fully integrated with M8 View Models/Data Binding, Components, ownership/dependency reporting and the canonical human/AI command plane.

The human visual graph and the AI/control-plane representation must be two views of the **same persistent graph and runtime**, not separate implementations. Moving a graph node or renaming any state/layer must never change behavioral identity.

## Non-negotiable rules

1. **One machine model/evaluator.** Do not build a second visual-editor state machine or AI-only runtime.
2. **Stable identity everywhere.** Layers, states, transitions, conditions and persistent actions use immutable typed refs. Human labels and graph positions are advisory/editor metadata.
3. **M8 is the preferred data path.** View Model properties, events and built-in artboard values can drive transitions/blends. Legacy `number`/`bool`/`trigger` machine inputs remain compatible but are not the preferred new authoring path.
4. **Layered ownership is explicit.** AI must be able to explain which layer/state/track currently owns a visible value and why a higher-priority layer won.
5. **Runtime state stays ephemeral and scope-safe.** Component instance paths, clocks, transition progress, triggers and random choices never leak into authored serialization.
6. **Deterministic/fail-closed behavior.** Ambiguous controller ownership, invalid transition graphs, bad data sources and cycles fail with bounded diagnostics instead of hanging or silently choosing an undocumented winner.
7. **Preserve `QUALITY.md`.** Projects with no state machines pay effectively zero machine work; inactive/settled layers sleep; no per-frame full-project scans or DOM dependency inside the evaluator.
8. **Migration first.** Existing flat Veyra machines load and behave compatibly after automatic migration into the new layered schema.

---

## Task 1 — Versioned layered machine schema + migration

Add a persistent layered machine contract with stable typed identity.

Required persistent entities/capabilities:

- `stateMachine`;
- `machineLayer`;
- `machineState`;
- `machineTransition`;
- `machineCondition`;
- persistent state/transition action records where authored;
- graph/editor metadata stored separately from behavioral state where practical.

Requirements:

- [x] ordered layers with stable IDs, advisory names, enabled/disabled state and deterministic priority/order;
- [x] migrate every existing flat machine to one default layer without changing observable behavior;
- [x] old files round-trip deterministically through migration and save/load;
- [x] layer/state/transition/action IDs survive rename, reorder, graph movement and ordinary edits;
- [x] deleting/reordering layers cleans dependencies safely and fails closed when blocked;
- [ ] references, resolver, semantics, manifest, summary and dependency graph recognize `machineLayer` and every persistent sub-object;
- [ ] no migration of runtime clocks/current-state/transition progress into authored data.

### M9 layered-schema implementation evidence

- `tests/veyra-m9-layer-schema.test.mjs` proves deterministic legacy-flat → one-default-layer migration, stable compatibility-layer identity, deterministic save/load round-trip, layer CRUD/reorder/undo/redo, blocked unsafe removals, and rename/graph-metadata identity stability.
- `tests/veyra-m9-c1-layers.test.mjs` adds strict global layer/state identity, same-layer transition validation, layer weights, canonical layer commands, summary/manifest/resolver `machineLayer` refs, dependency guards across layers, deterministic artboard-duplication remapping and compatibility-layer preservation.
- `tests/veyra-m10-features.test.mjs` additionally exercises stable-ID state graph movement and transition reconnection through canonical commands. This contributes M9 implementation evidence even though the broader feature commit itself is deferred from roadmap advancement.
- All of those suites pass on exact-head standard Tests #195. Remaining Task 1 proof is full persistent-subobject semantic/dependency coverage and an explicit regression that advances runtime clocks/transitions before save/serialize and proves no ephemeral machine state enters authored data.

## Task 2 — Complete state families

Support the roadmap state families in the canonical model/runtime/UI:

- [x] Entry pseudo-state;
- [x] Exit pseudo-state;
- [x] Any state;
- [x] Single Animation state;
- [ ] 1D Blend state;
- [ ] Additive/Direct Blend state;
- [x] state speed, including reverse playback;
- [x] state captions and graph/editor metadata;
- [x] state start actions and state end actions.

Blend-state requirements:

- stable child/input records where persistent;
- deterministic thresholds/weights/order;
- control from compatible View Model/data sources or legacy inputs;
- ownership evidence identifies all contributing timelines and effective weights;
- zero-weight/inactive branches do not do unnecessary evaluation work.

### M9 blend-state implementation evidence — partial Task 2 advance

- `blend1d` steady-state evaluation is implemented with stable `machineBlendChild` identity, strictly increasing thresholds, numeric machine-input control, deterministic neighboring-child interpolation, boundary clamping and zero-unused-child work.
- `directBlend` steady-state evaluation is implemented with stable child identity, numeric per-child input weights, deterministic normalized ownership weights and zero-weight child sleeping.
- Ownership evidence exposes every active child timeline, its stable blend-child ref and effective normalized weight.
- Invalid thresholds, missing timelines, duplicate child IDs and non-number legacy inputs fail closed during canonical normalization.
- Blend-state transitions use the canonical transition compositor: animation↔blend and blend↔blend timed transitions compose outgoing/incoming child contributions with deterministic normalized effective weights.
- Lifecycle actions are now implemented for state-start/state-end and transition-start/transition-end phases with stable `machineAction` identity and exactly-once execution.
- Additive Blend, M8/View Model blend control sources and complete blend-state authoring/acceptance remain open. Therefore the full Task 2 blend checkboxes remain unchecked.
- Blend steady-state worker Actions run `34810521222`, job `103870774356`: syntax PASS, **49/49 suites PASS**, diff hygiene PASS. Transition-compositor worker run `34812631038`, job `103876831686`: **50/50 syntax checks + 50/50 suites PASS**; exact-main standard Tests #186 (`34812754122`, job `103877176194`) also PASS on `00f85fff5a92284efb343bb316bf531469ca182c`.

## Task 3 — Ordered simultaneous layer evaluation

Implement concurrent ordered layer evaluation with an explicit property-composition policy.

- [x] every enabled layer has independent current state, clock and transition state;
- [x] layers evaluate simultaneously in deterministic order;
- [x] property priority/composition is machine-readable and tested;
- [x] disabled layers perform no active runtime work and contribute no ownership;
- [x] transitions/blends from multiple layers compose without mutating authored source values;
- [ ] active owner stack reports authored value → timelines/blends → state/layer winner with evidence;
- [ ] Component instances receive isolated per-instance machine runtime paths, including repeated/nested Components;
- [ ] reset/prune/document replacement cleans only the relevant runtime scopes.

## M9 implementation evidence — layered runtime slice

- Production candidate tree implements concurrent ordered layer runtimes over the canonical `machineLayer` schema.
- Compatibility getters (`stateId`, `stateTime`, `transition`) remain adapters over the stable `compatibilityLayer`; reordering layers cannot silently retarget legacy callers.
- Entry/Exit/Any pseudo states, animation state speed (including reverse), state captions/graph metadata, deterministic later-layer property priority and layered ownership evidence are covered by `tests/veyra-m9-layered-runtime.test.mjs`.
- Layer weights now blend each layer's evaluated contribution against the previously composed/authored value; ownership evidence records layer ref, state, contribution timelines, `layerWeight` and effective winner status. This is useful partial evidence, but the Task 3 owner-stack checkbox remains open until the public ownership surface proves the complete authored → binding/timeline/blend → layer winner chain.
- Disabled layers are skipped and contribute no ownership; runtime work counters distinguish active/inactive layer work and reset with runtime reset so deterministic scrub/replay remains comparable.
- Worker Actions run `34810074334`, job `103869484723`: syntax checks PASS, **48/48 suites PASS**, diff hygiene PASS. Current exact-head Tests #195 also keeps the layered runtime and M9-C1 suites green.
- Capability honesty: steady 1D/Direct Blend evaluation and blend transition composition are implemented; Additive Blend and full blend authoring/UI remain open. M9 remains `IN PROGRESS`.

## Task 4 — Rive-class transition contract

Transitions must support, where meaningful for the source/target state types:

- [x] View Model property conditions;
- [x] compatible events/triggers;
- [ ] built-in artboard/runtime values supported by the roadmap;
- [x] legacy machine inputs;
- [x] comparison against fixed values;
- [x] comparison against compatible data-bound values;
- [x] transition duration;
- [x] exit time;
- [x] pause source;
- [x] allow exit during transition;
- [x] interpolation/easing;
- [x] transition start actions;
- [x] transition end actions;
- [x] enabled/disabled transition;
- [x] Any-state routing;
- [x] Entry/Exit routing;
- [x] Randomize Exit with weighted outgoing paths.

Randomized transitions need an explicit deterministic runtime RNG/seed contract for tests/replays. Never use a hidden global random source that makes verification nondeterministic.

### M9 transition implementation evidence — compositor + timing/lifecycle slices

- Production `00f85fff5a92284efb343bb316bf531469ca182c` lifts the previous fail-closed blend-transition restriction. The same canonical compositor handles animation→blend, blend→animation and blend→blend timed transitions by converting absolute outgoing/incoming contributions into deterministic sequential timeline weights.
- Transition interpolation persists `enabled`, `easing` and bounded cubic-bezier parameters; runtime/debug evidence exposes both raw and eased progress. Structural machine invalidation includes transition behavior rather than relying on stale runtime state.
- Permanent `tests/veyra-m9-transition-compositor.test.mjs` covers animation→1D Blend, 1D Blend→Direct Blend, eased composition and invalid interpolation authoring. Worker run `34812631038`, job `103876831686`: **50/50 syntax + 50/50 suites PASS**. Standard Tests #186 (`34812754122`, job `103877176194`) is SUCCESS on that exact production SHA.
- Production `fb0bfb1c90452a477833f36757ee3e3b3fe76dab` adds canonical Exit Time with `{unit: seconds|percent, value}`, speed-aware percent gating, and Pause Source behavior that freezes the exact outgoing source time captured when a transition starts while the incoming state continues.
- Exit Time rejects invalid units/ranges and meaningless pseudo-state source usage. The legacy `after` gate remains a separate condition; the two contracts are not silently conflated.
- Permanent `tests/veyra-m9-transition-exit-pause.test.mjs` covers seconds, percent, speed-adjusted percentage, paused-vs-live source clocks and invalid authored values. Worker run `34812931703`, job `103877684445`: syntax/full-suite/diff gates PASS; standard Tests #187 also passed on that exact production SHA.
- Production `db024269faf013db6254941053ce38499a4604f8` implements snapshot-safe Allow Exit During Transition. Interruptions evaluate outgoing transitions from the active target state, capture the exact composed in-flight pose as a runtime-only source snapshot, preserve target-clock Exit Time/Any routing, support repeated interruption and clone snapshots in forks. Standard Tests #189, run `34817067428`: **SUCCESS**.
- Production `5c9c700ec956df0d05f73b116c17a730be2d38c8` adds typed M8 View Model data condition sources, nested runtime data paths, data-bound comparison endpoints and trigger `fired`/`!fired` sources with nominal definition validation and non-consuming observation. Standard Tests #190, run `34817951482`: **SUCCESS**.
- Production `2d22041a984894ae170655b1305074fc35f8a4ca` defines exact queued M8 trigger consumption: candidates observe non-destructively, the selected transition consumes exactly one pulse, failed/gated candidates and observation conserve queues, duplicate conditions spend one pulse, ordered layers consume deterministically and forks spend only private queues. Standard Tests #191, run `34820131793`: **SUCCESS**.
- Production `3d9b71c7430e6636366c2c62c270016ba8f910a4` adds stable persistent `machineAction` records and exactly-once state-start/state-end/transition-start/transition-end execution across initial activation, timed/zero-duration transitions and interruption. Data/input actions mutate runtime state only; emit/timeline actions surface typed effects/requests without authored document mutation. Standard Tests #192, run `34821289759`: **SUCCESS**.
- Production `f68c3980930f42bd012a26be4773353cdeaa72d8` adds deterministic weighted Randomize Exit using an internal unsigned-32-bit seeded LCG rather than global randomness. Only eligible outgoing paths enter the weighted pool; choices expose seed/draw/sample/candidate evidence; reset/scrub replay from the configured seed; forks clone PRNG position; non-random states keep first-match behavior. Standard Tests #193, run `34821761018`, job `103904706876`: **SUCCESS on the exact production SHA with 50/50 syntax checks and 56/56 suites PASS**.
- Remaining transition-source gap: built-in artboard/runtime values. Broader open M9 work includes Additive Blend, full owner-stack evidence, Component-scoped runtime isolation, visual-graph browser acceptance, machine manifest/semantic/dependency completion and final performance/browser gates.

## Task 5 — Unified conditions, actions and data sources

Create one bounded machine-source/action registry rather than hard-coded editor-only cases.

Data-source contract:

- View Model/data endpoint;
- event/trigger endpoint;
- built-in artboard/runtime value where supported;
- legacy machine input compatibility.

Action contract:

- stable authored identity when persistent;
- execution phase (`state-start`, `state-end`, `transition-start`, `transition-end`);
- JSON-safe parameters and typed refs;
- runtime-only vs authored mutation clearly classified;
- canonical transport for View Model updates/events/timeline/runtime actions;
- no direct document mutation from machine runtime actions;
- exactly-once semantics per actual lifecycle event.

Unsupported future action types must fail with capabilities/diagnostics rather than being silently ignored.

### M9 data/lifecycle implementation evidence

- View Model/data condition sources and compatible data-bound comparisons are implemented through the existing M8 endpoint model, including nested View Model paths and nominal type compatibility. No second machine data model was introduced.
- M8 trigger endpoints are valid machine event sources. Candidate evaluation and read/fork observation are non-consuming; a selected transition spends exactly one queued pulse according to the permanent trigger-consumption tests.
- Persistent machine actions have stable typed identity and explicit lifecycle phase. Implemented runtime transports cover View Model/data updates, legacy input updates, emitted typed effects and timeline/runtime requests without direct authored mutation.
- Lifecycle actions execute exactly once for actual state/transition lifecycle events, including zero-duration transitions and snapshot-safe interruption. Forks isolate action side effects.
- Deterministic Randomize Exit is replayable under a seed and composes with the same selected-transition trigger consumption and lifecycle-action path.
- Permanent suites now include `veyra-m9-transition-interruption`, `veyra-m9-data-condition-sources`, `veyra-m9-trigger-consumption`, `veyra-m9-lifecycle-actions` and `veyra-m9-randomize-exit`; all are in standard discovery and pass on current exact-head Tests #195.
- Built-in artboard/runtime values remain unimplemented as condition sources; unsupported future source/action kinds must continue to fail closed through canonical capabilities/normalization.

## Task 6 — Runtime correctness and lifecycle

Rebuild `MachineRuntime` around layer runtimes while retaining compatibility adapters for existing callers.

Required runtime behavior:

- [x] deterministic fixed-step/elapsed-time stepping;
- [x] current states for every layer;
- [x] transition progress and interpolation;
- [x] state speed/reverse playback;
- [x] pause/exit-time behavior;
- [x] exact trigger/event consumption policy;
- [x] start/end actions fire exactly once;
- [x] Randomize Exit chooses once per decision and is replayable under a seed;
- [ ] structural authored edits reconcile safely without leaving dangling state IDs;
- [x] observation/fork/read paths do not advance the live machine or consume live events;
- [ ] runtime errors are bounded per layer so an invalid independent layer cannot corrupt another layer's valid output;
- [ ] settled/inactive layers stop continuous evaluation where possible.

## Task 7 — Visual graph editor

Add a real human authoring surface backed by the canonical machine commands.

Required UI:

- [ ] layer list with create/remove/rename/reorder/enable-disable;
- [ ] graph canvas for states and transitions;
- [ ] create/select/delete/reconnect states/transitions;
- [ ] drag states with deterministic graph positions and snapping;
- [ ] Entry / Exit / Any visualization;
- [ ] distinct visual representation for animation and blend states;
- [ ] conditions inspector;
- [ ] state/transition actions inspector;
- [ ] transition timing/interpolation inspector;
- [ ] blend-state child/threshold editor;
- [ ] current runtime state and active transition highlighting;
- [ ] layer runtime/debug view showing active state, time, weights and winning property contributions;
- [ ] graph pan/zoom/selection behavior that does not mutate behavioral data accidentally.

Graph positions, captions and layout metadata are editor-facing properties; changing them must not alter runtime behavior.

### M9 visual-graph implementation evidence — acceptance still open

- The landed graph-editor/Logic-panel code supports machine/layer selection, layer create/rename/reorder/enable/remove, state and transition creation, stable-ID selection, endpoint reconnection, graph movement, pan/zoom, typed pseudo/animation/blend rendering, runtime readout and inspector edits.
- `tests/veyra-m10-features.test.mjs` exercises the shared graph controller, SVG graph rendering, state movement, transition creation/reconnection and graph-camera non-mutation. Standard Tests #195 keeps that suite green on the integrated head.
- **Task 7 checkboxes remain open** because current permanent coverage is controller/fake-DOM oriented and does not yet prove the complete browser interaction surface: delete/reconnect UX, snapping behavior, all inspectors, runtime highlighting/owner contributions and pan/zoom/selection through real DOM events. M9 acceptance explicitly requires honest browser/headless coverage rather than source-only or controller-only claims.

## Task 8 — Canonical UI/AI command parity

Every persistent graph operation must exist once in the canonical command registry and be used by both human UI and AI/browser adapters.

At minimum provide commands for:

- layer CRUD/reorder/enable;
- state CRUD/update/move graph metadata;
- blend-state child CRUD/reorder/update;
- transition CRUD/reconnect/enable;
- condition CRUD/reorder/update;
- state/transition action CRUD/reorder/update;
- initial/entry behavior where authored;
- relevant persistent machine metadata.

Runtime ports remain separate for stepping, reset, data/event input and debug observation.

Every new persistent command must support validation, preview, transactional apply, provenance, undo/redo and verification/read-back.

### M9 command-surface implementation evidence — parity gate still open

- Canonical Store/command-bus operations now cover layer CRUD/reorder/update, state creation/update/movement, transition CRUD/reconnect, blend-child CRUD/reorder/update, condition CRUD/reorder/update and lifecycle-action CRUD/reorder/update. `tests/veyra-m9-c1-layers.test.mjs` and `tests/veyra-m10-features.test.mjs` exercise representative operations through the canonical command path.
- This is strong implementation evidence but not yet a Task 8 acceptance verdict. The remaining gate is a systematic catalog parity test proving that every UI/helper operation resolves to the same canonical command, with preview/failure/read-back/undo/provenance behavior for every command family.

## Task 9 — Manifest, semantics, ownership and name independence

Extend the AI-native surfaces so an agent can understand the entire machine without relying on names.

- [ ] manifest enumerates layers, state types, transitions, conditions, actions, data sources, capabilities and current runtime ownership when requested;
- [ ] semantic registry supports machine layers and all new persistent sub-objects;
- [ ] dependency graph connects View Models/events/timelines/components to machine graph consumers;
- [ ] `getOwnership()` identifies active layer/state/blend/track contributions and the effective place to edit;
- [ ] resolver treats human machine/layer/state names only as advisory/explicit-human lookup hints;
- [ ] random/duplicate/empty/misleading names do not change graph behavior or AI resolution;
- [ ] moving nodes in the visual graph does not change machine identity or runtime behavior.

AI gate from `plan.md`: the entire graph is addressable by IDs and semantic aliases; moving states in the visual graph or renaming them never changes behavioral identity.

### M9 AI-surface evidence — partial only

- M9-C1 proves stable `machineLayer` refs are visible in scene summaries and manifests and are indexed by the semantic resolver with machine ownership relationships.
- Later feature-graph code broadens generic identity/semantics/dependency plumbing, but there is still no dedicated acceptance proof that **every** M9 machine sub-object, data source and live ownership contribution is represented name-independently. The Task 9 checkboxes therefore remain open.

## Task 10 — Lightweight/runtime work accounting

Preserve the permanent quality contract while adding the larger machine system.

Required measured counters/gates:

- machine catalog/index builds;
- layer evaluations;
- active/inactive layer counts;
- state evaluations;
- transition-condition evaluations;
- blend-child/timeline evaluations;
- actions emitted;
- ownership/property-composition applications;
- cache/sleep hits where meaningful.

Performance fixtures:

- no-machine project: O(1) machine bypass;
- machine with multiple disabled/settled layers: no repeated timeline/condition work for inactive layers;
- one changed View Model property wakes only dependent transition/blend work;
- repeated Component instances keep runtime state isolated without rebuilding authored graph catalogs per instance/frame;
- observation/read paths report their real copy/traversal work and do not pretend to be free.

Do not introduce a new heavy dependency or editor framework solely for the graph UI.

## Task 11 — Adversarial verification suite

Add permanent tests covering at minimum:

1. legacy flat-machine migration preserves behavior;
2. save/load/undo/redo for layers, blend states, conditions and actions;
3. two+ simultaneous layers controlling overlapping and non-overlapping properties;
4. layer reorder/disable changes ownership deterministically;
5. Entry/Exit/Any behavior;
6. 1D blend thresholds and weights;
7. Additive/Direct Blend composition;
8. forward and reverse state speed;
9. duration/exit-time/pause/allow-exit/interpolation behavior;
10. View Model boolean/number/enum/trigger transition sources;
11. comparison against data-bound values;
12. exact-once state/transition start/end actions;
13. Randomize Exit weighted deterministic replay;
14. runtime graph edits/reconciliation during playback;
15. nested/repeated Component instance isolation;
16. live read/ownership does not advance clocks or consume triggers;
17. conflict/ownership explanation across layered timelines + M8 bindings;
18. random/duplicate/empty/misleading human names;
19. rename/reorder/graph-position changes preserve stable identity;
20. command/UI/helper ↔ canonical catalog parity;
21. preview/failure/read/query/ownership non-mutation;
22. no-machine and settled-layer performance counters;
23. existing M0–M8 regression suites stay green;
24. headless/browser DOM tests exercise actual visual-graph interactions rather than source-regex-only checks.

Current permanent coverage now directly exercises legacy migration/layer CRUD/identity and weighted layered runtime (#1, substantial parts of #2–#6), transition/runtime families #8–#13, and portions of #19–#21 through the M9-C1/layer-schema and graph-controller tests. Additive composition (#7), runtime reconciliation/isolation/ownership/name-invariance (#14–#18), settled/no-machine performance (#22) and real browser graph interaction (#24) remain acceptance blockers. All M0–M8 suites remain green on exact-head Tests #195 (#23).

## Explicit non-goals

Do not expand M9 into the next roadmap families:

- Layout/scrolling/responsive layout;
- broad listener/event/accessibility parity beyond machine actions/data sources required here;
- text/media/audio authoring;
- drawing/effect families unrelated to machine output;
- scripts/WGSL;
- Lottie/dotLottie interchange;
- Rust/WASM production-runtime rewrite;
- collaboration/cloud history;
- broad visual redesign outside the State Machine graph/editor surface.

Some code in these categories has already landed on `main`. Treat it as deferred implementation evidence only; do not extend it further or award roadmap/verified progress until M9 is accepted and the appropriate later milestone is activated.

## M9 acceptance

M9 may be independently VERIFIED only when:

- the layered schema and legacy migration are deterministic;
- all required state/transition families above are executable through one runtime;
- View Models/Data Binding drive machine logic without a second data model;
- ordered simultaneous layers have deterministic ownership/composition;
- Component runtime isolation is preserved;
- state/transition actions are exactly-once and use canonical transports;
- the visual graph editor creates/edits the same persistent graph used by AI/runtime;
- manifest/semantics/dependencies/ownership cover every new persistent entity;
- rename/graph-position invariance passes;
- lightweight/sleep/no-machine gates pass with honest counters;
- existing M0–M8 suites remain green;
- `npm run check` and `npm test` pass;
- unchanged standard `.github/workflows/test.yml` succeeds on the **exact final clean `main` SHA**;
- implementation handoff records that real-browser visual/usability acceptance was performed if available, or explicitly states the remaining browser-only acceptance boundary rather than claiming it.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Final clean main SHA / exact standard Tests run:
- Legacy migration proof:
- Layer/state/blend model + stable identity proof:
- Transition/data-source/random-exit proof:
- Action lifecycle exact-once proof:
- Multi-layer ownership/composition proof:
- Component-scope isolation proof:
- Visual graph UI + canonical command parity proof:
- Manifest/semantics/dependency/ownership/name-invariance proof:
- Lightweight counters and performance fixtures:
- Save/load/undo/redo/non-mutation proof:
- Existing M0–M8 regression proof:
- Browser/headless acceptance boundary:
- Compatibility/migration/size limitations:
```

---

# Deferred post-M9 implementation evidence — Feature Graph, Player + Interchange

**Roadmap mapping:** touches later `plan.md` families (including listener/event/accessibility, text/assets, layout, scripting/runtime and Lottie/dotLottie work)  
**Status:** `LANDED ON MAIN — OUT OF SEQUENCE; NOT ACTIVE; NOT INDEPENDENTLY VERIFIED`

## Purpose of this record

Keep already-landed implementation evidence visible without turning it into a second active milestone or bypassing M9. The code remains part of `main` and must stay regression-covered, but it receives no verified roadmap credit until M9 is accepted and the corresponding later milestone is activated under `plan.md`.

## Landed implementation slice

- **Feature graph (`featureVersion: 8`):** rich text runs/modifiers, layout containers/items, unified events/marker actions, accessibility metadata, script and shader source contracts, render presets, and interchange audit records. Nested records carry owner refs and participate in identity, semantics, resolver queries, dependency links, summaries and manifests.
- **Canonical feature commands:** `addFeature`, `updateFeature`, `removeFeature`, and `reorderFeature` share Store validation, transactions, provenance, undo/redo and the AI/browser command bus. Layered machine graph commands include state movement, transition reconnect, blend-child, condition, and lifecycle-action CRUD/reorder operations.
- **Rendering/media bridge:** image nodes reference the asset registry and render to SVG with embedded or external sources. Text records render as accessible SVG text spans while remaining editable source data.
- **Player/runtime:** `VeyraPlayer` provides deterministic seek/advance, looping and ping-pong, machine inputs, lifecycle events, snapshots and render callbacks. `registerVeyraPlayerElement()` supplies the browser `<veyra-player>` custom element using the same evaluator as the editor.
- **Graph editor:** the Logic panel supports machine/layer selection, layer create/rename/reorder/enable/remove, state and transition creation, stable-ID selection, reconnecting endpoints, graph movement, pan/zoom, typed pseudo/animation/blend visuals, runtime readout and inspector edits. These pieces are useful M9 implementation evidence but still require M9 browser/parity acceptance.
- **Lottie bridge:** dependency-free import/export covers common shape, polygon/star/path, text, marker and image layers with parent links, transform tracks, diagnostics and stable mapping refs. `exportDotLottie()` and `importDotLottie()` exchange a JSON-safe package with manifest, animations, images, fonts and Veyra extension metadata.

## Integrated CI evidence

- Implementation commit: `1c371fa5ea498bb1a3d4a4ed1c4a9dee67fc0bde`.
- Current integrated baseline reviewed here: `abf62f61c2e6121a64afc5c31c37f6da9dd54c20`.
- Standard Tests #195, run `34866362425`, job `104051088061`: **SUCCESS on that exact integrated SHA**.
- Exact-head log: **55/55 source syntax checks PASS; 59/59 repository suites PASS**, including `tests/veyra-m10-features.test.mjs` and all discovered M0–M9 regressions.
- Direct feature-suite coverage includes nested feature identity/undo, graph camera non-mutation, state movement/reconnect, deterministic player stepping, Lottie text/marker/image/path mapping, SVG text output and JSON-safe dotLottie round-trip.

## Sequencing and acceptance boundary

This is **not** an independently verified milestone. Standard CI proves the integrated tree is green; it does not replace the independent acceptance required by the active M9 milestone, nor does it establish full vendor parity for later roadmap families.

Scripts and shaders are machine-readable authored contracts; they are not executed in the browser runtime. Layout, event and accessibility records are addressable and rendered where applicable, but do not yet constitute full production engines. The dotLottie bridge is intentionally JSON-safe and dependency-free; it is not a binary ZIP writer. There is no `.riv` binary importer/exporter, production GPU/raster/video encoder, or complete Rive WASM feature surface in this change. Real-browser visual/usability acceptance remains open.

Do not add further post-M9 feature-family scope merely to elaborate this record. First close the active M9 acceptance gates. Once M9 is independently VERIFIED, re-map these landed capabilities into the next authoritative `plan.md` milestone(s), run the appropriate dedicated acceptance pass, and only then update verified progress percentages.

## Deferred implementation record

```text
- Status: DEFERRED PENDING M9 ACCEPTANCE
- Implementation commit: `1c371fa5ea498bb1a3d4a4ed1c4a9dee67fc0bde`
- Integrated main baseline reviewed: `abf62f61c2e6121a64afc5c31c37f6da9dd54c20`
- Exact standard Tests evidence: #195 / run `34866362425` / job `104051088061` — 55/55 syntax, 59/59 suites PASS
- Feature graph / nested stable identity proof: tests/veyra-m10-features.test.mjs
- Canonical command + UI evidence: src/veyra/commands.js, src/veyra/serviceRegistry.js, veyra.js
- Player/custom-element evidence: src/veyra/player.js + M10 suite
- Graph-editor evidence contributing to M9: src/veyra/graphEditor.js + Logic panel + M10 suite
- Lottie/dotLottie evidence: src/veyra/lottie.js + M10 suite
- Browser acceptance boundary: current controller/fake-DOM coverage is green; real-browser visual/usability acceptance remains open
- Compatibility/size limitations: JSON dotLottie package only; no .riv binary or production encoder/runtime parity
```
