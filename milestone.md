# Veyra — Current Milestone

`plan.md` is the product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This is the **only active implementation milestone**.

Complete only the tasks below. Follow-up ideas belong in `suggestions`. Do not start M9. Implementers stop at `AWAITING VERIFICATION` with reproducible commit/test evidence; they do not mark their own work VERIFIED.

## Progress snapshot — refreshed after independent M8-C3 verification

These are carry-forward approximate planning estimates, not measured vendor-parity scores, line-count metrics or test-pass percentages. The C3 corrections have demonstrated progress, but M8 has not passed its complete acceptance gate, so no new overall verified-completion increment is claimed.

| Area | Verified estimate | Current interpretation |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Previously accepted M0–M7 foundation. C3 identity/observation/public-port fixes pass; resolved data identity and active-controller context still block M8. |
| Core editor / engine foundation | **~93–95%** | Previously accepted foundation; all earlier suites remain green. M8 is not accepted as a complete capability. |
| Modern Rive editor/runtime parity | **~53–57%** | No new feature-family completion credit until M8 acceptance. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No new interchange capability accepted. |
| Full Veyra superset target | **~46–49%** | Rive-class capability + Lottie/dotLottie interoperability + AI-native semantics, subject to quality/modularity gates. |
| Remaining full-target work | **~51–54%** | Unchanged pending M8 acceptance. |

### Roadmap position

- Implementation M0–M7: previously VERIFIED, with documented limitations preserved.
- `plan.md` M3 / implementation M8: **CORRECTIONS REQUIRED**.
- C3's ten previously reproduced failures: **FIXES CONFIRMED**; do not undo these fixes.
- Current implementation work: **M8-C4**, below.
- M9 / layered state machines: **NOT STARTED; blocked on M8 acceptance**.

Every verification/correction/advance must refresh this snapshot. Do not turn selected probe counts into completion percentages.

## Independent M8-C3 evidence

- Production baseline: `d36f0ac2841fa6320f4335f617847d123dd394ca`.
- Standard repository Tests #176, run `34349387154`: **SUCCESS on that exact baseline**.
- Independent review commit: `92b91621aa81c095a591bc5abc9bbd20cc4c175e`.
- Independent Actions run `34351233655`, job `102464741882`: unchanged-production guard and baseline gates PASS; additional composition probes FAIL.
- **48/48 syntax checks, 41/41 existing suites, C3 12/12 reproduced-contract checks and 17/17 composition checks passed independently**, both locally and in GitHub Actions. Original M8/C1/C2 28/28/13 remain green.
- Additional selected probes: **2 positive controls pass, 7 assertions fail across three blocker families, zero setup/execution errors in the final probe run**. This is not an overall application pass ratio.
- Positive controls confirm warm nested numeric updates and non-consuming live ownership observation.
- No production code or existing tests were modified by this verification. Temporary verifier workflow was removed from the review branch and never entered main.
- Scope: executed Node runtime/control-plane/host-adapter verification, **not real-browser visual/usability acceptance**.

[Executed M8-C3 review](https://github.com/Logan17de/Rive_Rider/blob/805f3b30be4ca189605b183535d4aecd04485f6d/verification/M8-C3-review.md)

[Reproduction source](https://github.com/Logan17de/Rive_Rider/blob/92b91621aa81c095a591bc5abc9bbd20cc4c175e/verification/m8-c3-review.mjs)

The review branch contains evidence, not a second implementation milestone. Convert the demonstrated behavior into permanent regressions; do not cherry-pick the temporary workflow.

---

# MILESTONE M8-C4 — Resolved Binding Graph & Evaluated Context

**Topic:** Nested Data Aliases, Type Definitions, Scoped Observation & Controller Ownership  
**Roadmap mapping:** correction pass for `plan.md` M3 — View Models & Data Binding  
**M8 verdict:** `CORRECTIONS REQUIRED`  
**Implementation status:** `READY`

## Goal

Make the already-supported M8 features compose correctly. Fix the three executed blocker families below without adding a new feature family, removing supported types, restricting valid IDs, or starting M9.

## Instructions for implementing agents

1. Read this file, the executed review, `QUALITY.md`, `docs/M8-C3-runtime-contract.md`, and affected tests before editing.
2. Preserve one evaluator, one data graph, stable typed/opaque identities, canonical authored transactions and scoped ephemeral runtime values.
3. Add failing regressions for each demonstrated behavior before the production fix. Do not count fixture errors as product failures, hard-code sample IDs/order, or weaken assertions to accept the defect.
4. Keep successful C3 structured runtime keys, Property Group aliases, trigger fan-out, observation forks, typed live lists, callable runtime ports and retained indexes.
5. Resolve graph/ownership meaning from IDs, paths, current scope and evaluated context, never human names. Retain authored root paths for future retargeting rather than permanently flattening them to today's terminal instance.
6. Preserve explicit event advancement. Read/ownership/scene inspection must not consume live events, advance clocks, mutate live caches/counters, or emit mutation notifications.
7. Intentional persistence goes through canonical validation/provenance/revision/history and one undo transaction. Invalid authoring must reject before commit with structured evidence.
8. Keep performance counters honest; no per-runtime-write full-project scan or unconditional per-frame graph rebuild to hide dependency errors.
9. Run all previous suites and new composition cases on the same final tree. Keep permanent tests in normal discovery and remove temporary transport/workflow artifacts before promotion.
10. Stop at `AWAITING VERIFICATION` with final SHA and standard Tests evidence. M9 and progress increases remain verifier-owned.

## Blocker family A — Resolved nested data aliases disagree

These two paths reach the same actual runtime property:

```text
root.nested -> instance child
root.nested.child_value
child.child_value
```

C3's syntactic key includes the root/path tuple, so the graph still treats them as different effective endpoints.

Executed failures:

- `z_writer: root.num -> child.child_value` plus `a_reader: root.nested.child_value -> box.opacity`: expected cold 0.25, then 0.66 after a runtime write; actual 0.2 both times.
- Priority-10 nested-target binding and priority-0 direct-target binding to that same child field: actual lower-priority 0.75 with zero conflicts; expected 0.25 and one conflict.
- A self-cycle from the nested form to the direct form is accepted and changes authored state instead of rejecting.

### Task 1 — One effective endpoint graph for resolved aliases

- [ ] Retain the stable authored root/path while resolving effective data endpoints in the relevant runtime scope.
- [ ] Use the resolved relationship consistently for topological order, virtual/derived values, conflicts, cycles, dependency propagation and ownership.
- [ ] Preserve the existing higher-priority/stable-ID tie-break policy across direct/nested aliases; dependency ordering must not depend on the chosen binding ID sorting before its writer.
- [ ] Reject demonstrable authored self/multi-hop cycles before document/revision/history mutation with stable endpoint/binding evidence.
- [ ] Preserve valid direct, nested and Property Group alias forms and existing file compatibility; do not ban nested targets to make the test pass.

### Task 2 — Retargeting, warm caches and scope isolation

- [ ] Re-resolve affected effective edges when a nested instance reference changes, including runtime-scoped references and supported derived reference changes.
- [ ] Remove stale dependency registrations and invalidate only affected reachable branches.
- [ ] Define bounded deterministic handling for cycles/conflicts introduced by runtime retargeting; do not hang or silently choose a winner outside the documented policy.
- [ ] Test cold/warm chains with both binding-ID orders, aliases as source and target, same/different scopes, rename/reorder, reference retargeting, self/multi-hop cycles and unrelated cache hits.
- [ ] Exercise real repeated/nested Component instances as well as direct runtime fixtures.

## Blocker family B — Broad type labels admit incompatible definitions

A property typed to enum e1 can currently bind to a Property Group typed to enum e2 simply because both report `enum`. Dispatch succeeds and changes authored state; evaluating the saved binding throws because e1v does not belong to e2. Preview currently throws a raw exception rather than returning its structured failure contract.

A View Model property typed to vm_child can likewise bind to a Property Group typed to different_model, then fail during scene evaluation.

### Task 3 — Full type-descriptor compatibility and failure boundaries

- [ ] Validate referenced enum and View Model definition identity, not only the broad labels `enum`/`viewModel`.
- [ ] Apply the same compatibility discipline to nested list descriptors and converter input/output contracts where those definitions flow through the existing binding pipeline.
- [ ] Preserve valid same-definition bindings and supported explicit conversions; do not delete M8 property types or silently coerce incompatible references.
- [ ] Make invalid normalization, preview and dispatch fail before authored mutation with stable source/target/type evidence; preview returns structured errors instead of leaking evaluation exceptions.
- [ ] Prove both executed enum/model mismatches reject with unchanged serialization/revision/history, then positively evaluate valid counterparts.
- [ ] Test the same contracts after authored schema/config changes with a warm runtime and explicit runtime overrides. Runtime-only incompatible values need bounded deterministic diagnostics rather than silently corrupting authored state or the next frame.

## Blocker family C — Scoped reads omit Component animation context

The executed fixture animates a source Property Group from 0.2 to 0.8, binds it to box.opacity, and instantiates the source twice. Instance A's timeline is at one second; B's is at zero.

```text
Full canonical host scene: A = 0.8, B = 0.2
Scoped host.read:          A = 0.2, B = 0.2
Scoped host scene for A:       0.2
```

Selecting the terminal source artboard is not equivalent to evaluating that Component instance with its actual controller/override state. The non-consuming boundary is fixed; this defect is incorrect context.

There is a related ownership failure even when the correct timeline context is explicitly supplied: visible output is 0.8, but the recommended operation edits the authored Property Group value that the timeline overwrites. The chain contains no controlling timeline.

### Task 4 — Scoped observation uses the actual evaluated Component context

- [ ] Construct scoped read/ownership/scene context through the canonical Component evaluation semantics, including the selected instance path and applicable timeline/state-machine/remap/mix/authored override state.
- [ ] Match the full host scene for the same instance and corresponding property. Define source-local vs wrapper/world property semantics explicitly where relevant; the scalar opacity fixture must agree without ambiguity.
- [ ] Do not reset live controllers or silently substitute source defaults, the first artboard, or a sibling's runtime.
- [ ] Preserve non-mutating forks and repeated observation; snapshot live values, queues, controller times, buckets, counters, notifications and authored history before/after reads.
- [ ] Test A/B at different times, repeated nested instances, live binding input changes, remap/mix and supported instance overrides; compare actual full-scene descendants with public scoped read-back.

### Task 5 — Ownership reaches the effective controller, including animation

- [ ] Continue the winning binding chain into the active controller of its source; `Timeline -> Property Group -> Binding -> visual` must not stop at the overwritten authored Property Group value.
- [ ] Include stable timeline/track or other applicable controller refs and truthful precedence/context evidence.
- [ ] Recommend a realizable edit that can affect the visible result: the active authored controller/keyframe or an explicitly described runtime override with its precedence. Do not claim an overwritten authored intermediate is the effective edit target.
- [ ] Execute the recommended operation through its advertised public/canonical transport and compare evaluated read-back, not just metadata/regex presence.
- [ ] Preserve existing data -> converter -> Property Group chains, conflict-winner ownership, readonly-source handling, name independence and runtime/authored separation.

### Task 6 — Regression, lightweight and release gates

- [ ] Convert all seven executed regression assertions into permanent tests, retaining both positive controls and all 41 existing suites.
- [ ] Add combinations described above, not only a count-to-requirement mapping.
- [ ] Retain C3's 220-binding, two-artboard, two-scope fixture: settled revisits perform zero graph/catalog/signature rebuilds; account separately for output application. Record the cost of new alias-resolution/observation work truthfully.
- [ ] Keep syntax checks and the unchanged standard `.github/workflows/test.yml` green on the exact final clean main SHA.
- [ ] Record a reproducible handoff with actual values, test names, final SHA/run, compatibility decisions and limitations. Do not claim real-browser visual QA from Node tests.

## Acceptance

M8 is eligible for independent verification when the three blocker families are fixed on one production tree, all previous C3 fixes remain green, supported endpoint/type combinations behave consistently, public scoped reads match the canonical scene, effective ownership recommendations are executable, and the exact-final-head standard Tests gate passes.

This milestone does not add layered state machines, Layout, assets/effects, scripting, interchange, MCP, a new UI framework or a runtime-language rewrite. No new vendor-parity completion credit is claimed before independent acceptance.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Final clean main SHA / standard Tests run:
- Seven independent regression assertions -> permanent tests:
- Resolved direct/nested endpoint ordering/conflict/cycle proof:
- Dynamic retargeting/warm-cache/scope proof:
- Enum/View Model/list/converter compatibility proof:
- Invalid preview/dispatch non-mutation and diagnostics:
- Full-scene vs scoped Component read/ownership proof:
- Animated Property Group effective-controller edit/read-back:
- Event/clock/cache/history observation non-mutation:
- C3 must-preserve regression proof:
- Actual performance/size/compatibility impact:
- npm run check:
- npm test:
- Temporary artifact cleanup:
- Suggestions and known limitations:
```
