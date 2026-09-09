# M8-C3 — Independent verification report

## Verdict

**The ten previously reproduced failures are fixed. M8 as a whole remains CORRECTIONS REQUIRED.**

Do not undo the successful C3 identity, Property Group alias, event, list, host-port or index work. Seven additional failed assertions expose three remaining integration families: resolved nested data aliases, nominal binding type compatibility, and evaluated Component/animation context in scoped reads and ownership. M9 has not been advanced by this review.

## Exact execution evidence

- Production baseline: `d36f0ac2841fa6320f4335f617847d123dd394ca`.
- Standard repository Tests #176, run `34349387154`: SUCCESS on that exact production SHA.
- Independent review commit: `92b91621aa81c095a591bc5abc9bbd20cc4c175e`.
- Independent Actions run: `34351233655`; job `102464741882`.
- The unchanged-production guard passed: `git diff --exit-code d36f0ac2841fa6320f4335f617847d123dd394ca HEAD -- src veyra.js veyra.html veyra.css scripts tests package.json package-lock.json .github/workflows/test.yml`.
- Independent GitHub rerun: **48/48 syntax checks and 41/41 existing suites PASS**. This includes C3's 12 reproduced-contract checks and 17 composition checks, original M8 28, C1 28 and C2 13.
- Additional independent probes: **2 positive controls PASS; 7 regression assertions FAIL; zero setup/execution errors in the final probe run**.
- Local Node 22.16.0 independently reproduced the same 48/48, 41/41 and 2/9 results from an archive pinned to the production SHA. The archive comment identified that SHA; downloaded `dataGraph.js` and `runtimeHost.js` blob hashes matched the connector-read production blobs.
- Source: `verification/m8-c3-review.mjs` at the review commit. Execute with `node verification/m8-c3-review.mjs` from the repository root. It emits JSON observations and writes `verification/m8-c3-review-results.json`.
- GitHub artifact `m8-c3-independent-results`, ID `10103782597`, preserves the executed probe and JSON results. Durable probe source remains in Git history; the artifact has limited retention.
- The temporary review workflow was removed from this review branch after execution. It never entered main. Production code and existing tests were not changed by the reviewer.

These probes intentionally target suspected integration gaps. Their pass ratio is **not** an app-completion percentage. This is executed Node runtime/control-plane/host coverage, **not real-browser visual/usability acceptance**.

## Results

| Probe | Expected | Observed |
| --- | --- | --- |
| Positive control: warm nested numeric update | Target 0.61, one recomputation, then sleep | PASS |
| Positive control: live ownership with queued event | Correct live value, event stays queued, live counters unchanged | PASS |
| Nested/direct alias chain | Cold output 0.25; after input write 0.66 | 0.2 before and after |
| Nested/direct target conflict | Priority-10 output 0.25; one conflict | Lower-priority output 0.75; zero conflicts |
| Nested/direct self-cycle | Reject before document/revision/history mutation | Accepted; authored state changed |
| Enum definition mismatch | Structured preview rejection; dispatch rejects; authored state unchanged | Preview throws; dispatch succeeds; later evaluation throws because e1v does not belong to e2 |
| Nested View Model definition mismatch | Reject before mutation | Accepted; later evaluation throws incompatible nested View Model instance |
| Scoped read of animated Component A | Full scene, scoped read and scoped scene all give 0.8; B remains 0.2 | Full scene A=0.8/B=0.2, but scoped reads A=0.2/B=0.2 and scoped A scene=0.2 |
| Animated Property Group ownership | Include controlling timeline and recommend an effective edit | Visible value 0.8, but recommendation edits the overwritten authored PG value; timeline absent from chain |

## 1. Resolved data identity, not only syntactic endpoint spelling

Fixture:

```text
root.nested -> View Model instance child
root.num -> child.child_value          (binding z_writer)
root.nested.child_value -> box.opacity (binding a_reader)
```

Both paths reach the same actual child property, but `bindingEndpointKey()` retains the root/path tuple as a separate graph identity. `buildRuntimeIndex()` therefore misses the writer-reader dependency. It can evaluate the nested reader first and then cache its old value forever while the direct writer changes.

The same missing equivalence lets nested and direct writes to that child property avoid priority conflict detection, and permits a self-cycle expressed through the two paths.

This is **not** a return of C3's delimiter collisions or Property Group address/ref alias bug; those fixes pass. The remaining defect is resolution of two data paths to one effective runtime property.

Correction must preserve the authored root/path for future retargeting while using scope-aware resolved dependencies for order, conflicts, cycles, propagation and ownership. Do not permanently collapse a path to today's terminal instance or ban nested endpoints. Runtime retargeting must update the effective graph safely and incrementally.

## 2. Binding type compatibility loses the referenced definition

The current binding validator compares broad labels such as `enum` or `viewModel`. Equal labels do not make different enum definitions or different View Model definitions interchangeable.

The enum fixture creates two valid enums, a source property typed to e1, and a target Property Group property typed to e2. The source's valid e1v value cannot satisfy the e2 target. Dispatch nevertheless persists the binding. Evaluation then throws `propertyGroups[0].properties[0].value enum value e1v does not belong to e2.`

A second fixture binds a property referencing vm_child into a Property Group property declared for different_model. That also persists and fails later during evaluation. These are valid fixtures before the invalid binding is attempted, not missing-reference setup errors.

Fix compatibility of full type descriptors and converter output contracts before authored commit. Preserve valid same-definition bindings. Unsupported or mismatched definitions must produce structured preview/dispatch diagnostics with stable refs, not raw preview exceptions or accepted files that fail immediately when evaluated.

## 3. Scoped observation omits Component controller context; ownership stops too early

The fixture animates a source Property Group from 0.2 to 0.8 and binds it to box.opacity. Two valid Component instances use the same source. A's timeline is at one second; B's is at zero.

The canonical full-host evaluated scene correctly produces A=0.8 and B=0.2. The same production host adapter's scoped read and scoped scene produce A=0.2 and B=0.2.

`runtimeHost.readOptions()` selects the terminal source artboard, but selecting that board is not equivalent to evaluating the selected Component instance with its actual timeline/state-machine/remap/mix/overrides. Reuse the existing canonical Component evaluation path when constructing read context; do not add an alternate evaluator or reset live runtime state.

There is a related ownership defect even when the correct timeline context is supplied explicitly: the visual target evaluates to 0.8, but writableSource recommends editing the authored Property Group value, which the timeline overwrites. The binding-chain trace needs to continue into the active animation/controller of its source. It must identify an effective edit such as the owning track/keyframe or an explicitly described runtime override, with truthful precedence evidence.

All read probes retained authored state and live queues/counters. The non-consuming boundary is fixed; the remaining failure is accuracy of the context and recommendation.

## Implementer direction

Use root milestone.md as the only active scope. Add permanent regression tests for these exact failures, plus direct/nested retargeting and repeated real Component cases. Preserve every green C3 regression and its explicit performance accounting. No new feature family or M9 work is required to close these contracts.
