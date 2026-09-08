# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, universal semantics, name-independent resolution, canonical control plane, dependency/ownership graph, preview/dispatch/verify and machine-readable interaction surfaces are verified for the pre-M6 feature graph. |
| Core editor / engine foundation | **~87–90%** | M0–M5 foundations are independently verified, including stable workspace/camera mechanics and persistent artboard frame origin. |
| Modern Rive editor/runtime feature parity | **~44–48%** | M6 adds substantial multi-artboard/Component code, but it is not counted until the Component runtime/evaluation corrections below pass. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture remains ahead of raw Rive feature breadth. |
| Remaining full-target work | **~55–58%** | M6 corrections plus Data Binding/View Models, full layered state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent productization. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED**.
- `plan.md` **M1 — Close current interaction loop:** **VERIFIED**.
- Interstitial **M5 — Workspace UX Stabilization:** **VERIFIED**.
- **Current milestone M6 maps to `plan.md` M2 — Multi-artboard, Components and project graph: CORRECTIONS REQUIRED.**

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not count an unverified milestone as completed progress.

---

# MILESTONE M6 — Multi-Artboard, Components & Project Graph — CORRECTION PASS

**Roadmap mapping:** `plan.md` M2 — Multi-artboard, Components and project graph  
**Status:** `CORRECTIONS REQUIRED`

## Independent verification summary

The implementation at `90c373586c0c0d74eaa6185fb12bae32fc606518` is substantial and most of M6 is real:

- versioned multi-artboard migration and explicit artboard ownership exist;
- artboard/component/componentInstance/componentOverride refs are first-class;
- canonical artboard and Component CRUD, preview/dispatch, history and browser/UI integration exist;
- simple node-based Component instances evaluate without authored cloning;
- bounded property overrides leave source authored data unchanged;
- per-instance timeline/state-machine runtime buckets are isolated;
- dependency/resolver/semantic/manifest surfaces include the new project entities;
- component deletion/source deletion fail closed with live dependents;
- cycle detection and bounded nesting are present;
- the standard Tests run on final handoff head `8de2957b4ed020c9e2bf2a5b6af9f0b4479f84a1` is green: **40/40 syntax checks and 33/33 suites**.

However, three Component-runtime/evaluation contracts required by M6 are not complete. Do not advance to the next roadmap family until these are fixed in production code and adversarial tests.

---

## Blocker 1 — authored remap/mix runtime contract is metadata-only

`createComponentInstance()` persists and validates:

```text
runtime.timeline
runtime.stateMachine
runtime.mix
runtime.remap.timeline
runtime.remap.stateMachine
```

but `ComponentRuntimeRegistry` does not consume the authored timeline/stateMachine/remap configuration when evaluating an instance. Runtime behavior currently depends only on explicit imperative calls such as `setTimelineTime(instanceId, timelineId, ...)` and `machineRuntime(instanceId, machineId)`.

That means a persisted `runtime.remap` can appear valid in the model/dependency graph while having no effect on evaluation.

`projectGraphCapabilities()` also exposes fit/alignment/nesting/clipping/override targets but does not state the supported runtime selection/remap/mix modes required by the M6 contract.

### Required correction

Define one deterministic, machine-readable M6 runtime mapping contract and implement it end-to-end.

At minimum:

- authored runtime timeline/state-machine refs must have documented meaning;
- authored remap refs must actually affect which source timeline/machine the instance runtime evaluates, or the fields must be removed/rejected and the capability explicitly state remap is unsupported;
- do **not** keep accepted authored fields that silently do nothing;
- mix semantics must be explicit for supported value types and deterministic at 0, intermediate values, and 1;
- source refs must remain source-artboard scoped and fail closed when invalid;
- manifest/project capabilities must expose the exact supported runtime selection/remap/mix modes;
- ownership/dependency output must agree with actual runtime behavior, not merely stored metadata;
- any authored runtime/remap mutation must remain previewable/verifiable through the canonical control plane.

### Mandatory tests

Prove at least:

1. persisted runtime selection changes evaluated instance playback after save/load;
2. persisted remap either changes the actual source controller used or is rejected as unsupported;
3. two source timelines/machines with different results make remap behavior observable;
4. instance A remap/runtime selection cannot affect instance B;
5. cross-artboard or missing remap refs fail without document/history/revision mutation;
6. mix `0`, an intermediate value, and `1` are deterministic and match the declared capability;
7. manifest capabilities exactly describe the implemented modes.

---

## Blocker 2 — nested Component hierarchy can double-apply the outer transform

M6 advertises:

```text
nestedComponents: true
maxComponentDepth: 16
```

and cycle/depth validation exists.

But the nested-evaluation merge currently prefixes nested identities and applies the outer Component wrapper to both `nested.localMatrix` and `nested.worldMatrix` for every nested descendant.

For a nested Component whose evaluated source contains a parent → child node hierarchy, the child already has a local matrix relative to its nested parent. Applying the outer wrapper again to that child local matrix makes renderer hierarchy composition apply the outer transform more than once.

The current M6 suite tests cycle rejection, but it does not positively render a legal nested Component with a multi-node hierarchy.

### Required correction

Preserve proper transform spaces when re-scoping nested evaluated descendants:

- apply the outer instance/source mapping exactly once to the nested subtree root/context;
- descendant `localMatrix` values must remain relative to their newly re-scoped evaluated parent;
- `worldMatrix` must equal deterministic parent-world × local composition;
- parent refs must map to the correct outer-scoped evaluated IDs;
- nested source/component/instance provenance must remain intact;
- renderer and hit testing must see the same final geometry;
- no nested evaluated identity may become authored persistent storage.

### Mandatory tests

Create at least a two-level Component nesting fixture with:

- outer instance transform;
- inner instance transform;
- source parent node transform;
- source child node transform.

Prove:

1. expected child world transform analytically;
2. `parent.worldMatrix * child.localMatrix == child.worldMatrix`;
3. renderer output matches that transform;
4. hit testing finds the child at the rendered location;
5. save/load does not create authored evaluated descendants;
6. two nested instances remain independent;
7. cycle/depth failures remain deterministic.

---

## Blocker 3 — Component instances currently expand nodes only, not rigged source content

`evaluateDocument()` builds normal evaluated nodes + rig data for an artboard, but `evaluateComponentInstances()` returns only evaluated Component **nodes**. The host scene then appends only `componentEvaluatedNodes` to `scene.nodes`.

A Component source artboard containing bones, weighted meshes, controls or constraints therefore does not instantiate that evaluated rig/mesh content into the host Component instance. A simple rectangle Component works; a rigged character Component does not represent the full source artboard.

This conflicts with M6's reusable Component/source-content contract and with the milestone's explicit artboard ownership of nodes, bones, meshes, controls and constraints.

### Required correction

Extend Component evaluation to carry the supported source-artboard evaluated content required to render/inspect a rigged Component.

At minimum for the current Veyra feature set:

- evaluated Component nodes;
- evaluated weighted meshes/deformed vertices;
- bones needed by those meshes/rig output;
- controls/constraint evaluated context where required for inspection/ownership/runtime correctness.

Requirements:

- source persistent refs remain source refs;
- instance-evaluated rig/mesh identities are explicitly non-persistent and instance-scoped, analogous to evaluated node descendants;
- instance transform/fit/alignment maps rigged geometry consistently with node geometry;
- source authored rig/mesh data is never cloned into authored instance storage;
- per-instance runtime/overrides affect only that instance;
- renderer consumes the evaluated instance mesh output;
- dependency/ownership/summary surfaces can explain source vs Component vs instance context;
- if any current rig subfamily is deliberately unsupported inside Components, expose that limitation explicitly and fail validation rather than silently dropping it.

### Mandatory tests

Use a source Component containing a real current Veyra rig fixture (bone + weighted mesh, and control/constraint where applicable) and prove:

1. the host instance renders the source mesh;
2. source and instance evaluated mesh/bone identities are distinguishable;
3. instance transform/fit changes instance rig output without changing source;
4. two instances produce independent evaluated rig output;
5. source animation/state-machine runtime can deform/move one instance without leaking to another;
6. save/load contains no evaluated rig clones;
7. unsupported rig features, if any, fail loudly and appear in capabilities.

---

## Preserve the M6 work that already passed review

Do not regress:

- deterministic legacy single-artboard → v5 migration;
- M5 non-zero frame origin;
- stable typed artboard/component/componentInstance/componentOverride refs;
- explicit artboard ownership and cross-artboard validation;
- artboard CRUD/reorder/focus/resize mechanics;
- canonical command/preview/dispatch/history/provenance behavior;
- source Component identity and dependent-deletion safety;
- bounded typed instance property overrides;
- per-instance runtime bucket isolation;
- dependency graph and universal semantic targets;
- name-independent resolver behavior;
- cycle detection/depth bound;
- current M0–M5 test contracts.

---

## M6 acceptance after correction

M6 is VERIFIED only when:

- the three blockers above are fixed in production implementation;
- runtime/remap/mix capability claims exactly match behavior;
- legal nested Component hierarchies render with correct transform composition;
- rigged current-feature Components evaluate/render instead of silently losing source rig content;
- all existing M6 project-graph behavior remains green;
- `npm run check` passes;
- `npm test` passes;
- the latest standard GitHub `Tests` run passes on the final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Runtime/remap/mix proof:
- Nested Component transform proof:
- Rigged Component evaluation/render proof:
- Existing M6 regression proof:
- Manifest/capability proof:
- Persistence/history proof:
- Progress snapshot update: keep verified-only percentages unchanged until independent acceptance
- Suggestions added to `suggestions`:
- Known limitations:
```
