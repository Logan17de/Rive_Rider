# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target. M6 remains uncounted until independent acceptance.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Pre-M6 identity, semantics, resolver, control-plane and dependency/ownership contracts are independently verified. |
| Core editor / engine foundation | **~87–90%** | M0–M5 are independently verified. M6 workspace/client-anchor and authored-stroke corrections are implemented but remain pending independent acceptance. |
| Modern Rive editor/runtime feature parity | **~44–48%** | M6 has substantial multi-artboard/Component implementation, but remains uncounted until accepted. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture remains ahead of raw Rive feature breadth. |
| Remaining full-target work | **~55–58%** | M6 verification, queued vector-authoring + multi-selection/grouping UX, then Data Binding/View Models and later Rive feature families. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Close current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED**.
- **Current milestone M6 maps to `plan.md` M2 — Multi-artboard, Components and project graph: AWAITING VERIFICATION.**

---

# MILESTONE M6 — Multi-Artboard, Components & Project Graph — CORRECTION PASS

**Roadmap mapping:** `plan.md` M2 — Multi-artboard, Components and project graph  
**Status:** `AWAITING VERIFICATION`

## Completed correction scope

The final M6 correction preserves the previously accepted Component work and closes the three remaining blockers on one implementation head.

### A — Top-level Component runtime/remap/mix preserved

- Persisted timeline/state-machine selection affects evaluation.
- Remap changes the effective source controller.
- Mix semantics remain deterministic.
- Invalid source/cross-artboard refs fail closed.
- Existing `veyra-m6-component-corrections` coverage remains green.

### B — Nested Component transform composition preserved

- Outer mapping is applied exactly once.
- Descendant local matrices remain parent-relative.
- `parent.world × child.local == child.world` remains true.
- Renderer/hit testing and evaluated-only identity behavior remain green.

### C — Rigged Component content preserved

- Component evaluation carries nodes, bones, weighted meshes, controls and constraints into the host evaluated scene.
- Evaluated identities remain instance-scoped/non-persistent.
- Source rig data remains authored-only.
- Top-level sibling runtime isolation remains green.

### D — Workspace client-space anchoring corrected

- Added a canonical pure camera compensation contract for old/new stage client rectangles.
- Panel resize/collapse preserves the absolute client-space position of existing graph content while keeping zoom unchanged.
- Left/right/bottom splitter behavior uses one immutable pre-gesture camera/client-rect snapshot, preventing cumulative drift during continuous dragging.
- Collapse/expand and splitter reset use the same compensation contract.
- No authored artboard/object coordinates are mutated and Fit Artboard/Fit Selection is never invoked implicitly.
- Hit-test/world-client alignment remains deterministic after compensation.
- Workspace/camera changes remain editor-only and do not change `.veyra` serialization, Store revision or command history.

### E — Authored stroke zoom semantics corrected

- Removed unconditional SVG `non-scaling-stroke` from authored scene shapes and authored mesh triangles in the editor.
- Removed the same authored non-scaling behavior from SVG export.
- Authored stroke width now follows world units × camera zoom, matching geometry scale.
- Verified 4-world-unit stroke relationship: 10% → 0.4 CSS px, 50% → 2 CSS px, 100% → 4 CSS px, 200% → 8 CSS px.
- Editor-only handles remain screen-sized.
- Detailed rig overlays are deterministically hidden below 20% zoom so low-zoom artwork remains inspectable; they reappear at 20% and above.
- SVG golden hashes were updated only for the intentional authored-stroke semantic change.

### F — Nested Component runtime isolation corrected

- Added canonical ephemeral runtime scope:

```text
{
  kind: "componentRuntimeScope",
  path: [
    { kind: "componentInstance", id: "outer-A" },
    { kind: "componentInstance", id: "inner-instance" }
  ]
}
```

- Runtime buckets are keyed by the complete typed evaluated instance path rather than only the terminal authored instance ID.
- Nested evaluation propagates that scope recursively.
- Timeline clocks, remap/mix and state-machine runtimes are independent for repeated nested copies.
- Top-level APIs retain convenient instance-ID addressing; nested browser/runtime control accepts the same canonical structured scope.
- Exact-scope reset does not affect sibling scopes.
- Runtime subtree/deletion/pruning behavior removes only matching scoped buckets.
- Runtime scopes and buckets remain evaluated/ephemeral and are never serialized into authored Component data.
- Project graph capabilities explicitly distinguish authored top-level instance isolation from evaluated nested runtime-scope isolation.

## Adversarial regression proof

`tests/veyra-m6-final-corrections.test.mjs` covers:

- left/right/bottom client-rect changes preserving absolute client X/Y;
- collapse/expand and arbitrary panel-change sequences with no camera drift or zoom change;
- hit testing and focus math after compensated layout changes;
- serialization/revision/history non-mutation by workspace camera state;
- authored stroke linear scaling from 10% through 800%;
- editor overlay separation and low-zoom rig-overlay policy;
- two outer Component instances containing the same authored runtime-driven nested instance;
- distinct typed runtime-scope identities for both evaluated nested copies;
- timeline and state-machine advancement isolated to one nested scope;
- remap and mix remaining observable and isolated;
- exact-scope reset isolation;
- save/load excluding runtime scopes/evaluated IDs;
- runtime-bucket pruning/deletion isolation;
- rename/reorder invariance for nested evaluated runtime scope;
- browser APIs using the canonical structured scope rather than a parallel address format.

## Validation

- Clean correction implementation: `e0ad36d` (`Fix M6 workspace stroke and nested runtime scope [m6-final-corrected]`).
- `npm run check`: **40/40 source files passed**.
- `npm test`: **35/35 suites passed**.
- Existing M0–M5 and previous M6 project-graph/Component correction suites remain green.
- Temporary correction scripts/workflows were removed by the gated implementation commit.
- Final standard GitHub `Tests` must pass on the exact handoff `main` head before independent verification.

## Explicit non-goals preserved

No Pen/Edit Vertices/multi-selection/grouping work was started. Those requests remain queued in `suggestions` for the next interstitial milestone after M6.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: e0ad36d (clean implementation); this milestone handoff commit
- Changed files: src/veyra/workspace.js, src/veyra/renderer.js, src/veyra/geometry.js, src/veyra/components.js, src/veyra/evaluation.js, src/veyra/projectGraph.js, src/index.js, veyra.js, tests/veyra-m6-final-corrections.test.mjs, tests/veyra-golden.test.mjs
- Tests added/changed: added tests/veyra-m6-final-corrections.test.mjs; updated six SVG golden hashes for intentional authored-stroke semantics
- npm test: PASS — 35/35 suites
- npm run check: PASS — 40/40 source files
- Runtime/remap/mix proof: existing M6 correction suite remains green; final nested-scope suite proves remap/mix isolation under repeated nested copies
- Nested Component transform proof: existing analytical hierarchy/render/hit-test tests remain green
- Rigged Component evaluation/render proof: existing source/instance rig evaluation suite remains green
- Panel client-anchor proof: pure old/new client-rect compensation plus left/right/bottom/collapse/arbitrary-sequence adversarial tests
- Authored stroke zoom-scaling proof: 4 world units -> 0.4/2/4/8 CSS px at 10/50/100/200%; 10%-800% proportionality; editor/export semantics agree
- Nested runtime-scope isolation proof: typed componentRuntimeScope path; two outer copies independently advance/reset/remap/mix; rename/reorder stable; prune/delete isolated
- Hit-test/render alignment proof after panel changes: compensated viewport mapping feeds canonical hit-test transform and passes rendered-point regression
- Existing M0–M6 regression proof: 35/35 suites green in gated final integration
- Manifest/capability proof: projectGraph runtimeIsolation exposes authoredTopLevel + evaluatedNested + typed non-persistent scope contract
- Persistence/history proof: runtime scopes/camera layout are not authored; save/load contains no componentRuntimeScope/componentEval IDs; panel compensation leaves serialization/revision/history unchanged
- Progress snapshot update: verified-only percentages intentionally unchanged until independent acceptance
- Suggestions added to suggestions: none in this implementation pass; queued post-M6 vector UX remains untouched
- Known limitations: detailed rig overlays intentionally hide below 20% zoom for clean-artwork inspection; runtime-scope state is intentionally ephemeral and not persisted
```
