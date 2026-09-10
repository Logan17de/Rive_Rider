# M8-C4 worker handoff — exact-final-main release evidence

**Status: AWAITING VERIFICATION.** Recorded September 10, 2026 after the final-main standard Tests run completed successfully. This is worker implementation/test evidence, not independent acceptance. M8 remains CORRECTIONS REQUIRED; M9 remains blocked. Carry-forward planning estimates remain approximately 53–57% Rive parity and 46–49% of the full Veyra target.

This evidence branch is based on the tested production commit and adds only this receipt. It does not move main or contain an alternative implementation milestone. Root `milestone.md` on main remains the only active milestone; `QUALITY.md` remains authoritative.

## Immutable production and CI identifiers

| Evidence | Exact value |
| --- | --- |
| Implementation base / previous main | `04ac6842bbc57125e37604c84112a7a8ce937f7f` |
| Base tree | `9ca9fedbded41c335553354292f6e3435c926182` |
| Test-only commit, before production changes | `e08c287e8f7c9929e3a491d49e709cdbb002a875` |
| Final clean main / implementation commit | **`b57b390b245b363f9024349d9b116996eb045e7a`** |
| Final tree | `0987af4e7c36aa367af320e862ea4ed8b85218dc` |
| Standard workflow | Unchanged `.github/workflows/test.yml` |
| Standard workflow blob | `bd31d16af5fe9c09f04450d487ea074dc66cfe41` |
| Standard Tests number / run | **Tests #178 / `34426474579` — SUCCESS** |
| Standard job | `102712690147` — SUCCESS |
| Standard event / branch / attempt | `push` / `main` / 1 |
| Standard tested head | `b57b390b245b363f9024349d9b116996eb045e7a` |
| Standard run completed | September 10, 2026, 01:41:49 UTC |
| Runtime used by standard commands | Node 22.23.2; npm 10.9.8; Ubuntu runner |

[Final main commit](https://github.com/Logan17de/Rive_Rider/commit/b57b390b245b363f9024349d9b116996eb045e7a) · [Tests #178](https://github.com/Logan17de/Rive_Rider/actions/runs/34426474579) · [Exact job and logs](https://github.com/Logan17de/Rive_Rider/actions/runs/34426474579/job/102712690147) · [Active milestone](https://github.com/Logan17de/Rive_Rider/blob/b57b390b245b363f9024349d9b116996eb045e7a/milestone.md) · [Runtime contract and limitations](https://github.com/Logan17de/Rive_Rider/blob/b57b390b245b363f9024349d9b116996eb045e7a/docs/M8-C4-runtime-contract.md)

The final commit is exactly two commits ahead of the base, with no divergence: the test-only regression commit, then the implementation/docs/remaining tests commit. Main was advanced with a non-forced fast-forward only after the clean candidate gate passed.

## Red-to-green evidence before promotion

[Isolated replay run `34426278992`](https://github.com/Logan17de/Rive_Rider/actions/runs/34426278992), job `102712086122`, completed SUCCESS. The worker-authored replay is reproducible evidence, not an independent verifier.

The replay checked out the exact unchanged base and ran all 48 syntax checks and 41 previous suites successfully. It applied and committed only `tests/veyra-m8-c4-reproduced.test.mjs` before changing production. That execution produced exactly **2 positive controls PASS, 7 regression assertions FAIL, and zero SETUP_OR_EXECUTION_ERROR results**. The gate parsed these results and required that exact distribution; a generic failing process was not sufficient.

It then applied the implementation, checked the exact expected final Git tree, reran the full standard commands plus all four focused C4 suites, asserted a clean worktree and unchanged standard workflow, and published only the clean candidate. The source patch SHA-256 was `972080f410025542adac775d1d5e88155aa6db9a20cfde6be6165410588c3bde`.

The replay artifact `m8-c4-publication-evidence` (artifact ID `10132781210`) contains baseline/final logs, the failing regression log, all four focused passing logs, commit/tree IDs, changed paths, cleanup evidence, the patch and the candidate source archive. Its configured expiration is September 17, 2026; the permanent tests and this receipt are not dependent on artifact retention.

## Executed final-main gates

The exact-final-main standard job log contains all of these results:

| Gate | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run check` | **49/49 source syntax files PASS** |
| `npm test` | **45/45 suites PASS** |
| `veyra-m8-c4-reproduced.test.mjs` | **9/9 PASS**: seven regressions plus two controls |
| `veyra-m8-c4-graph.test.mjs` | **17/17 PASS** |
| `veyra-m8-c4-types.test.mjs` | **13/13 PASS** |
| `veyra-m8-c4-context.test.mjs` | **15/15 PASS** |
| Original M8 / C1 / C2 | **28 / 28 / 13 checks PASS** |
| C3 reproduced / composition | **12 / 17 checks PASS** |

The four C4 suites contain 54 named checks. These are selected regressions, not a percentage of application completion. None of the 41 previous test suites was edited or weakened. The standard workflow, package metadata and dependency lockfile were unchanged.

## Seven demonstrated assertions and actual read-back

| Regression | Permanent post-fix evidence |
| --- | --- |
| Direct writer and equivalent nested reader | Chain returns **0.25 cold, then 0.66** after the scoped write; graph suite also reverses binding-ID order |
| Nested/direct target conflict | Higher-priority output **0.25**, **one conflict** |
| Aliased self-cycle | Rejected before document serialization, revision or history changes; authored multi-hop and default-derived cases also reject |
| Enum definition mismatch | Preview returns structured rejection without throwing; dispatch rejects; authored state/history unchanged; subsequent evaluation valid |
| Nested View Model definition mismatch | Rejects before mutation; subsequent scene evaluation valid |
| Animated Component observation | Full A/B **0.8 / 0.2**; public scoped A/B **0.8 / 0.2**; A scoped scene **0.8** |
| Animated Property Group ownership | Timeline/track/controller evidence retained; no recommendation to edit the overwritten authored intermediate |

The context suite executes the advertised scoped Property Group runtime operation, not merely its metadata: setting A to **0.47** yields A **0.47** in both scoped and full read-back, while B stays **0.2**, with unchanged authored history and live controller clocks. Canonical keyframe edits, Component override edits, machine transition contributions and undo are also executed and read back.

## Compatibility and composition decisions

Authored root/path is retained. Current scope resolves effective terminal identity used consistently for conflicts, cycles, order, propagation and ownership. Prefix-reference dependencies trigger affected re-resolution; stale terminals and conflict-loser dependencies are removed. Runtime/derived reference changes settle before publication. Runtime cycles are bounded, diagnosed and suppress their dependent consumers rather than hanging or silently selecting an undocumented winner; valid retargets recover.

Enum/View Model definitions are nominally checked, including recursive list and converter contracts. Valid same-definition bindings, two-way forms, explicit conversions, existing Property Group aliases and opaque typed IDs remain supported. Schema changes revalidate stale runtime overrides and whole live lists, including nonselected items. Invalid values diagnose/suppress affected outputs without corrupting authored state; valid replacement/reset paths recover.

Scoped observation captures the actual canonical Component traversal on private live-state forks. Timeline/remap/mix, machine/transition and supported instance override context are retained. Repeated reads preserve queues, values, clocks, buckets, counters, notifications and authored history. Invalid or not-evaluated scopes fail explicitly rather than choosing a sibling/default.

Scoped scene/properties are explicitly **source-local**, with wrapper context exposed. The wrapper-opacity test reports local 0.8 and flattened host 0.4 for wrapper opacity 0.5. Integer-frame keyframe recommendations expose fractional sample/snap information and the controller-input value domain; they do not promise that an input keyframe equals the final mixed visual value.

## Performance and size — measured scope, not inferred speed

C3's unchanged 220-binding/two-artboard/two-scope performance fixture remains green. The additional C4 220-binding/two-scope fixture records:

- Settled revisits: zero catalog/signature/authored/effective graph builds, endpoint resolutions or binding/converter evaluations; **440 output applications and 880 binding examinations** are still counted.
- One scalar write: zero bindings examined during the write, one reverse dependency edge visited. Affected frame: one recomputation, 219 cache hits, zero new effective graph/endpoint work, 220 outputs applied.
- One reference write: zero bindings examined during the write, one reverse edge visited. Affected frame: **two endpoint resolutions, one effective graph rebuild**, zero authored index/catalog/signature rebuilds; one recomputation, 219 cache hits, 220 output applications and 661 binding examinations including graph rebuild work. The next settled frame does not rebuild again.

Observation still copies live state and traverses the full canonical host: the measured fixtures evaluate **3 scopes** for A/B and **5 scopes** for repeated nested instances. The scope counter is not a total-time metric and excludes copy/normalization/metadata costs. Targeted observation optimization is recorded in `suggestions`, not claimed as completed.

The sorted Veyra JS source concatenation changes from 975,471 to 1,011,010 raw bytes (**+35,539**) and from 159,039 to 165,906 Brotli-quality-11 bytes (**+6,867**). Changed runtime-module and host/editor subsets add 5,417 and 1,756 independently compressed bytes respectively; independently compressed subsets do not sum to the full concatenation. These are source-size proxies, not bundled/minified runtime budgets. No new dependencies/framework/language/schema version were introduced. No FPS or browser performance acceptance is claimed.

## Cleanup and reproducibility

Temporary `.c4-transport/*` files and `.github/workflows/c4-local-transport.yml` never entered the final tree or its production ancestry. The temporary branch `work/m8-c4-local-transport` was removed by the replay after asserting its exact head. The retained `work/m8-c4-ready` branch points at the clean production candidate; it contains no transport payload. This receipt branch contains only documentation added to the final production commit.

To reproduce final gates:

```sh
git checkout b57b390b245b363f9024349d9b116996eb045e7a
npm ci
npm run check
npm test
node tests/veyra-m8-c4-reproduced.test.mjs
node tests/veyra-m8-c4-graph.test.mjs
node tests/veyra-m8-c4-types.test.mjs
node tests/veyra-m8-c4-context.test.mjs
```

For the isolated RED regression gate, use a separate worktree at `e08c287e8f7c9929e3a491d49e709cdbb002a875` and run `node tests/veyra-m8-c4-reproduced.test.mjs`; its seven assertion failures are expected. Do not interpret that test-only commit as the production handoff.

## Acceptance boundary

All evidence above is executed Node runtime/control-plane/public-host testing and standard CI. **Real-browser visual/usability acceptance was not performed.** Existing nullable empty-list conversion, explicit event advancement, supported M6 override fields, integer keyframes and explicit invalidation for intentionally in-place-mutated external authored hosts remain documented contracts.

The implementer has stopped at **AWAITING VERIFICATION**. Independent review still owns M8 acceptance, progress-estimate increases and permission to start M9.
