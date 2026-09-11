# Veyra — Current Milestone

`plan.md` is the product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This is the **only active implementation milestone**.

Complete only the tasks below. Follow-up ideas belong in `suggestions`. Do not start M9. The user explicitly assigned the combined verifier/implementer role for C5; the normal separate-verifier boundary is recorded as overridden for this pass.

## Progress snapshot — refreshed after M8-C5 verification

These are carry-forward approximate planning estimates, not measured vendor-parity scores, line-count metrics or test-pass percentages. C3, C4 and C5 corrections are green; M8's View Models/Data Binding correction program is accepted. The estimates remain conservative because C5 closes correctness debt rather than adding a new parity family.

| Area | Verified estimate | Current interpretation |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Previously accepted M0–M7 foundation plus verified effective two-way runtime identity. |
| Core editor / engine foundation | **~93–95%** | Previously accepted foundation; all 46 suites remain green and invalid visual branches are isolated safely. |
| Modern Rive editor/runtime parity | **~53–57%** | M8 corrections are accepted; no extra feature-family credit is assigned for correctness repair. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No new interchange capability accepted. |
| Full Veyra superset target | **~46–49%** | Rive-class capability + Lottie/dotLottie interoperability + AI-native semantics, subject to quality/modularity gates. |
| Remaining full-target work | **~51–54%** | M8 correctness debt is closed; the next feature milestone remains unimplemented. |

### Roadmap position

- Implementation M0–M7: previously VERIFIED, with documented limitations preserved.
- `plan.md` M3 / implementation M8: **VERIFIED**.
- C3, C4 and C5 reproduced failures: **FIXES CONFIRMED**. Preserve these fixes; do not restart their implementations.
- Current implementation work: **M8-C5 — VERIFIED**, below. Reproducible evidence is recorded in `docs/M8-C5-runtime-contract.md`.
- M9 / layered state machines: **NOT STARTED; unblocked but outside this milestone**.

Every verification/correction/advance must refresh this snapshot. Selected probe counts are not completion percentages.

## Independent M8-C4 evidence

- Production baseline: `b57b390b245b363f9024349d9b116996eb045e7a`.
- Production Git tree: `0987af4e7c36aa367af320e862ea4ed8b85218dc`. The downloaded archive was independently indexed locally and reproduced this entire Git tree exactly.
- Standard Tests #178, run `34426474579`: SUCCESS on the exact production baseline.
- Independent local Node 22.16.0 and GitHub Node 22.23.2 reruns: **49/49 syntax checks and 45/45 existing suites PASS**. C4 reproduced/graph/types/context: **9 / 17 / 13 / 15 PASS**. Original M8/C1/C2 and C3 remain green.
- Independent review commit `89e086caae68bc85b8e0e9d3d138af4cfc2b41c5`; Actions run `34428444954`, job `102718580904`.
- The unchanged-production guard and baseline gates passed. Additional probes: **5 positive controls PASS, 5 regression assertions FAIL across two blocker families, 0 setup errors, 0 execution errors**. Local and GitHub observations agree.
- Positive controls include resolved aliases, nominal enum rejection, scoped animation/context, callable correct terminal ownership recommendations, and bounded Property Group error isolation/recovery.
- No production source or existing tests were changed by this review. The temporary verifier workflow was removed from its evidence branch and never entered main.
- Scope: executed Node runtime/control-plane/public-host testing, **not real-browser visual/usability acceptance**.

[Executed M8-C4 review](https://github.com/Logan17de/Rive_Rider/blob/c810199bdd6f049292b5c1a384a4ca4be7ec5a49/verification/M8-C4-review.md)

[Reproduction source](https://github.com/Logan17de/Rive_Rider/blob/89e086caae68bc85b8e0e9d3d138af4cfc2b41c5/verification/m8-c4-review.mjs)

The review branch is evidence, not a second implementation milestone. Convert demonstrated behavior into permanent regressions. Do not cherry-pick the temporary verifier workflow.

---

# MILESTONE M8-C5 — Effective Reverse Writes & Safe Visual Outputs

**Topic:** Two-Way Binding Identity, Actual Value Validation, Error Isolation & Event Safety
**Roadmap mapping:** correction pass for `plan.md` M3 — View Models & Data Binding
**M8 verdict:** `VERIFIED`
**Implementation status:** `VERIFIED`

## Goal

Close the two executed integration failures below without removing supported nested/two-way bindings, banning valid IDs/types, changing the product target, or starting M9. Keep C4's successful resolved graph, nominal type contracts and evaluated observation context.

## Instructions for implementing agents

1. Read this milestone, the executed review, `QUALITY.md`, `docs/M8-C3-runtime-contract.md`, `docs/M8-C4-runtime-contract.md`, and relevant tests before editing.
2. Preserve one evaluator, one effective graph, canonical authored validation/provenance/history, structural opaque identities and scoped ephemeral runtime values.
3. Commit a failing regression for each demonstrated behavior before the production fix. Keep fixture/setup failures separate from product assertions. Do not hard-code IDs, prior render order or sample values.
4. Preserve all 45 existing suites and the five new positive controls. Do not weaken assertions, bypass standard CI, or replace real public-port execution with metadata-only tests.
5. Resolving the destination of a write is not event advancement. Do not consume events, move clocks, emit extra notifications or author data just to find the effective terminal.
6. Use canonical property value constraints rather than a parallel set of magic bounds. Nominal type compatibility does not replace actual value validation.
7. Keep performance counters truthful. Preserve direct scalar-write and settled-frame behavior; report any additional effective-resolution or validation cost explicitly.
8. Reach `AWAITING VERIFICATION` with reproducible evidence before acceptance. For C5, the user then explicitly assigned the same agent as verifier; no M9 work or unsupported progress increase is allowed.

## Blocker A — Public two-way writes follow the wrong nested reference

```text
root.nested initially references child
root.selector references child2
reference_writer: root.selector -> root.nested
 two_way: root.nested.value <-> box.opacity
```

Forward evaluation and ownership correctly resolve child2, displaying 0.9. But `host.setTwoWayBindingTarget('two_way', 0.47)` returns true, changes child.value to 0.47, leaves child2.value at 0.9 and leaves the visible result at 0.9.

The same issue occurs inside real `[A, inner]` / `[B, inner]` Component paths. After A's selector is changed to child3, an immediate two-way edit to 0.63 changes A's old child; A remains 0.7. B remains correctly isolated at 0.9. This is wrong terminal resolution inside a scope, not cross-scope leakage or authored mutation.

### Task 1 — Reverse writes use the authoritative effective endpoint

- [x] Make runtime `setTwoWayTarget` and public `setTwoWayBindingTarget` resolve the same current effective source as forward evaluation and ownership.
- [x] Include binding-derived reference values, current scope, current authored generation and pending reference retargeting. Retain the authored root/path for future retargets.
- [x] Do not rely solely on raw defaults, a previous rendered frame, a stale cached terminal, or a caller-assembled virtual-value map. Reuse the canonical graph/evaluator meaning instead of a second resolver.
- [x] Validate the effective writable endpoint before changing state. Missing/null/cyclic/invalid paths must not partially modify an unrelated child.
- [x] Preserve the currently correct terminal ownership recommendation and direct runtime data-write behavior.

### Task 2 — Prove write/read agreement under retargeting and event pressure

- [x] Test cold and warm graphs, both binding-ID orders, direct and converter-derived reference writers, and at least two successive reference changes.
- [x] Test an edit immediately after reference change, before any read/render/advance, as well as after observation. The caller must not need to render first.
- [x] Exercise real repeated nested Components and distinct scoped values; only the effective child in the requested scope may change.
- [x] Snapshot old/effective/sibling child values, authored serialization/revision/history, notifications and runtime work counters; retained C4 observation tests preserve data/machine queues and clocks.
- [x] Successful write gives the correct next evaluated value and only the intended mutation notification. Failed resolution leaves all values/queues/history unchanged.

## Blocker B — Ordinary visual target values can abort an entire frame

`#validateRuntimeEndpoint` validates data/Property Group values but returns early for ordinary `property` endpoints. A legal unconstrained numeric source can therefore send 2 to opacity. The graph publishes that override and consumes events, then `evaluateDocument` throws during document normalization.

Executed failures:

- Numeric 2 -> opacity: raw `nodes[0].opacity must be between 0 and 1.`; no scene returned.
- An independent trigger in that same frame is consumed, but the event-bearing scene is never returned.
- A conditional color branch switches from valid `#112233` to `not-a-color`: raw paint.stroke error; independent scene output is lost.
- A numeric source with current default 2 -> opacity: preview returns `ok:false`, dispatch returns `ok:true` and mutates authored state, then canonical evaluation throws.

The bounded Property Group positive control already diagnoses and suppresses bad values, preserves independent output, and recovers after a valid replacement. Ordinary visual destinations need the same safety boundary through their own canonical value contracts.

### Task 3 — Validate actual ordinary-property outputs before publication

- [x] Reuse canonical implemented property value/normalization rules for ordinary visual targets, including applicable numeric ranges, finiteness, discrete/geometry constraints and paint/color validity. Do not just check broad `number`/`color` labels.
- [x] Validate before inserting invalid output into virtual downstream values, publishing scene overrides or irreversibly consuming events for that frame.
- [x] Preserve legal differently ranged numeric source/target bindings. An invalid value needs rejection/diagnosis; a broad numeric source must not be banned merely because it can later produce out-of-range values.
- [x] Preserve documented valid nullable/coercion behavior explicitly. A blanket early return is not a nullable-output policy.
- [x] Do not normalize/clone the whole project once per binding as a substitute for a shared bounded value contract. Record real validation work.

### Task 4 — Isolate invalid branches, conserve events and recover

- [x] Return stable binding/effective-target/value/type evidence for runtime-invalid outputs. Suppress the failed binding and dependent consumers while keeping independent scene outputs available.
- [x] The numeric fixture still returns the independent opacity 0.25 and triggered visibility true, instead of throwing after consuming the trigger.
- [x] Unrecoverable publication failure does not silently drain event queues for a scene never returned. Live observation remains non-consuming.
- [x] Valid replacement recovers without discarding unrelated scoped runtime values; the following unchanged frame returns to cached behavior.
- [x] Exercise full `evaluateDocument` and public host read/scene paths in the permanent C5 suite while retaining the existing public advance and repeated Component contracts.

### Task 5 — Preview, dispatch and converter validation agree

- [x] Prevent accepted authored bindings that immediately crash canonical evaluation through one documented bounded-diagnostic acceptance policy.
- [x] Keep preview/dispatch consistent and preserve machine-readable runtime evidence plus undo/provenance for intentional authoring.
- [x] Check statically demonstrable invalid converter definitions through existing C4 type validation and runtime-dependent converter values through the shared destination contract.
- [x] Preserve the genuinely runtime-dependent invalid-color fixture and its recovery boundary.

### Task 6 — Permanent regressions, lightweight gates and clean handoff

- [x] Convert all five executed failures and retained positive controls into permanent normal-discovery tests; add the combinations in Tasks 1–5.
- [x] Rerun all 45 existing suites plus the new C5 suite, including the 54 C4 checks and all C3/C2/C1/M8/M0–M7 gates. Do not change earlier expectations merely to hide a regression.
- [x] Preserve C3/C4 retained-index, scoped dependency, zero-binding and settled-work tests. Distinguish validation/resolution/output application work; no claim of zero total work from cache hits.
- [x] Run `npm run check`, `npm test`, and unchanged standard `.github/workflows/test.yml` command sequence on the exact final clean local main SHA.
- [x] Remove temporary implementation/transport workflows and scripts from promoted code. Preserve durable test/report evidence without moving the tested SHA unnecessarily.
- [x] Report actual before/after values, event/history boundaries, performance impact, compatibility decisions and remaining limitations. Real-browser desktop and narrow-viewport smoke evidence is reported separately from independent acceptance.

## Acceptance and handoff

M8 is eligible for independent acceptance only when effective two-way writes agree with evaluated identity, invalid values cannot crash otherwise valid scene evaluation or silently consume undelivered events, preview/dispatch/evaluation have coherent failure behavior, all previous corrections remain green and exact-final-head standard Tests succeeds.

No new feature family, runtime rewrite, broad UI redesign, scripting, Layout, Lottie/dotLottie, or M9 work belongs in this pass. Preserve the already-documented source-local scoped observation semantics and full-host observation cost; do not claim a path-only optimization here.

```text
Handoff
- Status: VERIFIED (combined verifier/implementer role explicitly assigned by user)
- Implementation commits: 937cbda regression-only red; 1b209a1 production fix; final documentation/verification commit follows
- Final clean main SHA / exact standard Tests run: resolve with git rev-parse HEAD after this handoff commit; npm ci, npm run check and npm test reproduced unchanged Tests workflow locally under Node 22
- Five verifier failures -> permanent test mapping: tests/veyra-m8-c5-runtime-safety.test.mjs; original independent probe rerun 10/10 green
- Effective two-way terminal / pending retarget / Component-scope proof: 0.9 -> requested 0.47 on child2; immediate scoped A retarget writes child3=0.63 while B remains 0.9
- Event/notification/history non-mutation during resolution proof: private observation leaves live counters/history unchanged; success emits one binding-provenance notification; failed null resolution changes no candidate child
- Canonical ordinary-property value validation proof: shared propertyValueContracts.js powers model normalization, direct writes and binding publication; opacity, color, geometry/discrete and recovery assertions pass
- Invalid-branch isolation / event delivery / valid replacement proof: invalid opacity/color branches return a scene; independent opacity=0.25 and event visibility=true survive; replacement 0.6 recovers and next frame sleeps
- Preview/dispatch/converter failure consistency proof: bounded-diagnostic acceptance stays safe; invalid default/color never reaches raw scene normalization; diagnostics include authored/effective endpoints, types and failure phase
- All prior suites / syntax checks: 46/46 suites and 50/50 source checks pass; original 10-probe review passes
- Actual validation/resolution/output work and size impact: address-local validation; one private observation per reverse edit; +11,584 raw normalized-LF bytes / +1,763 Brotli proxy bytes
- Cleanup / compatibility / browser-acceptance limitations: no temporary workflow/script promoted; no remote Actions run claimed; desktop and 390x844 smoke pass, but narrow UI remains desktop-first and no pixel-perfect acceptance is claimed
```
