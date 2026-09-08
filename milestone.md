# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count **independently verified capability** against the current `plan.md` target and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~92–94%** | Stable typed identity, universal semantics, name-independent resolution, canonical control plane, dependency/ownership graph, preview/dispatch/verify and machine-readable interaction surfaces are verified for the current feature graph. |
| Core editor / engine foundation | **~87–90%** | M0–M5 foundations are verified, including stable CSS-pixel camera semantics, right/middle/Space navigation, focus/visibility controls, resizable/collapsible workspace panels, object resize transactions, full-editor themes and persistent artboard frame origin. |
| Modern Rive editor/runtime feature parity | **~44–48%** | Current vector/animation/rig/state-machine/interaction loop and professional workspace mechanics are verified; the large modern Rive feature families remain the dominant gap. |
| Full Veyra target: Rive parity + every feature AI-readable/controlable | **~42–45%** | Architecture is substantially ahead of raw feature breadth. M6 begins the first major post-foundation Rive feature-family expansion. |
| Remaining full-target work | **~55–58%** | Primarily multi-artboards/Components, Data Binding/View Models, full layered state machines/listeners/events, paint/effects, text/media, layout, advanced rigging/animation, scripting/WGSL, runtimes/SDKs/export, collaboration and MCP/agent productization. |

### Roadmap position

- `plan.md` **M0 — AI Identity & Control Foundation:** **VERIFIED**.
- `plan.md` **M1 — Close current interaction loop:** **VERIFIED**.
- Interstitial **M5 — Workspace UX Stabilization:** **VERIFIED**.
- **Current milestone M6 maps to `plan.md` M2 — Multi-artboard, Components and project graph; implementation is complete and awaiting independent verification.**

### Progress maintenance rule

Every future milestone verification or milestone advance must update this **Progress snapshot** in the same `milestone.md` commit. Do not count an unverified milestone as completed progress.

---

# MILESTONE M6 — Multi-Artboard, Components & Project Graph

**Roadmap mapping:** `plan.md` M2 — Multi-artboard, Components and project graph  
**Status:** `AWAITING VERIFICATION`

## Goal

Replace Veyra's single-artboard assumption with a real project graph containing multiple stable artboards and reusable Components, while preserving the M0–M5 rules that humans and AI operate on the same canonical model.

After M6, a project must be able to contain several independently addressable artboards, designate reusable component sources, place component instances, evaluate/render those instances, run instance-local animation/state-machine playback, and explain all source/instance/dependency relationships without using display names as identity.

This is the first large Rive-parity feature-family milestone after the architecture/UX foundation. It must be implemented as a clean extension of the current universal entity graph, not as a parallel scene format.

---

## Mandatory agent rules

1. Preserve every verified M0–M5 validation, identity, semantics, command, resolver, history, hit-test, interaction and stable-camera contract.
2. Human names are display metadata only. Artboards, components and instances use immutable stable IDs and typed refs.
3. There must be **one canonical project graph**. Do not create a browser-only component tree or an AI-only component model.
4. Authored source, evaluated instance output and runtime-local state must remain distinguishable.
5. Do not clone source nodes into authored instance nodes just to render an instance. Component instances reference source content and evaluate it deterministically.
6. Instance overrides must never mutate the source component.
7. Cross-artboard/component dependencies must be explicit and machine-readable. Deletion/replacement must fail closed when dependencies make the operation unsafe.
8. Component recursion must be deterministic and cycle-safe. Illegal source cycles are rejected before evaluation/render.
9. Existing single-artboard `.veyra` files must migrate deterministically and preserve visual output, stable IDs and M5 artboard-frame semantics.
10. The human UI and AI/API must use the same command/service registry for all authored M6 mutations.
11. Do not implement View Models/Data Binding, full Layout, Text, scripting/WGSL, MCP/headless, collaboration or runtime SDK packaging in M6.
12. Do not weaken existing tests or compatibility fixtures to make migration easier.
13. Run `npm test` and `npm run check` before handoff, and require a green standard GitHub `Tests` run on the final `main` head.

---

## Task 1 — Versioned multi-artboard project model

Replace the singular authored `document.artboard` assumption with a stable artboard registry.

### Required authored identity

Every artboard must have an immutable stable ID and typed ref:

```js
{ kind: 'artboard', id: 'artboard_...' }
```

A representative authored shape may look like:

```js
artboards: [
  {
    id: 'artboard_main',
    name: 'Main',
    x: 40,
    y: 30,
    width: 960,
    height: 640,
    background: '#ffffff',
    componentSource: null
  }
]
```

Exact field naming may differ, but the contracts below may not.

### Migration

- bump/feature-gate the document format as needed so readers can distinguish the new project model;
- legacy documents with `artboard` migrate to exactly one stable artboard;
- legacy M5 `artboard.x/y/width/height/background` values survive exactly;
- migrated artboard ID is deterministic for the same legacy document and never regenerated on normalize/save/load;
- current node/rig/animation/machine/listener IDs remain unchanged;
- canonical serialization is deterministic;
- repeated parse → normalize → serialize is stable;
- old golden fixtures remain supported through explicit migration, not test exceptions.

### Ownership

Every authored entity that is artboard-scoped must have one unambiguous artboard owner or be explicitly project-global.

Define and validate scope for at least:

- nodes / hierarchy;
- bones, meshes, controls, constraints;
- timelines/tracks/keyframes;
- state machines and listeners;
- component instances;
- artboard-local semantic context.

Do not infer ownership from names or array position.

Project-global assets may remain project-global, but their consumers must be represented in dependency queries.

---

## Task 2 — Universal typed refs for artboards, Components and instances

Extend the M0 reference/semantic/control contracts with at least:

```text
artboard
component
componentInstance
```

Requirements:

- constructors/normalizers/lookup helpers for every new ref kind;
- duplicate IDs rejected per entity kind;
- generic entity lookup resolves them;
- universal semantics may target them where appropriate;
- dependency graph, resolver, summary and manifest understand them;
- refs survive rename, reordering, save/load, artboard movement and component instancing;
- display paths may change without affecting references.

If a Component is represented as metadata attached to a source artboard, it must still have an explicit stable `component` identity rather than making AI infer component identity from an artboard flag.

---

## Task 3 — Artboard CRUD and editor workspace integration

Add canonical authored operations for:

- create artboard;
- duplicate artboard;
- update frame/background/display metadata;
- delete artboard with dependency safety;
- reorder presentation/list order without changing identity.

### Human UI

The editor must expose a usable artboard surface, including:

- list/browse artboards;
- select/activate an artboard;
- focus an artboard;
- create/duplicate/delete;
- edit name/frame/background;
- clear indication of component-source artboards;
- stable-ref based selection.

The workspace may display multiple artboard frames simultaneously or use an explicit active-artboard editing mode, but the choice must be deterministic and preserve the stable M5 camera semantics.

Panel resize/window resize must still never silently change zoom.

### Viewport rules

- `Fit Artboard` targets a specific artboard ref;
- focus/fit works for non-zero origins;
- moving/resizing one artboard never changes another artboard's authored frame;
- active-artboard selection is editor state unless explicitly persisted by a documented project setting;
- switching active artboards does not mutate authored artwork.

---

## Task 4 — Component source model

Create an explicit reusable Component source contract.

A Component must have:

- stable `component` ID;
- source artboard ref;
- human display name marked advisory;
- source capabilities/semantic metadata;
- dependency list;
- deterministic source-local frame/bounds contract.

Requirements:

- mark/unmark an eligible artboard as a Component source through canonical commands;
- one source artboard cannot accidentally produce duplicate Component identities;
- source component identity survives artboard rename/move/reorder;
- source content remains normal authored Veyra entities with their existing stable refs;
- making an artboard a Component does not clone/re-ID its existing content;
- unmark/delete is rejected or explicitly cascaded if live instances depend on it;
- component source metadata appears in the manifest/project graph.

---

## Task 5 — Component Instance authored model and evaluation

Add first-class reusable Component instances.

Each instance must have a stable `componentInstance` identity and explicitly reference its source Component.

At minimum, instance authoring must support:

- transform/placement;
- visibility/opacity where applicable;
- fit/alignment against the source frame;
- deterministic source→instance coordinate mapping;
- an override/remap container with explicit typed targets/property addresses;
- optional instance-local runtime configuration;
- parent/artboard ownership.

### Evaluation rule

An instance renders/evaluates source content without copying the source entities into the authored document.

The evaluated scene must be able to distinguish:

```text
source persistent entity
component source
component instance
instance-evaluated descendant/context
```

Do not pretend an evaluated descendant is a new persistent source entity unless it has an explicit persistent identity contract.

### Overrides

Implement a bounded, explicit override system sufficient for `plan.md` M2:

- override source properties through stable source refs/property addresses;
- source authored values remain unchanged;
- invalid/non-overridable targets fail validation;
- override precedence is deterministic;
- manifest/ownership APIs report that the evaluated value is instance-overridden;
- remove/reset override restores source-driven evaluation.

Do not turn this into View Model/Data Binding; that is the next roadmap family.

---

## Task 6 — Instance animation and state-machine runtime isolation

A Component instance must be able to play its source timelines/state machines without sharing mutable runtime state with other instances.

Requirements:

- each instance has an independent runtime identity/state bucket;
- two instances of the same source may be in different animation frames/states simultaneously;
- trigger/input changes on one instance do not leak into another instance or the source authored machine;
- instance playback resolves source timelines/machines through stable refs;
- evaluated ownership reports the source + instance runtime layer correctly;
- deleting/replacing an instance cleans up its runtime state deterministically;
- save/load preserves authored instance configuration but does not serialize transient playback state unless explicitly part of the authored model.

If nested Component instances are allowed in M6, evaluation must reject cycles and enforce a bounded recursion/depth policy. If nested instances are deliberately deferred, that limitation must be explicit in capabilities and tests rather than silently unsupported.

---

## Task 7 — Instance fit, alignment, remap and mix semantics

Close the Component behavior explicitly called out in `plan.md`.

### Fit/alignment

Provide deterministic, validated modes for mapping the source component frame into the instance frame/transform, with machine-readable enums rather than magic strings.

At minimum define:

- scale/fit behavior;
- horizontal alignment;
- vertical alignment;
- clipping/frame behavior if currently supported.

### Remap / mix / override

Where a source animation/state machine is exposed to the instance:

- define how instance-local playback selects/remaps a source animation or machine;
- define mix/blend amount semantics where supported;
- validate all source refs before applying;
- expose authored vs evaluated ownership;
- preview/apply/verify through the canonical control plane.

Do not hide unsupported Rive behavior. Capabilities must state exactly which fit/mix/remap modes M6 supports.

---

## Task 8 — Cross-artboard project dependency graph

Extend `getDependencyGraph()` / ownership services so project structure is explicit.

Required edges include at least:

```text
artboard -> owned authored entities
component -> source artboard
componentInstance -> component
componentInstance -> owning artboard
componentInstance override -> source entity/property
component -> project-global assets used by its source
instance runtime -> source timeline/stateMachine
semanticRecord -> artboard/component/componentInstance target
```

Requirements:

- graph order is deterministic;
- no display-name lookup;
- dependents are queryable before delete/reparent/re-source;
- delete source artboard/component fails closed when instances depend on it unless an explicit cascade policy is supplied;
- illegal cross-artboard parent/rig relationships are rejected or explicitly modeled;
- component cycles are rejected with a precise dependency path;
- previewCommand/dispatchPlan reports dependency conflicts before mutation;
- failed validation leaves document/history/revision unchanged.

---

## Task 9 — Component-safe semantics and name independence

Extend the M1/M2 semantic system into the new project graph.

Requirements:

- semantics can target `artboard`, `component` and `componentInstance` refs;
- component source semantics remain source semantics;
- an instance may carry **instance-local aliases/tags/context** without mutating source semantics;
- resolver evidence distinguishes inherited source meaning from instance-local context;
- duplicate instances with identical human names remain separately addressable;
- renaming/misnaming source artboard, component or instance cannot change stable resolution;
- misleading display names never outrank confirmed semantic identity;
- an intent that matches multiple structurally equivalent instances remains `ambiguous` unless additional semantic/context evidence disambiguates it.

The AI read surface must be able to answer questions such as:

```text
Which component is this an instance of?
Which artboard owns this instance?
Which source entity/property is this override affecting?
Is this semantic role inherited from the component or local to this instance?
What other instances depend on this source?
```

---

## Task 10 — Canonical commands, manifest and browser API parity

All M6 authored mutations must exist in the canonical command/service registry before the milestone passes.

Expected command families include the equivalent of:

```text
addArtboard
updateArtboard
removeArtboard
duplicateArtboard
createComponent
removeComponent
addComponentInstance
updateComponentInstance
removeComponentInstance
setComponentOverride
removeComponentOverride
```

Exact names may differ, but human UI and AI must converge mechanically on the same operations.

Manifest/read surfaces must expose:

- artboard registry and refs;
- component registry/source refs;
- instance registry/ownership/source refs;
- supported fit/alignment/remap/mix enums;
- instance overrides;
- dependencies/dependents;
- semantic records;
- authored/evaluated/ownership information;
- capability limitations.

`globalThis.veyra` remains a thin adapter over the same canonical services. Do not add hand-written mutation logic there.

---

## Task 11 — Deterministic M6 regression suite

Tests must prove at least:

1. legacy single-artboard document migrates to one deterministic stable artboard ref;
2. M5 non-zero artboard origin survives migration exactly;
3. artboard IDs survive rename/move/reorder/save/load;
4. duplicate artboard IDs fail closed;
5. artboard create/duplicate/delete/undo/redo use canonical commands;
6. duplicate artboard gets fresh IDs for duplicated persistent content according to an explicitly tested lineage policy;
7. component identity survives source-artboard rename/move/reorder;
8. component source creation does not re-ID source content;
9. two instances of one component have distinct stable instance refs;
10. instance render/evaluation does not clone persistent source IDs into authored storage;
11. instance transform/fit/alignment is deterministic;
12. instance override changes evaluated instance output while source authored value remains unchanged;
13. removing an override restores source evaluation;
14. two instances can hold different override values simultaneously;
15. two instances can run different animation/state-machine runtime states simultaneously;
16. runtime input/trigger on instance A cannot affect instance B;
17. component/source deletion with dependents fails closed and leaves state/history unchanged;
18. explicit allowed cascade produces deterministic cleanup;
19. illegal component cycles are rejected with useful diagnostics;
20. project dependency graph contains source/instance/override/runtime edges;
21. universal semantics target artboard/component/componentInstance refs;
22. confirmed instance-local alias survives all human renames;
23. duplicate/random/empty/misleading human names do not change stable resolution;
24. structurally indistinguishable duplicate instances remain ambiguous rather than first-match wins;
25. `Fit Artboard` works for any stable artboard ref and non-zero origin;
26. panel/window resizing remains camera-scale invariant with multiple artboards;
27. M4 hit testing remains aligned for evaluated component-instance output;
28. project summary/manifest are deterministic and JSON-safe;
29. human UI M6 mutations route through canonical commands rather than direct alternate mutation paths;
30. all existing M0–M5 suites remain green.

Add golden project/component fixtures where they make migration/evaluation drift easier to detect.

---

## Explicit non-goals

Do not implement in M6:

- View Models / Data Binding / Property Groups / enums / converters / lists;
- full Rive Layout system or responsive layout engine;
- Text system;
- new advanced paint/effect families unrelated to component evaluation;
- full layered state-machine expansion beyond what Component instance isolation requires;
- scripting / WGSL / path effects;
- MCP or headless Node CLI;
- distributable runtime SDK ecosystem;
- collaboration/revision-history product features;
- external shared Libraries synchronization/import UI.

The asset/dependency model should be **libraries-ready**, but actual Libraries product work is later.

---

## Acceptance criteria

M6 is complete only when:

- the document has a versioned stable multi-artboard registry;
- legacy single-artboard files migrate deterministically without visual/identity loss;
- artboard/component/componentInstance typed refs are first-class everywhere they need to be;
- artboard CRUD and focus/select UI are usable;
- Component sources and instances are persistent, validated and undoable;
- instances evaluate/render source content without authored cloning;
- fit/alignment and bounded override/remap/mix semantics are explicit and machine-readable;
- each instance has isolated animation/state-machine runtime state;
- cross-artboard/component dependencies and ownership are queryable;
- component source deletion/cycles fail closed;
- source vs instance vs instance-local semantic context is distinguishable;
- names remain advisory and adversarial rename tests pass;
- all M6 UI mutations route through the canonical command/control plane;
- project manifest/summary/resolver expose the new graph deterministically;
- all M0–M5 tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest standard GitHub Actions `Tests` run passes on the final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: d0e8bf21dbd5c1db72c5a8a765a24562ee546c3f (project graph primitives); b990dcb692cf4dfe577d08cafaf18ca2ad50d32b (Component evaluation/runtime isolation); 3a20fec26ee76a6301a087607d16681fd4794c25 (typed project refs); 53a22a827fd597a47793358075eb5d2a9962d5b0 (M6 adversarial suite); 90c373586c0c0d74eaa6185fb12bae32fc606518 (clean integrated M6 implementation and staging cleanup).
- Changed files: src/veyra/projectGraph.js; src/veyra/components.js; src/veyra/references.js; src/veyra/model.js; src/veyra/io.js; src/veyra/evaluation.js; src/veyra/store.js; src/veyra/commands.js; src/veyra/controlPlane.js; src/veyra/serviceRegistry.js; src/veyra/resolver.js; src/veyra/dependencyGraph.js; src/veyra/manifest.js; src/veyra/summary.js; src/veyra/gestures.js; src/index.js; veyra.js; M6/compatibility regression tests. Temporary M6 integration scripts/workflow were removed before handoff.
- Tests added/changed: added tests/veyra-m6-project-graph.test.mjs; updated migration/version/golden/manifest/listener/M5 compatibility assertions to test canonical v5 migration rather than pre-M6 output bytes; preserved all M0–M5 suites.
- npm test: PASS — 33 of 33 suites in gated integration run 34193121853, including veyra-m6-project-graph, all M0–M5 suites, golden, identity, resolver, control-plane, hit-test and interaction suites.
- npm run check: PASS — 40 of 40 source files in gated integration run 34193121853.
- Legacy migration + artboard identity proof: v1–v4 inputs remain readable and canonicalize to v5; legacy singular artboard data maps to exactly one deterministic artboard_legacy_<document-id hash> ref; old persistent entity IDs are retained; non-zero M5 frame origin survives exactly; old v3 golden fixtures are retained as migration inputs and are byte-stable after their first canonical v5 write.
- Artboard CRUD/UI proof: Store + canonical command registry provide add/update/reorder/duplicate/remove artboard operations; duplication deterministically creates fresh descendant IDs; dependency-unsafe deletion fails closed; the browser exposes an ephemeral stable-ID active-artboard list/editor and routes authored mutations through the canonical dispatcher; active-artboard fit/resize uses the preserved M5 camera/frame contract.
- Component source identity proof: Components have explicit stable component refs separate from source artboard refs; one source artboard cannot acquire duplicate Component identities; marking a source does not clone/re-ID source content; source rename/move/reorder does not affect Component identity; dependent unmark/delete is guarded.
- Component instance evaluation proof: authored componentInstance records reference source Components instead of cloning source nodes; evaluation expands source content only into evaluated instance context with source/instance provenance; per-instance overrides are bounded typed property-address overrides and never write back to source authored values.
- Fit/alignment/remap/mix proof: machine-readable fit modes are none/contain/cover/stretch; horizontal/vertical alignment are start/center/end; runtime mix is validated to 0..1; timeline/stateMachine remaps use typed source refs; nested Components are enabled with max depth 16; clipping capability is explicitly none-only and clip=true is rejected.
- Instance runtime-isolation proof: createComponentRuntimeRegistry maintains independent per-componentInstance timeline/state-machine buckets; timeline time, input/trigger and machine stepping on one instance do not mutate another instance or authored source runtime; transient runtime state is pruned/reset separately from authored instance persistence.
- Dependency/ownership graph proof: artboard ownership is explicit for scoped entities; dependency graph includes Component->source artboard, instance->Component, instance->owning artboard, override->source target/property and runtime->source controller relationships; cross-artboard illegal ownership/cycles fail closed; nested Component cycles/depth are validated before evaluation.
- Semantic/name-independence proof: artboard/component/componentInstance are first-class resolver/semantic targets; structural/source and instance-local evidence remain separate; stable IDs remain authoritative across renames, duplicate human names and misleading names; ambiguous equivalent instances do not resolve by first match.
- Command/manifest/browser parity proof: manifest action catalog is 65 actions after the 12 additive M6 project/Component authored mutations; project manifest/summary expose artboards, Components, instances, ownership, capabilities and dependencies; globalThis.veyra M6 authored helpers call dispatchCompatibilityCommand rather than introducing a parallel mutation path; preview/dispatch implicit IDs ignore human command labels/provenance and match on the same snapshot.
- Persistence/history proof: canonical serialization persists artboards/Components/instances/overrides and omits the singular compatibility artboard alias; parse-normalize-serialize is deterministic; Store mutations remain transactional/undoable; rejected ownership/dependency/validation operations leave document/history/revision unchanged; runtime playback remains ephemeral.
- Progress snapshot update: verified percentages intentionally remain unchanged because M6 has not been independently verified; roadmap position now records implementation complete / awaiting verification.
- Suggestions added to suggestions: none.
- Known limitations: M6 intentionally supports no Component clipping beyond clip=false (capability: clipping='none-only'); View Models/Data Binding, full Layout, Text, broader advanced effects, full layered state-machine expansion, scripting/WGSL/path effects, MCP/headless CLI, distributable runtime SDKs, collaboration and external Libraries remain deferred roadmap work; transient Component runtime playback state is not serialized.
```
