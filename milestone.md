# Veyra — Current Milestone

`plan.md` is the product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This is the **only active implementation milestone**.

Complete only the tasks below. Follow-up ideas belong in `suggestions`. Implementers stop at `AWAITING VERIFICATION` with reproducible commit/test evidence; they do not mark their own work VERIFIED.

## Progress snapshot — refreshed after independent M8 acceptance

These are approximate engineering planning estimates, not vendor-certified parity scores, line-count metrics or test-pass percentages. M8 is now counted because its full View Model/Data Binding capability has passed independent verification through the original implementation and correction passes C1–C5.

| Area | Verified estimate | Current interpretation |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~96–97%** | Stable typed identity, universal semantics, canonical UI/AI control, ownership/dependency evidence, Components and the M8 data graph are independently verified. Remaining architecture work is mainly integration of later feature families into the same contracts. |
| Core editor / engine foundation | **~95–96%** | Workspace, authoring, Components, interaction loop, data runtime, incremental caches and authored/evaluated boundaries are verified. |
| Modern Rive editor/runtime parity | **~59–63%** | Components and View Models/Data Binding are now accepted; major remaining families include layered state machines, Layout, richer listeners/events/accessibility, drawing/effects/text/media, advanced rigging, scripting/shaders and production runtimes. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No new interchange family was completed by M8. |
| Full Veyra superset target | **~50–54%** | Target = Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while remaining modular/lightweight. |
| Remaining full-target work | **~46–50%** | Dominated by feature breadth, production runtime/export tooling and later editor/runtime systems rather than another identity/control-plane retrofit. |

### Roadmap position

- Implementation M0–M7: **VERIFIED**.
- `plan.md` M3 / implementation M8 — View Models & Data Binding: **VERIFIED**.
- M8-C1 through M8-C5 corrections: **VERIFIED as part of M8**; preserve their regression suites and contracts.
- Current implementation work: **M9 — State Machine parity + visual graph editor**, below.
- `plan.md` M5+ remains queued until M9 is independently accepted.

Every verification/correction/advance must refresh this snapshot. Selected probe counts are not completion percentages.

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

- [ ] ordered layers with stable IDs, advisory names, enabled/disabled state and deterministic priority/order;
- [ ] migrate every existing flat machine to one default layer without changing observable behavior;
- [ ] old files round-trip deterministically through migration and save/load;
- [ ] layer/state/transition/action IDs survive rename, reorder, graph movement and ordinary edits;
- [ ] deleting/reordering layers cleans dependencies safely and fails closed when blocked;
- [ ] references, resolver, semantics, manifest, summary and dependency graph recognize `machineLayer` and every persistent sub-object;
- [ ] no migration of runtime clocks/current-state/transition progress into authored data.

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
- [ ] state start actions and state end actions.

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
- Blend-state transitions now use the canonical transition compositor: animation↔blend and blend↔blend timed transitions compose outgoing/incoming child contributions with deterministic normalized effective weights. Additive Blend, M8/View Model blend sources and canonical blend-child CRUD commands remain open. Therefore the full Task 2 blend checkboxes remain unchecked.
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
- Disabled layers are skipped and contribute no ownership; runtime work counters distinguish active/inactive layer work and reset with runtime reset so deterministic scrub/replay remains comparable.
- Worker Actions run `34810074334`, job `103869484723`: syntax checks PASS, **48/48 suites PASS**, diff hygiene PASS.
- Capability honesty: Blend state families remain **not exposed** until their evaluator/authoring contracts are implemented. M9 remains IN PROGRESS.

## Task 4 — Rive-class transition contract

Transitions must support, where meaningful for the source/target state types:

- [ ] View Model property conditions;
- [ ] compatible events/triggers;
- [ ] built-in artboard/runtime values supported by the roadmap;
- [x] legacy machine inputs;
- [x] comparison against fixed values;
- [ ] comparison against compatible data-bound values;
- [x] transition duration;
- [x] exit time;
- [x] pause source;
- [ ] allow exit during transition;
- [x] interpolation/easing;
- [ ] transition start actions;
- [ ] transition end actions;
- [x] enabled/disabled transition;
- [x] Any-state routing;
- [x] Entry/Exit routing;
- [ ] Randomize Exit with weighted outgoing paths.

Randomized transitions need an explicit deterministic runtime RNG/seed contract for tests/replays. Never use a hidden global random source that makes verification nondeterministic.

### M9 transition implementation evidence — compositor + timing slice

- Production `00f85fff5a92284efb343bb316bf531469ca182c` lifts the previous fail-closed blend-transition restriction. The same canonical compositor handles animation→blend, blend→animation and blend→blend timed transitions by converting absolute outgoing/incoming contributions into deterministic sequential timeline weights.
- Transition interpolation now persists `enabled`, `easing` and bounded cubic-bezier parameters; runtime/debug evidence exposes both raw and eased progress. Structural machine invalidation includes the transition behavior rather than relying on stale runtime state.
- Permanent `tests/veyra-m9-transition-compositor.test.mjs` covers animation→1D Blend, 1D Blend→Direct Blend, eased composition and invalid interpolation authoring. Worker run `34812631038`, job `103876831686`: **50/50 syntax + 50/50 suites PASS**. Standard Tests #186 (`34812754122`, job `103877176194`) is SUCCESS on that exact production SHA.
- Production `fb0bfb1c90452a477833f36757ee3e3b3fe76dab` adds canonical Exit Time with `{unit: seconds|percent, value}`, speed-aware percent gating, and Pause Source behavior that freezes the exact outgoing source time captured when a transition starts while the incoming state continues.
- Exit Time rejects invalid units/ranges and meaningless pseudo-state source usage. The legacy `after` gate remains a separate condition; the two contracts are not silently conflated.
- Permanent `tests/veyra-m9-transition-exit-pause.test.mjs` covers seconds, percent, speed-adjusted percentage, paused-vs-live source clocks and invalid authored values. Worker run `34812931703`, job `103877684445`: syntax/full-suite/diff gates PASS. Standard exact-main Tests #187 is the required promotion gate for this SHA.
- Compatibility boundary: `allow exit during transition` remains deliberately open because interruption needs a snapshot-safe source/target composition contract; start/end actions, View Model/data-bound conditions, deterministic Randomize Exit and Additive Blend also remain open.

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

## Task 6 — Runtime correctness and lifecycle

Rebuild `MachineRuntime` around layer runtimes while retaining compatibility adapters for existing callers.

Required runtime behavior:

- [x] deterministic fixed-step/elapsed-time stepping;
- [x] current states for every layer;
- [x] transition progress and interpolation;
- [x] state speed/reverse playback;
- [x] pause/exit-time behavior;
- [ ] exact trigger/event consumption policy;
- [ ] start/end actions fire exactly once;
- [ ] Randomize Exit chooses once per decision and is replayable under a seed;
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
