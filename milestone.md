# Veyra — Current Milestone

`plan.md` is the product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This file is the **only active implementation milestone**.

Complete only the tasks below. Follow-up ideas belong in `suggestions`. Do not start M9. When implementation is complete, set `AWAITING VERIFICATION`, supply reproducible evidence, commit, and stop. Implementers do not mark their own work VERIFIED.

## Progress snapshot — refreshed after independent M8-C2 verification

These are carry-forward approximate planning estimates from the last accepted milestone, not measured vendor-parity percentages or a line-count metric. Unaccepted M8 work receives no new verified-completion credit.

| Area | Verified estimate | Current interpretation |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Previously accepted M0–M7 foundation. Remaining M8 runtime identity, graph aliasing and observation defects are not counted as complete. |
| Core editor / engine foundation | **~93–95%** | Previously accepted foundation; passing C2 cases do not constitute acceptance of the whole data runtime. |
| Modern Rive editor/runtime parity | **~53–57%** | M8 is implemented substantially but remains outside the accepted increment. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No new interchange capability accepted. |
| Full Veyra superset target | **~46–49%** | Rive-class capability + Lottie/dotLottie interoperability + AI-native semantics, subject to quality/modularity gates. |
| Remaining full-target work | **~51–54%** | Unchanged until M8 is independently accepted. |

### Roadmap position

- Implementation M0–M7: previously VERIFIED, with their documented limitations preserved.
- `plan.md` M3 / implementation M8: **CORRECTIONS REQUIRED**.
- Current implementation work: **M8-C3**, below.
- M9 / layered state machines: **NOT STARTED; blocked on M8 acceptance**.

Every verification/correction/advance must refresh this snapshot. Do not translate test counts into completion percentages.

## Independent verification evidence

- Production baseline: `216deb8c972cf476c3c9c0de90d640e47520568f`.
- Standard `Tests` #173, run `34325474833`: **SUCCESS on that exact baseline**.
- Independently reran the unchanged production tree on review commit `93558a3c364a7f34e913b0771f826dc3a4c76985`, Actions run `34344021696`, job `102441231159`.
- A `git diff --exit-code` gate proved production sources, package files, existing tests and scripts were unchanged from the baseline.
- **45/45 syntax checks and 39/39 existing suites passed again**, including original M8 28 checks, C1 28 checks and C2 13 checks.
- Additional targeted verifier probes: **2 positive controls passed; 10 regression assertions failed; no fixture/setup errors**. The same results were reproduced locally from the archived source.
- Positive controls: warm nested numeric invalidation refreshes once then sleeps; Property Group two-way interaction preserves authored serialization/revision/history while changing runtime output.
- Scope of this review: executed Node runtime/control-plane probes plus one static host-adapter declaration check. It is not real-browser visual acceptance.

Reproduction source: [verification/m8-c2-review.mjs](https://github.com/Logan17de/Rive_Rider/blob/93558a3c364a7f34e913b0771f826dc3a4c76985/verification/m8-c2-review.mjs).

Executed report: [M8-C2 independent review](https://github.com/Logan17de/Rive_Rider/blob/83711f201dd85a797301b0f9de669f0cf5222209/verification/M8-C2-review.md).

The review branch is evidence only, not another implementation milestone. Its temporary workflow was removed and never entered `main`. Do not cherry-pick that workflow. Convert the demonstrated behaviors into permanent regression tests. The host-port test should prove that the advertised operation is callable, not impose a particular spelling.

---

# MILESTONE M8-C3 — Runtime Contract Closure

**Topic:** Events, Lists, Canonical Identity, AI/Browser Parity & Incremental Work  
**Roadmap mapping:** correction pass for `plan.md` M3 — View Models & Data Binding  
**M8 verdict:** `CORRECTIONS REQUIRED`  
**Implementation status:** `READY`

## Goal

Close the executed failures below while preserving the successful M8-C1/C2 work. Verify combinations of existing features, not just each isolated happy path. No new Rive feature family is being added in this correction pass.

## Instructions for all implementing agents

1. Read this file, `QUALITY.md`, the executed review, and relevant existing tests before changing code.
2. Preserve one evaluator, one data graph, and the canonical Store/control-plane authored mutation boundary. No browser-only fixes or second runtime.
3. Add a failing regression for each demonstrated behavior before its production fix. Validate fixtures; do not count setup failures as product failures or weaken expectations to match current defects.
4. Keep IDs opaque and typed. Do not ban punctuation, rename user objects, or replace IDs to hide identity bugs. Human names remain advisory.
5. Preserve C2 ephemeral Property Group writes, warm nested-number behavior, authored-generation invalidation, runtime override precedence, and all earlier regression suites.
6. Runtime ports stay runtime-only. Intentional persistence uses a canonical authored command with validation/provenance/one undo transaction.
7. Keep diagnostics, metadata and executable APIs aligned. A method name in a manifest is not proof that an agent can call it.
8. Measure actual graph/index/traversal work separately from converter/output recomputation. Do not fake a lightweight result by counting only one narrow operation.
9. Keep permanent tests in normal discovery. Remove staging scripts/workflows from promoted code; never change standard CI to hide failing tests.
10. Stop at AWAITING VERIFICATION with exact commit/run evidence. No M9 or new completion credit.

---

## Task 1 — Collision-free runtime identity

- [ ] Replace delimiter-only scope/value/list/Property Group/cache keys with a collision-free structural encoding or equivalent nested maps.

### Executed failures

These distinct accepted runtime paths currently produce the same key:

```text
[{kind: componentInstance, id: "outer/componentInstance:inner"}]
[{kind: componentInstance, id: "outer"}, {kind: componentInstance, id: "inner"}]
```

Writing 0.66 in one makes the other read 0.66 instead of its initial 0.25.

Likewise, `(instance "a|b", property "c")` overwrites `(instance "a", property "b|c")`; both are valid authored instance/property pairs.

### Required behavior and tests

- Preserve complete typed path structure and each opaque ID; a short hash alone is not a collision-proof identity contract.
- Reset/prune/delete must match structural scope ownership, not ambiguous string prefixes.
- Cover `/`, `:`, `|`, `%`, quotes, Unicode and equal literal IDs across kinds.
- Test with valid authored Component graphs as well as direct runtime API scopes.
- Assert A updates only A; B defaults/runtime values remain unchanged; resetting A leaves B unchanged.
- Keep runtime/evaluated scope identities out of authored serialization.

## Task 2 — Canonical endpoint identity before graph operations

- [ ] Normalize equivalent endpoint forms before cycle detection, conflict selection, dirty propagation, caching, dependencies and ownership.

### Executed failures

Both forms address the same property but are treated as different graph nodes:

```text
{kind: "propertyGroupProperty", property: {kind: "propertyGroupProperty", id: "p"}}
{kind: "property", address: "propertyGroupProperty:p/value"}
```

A priority-0 binding then overwrites a priority-10 binding: output 0.75 instead of 0.25, wrong owner, zero reported conflicts. A self-cycle expressed through the two forms is accepted and changes the document.

### Required behavior and tests

- One canonical internal identity for one actual endpoint; retain deterministic compatibility for accepted serialized forms.
- Reuse the canonical property-address parser/encoding rather than maintaining a parallel string interpretation.
- Enforce higher-priority then stable-ID tie-breaking across aliases and declaration reorder.
- Direct and multi-hop cycles through aliases must reject atomically with stable dependency evidence.
- Chain propagation through equivalent forms must use the latest derived value rather than a stale authored value.
- Include percent-encoding/opaque-ID cases and prove document/revision/history stay unchanged on rejection.

## Task 3 — Event advancement vs non-mutating observation

- [ ] Fix nested-trigger consumption/settling and make live read/ownership inspection observational.

### Executed failures

After warming a nested trigger binding and firing twice:

```text
Expected outputs: true, true, false; two pulses consumed; empty queue
Actual outputs:   true, true, true;  one pulse consumed; one still queued
```

C2 invalidates nested paths on fire, but the consumption/settle path still invalidates only the terminal direct endpoint key.

Separately, `getOwnership(..., {dataRuntime: liveRuntime})` consumes a pending trigger: pending changes from true to false just because the caller reads ownership.

### Required behavior and tests

- The same resolved dependency identity must govern fire, pulse consumption and false/inactive settling, including direct and nested aliases.
- Each explicit fire is delivered according to the documented per-advance contract; fan-out must not consume it once per binding or inspecting observer.
- Read/query/ownership/current-scene inspection must not advance clocks, consume triggers, change live values, or emit mutation notifications.
- Do not fix observation by silently substituting a fresh default runtime: reads must still report current live values and scope.
- Separate explicit advancement from snapshot/peek evaluation using the same evaluator semantics.
- Test warm nested queues, one/two/multiple fires, fan-out, unrelated cached branches, repeated reads between advances, and two isolated Component paths.
- After the queue drains, the target settles inactive and unchanged evaluations cache again.

## Task 4 — Typed scoped runtime lists and converter dependencies

- [ ] Make list-consuming converters use the actual scoped runtime list, propagate its dependencies, and validate all runtime list mutations.

### Executed failures

Replacing runtime item A from 0.2 to 0.6 changes `getList()`, but the bound `numberToListIndex` output remains 0.2. Forcing the numeric source to change and recompute still returns 0.2 because the converter reads authored `document.lists`.

Inserting `"not-a-number"` into a declared number list succeeds and changes the list.

### Required behavior and tests

- Resolve converter list references through the same scoped data runtime, not a separate list model or authored-only shortcut.
- Register converter configuration dependencies (including list refs) and invalidate their actual dependent bindings on insert/remove/move/replace.
- Validate item type, enum/model/asset/artboard references, constraints and index policy before runtime mutation; failures preserve list/value/queue/notification state.
- Keep surviving item identity stable, handle empty/out-of-range cases explicitly, and preserve source defaults.
- Test live item 0.6 -> bound output 0.6 immediately and after forced recomputation; sibling scope stays 0.2.
- Test wrong-type insert and replacement failure, list reordering, nested View Model/list items, reset and authored-initial-list changes under the documented runtime-precedence policy.
- Notifications must preserve the complete runtime scope and useful old/new/change evidence.

## Task 5 — Executable public runtime/AI parity

- [ ] Align ownership recommendations, public adapters and registry metadata, then exercise them against live state.

### Executed failure and existing implementation

Ownership recommends runtime port `setTwoWayTarget`. The browser adapter does not expose that name. It **does** expose `setTwoWayBindingTarget`, which calls the runtime class method. Fix this metadata/transport mismatch rather than claiming the reverse-write implementation is absent.

### Required behavior and tests

- Either advertise the real public helper or provide an explicit callable mapping/alias. Do not require a particular method spelling.
- Discover a recommended operation, invoke it through the public surface, and read back the correct scoped visible result. A source regex/catalog entry alone is insufficient acceptance evidence.
- Preserve JSON-safe stable-ref arguments and runtime-vs-authored classification.
- Test nested-source recommendations with a realizable terminal/path write, not an uncallable root-plus-path description.
- Live browser read/ownership must use or explicitly request the actual host runtime, active artboard/Component scope and current evaluation context; do not silently report defaults as live output.
- Preserve Task 3 non-consuming observation while reading live state.
- Include full controlling-chain evidence for data -> converter/Property Group -> target and winner-only ownership. Do not recommend an overwritten intermediate authored property as the effective edit target.
- Keep intentional authored source reads distinct and available.

## Task 6 — Retained indexes and honest incremental-work gates

- [ ] Retain independent artboard binding indexes and bound actual invalidation work.

### Executed failure

Warm artboard A and B, then revisit A and B unchanged. `graphBuilds` increases by **2**, not 0. `#index()` clears every cached index when installing one, so alternating artboards continually rebuilds graphs.

### Required behavior and tests

- Cache indexes per document/artboard/relevant generation with explicit invalidation; do not evict all sibling indexes on every lookup.
- Retain independent scope output caches without sharing mutable runtime values.
- Use dependency indexes for terminal/nested/list changes instead of scanning and recompiling the entire project for each runtime write.
- Avoid repeatedly serializing the full authored data graph merely to check an unchanged frame where an explicit generation/revision contract can do so.
- Measure index builds, bindings examined, dependency edges visited, converter evaluations and output application separately. Output application/rendering may have its own legitimate cost; zero converter evaluations is not zero total work.
- Keep the 220-binding fixture and add multi-artboard/repeated-Component fixtures. A settled A/B revisit adds zero graph builds; one input change wakes only its relevant dependency branches, then caches again.
- Preserve the zero-binding fast path, DOM-free engine and no new heavy dependency.

---

## Acceptance and implementer handoff

M8 can be VERIFIED only after the demonstrated behaviors above pass against the **same final production tree**, with all previous M0–M8-C2 regressions intact.

Required evidence:

- permanent regressions mapped to all ten verifier failures, plus positive controls and composition cases specified in each task;
- actual public-adapter execution for runtime/AI parity and explicit distinction from real-browser visual QA;
- unchanged serialization/revision/history for runtime operations, reads, previews and rejected commands;
- meaningful index/traversal counters for lightweight behavior;
- `npm run check` and `npm test` passing;
- standard `.github/workflows/test.yml` SUCCESS on the exact final clean `main` HEAD;
- no staging scripts/temporary workflows in promoted code;
- refreshed progress notes, with percentages unchanged until independent acceptance.

Do not silently discard established M8 feature types or reject previously supported valid IDs/endpoints to make this pass. Unsupported operations need an explicit capability contract and compatibility decision.

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Final clean main SHA:
- Ten verifier failures -> permanent test mapping:
- Structured scope/tuple identity proof:
- Endpoint alias/conflict/cycle proof:
- Nested trigger + non-consuming read proof:
- Scoped typed list + converter propagation proof:
- Public host operation discovery/invoke/read-back proof:
- Retained index/actual work-counter proof:
- Preserved C1/C2 positive controls and earlier regressions:
- npm run check:
- npm test:
- Exact-head standard Tests run ID/result:
- Persistence/migration and performance impact:
- Cleanup evidence:
- Suggestions / explicit limitations:
```
