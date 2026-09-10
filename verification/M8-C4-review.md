# M8-C4 — Independent verification report

## Verdict

**C4's seven reproduced regression assertions now pass. M8 as a whole remains CORRECTIONS REQUIRED because of two remaining runtime integration families.** M9 has not been advanced. Preserve the successful resolved graph, nominal types, scoped observation, controller ownership and C3 work; do not restart those implementations.

## Exact evidence

- Production baseline: `b57b390b245b363f9024349d9b116996eb045e7a`.
- Production Git tree: `0987af4e7c36aa367af320e862ea4ed8b85218dc`.
- Standard Tests #178, run `34426474579`: SUCCESS on that exact production SHA.
- The source archive obtained through the GitHub connector was independently indexed locally. `git write-tree` exactly reproduced `0987af4e7c36aa367af320e862ea4ed8b85218dc`, not merely a selection of file hashes. The standard workflow blob is unchanged: `bd31d16af5fe9c09f04450d487ea074dc66cfe41`.
- Independent local Node 22.16.0 rerun: **49/49 source syntax checks and 45/45 repository suites PASS**.
- C4 reproduced/graph/type/context suites: **9 / 17 / 13 / 15 PASS** (54 named checks). Original M8/C1/C2: 28/28/13; C3: 12/17, all green.
- Independent review commit: `89e086caae68bc85b8e0e9d3d138af4cfc2b41c5`.
- Independent GitHub Actions run: `34428444954`; job `102718580904`; Node 22.23.2.
- The unchanged-production guard, `npm ci`, and all baseline syntax/suite gates passed in that run. Only the additional independent probe step failed.
- New probes: **5 positive controls PASS; 5 regression assertions FAIL across two blocker families; 0 setup errors; 0 execution errors**. Local and GitHub runs produced the same observed values.
- Artifact `m8-c4-independent-results`, ID `10133540451`, preserves the executed probe and JSON results. It has limited retention; the probe remains in Git history.
- The temporary verifier workflow was removed from the evidence branch after execution. It never entered main. Production code, standard workflow and existing tests were not edited by the reviewer.

[Executed run](https://github.com/Logan17de/Rive_Rider/actions/runs/34428444954) · [Reproduction source](https://github.com/Logan17de/Rive_Rider/blob/89e086caae68bc85b8e0e9d3d138af4cfc2b41c5/verification/m8-c4-review.mjs)

Run `node verification/m8-c4-review.mjs` from the repository root. The file uses production modules directly, without mocks, extra packages, or dependency on the worker's test helper. It records fixture errors separately from failed product assertions. The selected probe ratio is not an app completion/pass percentage. This is Node runtime/control-plane/public-host testing, not real-browser visual/usability acceptance.

## Passing independent controls

1. Direct writer / equivalent nested reader gives 0.25, then 0.66 after a runtime change, then sleeps.
2. Different enum definitions reject preview and dispatch with structured evidence and unchanged serialization/revision/history.
3. Animated Components A/B read 0.8/0.2 in both scoped and full-scene observations; authored state and live controller/runtime state remain unchanged.
4. The ownership-advertised terminal `setDataRuntimeValue` recommendation correctly edits the child selected by a derived reference, changing the visible result to 0.47 without changing the old child.
5. An invalid value flowing into a typed, bounded Property Group is diagnosed and isolated; an independent output stays 0.25, and valid replacement restores the bounded value to 0.6.

These controls distinguish the remaining failures from already-fixed alias ordering, nominal validation, observation or general runtime-writing behavior.

## Blocker A — The public two-way binding write does not use the effective derived reference

Valid fixture:

```text
root.nested initially references child
root.selector references child2
reference_writer: root.selector -> root.nested
 two_way: root.nested.value <-> box.opacity
```

Forward evaluation correctly follows child2 and shows 0.9. Ownership also correctly recommends the terminal child2 value port. But calling the supported public operation:

```js
host.setTwoWayBindingTarget('two_way', 0.47)
```

returns `true`, writes **child.value = 0.47**, leaves **child2.value = 0.9**, and leaves visible opacity **0.9**. The serialized document/history stay unchanged; this is a wrong-runtime-target write, not a persistence leak.

A second probe uses real repeated nested Components `[A, inner]` and `[B, inner]`. After warming both scopes, A's selector is changed to child3 and the two-way write is called immediately, without an intervening render. Expected A is 0.63; actual A remains 0.7 and its old child receives 0.63. B correctly stays 0.9. This is not cross-scope leakage: it is stale/default terminal resolution inside A.

### Cause and correction boundary

`VeyraDataRuntime.setTwoWayTarget()` calls `resolveDataEndpoint(source, options)` without obtaining the current effective virtual reference values. `resolveDataEndpoint` can consume virtual values, and ownership supplies them, but the public two-way path does not. Thus the read/forward graph and reverse-write path disagree.

Reverse writes must reuse the authoritative effective graph/context for the requested binding and scope, including pending reference changes. Do not require an earlier render, flatten the authored path permanently, trust a caller-supplied stale derived-value map as authoritative, or remove valid two-way nested bindings. Preserve no-event-consumption during resolution and exactly one intended runtime mutation/notification. Invalid/cyclic/unresolved references must fail before an unrelated child's value is changed. Keep the already-working terminal ownership recommendation.

## Blocker B — Ordinary visual targets bypass value validation and can abort the entire frame

The new runtime value check handles data and Property Group endpoint values, but `#validateRuntimeEndpoint()` explicitly returns early for `resolution.endpoint.kind === 'property'`.

### Executed cases

| Case | Actual result |
| --- | --- |
| Unconstrained numeric data property sends 2 to box.opacity | `evaluateDocument()` throws `nodes[0].opacity must be between 0 and 1.`; no scene is returned |
| Same frame contains an independent trigger -> visibility binding | The trigger is consumed (`pending=false`) before the exception, but no event-bearing scene is returned |
| Conditional color converter switches from valid `#112233` to `not-a-color` | Raw exception: `nodes[0].paint.stroke must be "none" or a six-digit hex color.`; independent visual output is lost with the frame |
| Bind a valid numeric property whose current default is 2 to opacity | Preview returns `ok:false`, but dispatch returns `ok:true` and changes authored state; the next canonical evaluation throws |

The inputs are valid fixtures before the tested operation. Numeric 2 is legal for the unconstrained source; the destination's range is narrower. The color fixture successfully evaluates its initial valid branch before switching. The Property Group positive control confirms that bounded diagnostic isolation already works for other endpoint families.

### Cause and correction boundary

Complete nominal type comparison is now working. The missing contract is **actual output validity at ordinary visual-property destinations**, before publishing overrides and consuming events. Broad type `number` or `color` is insufficient to establish that a value satisfies opacity, geometry, paint or another implemented property's canonical constraints.

Reuse the existing canonical property value/normalization contracts rather than maintaining a second set of ad hoc bounds. Preserve valid differently ranged numeric bindings: reject or diagnose invalid values, not every broad source type. Preserve documented valid coercion/nullable behavior explicitly, not through a blanket bypass.

Invalid runtime outputs should produce stable binding/target/value evidence and suppress the failed binding and dependent consumers while leaving independent scene outputs available. An unrecoverable frame failure must not silently consume events for a scene that was never returned. Return to normal cached behavior after a valid value repairs the failure.

Preview, dispatch and evaluation need a consistent policy for known-invalid starting values. Structured rejection is appropriate; a documented safe diagnostic acceptance is also distinguishable from the demonstrated failure. Saving a binding that immediately crashes canonical evaluation is not acceptable. The independent last probe deliberately permits safe bounded-diagnostic acceptance rather than mandating one specific rejection implementation.

The color case may be caught earlier by converter validation if its invalid branch is statically demonstrable. In that case add explicit atomic rejection coverage and retain a genuinely runtime-dependent invalid-output test; do not count fixture rejection as an execution failure or weaken the safety requirement.

## Implementer direction

The active root milestone is the only work scope. Convert the five assertions into permanent regressions and preserve all five positive controls plus every existing suite. Keep C4's successful graph/context/type fixes, source-local observation semantics, explicit event advancement and performance counters. Do not start M9, rewrite the runtime, ban valid IDs/types, or expand into unrelated feature families.

No new completion credit is claimed. Carry-forward planning estimates remain approximately 53–57% Rive parity and 46–49% full Veyra target until M8 acceptance.
