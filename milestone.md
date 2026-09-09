# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. `QUALITY.md` is the permanent lightweight/performance/fidelity contract. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Progress snapshot

> These percentages are weighted engineering estimates, not line-count completion. They count only **independently verified capability** and must be refreshed whenever a milestone is verified, corrected, or advanced.

| Area | Current verified estimate | Notes |
| --- | ---: | --- |
| AI-native identity / semantics / control architecture | **~94–96%** | Stable typed identity, universal semantics, name-independent resolution, canonical control plane, dependency/ownership graph, Components and current editor command surfaces are verified. |
| Core editor / engine foundation | **~93–95%** | M0–M7 foundations are verified, including robust workspace/camera behavior, Components, interaction loop, persistent Pen paths, stable vertex editing, multi-selection/marquee and canonical grouping. |
| Modern Rive editor/runtime feature parity | **~53–57%** | Current vectors/rigging/timelines/interactions/Components and core authoring UX are substantial. Major remaining families include View Models/Data Binding, layered state machines, layout, text/assets/effects, richer animation tooling, scripting/WGSL and production runtimes. |
| Lottie / dotLottie / Creator ecosystem parity | **~28–32%** | Native path authoring, Bezier editing, hierarchy, timelines and current interaction foundations overlap strongly, but formal interchange, masks/mattes, Motion Tokens, packaging and compatibility work remain substantial. |
| Full Veyra superset target | **~46–49%** | Target = Rive-class capability + Lottie/dotLottie interoperability/ecosystem coverage + Veyra AI-native semantics while remaining modular/lightweight. |
| Remaining full-target work | **~51–54%** | Data Binding/View Models, layered state machines, layout/text/effects/assets, richer animation authoring, interchange, scripting/plugins, runtimes/SDKs, collaboration/accessibility and AI/MCP productization. |

### Roadmap position

- `plan.md` M0 — AI Identity & Control Foundation: **VERIFIED**.
- `plan.md` M1 — Current interaction loop: **VERIFIED**.
- Interstitial M5 — Workspace UX Stabilization: **VERIFIED**.
- `plan.md` M2 / implementation M6 — Multi-Artboard, Components & Project Graph: **VERIFIED**.
- Interstitial implementation M7 — Vector Authoring, Multi-Selection & Grouping UX: **VERIFIED**.
- **Current implementation M8 maps to `plan.md` M3 — View Models & Data Binding: READY.**

### M7 verification gate

M7 was independently accepted on `main` head `31cbbc7549ef0cf0a9bc03cfd0d9eff9e58e8a80`.

- GitHub standard `Tests` run #167: **SUCCESS** on the exact head.
- `npm run check`: **41/41** source files.
- `npm test`: **36/36** suites.
- Dedicated M7 suite: **22 adversarial checks green**.
- Same-parent/contiguous grouping remains an intentional fail-closed limitation rather than silently changing stacking/local animation coordinate domains; broader safe grouping belongs in `suggestions`.

### Progress maintenance rule

Every future milestone verification or advance must refresh this Progress snapshot in the same `milestone.md` commit. Do not count unverified work as completed progress.

---

# MILESTONE M8 — View Models, Data Binding & Runtime Data Graph

**Roadmap mapping:** `plan.md` M3 — View Models & Data Binding  
**Status:** `READY`

## Goal

Build Veyra's modern runtime-data backbone so interactive artwork is no longer centered on legacy state-machine inputs or display-name lookup.

After M8, authored runtime data must flow through one stable typed graph:

```text
View Model definition
        ↓
View Model instance / nested values / lists
        ↓
converter chain / Property Group
        ↓
Binding
        ↓
canonical property address
        ↓
evaluated scene
```

And Veyra/AI must be able to answer:

```text
What runtime data controls this visual property?
What is the current value?
Where did it come from?
Is the binding one-way or two-way?
What converter/property-group path is involved?
What else depends on this value?
```

without relying on human names.

M8 must preserve all M0–M7 contracts and `QUALITY.md`.

---

## Mandatory architecture rules

1. **Stable typed identity everywhere.** New persistent entities use immutable IDs and typed refs; names are advisory display/API conveniences only.
2. **One data graph.** Do not build separate editor-only, Component-only, state-machine-only or AI-only binding systems.
3. **Authored and evaluated values stay distinct.** Runtime/binding output does not overwrite authored source values merely because it is visible.
4. **Binding ownership is machine-readable.** Dependency/ownership APIs must expose the full controlling chain.
5. **Cycles fail deterministically.** Never loop, hang, or silently choose an arbitrary winner.
6. **Validation boundary remains canonical.** UI and AI mutations use Store/command/control-plane validation and history.
7. **No name-dependent paths internally.** Nested View Model/property/list paths resolve by stable refs/IDs; display paths may be derived for humans.
8. **Legacy machine inputs remain compatible, not the future data backbone.** Do not remove them in M8.
9. **No hidden runtime tax.** Projects without Data Binding must not continuously evaluate an unused binding graph.
10. **No heavy framework dependency for the core engine.** Keep the data engine DOM-free and suitable for the future compiled runtime.
11. **Deterministic order.** Same authored document + same runtime inputs = same evaluated data and scene.
12. `npm run check`, `npm test`, and exact-head GitHub `Tests` must pass.

---

## Task 1 — Universal data entity identity

Add persistent typed identity/reference support for the M8 families, at minimum:

```text
viewModel
viewModelInstance
dataProperty
enum
enumValue
binding
converter
propertyGroup
propertyGroupProperty
list
listItem
```

If a different normalized sub-object layout is cleaner, preserve equivalent first-class addressability.

### Requirements

- immutable stable IDs;
- generic lookup/ref validation;
- duplicate-ID rejection per kind;
- deterministic legacy/default migration where needed;
- document summary/manifest/index integration;
- universal semantic registry can annotate every persistent M8 entity;
- deleting/duplicating owners has explicit cascade/copy behavior;
- human `name` is marked advisory.

---

## Task 2 — View Model definitions

Implement authored View Model definitions with properties covering modern parity types:

```text
number
boolean
trigger
string
enum
color
viewModel        // nested model
list
image
artboard
```

### Property contract

Each property must expose:

- stable property ID;
- type;
- default/authored value or typed source contract;
- constraints/enum/model/list item type where relevant;
- bindability/readability/writability metadata;
- semantic annotations;
- deterministic validation.

Do not use the property display name as identity.

---

## Task 3 — View Model instances and runtime values

Add View Model instances with instance-local values and nested model/list state.

### Requirements

- stable authored instance identity;
- explicit relation to its View Model definition;
- nested model values resolve through stable property/instance refs;
- Component instances can have isolated View Model context without leaking values to sibling Component instances;
- triggers have explicit edge/fire semantics rather than being ordinary persistent booleans;
- runtime mutation APIs can set/get/fire values without writing evaluated-only state back into authored defaults unless explicitly requested;
- reset semantics are deterministic;
- ephemeral runtime instance state is not accidentally serialized.

If an authored instance intentionally stores initial values, distinguish those from live runtime values.

---

## Task 4 — Canonical binding model

Add first-class `binding` entities connecting a stable data source to a supported Veyra property address/target.

At minimum support:

- data → visual/property one-way binding;
- two-way binding only where the target/source capability explicitly allows it;
- nested View Model properties;
- Component-instance-local binding context;
- optional converter chain;
- optional Property Group source/target.

### Binding requirements

- binding source/target use typed refs/property addresses, not names;
- enabled/disabled state;
- deterministic direction/mode;
- validation before commit;
- clear diagnostics for missing source/target/type mismatch;
- binding deletion never destroys unrelated data;
- no direct mutation of derived evaluated output.

---

## Task 5 — Data evaluator and ownership precedence

Integrate Data Binding into the canonical evaluator with an explicit documented stage/priority.

The exact final order must be mechanically defined and tested. It should extend the current authored/animation/constraint/interactive discipline rather than creating a second evaluator.

For every bound address, expose:

```text
authored value
runtime data value
converted value
final evaluated value
active owner
owner stack
binding ref
source data ref
converter/property-group refs
conflicts/diagnostics
```

### Hard requirements

- no hidden writes to authored source during read/evaluation;
- cycles detected before or during bounded graph evaluation;
- deterministic conflict ordering;
- binding ownership appears in `getOwnership()` and dependency graph;
- `read(..., { evaluated: true })` can explain the data owner/evidence.

---

## Task 6 — Observability and change propagation

Provide a DOM-free runtime change-notification contract.

### Requirements

- changing one data value marks only relevant binding/dependency branches dirty where practical;
- listeners/subscribers receive stable data refs + old/new value + source/provenance;
- no full-document rebuild is required merely to notify a value change;
- multiple changes can be batched deterministically;
- trigger firing has bounded one-shot semantics;
- settled graphs do no continuous work.

This is a `QUALITY.md` release gate because Data Binding will become a hot runtime path.

---

## Task 7 — Property Groups

Implement artboard-local Property Groups as first-class keyable/data-bindable entities.

They must support a clear graph such as:

```text
Timeline → Property Group → View Model
View Model → Property Group → visual property
```

where the selected direction is explicit.

### Requirements

- stable group/property IDs;
- supported typed property values;
- property-address/keyframe integration where meaningful;
- deterministic ownership and conflict reporting;
- no hidden View Model ↔ View Model cycles;
- Component instance isolation;
- manifest/query/semantics support.

---

## Task 8 — Enums and converters

### Enums

Support user/system enum definitions with stable enum + enum-value IDs.

Renaming/reordering enum values must not change identity or break bindings.

### Converters

Implement a first-class converter pipeline sufficient for current roadmap needs, with deterministic typed input/output metadata.

At minimum establish extensible built-ins for relevant conversions such as:

- number ↔ boolean;
- number/string formatting where safe;
- enum mapping;
- color mapping/interpolation where defined;
- conditional/select mapping;
- number → list selection/index behavior required by Task 9.

Requirements:

- converter chains are ordered stable refs;
- type-check chain composition;
- invalid chain fails closed with named evidence;
- converter result is evaluated, not silently persisted;
- reserve an explicit future script-converter hook without implementing arbitrary scripts in M8.

---

## Task 9 — Lists and list item instances

Implement View Model lists without introducing a parallel scene model.

### Requirements

- stable list identity;
- item values/instances with stable runtime identity appropriate to their persistence model;
- insert/remove/move/replace operations;
- index/current-item read surface;
- deterministic number-to-list/index converter semantics;
- nested View Model list items;
- Component/artboard list-rendering contract sufficient for later Layout/UI work, without building the full Layout milestone now;
- list mutation emits bounded dependency notifications;
- sibling Component instances do not share mutable list runtime state accidentally.

Full responsive list layout is a later Layout milestone; M8 defines the data/runtime contract.

---

## Task 10 — UI authoring surface

Add a usable bounded human UI for the M8 model rather than shipping model-only capability.

At minimum users must be able to:

- create/delete/rename View Models;
- create/delete typed properties;
- create instances and edit initial/runtime-preview values;
- create/remove bindings for supported selected properties;
- inspect binding source/target/direction;
- create enums and edit values;
- create/edit converter chains;
- create/edit Property Groups;
- inspect list contents and perform basic list mutations;
- see validation/cycle/type errors clearly.

Human UI must use the same canonical commands as AI.

---

## Task 11 — Canonical commands and AI/read surface

Add JSON-safe command actions for persistent M8 CRUD and appropriate explicit runtime ports for ephemeral runtime value changes.

The exact catalog may differ, but must mechanically cover the capabilities above, e.g.:

```text
createViewModel
removeViewModel
addDataProperty
updateDataProperty
removeDataProperty
createViewModelInstance
updateViewModelInstance
removeViewModelInstance
createBinding
updateBinding
removeBinding
createEnum
updateEnum
removeEnum
createConverter
updateConverter
removeConverter
createPropertyGroup
updatePropertyGroup
removePropertyGroup
```

Runtime-only value mutation/fire/list operations must be explicitly classified so they do not masquerade as authored history when they are ephemeral.

Expose through canonical services:

```text
getManifest
queryEntities
resolveSemantic
read
getDependencyGraph
getOwnership
previewCommand
dispatchCommand
dispatchPlan
verifyChange
```

No separate AI binding model.

---

## Task 12 — Components + Data Binding integration

Prove Data Binding works through the M6 Component graph.

Mandatory semantics:

- Component source may define View Model/binding contracts;
- two instances can use different View Model runtime values;
- nested Component runtime/data scope uses the full evaluated instance path when necessary;
- instance A data updates do not alter instance B;
- source defaults remain unchanged;
- overrides and bindings have explicit precedence/ownership evidence;
- deleting/duplicating Components updates dependency graph safely;
- names can be duplicated/randomized without changing data routing.

Do not invent a second Component-only binding format.

---

## Task 13 — Lightweight/performance contract

M8 must preserve `QUALITY.md` and prepare Data Binding for a minimal runtime.

### Required engineering behavior

- projects with zero bindings pay effectively zero binding-evaluation work;
- graph/index structures are cacheable and invalidated explicitly;
- runtime value changes evaluate dirty dependents rather than scanning every entity where practical;
- no DOM dependency in View Model/binding/converter/list engine;
- editor panels/debug surfaces remain outside future minimal playback bundles;
- serialization contains only authored data/defaults, not transient subscription queues or dirty flags;
- no new external heavyweight runtime dependency without explicit justification/size measurement;
- deterministic microbench fixture for a representative large binding graph should exist before M8 is accepted, even if formal package-size gates wait for the compiled runtime milestone.

---

## Mandatory adversarial tests

Prove at least:

1. every M8 persistent entity receives stable typed identity;
2. random/duplicate/empty display names do not alter binding resolution;
3. all required View Model property types normalize/save/load deterministically;
4. nested View Model properties resolve by IDs after rename/reorder;
5. one-way binding updates evaluated visual output without rewriting authored target;
6. legal two-way binding propagates only through declared writable capability;
7. incompatible two-way binding fails without document/history mutation;
8. binding type mismatch fails with machine-readable evidence;
9. direct cycle and multi-hop cycle are detected deterministically;
10. multiple bindings contending for one target follow explicit deterministic conflict policy;
11. `getOwnership()` returns full binding/data/converter chain;
12. dependency graph includes data→binding→target and reverse dependents;
13. trigger fires once per explicit event and does not become a sticky boolean;
14. runtime reset restores deterministic initial state;
15. two sibling Component instances have independent View Model runtime values;
16. two repeated nested Component instances do not leak nested data scope;
17. Property Group timeline/data direction is explicit and cycle-safe;
18. enum rename/reorder preserves enum-value identity and bound behavior;
19. converter chains are deterministic and reject incompatible composition;
20. list insert/remove/move preserves defined item identity semantics;
21. list mutation invalidates only relevant dependents in the runtime test harness;
22. query/manifest/semantics expose M8 entities without name dependence;
23. UI persistent mutations exactly match the canonical command catalog;
24. preview/failure/read/query do not mutate authored document/revision/history;
25. save/load contains no dirty flags, subscriptions, trigger queues or ephemeral Component/data runtime scope;
26. M0–M7 suites remain green;
27. representative large binding graph microbench remains within an explicit recorded budget/complexity envelope;
28. exact final `main` head passes standard GitHub `Tests`.

---

## Explicit non-goals

Do not expand M8 into:

- full layered/visual state-machine editor;
- responsive Layout implementation;
- full text/image/audio authoring;
- masks/mattes/blend/effects expansion;
- full animation Graph Editor;
- scripting/WGSL or script converters;
- Lottie/dotLottie import/export;
- Rust/WASM runtime rewrite;
- collaboration/CRDT;
- MCP/headless CLI.

These remain later roadmap milestones.

---

## M8 acceptance

M8 is VERIFIED only when:

- View Models + instances + required property types have stable typed identity;
- one-way/two-way binding semantics are deterministic and cycle-safe;
- Property Groups, enums, converters and lists have bounded usable contracts;
- binding ownership/dependency chains are machine-readable;
- Components have isolated data contexts;
- human UI and AI use the same persistent command surface;
- transient runtime data never pollutes authored serialization/history;
- Data Binding adds no continuous work to projects that do not use it;
- `QUALITY.md` gates remain intact;
- all M0–M7 regressions stay green;
- `npm run check` passes;
- `npm test` passes;
- latest standard GitHub `Tests` passes on the exact final `main` head.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Identity/migration proof:
- View Model/property-type proof:
- Runtime instance/isolation proof:
- Binding/evaluator proof:
- Ownership/dependency proof:
- Cycle/conflict proof:
- Property Group proof:
- Enum/converter proof:
- List proof:
- Component data-isolation proof:
- UI/command/manifest parity proof:
- Name-independence proof:
- Persistence/history proof:
- Lightweight/performance impact:
- Existing M0–M7 regression proof:
- GitHub Tests final-head proof:
- Progress snapshot update: keep verified-only percentages unchanged until independent acceptance
- Suggestions added to `suggestions`:
- Known limitations:
```
