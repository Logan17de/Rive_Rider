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
| Modern Rive editor/runtime feature parity | **~44–48%** | M6 adds substantial multi-artboard/Component code, but it is not counted until the Component runtime/evaluation corrections below pass independent verification. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture remains ahead of raw Rive feature breadth. |
| Remaining full-target work | **~55–58%** | M6 verification plus Data Binding/View Models, full layered state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent productization. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED**.
- `plan.md` **M1 — Close current interaction loop:** **VERIFIED**.
- Interstitial **M5 — Workspace UX Stabilization:** **VERIFIED**.
- **Current milestone M6 maps to `plan.md` M2 — Multi-artboard, Components and project graph: CORRECTIONS IMPLEMENTED, AWAITING VERIFICATION.**

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not count an unverified milestone as completed progress.

---

# MILESTONE M6 — Multi-Artboard, Components & Project Graph — CORRECTION PASS

**Roadmap mapping:** `plan.md` M2 — Multi-artboard, Components and project graph  
**Status:** `AWAITING VERIFICATION`

## Independent verification summary

The implementation at `90c373586c0c0d74eaa6185fb12bae32fc606518` established most of M6:

- versioned multi-artboard migration and explicit artboard ownership exist;
- artboard/component/componentInstance/componentOverride refs are first-class;
- canonical artboard and Component CRUD, preview/dispatch, history and browser/UI integration exist;
- simple node-based Component instances evaluate without authored cloning;
- bounded property overrides leave source authored data unchanged;
- per-instance timeline/state-machine runtime buckets are isolated;
- dependency/resolver/semantic/manifest surfaces include the new project entities;
- component deletion/source deletion fail closed with live dependents;
- cycle detection and bounded nesting are present;
- the standard Tests run on handoff head `8de2957b4ed020c9e2bf2a5b6af9f0b4479f84a1` was green at **40/40 syntax checks and 33/33 suites**.

Independent verification then identified the three Component-runtime/evaluation blockers below. The focused correction implementation at `25d95e0d8cd7bdd691a586eaed84f3dc4177e9eb` addresses all three in production code and adds a dedicated adversarial suite. This milestone remains **AWAITING VERIFICATION** until those corrections are independently accepted.

---

## Blocker 1 — authored remap/mix runtime contract was metadata-only

`createComponentInstance()` persists and validates:

```text
runtime.timeline
runtime.stateMachine
runtime.mix
runtime.remap.timeline
runtime.remap.stateMachine
```

The previous `ComponentRuntimeRegistry` did not consume the authored timeline/stateMachine/remap configuration when evaluating an instance. Runtime behavior depended only on explicit imperative calls such as `setTimelineTime(instanceId, timelineId, ...)` and `machineRuntime(instanceId, machineId)`.

### Correction implemented

The Component runtime now has one explicit deterministic mapping contract:

- `runtime.timeline` selects a timeline runtime slot and is evaluated at deterministic time `0` before any imperative clock update;
- `runtime.stateMachine` selects a machine runtime slot and evaluates from its authored initial state;
- `runtime.remap.timeline` and `runtime.remap.stateMachine` change the source controller actually evaluated while the selected controller ID remains the instance-local runtime slot;
- remap without the matching selected runtime controller is rejected;
- selected and remapped refs must remain on the Component source artboard;
- `runtime.mix` remains bounded to `[0,1]`: numeric values interpolate linearly from authored to runtime values; discrete values use authored below `0.5` and runtime at or above `0.5`;
- per-instance timeline clocks and machine runtimes remain isolated;
- runtime evaluation returns controller→effective-source mappings for deterministic inspection;
- `projectGraphCapabilities()` / manifest authoring metadata expose the exact selection/remap/mix contract.

### Adversarial proof added

`tests/veyra-m6-component-corrections.test.mjs` proves:

1. persisted timeline selection changes evaluated output after serialize/parse without imperative setup;
2. persisted timeline remap changes the actual source timeline used;
3. persisted state-machine remap changes the actual source machine used;
4. two instances remapped to the same source timeline retain observably independent clocks/output;
5. cross-artboard and missing remap refs fail through the canonical control plane without document/revision/history mutation;
6. remap without selection fails validation;
7. mix `0`, `0.25`, and `1` produce the declared deterministic results;
8. manifest capabilities report the implemented mapping and mix behavior.

---

## Blocker 2 — nested Component hierarchy could double-apply the outer transform

M6 advertises:

```text
nestedComponents: true
maxComponentDepth: 16
```

The previous nested-evaluation merge prefixed nested identities and multiplied the outer Component wrapper into both nested `localMatrix` and `worldMatrix` values, which could apply the outer transform twice when the renderer recomposed the hierarchy.

### Correction implemented

Component expansion now maps the complete evaluated node subtree through one transform-space rule:

- the outer instance/source wrapper is applied once to evaluated world space;
- a descendant whose source parent is also re-scoped preserves its source-relative `localMatrix`;
- source parent refs are rewritten to the matching instance-scoped evaluated parent ID;
- a subtree root attached to an authored host parent derives its local matrix from `inverse(parentWorld) * mappedWorld`;
- final `worldMatrix` therefore remains equal to deterministic `parent.worldMatrix * child.localMatrix`;
- nested provenance retains the inner source/component/instance context and adds the outer instance context without turning evaluated identities persistent;
- renderer and hit testing consume the same corrected evaluated matrices.

### Adversarial proof added

The correction suite includes a legal two-level nested Component with outer instance, inner instance, source parent and source child transforms and proves:

1. the child world transform analytically;
2. `parent.worldMatrix * child.localMatrix == child.worldMatrix`;
3. the child local matrix is not polluted by the outer wrapper;
4. SVG output uses that corrected local transform;
5. hit testing resolves the child at the rendered world location;
6. two outer instances remain independently scoped;
7. save/load never creates authored `componentEval:` descendants;
8. cycle rejection remains deterministic.

---

## Blocker 3 — Component instances expanded nodes only, not rigged source content

The previous Component expansion returned only evaluated nodes, so the host scene silently lost source bones, weighted meshes, controls and constraints.

### Correction implemented

`evaluateComponentContent()` now expands the current supported Component source content as one evaluated bundle:

- nodes;
- evaluated bones;
- weighted meshes with deformed vertices;
- controls;
- constraints.

The host evaluator merges those arrays into the normal evaluated scene, so existing renderer paths consume Component mesh output without a renderer-only parallel implementation.

Instance-expanded rig identities are non-persistent and instance-scoped while retaining their persistent source refs. Bone/control/constraint references are re-scoped consistently; mesh deformed vertices and rig world-space output receive the same instance transform/fit/alignment mapping used by Component geometry. Source authored rig data is never cloned into instance storage.

### Adversarial proof added

The correction suite uses a source Component containing a current Veyra bone, weighted quad mesh, position control, constraint and bone animation. It proves:

1. two host instances each receive evaluated mesh/bone/control/constraint output;
2. their evaluated IDs are distinct and source refs remain distinguishable;
3. renderer SVG includes the instance-evaluated mesh;
4. the instance transform maps rig output consistently;
5. the constraint points at the correct instance-scoped evaluated bone;
6. runtime animation on instance A deforms its rig output without leaking to instance B;
7. the source evaluated rig remains unchanged;
8. save/load retains only the single authored source rig and no `componentEval:` rig clones.

---

## Preserve the M6 work that already passed review

The correction pass preserves:

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

- the three blockers above are independently confirmed fixed in production implementation;
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
- Correction commits: e24ad0a6799631c0edbe988fedf685070c5d9b70 (staged focused patch), 75e5af5ec7b3afdbdfa39d89e205325a854b1660 / d92e21e5880e6686f10ab535df0726457ce16c89 / 994d5fdda7cd44adc638b381ddd8234b699b0311 (gated adversarial-fixture iterations), 25d95e0d8cd7bdd691a586eaed84f3dc4177e9eb (clean correction implementation)
- Changed files: src/veyra/components.js; src/veyra/evaluation.js; src/veyra/projectGraph.js; src/index.js; tests/veyra-m6-component-corrections.test.mjs; milestone.md
- Tests added/changed: added tests/veyra-m6-component-corrections.test.mjs with persisted timeline/state-machine selection/remap/mix, atomic invalid-remap, legal nested hierarchy render/hit-test/persistence, and current-feature rigged Component instancing/runtime isolation coverage
- npm test: PASS — 34 of 34 suites in the clean correction integration gate
- npm run check: PASS — 40 of 40 source files in the clean correction integration gate
- Runtime/remap/mix proof: authored runtime.timeline/stateMachine now create deterministic default runtime evaluation; authored remap changes the effective source controller; selected controller IDs remain per-instance runtime slots; remap is source-artboard validated and requires a matching selected controller; mix semantics are explicit/tested at 0, 0.25 and 1; two remapped instances demonstrate different runtime clocks and outputs
- Nested Component transform proof: outer wrapper is applied once to world space; mapped descendants retain source-relative local matrices; parent refs are re-scoped; the adversarial nested child satisfies parent.world * child.local == child.world, matches SVG output and M4 hit testing, and never persists evaluated descendants
- Rigged Component evaluation/render proof: Component evaluation now returns nodes + bones + weighted/deformed meshes + controls + constraints; host evaluation merges all supported arrays; evaluated refs are instance-scoped/non-persistent with source provenance; a two-instance weighted-rig fixture proves renderer output and instance-local animation deformation without source/sibling mutation
- Existing M6 regression proof: original tests/veyra-m6-project-graph.test.mjs and every pre-existing M0–M5 suite pass in the same 34/34 gate
- Manifest/capability proof: projectGraphCapabilities()/manifest now declare selected-controller default behavior, controller→source remap semantics, exact mix semantics/range, runtime isolation, and the current Component-evaluated content set
- Persistence/history proof: serialize/parse tests show no evaluated node/rig clones enter authored storage; invalid missing/cross-artboard remaps fail through the canonical control plane with document, revision and command history unchanged
- Progress snapshot update: verified-only percentages intentionally unchanged until independent acceptance
- Suggestions added to `suggestions`: none
- Known limitations: this correction covers the current M6/current-Veyra Component content families only; clipping remains none-only and later Rive feature families (Data Binding/View Models, full Layout/Text/effects, expanded state-machine/listener families, SDK/export ecosystem, etc.) remain outside M6
```
