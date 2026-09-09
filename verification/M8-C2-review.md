# M8-C2 — Independent verification report

## Verdict

**M8: CORRECTIONS REQUIRED. M9 must not start.**

The ordinary C2 numeric warm-cache and ephemeral Property Group fixes work in their covered cases. This is not a rejection of those successful fixes. Additional contract-composition tests expose remaining M8 defects.

## Exact evidence

- Production baseline: `216deb8c972cf476c3c9c0de90d640e47520568f`.
- Original standard `Tests` #173: run `34325474833`, SUCCESS on that exact baseline.
- Independently executed verifier commit: `93558a3c364a7f34e913b0771f826dc3a4c76985`.
- Verifier Actions run: `34344021696`; job `102441231159`.
- A mandatory `git diff --exit-code` guard confirmed that production sources, package files, existing scripts and existing tests were unchanged from the production baseline.
- Baseline rerun: **45/45 syntax checks; 39/39 existing suites PASS**. Original M8 28 checks, C1 28 checks and C2 13 checks all remained green.
- Additional targeted probes: **2 positive controls PASS; 10 regression assertions FAIL; no fixture/setup errors**.
- Downloaded source was also tested locally with Node 22.16.0: same 45/45, 39/39 and same 2/12 probe results. The downloaded `dataGraph.js` and `veyra.js` Git blob hashes matched the connector-read baseline blobs.
- Scope: executed DOM-free runtime/control-plane tests and one static public-adapter declaration check. This is **not** a real-browser visual/usability acceptance test.

The probe source is `verification/m8-c2-review.mjs` at the verifier commit. The temporary verifier workflow has been removed from this branch; it never entered `main`. The report/probes are review evidence, not a second active implementation milestone.

## Executed results

| # | Contract | Observed | Expected |
| --- | --- | --- | --- |
| 1 | Warm nested numeric change | Target 0.61; one recomputation; next frame zero | Same — PASS |
| 2 | Property Group runtime two-way boundary | Serialization/revision/history unchanged; target 0.64 | Same — PASS |
| 3 | Nested trigger, two fires | `[true,true,true]`; one pulse consumed; one remains queued | `[true,true,false]`; two consumed; queue empty |
| 4 | Runtime list converter | Live first item is 0.6, but bound output remains 0.2, even after forced source recomputation | Bound output 0.6 |
| 5 | Runtime list typing | Inserting a string into a number list succeeds and mutates it | Reject atomically |
| 6 | Full runtime scope identity | Single path ID `outer/componentInstance:inner` aliases two path IDs `outer` then `inner`; sibling receives 0.66 | Distinct scopes; sibling retains 0.25 |
| 7 | Runtime property tuple identity | `(instance a|b, property c)` overwrites `(instance a, property b|c)` | Distinct tuples; other value remains 0.1 |
| 8 | Equivalent Property Group target spellings | Lower-priority binding wins with 0.75; no conflict reported | Higher-priority binding wins with 0.25; one conflict |
| 9 | Self-cycle through equivalent endpoint spellings | Binding accepted; authored document changed | Reject before commit; document unchanged |
| 10 | Ownership read with live runtime | Read consumes one queued trigger and returns pending=false | Read consumes no event; pending remains true |
| 11 | Advertised runtime write port | Ownership recommends `setTwoWayTarget`, absent from the browser adapter | Recommended host port must be callable/discoverable |
| 12 | Warm multi-artboard index caching | Revisiting two unchanged artboards builds two more indexes | No additional index builds |

These probes were deliberately chosen to exercise suspected gaps; 2/12 is **not** an app-completion or overall test-pass percentage.

## Root causes and correction boundaries

### Runtime identity and graph identity

`scopeKey()` concatenates unescaped kind/ID strings with `/`; property cache keys concatenate IDs with `|`. Use collision-free structured identities without narrowing the existing valid-ID contract.

`bindingEndpointKey()` treats `{kind:'propertyGroupProperty', property:{kind:'propertyGroupProperty',id:'p'}}` and `{kind:'property', address:'propertyGroupProperty:p/value'}` as different graph nodes even though both write the same property. Canonicalize equivalent endpoints before conflict selection, cycle detection, caching, dependency traversal and ownership reporting.

### Event lifecycle and observation

C2 nested invalidation handles numeric `setValue`/reverse writes, but trigger consumption still invalidates only the terminal direct endpoint key. Nested bindings cache `true` and fail to consume/settle the remaining pulses. The ownership/read path also calls consuming evaluation on a live runtime. Event advancement must be explicit; inspecting current state must not advance it or consume queued events.

### Runtime lists

`numberToListIndex` consults authored `document.lists`, not the scoped live list. Converter-list dependencies are not routed into the relevant dirty branch. Runtime inserts/replacements bypass the declared item-type validation. Fix reads, dependencies, scope and validation together, not just the converter cache counter.

### Public AI/browser parity

A browser helper already exists under the different name **`setTwoWayBindingTarget`** and delegates to the runtime class method. The defect is a metadata/host-port mismatch, not complete absence of reverse-write implementation. Either align the advertised port or provide an explicit callable adapter mapping. The permanent regression must test discoverability/execution, not insist on a particular spelling.

Also exercise actual host read/ownership against live data, Component scope and current evaluation context. Passing a separate runtime manually into a unit test is not proof that default browser adapters use the live runtime.

### Lightweight behavior

`#index()` clears all cached artboard indexes when installing one index, so alternating unchanged artboards constantly recompiles the graph. Retain independent indexes with explicit invalidation. Count graph construction, bindings examined and dependency traversal separately from output recomputations; `evaluatedBindings === 0` alone does not prove zero work.

## Instructions for the implementing agents

Use the active root `milestone.md` M8-C3 as the sole implementation scope. Convert these failures into permanent automated regressions, preserve all existing C2 positive controls and M0-M8 tests, and do not change expectations merely to accept current broken behavior. No production code was changed by this verification. Do not cherry-pick the historical temporary review workflow into `main`.
