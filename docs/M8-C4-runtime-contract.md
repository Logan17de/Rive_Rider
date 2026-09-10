# M8-C4 — Resolved graph and evaluated context

**Worker status: AWAITING VERIFICATION.** This is implementation and executable test evidence, not independent acceptance. M8 remains `CORRECTIONS REQUIRED`; M9 is blocked. `milestone.md` is the only active implementation milestone and `QUALITY.md` remains authoritative. No carry-forward parity estimate is increased.

The implementation starts at `04ac6842bbc57125e37604c84112a7a8ce937f7f`, whose production code is unchanged from `d36f0ac2841fa6320f4335f617847d123dd394ca`. The baseline tree is `9ca9fedbded41c335553354292f6e3435c926182`.

## Release receipt and reproduction

The exact final main SHA, standard Tests run, implementation commits and cleanup evidence are recorded in the [post-promotion release receipt](https://github.com/Logan17de/Rive_Rider/blob/evidence/m8-c4-handoff/verification/M8-C4-handoff.md). The evidence branch changes documentation only. Keeping that receipt outside main lets it name the actual final main SHA without moving that SHA again. A local/staging pass does not replace the standard Tests run on final main.

Run with Node 22 using the unchanged repository gate:

```sh
npm ci
npm run check
npm test
```

Focused, permanent suites in normal discovery:

```sh
node tests/veyra-m8-c4-reproduced.test.mjs
node tests/veyra-m8-c4-graph.test.mjs
node tests/veyra-m8-c4-types.test.mjs
node tests/veyra-m8-c4-context.test.mjs
```

Baseline executed locally: 48 syntax files and all 41 previous suites passed. The unchanged independent review probes produced exactly two passing controls and seven failed assertions, without fixture/execution errors. The permanent reproduced suite was installed and run RED before production changes. It retained those assertions and both controls. The isolated publication workflow repeats that RED gate before applying production changes.

Worker final local results: **49/49 source syntax files; 45/45 suites; 54 named C4 checks**. These are selected executable tests, not an application-completion percentage. The four new suites contain 9 reproduced, 17 graph, 13 type, and 15 context checks. Original M8/C1/C2 remain 28/28/13; C3 remains 12 reproduced plus 17 composition checks. None of the 41 previous test suites was weakened or edited.

## Seven independent failures → permanent checks

All seven are preserved in `tests/veyra-m8-c4-reproduced.test.mjs`.

| Original regression | Executed post-fix result |
| --- | --- |
| Direct writer → equivalent nested reader | `0.25` cold; `0.66` after runtime input update, independent of binding ID ordering |
| Nested/direct targets evade conflict identity | Higher-priority value `0.25`; exactly one conflict |
| Self-cycle through equivalent nested/direct paths | Rejected before serialization, revision or command-history changes |
| Enum definition mismatch | Preview and dispatch reject; no raw preview exception, no mutation, subsequent scene evaluation remains valid |
| Nested View Model definition mismatch | Rejected before mutation; subsequent evaluation remains valid |
| Animated Component scoped read/scene | Full scene A/B `0.8 / 0.2`; scoped reads `0.8 / 0.2`; A's source-local scene `0.8` |
| Ownership recommends an overwritten authored Property Group | Effective timeline/track evidence is present; the advertised scoped runtime edit changes the visible result |

Both original controls remain: a warm nested numeric update recomputes once then sleeps; live observation leaves queued triggers and live counters unchanged.

## One endpoint meaning, with authored paths retained

`resolveEffectiveEndpoint` is the shared path-resolution primitive. Effective data identity is the canonical direct terminal `(instance, property)` reached under the current scope. The original root/path remains in the authored binding and ownership stages. Existing canonical Property Group aliases and structural, opaque runtime scope tuples remain unchanged. IDs are never interpreted as names or delimiter-joined identities.

Each artboard retains its authored binding/config index. Each runtime scope retains a separate effective graph, resolutions, output caches and reverse dependency registrations. Prefix references are dependencies as well as the resolved terminal. The effective relationships drive topological ordering, conflict selection, virtual derived reads, propagation and ownership. Higher priority wins; a tied group retains the lexicographically lower binding ID.

Ordinary scalar updates use the registered reverse edges. A changed reference re-resolves only affected paths. A real topology/definition change rebuilds that scope's effective ordering; it does not rebuild the retained authored index or unrelated scopes. Obsolete terminal dependencies are removed on failed/retargeted paths and when a binding loses its target conflict. Reviving a winner recomputes it rather than reusing stale output.

Reference-valued binding outputs can retarget paths during the same evaluation. They are processed before dependent readers/targets. Provisional passes settle the effective graph and never escape as a published partial frame. A retarget-created winner invalidates downstream caches even on a cold provisional pass; otherwise an early lower-priority output could survive the new winner.

Authored self/multi-hop cycles reject transactionally with endpoint and binding evidence. When reference writers make a cycle demonstrable only after evaluating authored defaults, validation invokes the same bounded data evaluator on a private runtime. There is no separate converter interpreter, live event consumption, or authored mutation.

Runtime-only retarget cycles use `binding-runtime-cycle`: suppress the cycle and its dependent consumers, keep independent outputs available, and recover after a valid retarget. Missing/null paths use `binding-runtime-path`. Reference settling is bounded to enabled bindings plus two passes. Exhausting that bound yields `binding-runtime-retarget-limit`, suppresses the provisional frame and preserves recovery on later edits. No arbitrary winner or unbounded retry is substituted for the documented policy.

Graph tests cover both ID orders, aliases on either side, stable ties, rename/reorder/save-load, authored/runtime references, nested targets, derived and converter-driven references, conflict creation/removal, self/multi-hop cycles, null references, stale dependency removal, reset, unrelated cache hits, and real repeated nested Components.

## Full type definitions and bounded failures

`dataTypeContracts.js` contains dependency-free descriptor comparison and converter contract inference. Enum identity and View Model identity are nominal: a different referenced definition is not compatible merely because its broad label matches. Lists compare recursive item descriptors, including nominal definitions and numeric range covariance. Scalar numeric range constraints remain value checks rather than making all differently ranged numeric properties unbindable.

Existing valid same-definition bindings and two-way writes remain supported. Converter chains validate each stage. `enumMap` validates keys against the source definition and infers all output definitions; `conditional` checks both branches; `numberToListIndex` derives output from the list's declared item descriptor, including nested lists and nominal references. Optional `inputDescriptor`/`outputDescriptor` fields refine the existing broad converter labels and survive save/load. Existing explicit valid conversions remain usable; a generic `any` label does not erase nominal compatibility requirements.

Normalization rejects incompatible definitions. Preview returns a structured failure, not a leaked evaluator exception. Dispatch preserves `errorCode` and structured `errorEvidence` with stable binding/source/target/type records. A rejected preview's validation result now describes the rejected command rather than incorrectly reporting the unchanged valid document as validation success. Rejections preserve serialization, revision and history.

A previously valid runtime override can become invalid after an atomic authored schema change. Runtime evaluation catches it, emits `binding-runtime-value`, and suppresses its output and dependent consumers without changing authored state. Valid replacement values can repair stale data/Property Group overrides without an unrelated scope reset. Runtime copy-on-write lists are revalidated against the current item schema, including nonselected items, with a memo per authored generation and list snapshot; invalid lists remain diagnosed until repaired by supported operations or reset. Compatible authored edits retain valid runtime precedence.

An empty list-index conversion still returns `null`, preserving the existing contract. Ordinary visual target handling remains canonical; typed data/Property Group consumers enforce their actual value contracts. No supported M8 type or nested target was removed to make a regression pass.

## Scoped observations are captured from the real evaluator

The host validates the full authored Component path, then observes the canonical host traversal on private live-state forks. `evaluateDocument` provides an internal scope handoff; the host captures the exact requested Component's source scene, layers, controller context and scoped data runtime. It no longer evaluates an isolated source artboard with default controller state. Both root read/scene paths also use the same explicit timeline-context interpretation.

The captured context includes active timeline slots and effective remaps, current times, machine state/transition, exact evaluated machine timeline times/weights, Component mix and supported authored instance overrides. Machine evaluation exposes the timeline inputs it actually used; observation does not reconstruct a second machine clock. Repeated nested instances use their complete structural paths.

**Scoped properties/scenes are source-local.** Their wrapper matrix and wrapper opacity are exposed in `componentContext`. They are not silently presented as flattened host/world values. With wrapper opacity one, the reviewer scalar fixture matches directly (`0.8 / 0.2`). With wrapper opacity `0.5`, the explicit test reports source-local `0.8` and flattened root-node opacity `0.4`. Nested wrapper transforms remain a composition through the host scene; the immediate wrapper metadata is not a claim to be a complete world transform.

Invisible/not-evaluated or invalid scope paths fail explicitly; they do not select a sibling or source default. `live:false` deliberately observes authored/default runtime state. Public read-only runtime ports use snapshots as well. Actual advancement remains separate: `advanceDataRuntime` advances the requested artboard/scope and is not an implicit full-host clock step.

Tests snapshot serialization/revision/history, live scoped values/lists, queued data and machine triggers, machine state/time/transition, registry buckets, runtime counters, subscriber notifications and host refresh/advance notifications. Repeated read/ownership/scene calls preserve them. The two queued data pulses are still delivered by two later explicit advances, followed by false.

## Ownership identifies an effective, executable edit

Winning stages include authored and effective endpoints. Ownership continues beyond a Property Group or ordinary source value into the controller actually supplying that value. Timeline/track, selected/effective controller, machine/state/transition, contributing track, time/mix and supported Component-override evidence are retained by stable ID.

For an animated Property Group feeding a binding, ownership offers the public `setPropertyGroupRuntimeValue` port (or the already-supported two-way port), explicitly describing its scoped ephemeral precedence: after animation, before binding conversion. The test invokes the advertised arguments, sets A to `0.47`, reads `0.47` from both scoped and full evaluated scenes, keeps B at `0.2`, and preserves authored history and live controller clocks. It does not recommend persisting the overwritten intermediate.

For a bound ordinary property controlled by a timeline, the recommendation is canonical `setKeyframe` on the effective timeline/track. Supported authored Component overrides recommend `setComponentOverride`, not the default source property that the override replaces. Machine recommendations select an actually contributing track. Unknown externally supplied layer identity is not fabricated into an editable timeline. Readonly data sources still have no write port.

Canonical keyframes require integer frames. At a fractional sampled time, the recommendation exposes `sampleFrame`, snaps to the preceding integer frame, and identifies the value domain as a controller keyframe before Component mix and binding conversion. That is an edit which can affect the visible result, not a promise that its argument equals the final blended pixel/property value. Runtime loop overrides are respected when locating the editable frame. Tests execute these transports and compare evaluated read-back, including fractional machine transitions and undo.

## Lightweight/work evidence

No dependency, new renderer, editor framework, runtime-language rewrite or schema version bump was introduced. Runtime type helpers do not import editor/control-plane code. Existing no-binding fast paths and C3's exact 220-binding/two-artboard/two-scope suite remain unchanged and green.

The additional 220-binding/two-scope graph fixture reports real work rather than equating cache hits with free rendering:

| Operation | Measured work |
| --- | --- |
| Two settled scope revisits | 0 authored/effective graph builds, catalogs, signatures, endpoint resolutions, binding/converter evaluations; 440 output applications and 880 binding examinations |
| One scoped scalar write, before evaluation | 0 bindings examined or indexes built; 1 reverse dependency edge visited |
| Affected scalar frame | 1 binding recomputed; 219 cache hits; 0 new endpoint resolution/effective graph builds; 220 output applications |
| One reference retarget, before evaluation | 0 bindings examined; 1 reverse edge visited |
| Affected reference frame | 2 endpoint resolutions, 1 effective graph rebuild, 0 authored index/catalog/signature rebuilds; 1 recomputation, 219 cache hits, 220 output applications; 661 binding examinations including the graph rebuild |
| Settled frame after retarget | 0 endpoint resolution/effective graph builds/recomputations; output application still occurs |

New counters separately expose effective graph builds, endpoint resolutions, resolution segments, provisional retarget passes, runtime errors and list-item revalidation. Existing counters are not relabeled to conceal work. Topology changes can legitimately inspect the affected scope's graph; ordinary writes do not scan the full project or rebuild it unconditionally.

Scoped observation is **not O(1)** and not an optimized path-only query. It forks live state, traverses the canonical host and performs existing normalization/read metadata work. `observationWork.evaluatedScopes` counts canonical scene evaluations: 3 for a host with A/B, 5 for two repeated nested paths. It excludes state-copy/normalization/type-validation/ownership-index costs and is not a total-time metric. No live counters are changed to measure an observation. Future targeted snapshots/traversal optimization is queued in `suggestions`, not claimed here.

Source-size proxies, reproduced by concatenating the named UTF-8 modules in order and Brotli quality 11 (not a bundled/minified/distributable runtime):

| Source set | Raw delta | Brotli delta |
| --- | ---: | ---: |
| Changed runtime modules: dataGraph, new dataTypeContracts, components, evaluation, stateMachine | +27,112 bytes | +5,417 bytes |
| Changed host/editor contract modules: controlPlane, commands, runtimeHost, runtimePorts | +8,427 bytes | +1,756 bytes |
| Sorted `src/veyra/*.js` plus `veyra.js` concatenation | +35,539 bytes | +6,867 bytes |

The last proxy changes from 975,471 to 1,011,010 raw bytes and 159,039 to 165,906 Brotli bytes. Independently compressed subsets do not add to the full concatenation. These numbers exclude tests/docs and do **not** establish compliance with future distributable-runtime size or FPS budgets. No browser timing, pixel acceptance, or vendor parity score is claimed.

## Limits and handoff boundary

This is executed Node runtime/control-plane/public-host verification. Real-browser visual/usability acceptance is still not performed. Current source-local semantics, supported M6 instance override fields, canonical integer keyframes, explicit event advancement, nullable empty-list output and caller-managed invalidation for intentionally mutable authored hosts remain explicit contracts, not silently expanded features.

C4's implementation is ready for an independent reviewer to rerun and challenge. All final-head release evidence belongs in the linked receipt. Only that reviewer can accept M8, increase verified completion estimates, or unblock M9.
