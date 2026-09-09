# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count only **independently verified capability** and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Stable typed identity, universal semantics, name-independent resolution, canonical control plane, dependency/ownership graph, Components and current editor command surfaces are independently verified through M7. M8 remains unverified. |
| Core editor / engine foundation | **~93–95%** | M0–M7 foundations are independently verified. M8 runtime-data correctness is not counted yet. |
| Modern Rive editor/runtime feature parity | **~53–57%** | View Models/Data Binding are implemented substantially, but M8 remains outside verified progress until the runtime consistency issues below pass. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | No newly verified interchange capability in M8. |
| Full Veyra superset target | **~46–49%** | Target = Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while remaining modular/lightweight. |
| Remaining full-target work | **~51–54%** | Verified-only estimate remains frozen at the M7 level until M8 passes independent verification. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED**.
- `plan.md` M2 / implementation M6 — Multi-Artboard, Components & Project Graph: **VERIFIED**.
- Interstitial implementation M7 — Vector Authoring, Multi-Selection & Grouping UX: **VERIFIED**.
- `plan.md` M3 / implementation M8 — View Models & Data Binding: **CORRECTIONS REQUIRED**.

### Independent M8-C1 verification result

M8-C1 commit `d51bca71dca6d23f053dd0655e985d742488adaf` successfully fixes the previously identified capability-validation, two-way-shape validation, typed dependency blocker, ownership reporting, trigger multiplicity and settled non-data-source invalidation defects.

Standard GitHub `Tests` run #171 (`34319200295`) is **SUCCESS** on exact final head `4ad598fbdf61f8227f996c0fa6510fe93a89164d`; its Syntax check and Run test suites steps both succeeded.

Independent warm-runtime review nevertheless found the remaining consistency defects below. Do not advance to M9 until they are corrected and independently verified on one final head.

---

# MILESTONE M8-C2 — Warm Runtime Cache & Authored/Runtime Boundary

**Roadmap mapping:** final correction pass for `plan.md` M3 — View Models & Data Binding  
**Status:** `AWAITING VERIFICATION`

## Goal

Make a long-lived `VeyraDataRuntime` remain correct after authored data/binding changes and nested View Model runtime changes. M8 must behave correctly not only on the first evaluation, but after caches/indexes are warm for many frames.

This pass must preserve every accepted M8/M8-C1 behavior and must not start layered state machines, Layout, text/media/effects, scripting, interchange, MCP, or runtime rewrite work.

---

## Blocker 1 — Nested data paths do not invalidate their bound branch after warm-up

A nested binding can be authored as:

```text
data:inst_main / nested / nested_value
```

but `VeyraDataRuntime.setValue('inst_nested', 'nested_value', ...)` currently dirties only the direct endpoint key:

```text
data:inst_nested / nested_value
```

The binding index is keyed by the root nested path, so after the first evaluation has cached the binding, changing the terminal nested instance can leave the bound visual/property output stale.

The same issue affects a nested `setTwoWayTarget()` reverse write: the terminal runtime value changes, but the forward binding may remain clean/cached.

### Required correction

- runtime invalidation must understand every canonical binding endpoint that reaches the changed terminal runtime property;
- do not solve this with display names or full-document polling;
- nested resolution must remain stable-ref based;
- dirty propagation must remain bounded to reachable branches;
- Component runtime scope path must remain part of the runtime identity;
- sibling/repeated nested Component scopes remain isolated;
- triggers and nested list/view-model paths must follow the same identity discipline where applicable.

### Mandatory tests

1. Warm a nested binding until `evaluatedBindings === 0`, then change the terminal nested value; next evaluation must recompute the nested branch and update the target.
2. A completely unrelated branch must remain a cache hit.
3. Warm the graph, call nested `setTwoWayTarget()`, then evaluate; the forward target must reflect the reverse-written value immediately on the next evaluation.
4. Repeat #1–#3 in two different Component instance paths and prove zero leakage.
5. Rename/reorder nested definitions after binding creation and prove invalidation still follows stable refs.

---

## Blocker 2 — Binding/index signature changes can reuse stale binding cache entries

`bindingIndexSignature()` correctly notices authored binding/converter changes and causes a new runtime index to be built, but cached binding outputs are keyed only by:

```text
runtimeScope + bindingId
```

A long-lived runtime can therefore reuse an old output after the same binding ID changes source/target/converter configuration. Authored View Model default/initial-value changes can also leave a clean data-source binding cached because data endpoints skip non-data source snapshot checks.

### Required correction

Define one deterministic cache-generation/invalidation contract. Acceptable approaches include a canonical graph/data revision signature in cache keys or explicit invalidation when the relevant authored dependency signature changes.

It must cover at least:

- binding source change under the same binding ID;
- binding target change under the same binding ID;
- converter chain/config change under the same converter/binding IDs;
- binding enable/disable/priority winner changes;
- dataProperty default changes when no live runtime override exists;
- View Model instance initial-value changes when no live runtime override exists;
- nested View Model initial-reference changes;
- Property Group authored source changes (preserve C1 incremental behavior);
- removal/recreation of a binding with a reused ID;
- Component/runtime-scope isolation.

Do not simply clear every runtime cache every frame. `QUALITY.md` dirty/settled guarantees must remain intact.

### Mandatory tests

1. Warm a binding, update its converter config, evaluate again, and prove the new output is used.
2. Warm a binding, change its source while preserving binding ID, and prove the new source controls the target.
3. Warm a binding, change its target while preserving binding ID, and prove the old target is no longer reported/applied and the new target receives output.
4. Warm a data binding with no live override, update the authored default/initial value, and prove the evaluated target refreshes.
5. Set an explicit runtime override, change the authored default, and prove the live runtime override still wins until reset.
6. After one invalidating authored mutation, a subsequent unchanged frame must sleep/cache again.

---

## Blocker 3 — Property Group two-way reverse write crosses the authored boundary directly

M8-C1 added Property Group two-way reverse writes by assigning directly to `property.value` inside `VeyraDataRuntime.setTwoWayTarget()`.

That makes a runtime port mutate serialized authored project state without crossing the Store/control-plane transaction/history boundary. This conflicts with Veyra's authored/evaluated separation and canonical mutation contract.

### Required correction

Choose and mechanically enforce one explicit contract:

### Preferred runtime contract

- normal two-way interaction writes a **runtime/evaluated Property Group value**, leaving authored `property.value`, serialization, Store revision and history unchanged;
- reset restores the authored Property Group value;
- bindings/ownership can distinguish authored Property Group value from runtime value.

### Or explicit authored-write contract

If an operation intentionally persists a Property Group edit, it must cross the canonical Store/command/control-plane validation/history path and produce exactly one undoable authored transaction. A runtime-only API must never silently perform the authored write.

Whichever contract is selected:

- `getOwnership().writableSource` must report the correct runtime vs authored port;
- preview/read/evaluation remain non-mutating;
- Component runtime scope remains isolated;
- serialization cannot change merely because a runtime interaction fired unless the caller explicitly requested a canonical authored mutation.

### Mandatory tests

1. Capture serialized document + Store revision/history, execute a normal runtime two-way Property Group interaction, and prove the declared boundary contract exactly.
2. Reset and prove deterministic restoration.
3. Two Component scopes using the same authored Property Group source must not leak live reverse-written values.
4. If authored persistence is supported, prove one command = one undo entry and undo restores the previous authored value.

---

## Must-preserve M8-C1 fixes

Do not regress:

- canonical binding capability classifier shared by validation and evaluation;
- readable/writable/bindable/drivable enforcement;
- accepted two-way shapes have executable reverse-write ports;
- converter-bearing two-way bindings fail closed without inverse converters;
- typed `(kind,id)` dependency blockers and cross-kind equal-ID safety;
- winning Data Binding ownership/writable-source evidence;
- multiple queued trigger pulses consumed one per evaluation;
- settled Property Group/property sources stop recomputing until their value changes;
- O(1) zero-binding fast path;
- 220-binding bounded dirty-propagation fixture;
- all M0–M7 regressions;
- original M8 and M8-C1 adversarial suites.

---

## Acceptance

M8 can be independently VERIFIED only when:

- nested terminal runtime changes invalidate every reachable root nested binding path and nothing unrelated;
- warm runtime caches cannot survive an authored dependency change that changes binding output/ownership;
- unchanged settled graphs return to sleeping after invalidation;
- runtime two-way Property Group interaction no longer silently bypasses the authored Store/history boundary;
- all M8/M8-C1 tests remain green;
- dedicated M8-C2 warm-cache tests are green;
- `npm run check` passes;
- `npm test` passes;
- latest standard GitHub `Tests` succeeds on the **exact final `main` head**.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction implementation commits: c5ebae1bf4468cbdb4d9d60d103f981fcdf890ae
- Changed files: src/veyra/dataGraph.js, src/veyra/controlPlane.js, tests/veyra-m8-c1-corrections.test.mjs, tests/veyra-m8-c2-warm-runtime.test.mjs
- Tests added/changed: dedicated M8-C2 warm-runtime suite adds 13 adversarial checks; M8-C1 Property Group two-way assertion is updated to the corrected runtime-only boundary.
- Nested-path invalidation proof: terminal View Model property changes traverse stable-ref nested source paths in the active runtime scope and dirty only bindings whose data path touches the changed `(instance,property)` pair; unrelated warm branches remain cache hits.
- Warm-cache authored-change proof: a deterministic authored runtime signature covers binding/converter structure, View Model property defaults/schema, instance initial values/nested refs, Property Group capability schema and authored lists; a signature change invalidates the scope once, preserves live runtime overrides, then returns to sleeping.
- Converter/source/target cache-generation proof: same-ID converter config, source, target, priority/winner and remove/recreate changes cannot reuse old binding-cache output.
- Default/initial-value invalidation proof: authored defaults and instance initial values refresh warm bindings when no runtime override exists; explicit runtime values keep precedence until reset.
- Property Group two-way boundary proof: normal two-way interaction writes scoped ephemeral Property Group runtime state, never serialized `property.value`; Store revision/history/serialization remain unchanged, reset restores authored value, and ownership reports the runtime mutation port.
- Component-scope isolation proof: nested View Model and Property Group runtime writes are keyed by the full typed Component scope path; repeated outer/inner scopes do not leak.
- Settled/zero-binding performance proof: one authored/runtime invalidation wakes required work once; the next unchanged frame returns to `evaluatedBindings === 0`; zero-binding remains the O(1) early return.
- npm run check: PASS — 45/45 source files in the clean promotion tree.
- npm test: PASS — 39/39 suites in the clean promotion tree; M8-C2 13 checks green, M8-C1 28 checks green, original M8 28/28 green.
- Exact-final-head standard GitHub Tests: REQUIRED to succeed on the exact final clean `main` head after handoff; the standard `Tests` run attached to that head is authoritative.
- Existing M0–M8-C1 regression proof: all prior suites green in the clean promotion gate.
- Persistence/history impact: no schema/version change; runtime Property Group reverse writes are ephemeral and excluded from serialization/history unless a caller intentionally uses the existing canonical authored command surface.
- Suggestions added to `suggestions`: none.
- Known limitations: converter-bearing two-way bindings still require a future inverse-converter contract; no M9/layered-state-machine work included.
```
