# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count only **independently verified capability** and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Stable typed identity, universal semantics, name-independent resolution, canonical control plane, dependency/ownership graph, Components and current editor command surfaces are verified through M7. M8 remains unverified. |
| Core editor / engine foundation | **~93–95%** | M0–M7 foundations are verified, including workspace/camera behavior, Components, interaction loop, persistent Pen paths, stable vertex editing, multi-selection/marquee and canonical grouping. |
| Modern Rive editor/runtime feature parity | **~53–57%** | M8 Data Binding/View Models is implemented but not yet independently accepted; do not count it until this correction pass is verified. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No newly verified interchange capability in M8. |
| Full Veyra superset target | **~46–49%** | Target = Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while remaining modular/lightweight. |
| Remaining full-target work | **~51–54%** | Verified-only estimate remains frozen at the M7 level until M8 passes independent verification. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED**.
- `plan.md` M2 / implementation M6 — Multi-Artboard, Components & Project Graph: **VERIFIED**.
- Interstitial implementation M7 — Vector Authoring, Multi-Selection & Grouping UX: **VERIFIED**.
- `plan.md` M3 / implementation M8 — View Models & Data Binding: **CORRECTION REQUIRED**.

### Independent M8 verification result

The main M8 implementation commit `f772ba71f30cc3ac0e3b7b07cad290634af4e295` establishes the intended data graph, runtime, commands, Components integration and dedicated tests, but independent review found contract mismatches that must be corrected before M8 can be accepted.

The final handoff head `1a0274d654218a0919c5a1b9c9a505a8272d5994` also has no standard `.github/workflows/test.yml` run on that exact head yet. Do **not** trigger/claim the final CI gate until the correctness defects below are fixed.

---

# MILESTONE M8-C1 — Binding Capability, Ownership & Runtime Correctness

**Roadmap mapping:** correction pass for `plan.md` M3 — View Models & Data Binding  
**Status:** `READY`

## Goal

Keep the M8 architecture and close only the correctness/verification gaps found by independent review. Do not expand into M9/layered state machines or any later feature family.

A binding that the authored model accepts must be executable by the runtime, explainable by ownership/dependency APIs, capability-safe, typed-ID-safe, deterministic and fail-closed before authored state is committed.

---

## Mandatory correction rules

1. **One capability contract.** Binding validation, evaluator execution, manifest metadata, UI and AI must agree on what is readable, writable and bindable.
2. **No accepted-but-unexecutable binding.** If runtime/evaluator cannot honor a binding form, normalization/command preview must reject it before commit with machine-readable evidence.
3. **Typed identity means `(kind,id)`.** Dependency checks must never collapse typed refs to an unqualified ID string.
4. **Ownership must tell the truth.** A data-bound evaluated property must not tell AI to edit the authored target as if it were the active writable source.
5. **Each trigger fire is an event.** Multiple explicit fires must not silently collapse into one pulse unless a separately documented queue policy explicitly says so; for M8 use deterministic per-fire consumption.
6. **Settled graphs sleep.** Unchanged Property Group/property-sourced bindings must not be forced dirty every evaluation merely because their source is not a data endpoint.
7. Preserve all M0–M7 behavior, M8 stable IDs, serialization compatibility, Component scoping and zero-binding O(1) fast path.
8. Names remain display-only.
9. Run `npm run check`, `npm test`, and standard exact-final-head GitHub `Tests` only after corrections are complete.

---

## Task 1 — Canonical endpoint capability validation

Fix the current split where `dataGraph.js` can accept a property endpoint by raw readability/type while `evaluation.js` later rejects it through `propertyTargetStatus()`.

Required contract by endpoint role:

- one-way source: must be readable **and bindable**;
- one-way target: must be writable **and bindable** and supported by the canonical data-binding/evaluation write surface;
- two-way source and target: both directions must satisfy their declared readable/writable/bindable capabilities;
- `dataProperty.readable`, `.writable` and `.bindable` must be enforced, not descriptive only;
- Property Group capability flags must be enforced;
- normal Veyra property targets must reuse canonical property capability/status logic rather than a second raw-object interpretation;
- unsupported targets such as non-drivable display metadata must fail during preview/dispatch/normalization, not during scene evaluation.

Add precise diagnostics for at least:

```text
binding-source-unreadable
binding-source-unbindable
binding-target-readonly
binding-target-unbindable
binding-target-not-drivable
```

Exact wording may differ, but tests must identify the failed capability and stable target.

---

## Task 2 — Make two-way validation and runtime semantics identical

Current validation accepts broader writable endpoints than `VeyraDataRuntime.setTwoWayTarget()` can reverse-write. Remove that mismatch.

Requirements:

- every binding accepted as `mode: 'twoWay'` must have a working deterministic reverse-write path;
- nested data paths required by M8 must reverse-write through stable `viewModelInstance` + `dataProperty` refs;
- Property Group endpoints that are declared writable/bindable must have explicit reverse-write behavior;
- converter-bearing two-way bindings remain rejected until an inverse converter contract exists;
- any intentionally unsupported two-way shape must fail validation/preview before authored mutation;
- reverse writes remain runtime-only unless the source is explicitly an authored Property Group value;
- Component runtime scope must be preserved on reverse writes.

Do not solve this by merely loosening runtime errors after commit.

---

## Task 3 — Replace untyped dependency blocker scanning

Replace `blockersForReference()` JSON/string-substring detection with structural typed-reference traversal or canonical dependency-graph evidence.

Requirements:

- dependency identity is always `{ kind, id }`;
- equal IDs in different kinds are legal and must not create false blockers;
- real dependents still fail closed with stable blocker refs;
- owner-child relationships are handled explicitly, not inferred by substring;
- deletion diagnostics are deterministically sorted;
- the existing View Model-instance live-binding deletion fix remains protected.

Mandatory collision fixture: create multiple M8 entities of different kinds with the same literal ID and prove deleting one is blocked only by references to that exact typed identity.

---

## Task 4 — Correct Data Binding ownership/writable-source reporting

`getOwnership()` already detects `evaluatedSource: 'data-binding'`, but the writable-source result must also reflect Data Binding.

For a bound property expose at minimum:

```text
active binding ref
source endpoint
converter chain
runtime scope when relevant
one-way/two-way mode
conflict winner evidence
where a user/AI should edit to affect the visible value
whether that edit is authored or runtime-only
```

Required behavior:

- a one-way data-bound visual target must not report its authored target property as the recommended active writable source;
- direct runtime data source should identify the stable View Model instance/property path and runtime mutation port;
- Property Group source should identify its canonical property address/ref;
- two-way binding should explain that target edits propagate through the binding contract;
- owner stack must identify only the actual conflict-policy winner as active.

Add `read(..., { evaluated: true })`/ownership tests, not just dependency-graph existence tests.

---

## Task 5 — Trigger multiplicity and settled-runtime invalidation

### Trigger queue

Prove each explicit `fire()` is consumed deterministically.

For two fires before evaluation, the runtime must preserve two event pulses rather than collapsing the count to one boolean event. After all queued pulses are consumed, the bound target must settle back to its false/inactive value and then stop recomputing.

### Settled non-data sources

Remove the unconditional behavior that dirties every binding whose source kind is not `data` on every evaluation.

Requirements:

- unchanged Property Group/property-source bindings use cached results after settling;
- when an authored/animation/playback Property Group or readable property source actually changes, only reachable binding branches invalidate;
- zero-binding path remains O(1);
- no polling loop/DOM dependency is introduced;
- runtime stats make the behavior testable.

---

## Task 6 — Close the adversarial coverage gap

The existing file has 28 checks, but the original M8 acceptance list requires specific behaviors, not merely a count of 28. Extend/restructure the tests so every original mandatory M8 case has explicit evidence.

At minimum add coverage currently missing or too weak for:

1. random, duplicate and empty human names;
2. required property types through save/load determinism;
3. nested View Model paths after rename/reorder;
4. incompatible two-way binding failure with document/revision/history unchanged;
5. binding type/capability mismatch with machine-readable evidence;
6. runtime reset restoring deterministic initial values;
7. repeated **nested** Component-instance data scopes;
8. Property Group binding direction + cycle behavior;
9. enum reorder while a binding/value still uses the same enumValue ID;
10. incompatible converter-chain composition failure;
11. runtime list mutation invalidating only relevant dependents;
12. semantic registry support for every persistent M8 reference kind;
13. full persistent UI/helper ↔ canonical command-catalog parity, not a representative subset only;
14. preview/failure/read/query/ownership non-mutation of document/revision/history;
15. unsupported/non-drivable property target rejected before commit;
16. readable/writable/bindable capability enforcement;
17. cross-kind equal-ID dependency blocker correctness;
18. multiple queued trigger fires;
19. settled non-data binding cache behavior;
20. data-binding `getOwnership().writableSource` correctness.

Keep the 220-binding fixture and make its budget/complexity assertion deterministic rather than wall-clock dependent.

---

## Explicit non-goals

Do not expand this correction pass into:

- layered state-machine parity or visual graph editor;
- Layout;
- text/media/effects;
- scripts/WGSL;
- Lottie/dotLottie;
- Rust/WASM runtime;
- MCP/headless CLI;
- broad UI redesign.

---

## M8-C1 acceptance

M8 may be independently VERIFIED only when:

- canonical capability validation prevents accepted-but-unexecutable bindings;
- `readable` / `writable` / `bindable` flags have real enforcement;
- every accepted two-way form can reverse-write correctly in scope;
- dependency blockers use exact typed identity and survive cross-kind ID collisions;
- Data Binding ownership points to the real controlling/writable source;
- trigger multiplicity is deterministic and no explicit fire is silently lost;
- settled non-data bindings stop recomputing until their source changes;
- every original M8 mandatory adversarial requirement is explicitly covered;
- existing M0–M8 tests are green;
- `npm run check` passes;
- `npm test` passes;
- latest standard GitHub `Tests` succeeds on the **exact final `main` head**.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction implementation commits:
- Changed files:
- Tests added/changed:
- Endpoint-capability proof:
- Two-way parity proof:
- Typed dependency proof:
- Ownership/writable-source proof:
- Trigger multiplicity proof:
- Settled-runtime proof:
- Original M8 adversarial coverage map:
- npm run check:
- npm test:
- Exact-final-head standard GitHub Tests:
- Existing M0–M7 regression proof:
- Persistence/migration impact:
- Suggestions added to `suggestions`:
- Known limitations:
```
