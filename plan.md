# Veyra — Master Plan for Full Rive Parity + AI-Native Semantic Graph

**Audit date:** 2026-09-07  
**Branch:** `main`  
**Parity baseline:** current Rive documentation index at `https://rive.app/docs/llms.txt` as reviewed on 2026-09-07.  

> This file is the authoritative high-level roadmap. `docs/plan.md` is an older rolling interaction-milestone log. If the two disagree, this file wins.

---

## 0. North star and non-negotiable rules

Veyra is not finished when it merely looks like Rive. The target is:

1. **Full Rive-class authoring/runtime capability** for the feature surface in the parity baseline.
2. **Every meaningful thing in a Veyra project is machine-readable.** AI must be able to discover it, understand what it controls, inspect dependencies/ownership, edit it, preview it, verify it, and undo it.
3. **Human names are display labels only.** Renaming `Right Eye` to `banana`, `Layer 43`, or an empty string must not break AI understanding, bindings, automation, animation, or interactions.
4. **AI may maintain its own semantic identity layer** — aliases, roles, tags, relations, provenance and confidence — without renaming or overwriting the human's labels.
5. **The human UI and AI use the same canonical model and command layer.** No feature may exist only as a UI shortcut or only as an AI-only back door.
6. **Authored source and evaluated output remain distinct.** AI must know whether a visible value is owned by direct authoring, animation, data binding, layout, a constraint, a state machine, a script, a component override, or another derived system.
7. **Ambiguity fails closed for destructive actions.** The resolver can suggest/infer, but it must not silently edit the wrong eye, state, bone, component, binding, etc.
8. **Rive parity is a living contract.** New Rive documentation/features are added to the parity ledger rather than silently falling outside scope.

A feature does **not** count as complete until its human and AI surfaces are both complete (§4).

---

## 1. Audit verdict — where Veyra actually is

The foundation is strong, but the previous plan overstated how close Veyra is to current Rive because it treated several modern Rive systems as later extras. In current Rive, Data Binding/View Models, Components, Layouts, Listeners, scripting, scripts/shaders, responsive UI, advanced state machines, richer assets, accessibility semantics, revision history, and AI/MCP tooling are first-class product surfaces.

Weighted estimate after this deeper audit:

- **Core custom editor/engine foundation:** roughly **60–65%** of the foundation needed for a professional motion editor.
- **Current Rive editor/runtime feature parity:** roughly **30–35%**.
- **Our stronger requirement — every feature fully AI-readable/controlable and name-independent:** roughly **25–30%**.

These are planning estimates, not line-count metrics. Large missing systems (Data Binding, Components, Layouts, Text, scripting/WGSL, a distributable runtime, collaboration) carry much more weight than small inspector options.

### 1.1 Strong foundations already present

- Open, versioned `.veyra` JSON with deterministic serialization/migration.
- Stable IDs on nodes, rig objects, gradient stops, mesh vertices, timelines/tracks, machine inputs/states/transitions/conditions, and listeners.
- Typed references for a useful subset of entity kinds.
- Property-address system and authored/evaluated scene separation.
- Transactional store, undo/redo, command provenance (`user`, `ai`, `script`, `import`).
- JSON-safe command bus and generated project-manifest actions.
- Scene summary and capability system.
- Vector shapes/paths, hierarchy, transforms, solid/gradient fill, solid stroke.
- Bone hierarchy, weighted meshes, controls and six current constraint implementations.
- Timelines, keyframes, easing, playback, auto-key and animation evaluation.
- State-machine core with inputs, animation states, transitions and crossfade evaluation.
- Pointer listener schema/resolver and direct timeline `play`/`stop`/`seek` bridge.
- A node-level semantic layer (`role`, `description`, `tags`).
- Automated Node test discovery, browser seams and golden fixtures.

### 1.2 Architectural gaps discovered in the code

These are **P0** because every future feature would otherwise need another retrofit.

#### A. Semantics are node-only

`src/veyra/model.js`, `properties.js`, `summary.js`, and `capabilities.js` currently attach semantic role/tags/description only to `node` targets. Bones, meshes, controls, constraints, assets, timelines, tracks, keyframes, state machines, layers, states, transitions, inputs, listeners, actions, bindings, etc. do not have the same semantic identity.

**Required:** replace node-only semantics with a universal semantic/annotation registry targeting any typed entity reference.

#### B. Reference kinds are not yet universal

`src/veyra/references.js` currently covers only a subset (`node`, `bone`, `paint`, `asset`, `constraint`, `mesh`, `meshVertex`, `control`, `timeline`, `machineState`, `machineInput`). Full parity needs first-class refs for every persistent entity: artboards, components/instances, fills/strokes, gradient stops, tracks/keyframes, state machines/layers/transitions/conditions, listeners/actions/events, view models/instances/properties, enums, converters, bindings, property groups, layouts/lists, text runs/styles/modifiers, scripts/shaders, tags/annotations, render presets, etc.

#### C. Keyframes do not have immutable IDs

`createKeyframe()` currently stores frame/value/easing but no ID. The manifest synthesizes a keyframe identity from timeline + track + frame, so moving a keyframe changes its apparent identity. That is fragile for AI plans, references, selection, comments, provenance and collaboration.

**Required:** every persistent keyframe gets a stable ID; frame is a mutable property, not identity.

#### D. Human names still appear in a few resolution paths

Stable IDs already drive most references, which is good. However, some convenience paths still accept names (for example machine-input normalization/runtime calls). Human-name lookup may remain for explicit human requests, but **AI-generated plans must resolve to stable references before execution** and must never treat a matching display name as semantic proof.

#### E. The AI surface is split

- `manifest.js` has a good whole-project manifest.
- `commands.js` has the generic validated command bus.
- `veyra.js` exposes a separate hand-written `globalThis.veyra` API.
- The human UI often calls `VeyraStore` methods directly.

That creates drift: a command may exist without being exposed by the browser API, or a UI feature may bypass the canonical command catalog.

**Required:** one canonical capability/command registry. The UI, embedded AI, MCP, scripts and tests route through it (with narrow runtime-only ports where appropriate).

#### F. Listener authoring is incomplete

Listeners have a model/runtime resolver, but the shared store/command surface does not yet offer complete listener CRUD/action editing comparable to the machine/timeline APIs. Current listener actions are also much narrower than Rive.

#### G. Machine listener runtime is still missing

Direct timeline interaction works, but runtime intents for machine `setInput`/`fire` are still not applied by the editor transport. This must close before the interaction layer is considered end-to-end.

#### H. Hit testing is approximate

Ellipse hit testing is exact; most other shapes currently fall back to bounds. Interaction parity requires shape/path/stroke/clip/layout/component-aware hit testing against the evaluated scene.

---

## 2. P0 architecture — Universal Entity Graph

Before adding another major Rive feature family, Veyra needs a universal identity model that scales to all of them.

### 2.1 Every persistent entity has a stable typed reference

Canonical rule:

```text
{ kind: <entity-kind>, id: <immutable-stable-id> }
```

The `id` never changes when the user renames, reparents, reorders, animates, binds, or moves the entity. Display paths are derived convenience data only.

The entity registry must eventually cover at least:

```text
document, artboard, component, componentInstance,
node, shape, path, fill, stroke, gradientStop,
text, textRun, textStyle, textModifier,
image, asset, audioClip,
bone, mesh, meshVertex, joystick, control, constraint,
layout, list, solo,
timeline, track, keyframe,
stateMachine, machineLayer, machineState, machineTransition, machineCondition,
listener, listenerAction, event,
viewModel, viewModelInstance, dataProperty, enum, converter, binding, propertyGroup,
script, shader, renderPreset,
tag, semanticRecord
```

Not every kind needs a separate top-level document array; this is about addressability and stable identity.

### 2.2 Human `name` is explicitly non-semantic

For all named entities:

```text
name/displayName = UI label chosen by the human
id               = durable identity
semantic records = machine understanding
```

The manifest should explicitly mark names as advisory, e.g. `displayNameAdvisory: true`, so an agent cannot accidentally assume `R_Eye` means right eye.

### 2.3 Generalized semantic/annotation record

Replace node-only semantics with a target-agnostic record along these lines:

```json
{
  "id": "semantic_...",
  "target": { "kind": "node", "id": "node_..." },
  "canonicalRole": "character.eye",
  "description": "Character's anatomical right eye",
  "aliases": [
    { "namespace": "ai:default", "value": "right_eye" },
    { "namespace": "ai:rigging", "value": "eye_target_r" }
  ],
  "tags": ["character", "face", "eye", "right"],
  "relations": [
    { "predicate": "part_of", "target": { "kind": "component", "id": "component_face" } },
    { "predicate": "paired_with", "target": { "kind": "node", "id": "node_other_eye" } }
  ],
  "provenance": {
    "source": "ai",
    "agent": "veyra-semantic-indexer",
    "confidence": 0.94,
    "basis": ["hierarchy", "geometry", "symmetry", "rig", "animation-usage"]
  },
  "status": "inferred"
}
```

Requirements:

- Target can be **any persistent entity**, not only a scene node.
- Multiple alias namespaces are allowed; an AI does not have to overwrite human tags or another agent's aliases.
- `status`: `inferred`, `confirmed`, `rejected`, `stale`.
- Confidence and evidence are recorded for inferred semantics.
- Human organization tags, accessibility semantics and AI semantic aliases remain separable namespaces even if the UI presents them together.
- Removing an entity cleans up annotations/relations deterministically.
- Duplicating an entity creates new IDs and explicitly defines whether annotations are copied as inherited evidence or recomputed.

### 2.4 AI semantic indexer — understand structure, not names

The semantic indexer computes candidates using the project graph. Evidence may include:

1. Stable type/capabilities.
2. Parent/child/component hierarchy.
3. Geometry, bounds and relative spatial position.
4. Repetition, symmetry and paired structures.
5. Paint/style similarity.
6. Bone hierarchy, mesh weights, controls and constraints.
7. Timelines/tracks: what properties move together and when.
8. State-machine topology and listener actions.
9. Data-binding relationships and View Model contracts.
10. Layout/container/list membership.
11. Script inputs/outputs/dependencies.
12. Accessibility semantics already authored by the human.
13. Rendered visual evidence when structural evidence is insufficient.
14. Human names only as an **optional weak hint**, never as the sole proof.

Example: a node named `asdf_17` can still be recognized as the right eye because it is one of a mirrored pair inside the face component, is influenced by the eye rig, clips an iris/pupil group, and is keyed by blink/look timelines.

### 2.5 Semantic resolver

Resolution order:

```text
explicit stable ref
  -> confirmed semantic alias/role
  -> high-confidence semantic graph relation
  -> structural + behavioral inference
  -> rendered/visual inference
  -> human display name only when user explicitly refers to that name
  -> ambiguity / no-op rather than guessing
```

Every resolution returns evidence, not just an ID:

```json
{
  "target": { "kind": "node", "id": "..." },
  "semantic": "right_eye",
  "confidence": 0.94,
  "evidence": ["paired eye structure", "right-side rig relation", "blink track ownership"],
  "alternatives": []
}
```

For destructive edits, low-confidence or close competing candidates require preview/confirmation instead of silent application.

### 2.6 Rename-invariance is a release gate

Add adversarial fixtures/tests that:

- randomize **every human name** in a complex project;
- set all names to generic duplicates (`Layer`, `Thing`, `State`);
- deliberately swap/mislead names (`left_eye` label on the right-eye object);
- leave names empty where allowed;
- rename after an AI plan is generated but before it is applied;
- move/reorder entities without changing IDs;
- duplicate components and verify semantic lineage/re-resolution.

The same semantic intent must resolve to the same stable target (or explicitly become ambiguous for legitimate structural reasons).

Suggested suite: `tests/veyra-semantic-identity.test.mjs` plus golden semantic manifests.

---

## 3. P0 architecture — Unified AI/Human Control Plane

### 3.1 One project manifest

Make `createProjectManifest()` the canonical bounded AI context and expose it through the browser/runtime API.

The manifest must eventually enumerate **all** authored/runtime-relevant registries and include:

- typed stable refs;
- display names (advisory);
- semantic identity/aliases/tags/relations;
- capabilities (`readable`, `writable`, `animatable`, `bindable`, `scriptable`, `runtime-only`, etc.);
- property schemas/bounds/enums;
- authored value and, when requested, evaluated value;
- ownership: who currently controls the evaluated value;
- dependencies/dependents;
- actions/commands with parameter schemas;
- warnings/conflicts/unsupported host capabilities;
- source provenance and format version.

### 3.2 One command registry

The command table becomes the source of truth for both UI and agents.

Target API:

```text
veyra.getManifest(options)
veyra.queryEntities(query)
veyra.resolveSemantic(intent, options)
veyra.read(ref/address)
veyra.previewCommand(command)
veyra.dispatchCommand(command)
veyra.dispatchPlan(commands, policy)
veyra.validateDocument()
veyra.verifyChange(expected)
veyra.getDependencyGraph(ref?)
veyra.getOwnership(address/ref)
```

`globalThis.veyra`, future MCP tools, internal AI and human UI should be thin adapters over these canonical services rather than separate feature lists.

### 3.3 Ownership/dependency graph

For each address/entity, AI must be able to ask:

```text
What is the authored value?
What is the evaluated value?
Who currently owns/overrides it?
What depends on it?
What will this edit break or be overwritten by?
```

Ownership sources include:

```text
authored property
animation track
state-machine layer/state/blend
view-model/data binding/converter/property group
constraint/IK/joystick
layout
component instance/remap/override
listener/action/event
script/path effect/shader
runtime override
```

This generalizes the existing authored → animation → constraints discipline and prevents AI from editing derived output.

### 3.4 Preview/apply/verify/inverse for every command family

No AI command family is complete without:

1. schema validation;
2. dry-run/preview;
3. conflict report;
4. transactional apply;
5. read-back/evaluated verification;
6. inverse/undo semantics;
7. provenance.

---

## 4. Definition of feature completeness — mandatory for every Rive feature

A feature is marked **VERIFIED** only when all of these are present:

| Gate | Requirement |
|---|---|
| Model | Versioned authored schema + validation + migration |
| Identity | Stable IDs and typed references for every persistent sub-object |
| Addresses | Read/write property addressing where meaningful |
| Evaluation | Deterministic authored → evaluated/runtime behavior |
| Renderer | Correct visual/runtime output |
| Human UI | Create/read/update/delete and relevant editor controls |
| Command API | Same operation available through canonical validated commands |
| Manifest | Full machine-readable representation and capabilities |
| Semantics | AI annotation/alias support + dependency/ownership visibility |
| History | Transactional undo/redo + provenance |
| Tests | Unit + integration + serialization/golden tests |
| Name invariance | Renaming/misnaming human labels cannot break AI targeting |

A feature with only model/runtime code is **PARTIAL**. A feature with only UI is **PARTIAL**. A feature the AI cannot discover/control is **PARTIAL**.

---

## 5. Rive parity ledger — current high-level status

The official documentation index is the parity baseline. This table groups that surface into implementation tracks; each track needs a detailed child ledger as work begins.

| Rive capability family | Veyra now | Main work required |
|---|---|---|
| Files, multiple artboards, editor shell | **Partial** | Multi-artboard document, artboard CRUD/reorder/focus, selection/navigation parity, align/distribute, freeze/origin, transform spaces, shortcuts |
| Hierarchy, tags, dependency graph | **Partial** | Reorder/reparent parity, generalized tagging, dependency UI/API, animated/custom draw order, Solos, hierarchy filters/lock/select by tag |
| Components / nested artboards | **Missing** | Component sources/instances, instance playback, remap/mix, fit/alignment/layout modes, reusable libraries |
| Vector shapes & paths | **Good partial** | Shape/path separation, compound/multi-path shapes, per-corner rectangle behavior, procedural→path conversion, Shape Builder boolean ops, fill rules, richer vertex/handle tools |
| Paint & vector effects | **Partial** | Multiple ordered fills/strokes, gradient strokes, stroke caps/joins, transform-affects-stroke, visibility per paint, blend modes, clipping/inverse/even-odd, trim/dash, vector feathering/effect groups |
| Text | **Missing** | Text objects, runs, styles, fonts, wrap/alignment, variable/OpenType features, text modifiers, text-path behavior, animation/data binding |
| Images & raster | **Model only** | Image nodes, raster rendering, fit/origin/sampling, mesh deformation, image asset replacement/binding |
| Asset system/import | **Early partial** | Real import/usage for JPEG/PNG/WebP, SVG editable import, PSD layers, TTF/OTF, MP3/WAV/FLAC + clips, `.lottie`, custom blob assets, compression/export behavior, replace/source handling |
| Rigging / bones / meshes | **Strong partial** | Match Rive's detailed bone/mesh behavior, raster meshes, handle weighting, advanced edit tools and diagnostics |
| Joysticks | **Missing** | 1D/2D joystick controls, nested joystick driving, property ownership/conflict rules, UI/AI APIs |
| Constraints | **Partial** | Exact Rive option parity for IK, Distance, Follow Path, Rotation, Scale, Transform, Translation plus Scroll Constraints; spaces, limits, offsets, copy modes and all inspector/runtime behaviors |
| Timelines / keys / interpolation | **Good partial** | Stable keyframe IDs, richer track list, multi-select/copy/paste, animation modes, graph editor, correct cubic handle bounds/overshoot, motion paths, animated draw order, audio keys/events |
| State-machine layers | **Missing** | Multiple ordered layers, enable/disable/duplicate, ownership priority and simultaneous evaluation |
| State types | **Partial** | Entry/Exit/Any, Single, 1D Blend, Additive/Direct Blend, speed/reverse, captions, per-state actions |
| Transitions | **Partial** | View-model/built-in sources, dynamic comparison bindings, exit time, pause source, allow exit during transition, transition interpolation, actions, enable/disable, randomize-exit weights |
| State-machine editor UI | **Missing** | Full graph authoring, layers, state/transition inspectors, condition/action builders, live debugging |
| Listeners | **Early partial** | Full CRUD; artboard/component targets; Click; VM-property/Rive-event/semantic-action sources; opaque target; multiple ordered actions; align/report/script/data-bound action values |
| Events | **Missing** | Event records/properties, audio/open-url/general compatibility, timeline/state/transition/listener emission and runtime reporting where applicable |
| View Models & Data Binding | **Missing — P0/P1** | View models/instances; Number/Bool/Trigger/String/Enum/Color/nested VM/List/Image/Artboard; bindings; observability; runtime contract |
| Property Groups | **Missing** | Artboard-local keyable properties and bidirectional bindings used as explicit local/global bridges |
| Enums & Converters | **Missing** | User/system enums; built-in converters; custom/script converters; conversion graph and diagnostics |
| Dynamic Lists | **Missing** | Artboard lists, VM-list and number-to-list sources, item index, layout/scroll integration, runtime mutations |
| Layouts | **Missing** | Row/column responsive system, hug/fill/relative/absolute, padding/gap/alignment, nested layouts, styles, layout animation, tools and full parameters |
| N-Slicing / Scrolling | **Missing** | N-slice axes/modes; Scroll Constraints, list scrolling and runtime behavior |
| Scripting | **Missing** | Sandboxed Luau-compatible scripting model and protocols: Node, Converter, Layout, Listener Action, Path Effect, Transition Condition, Test, Util; inputs/data binding/debug/tests |
| WGSL / GPU script surface | **Missing** | Shader assets, validated/sandboxed GPU API, diagnostics, recompilation and AI tooling |
| Accessibility semantics | **Missing/AI semantics is different** | Rive-style roles/properties/traits/states/actions, semantic listeners, reduced-motion behavior, platform semantic tree; keep separate from AI semantic annotations |
| Debugging | **Partial tests only** | Debug panel for logs/problems/AI changes/tests/audio, state-machine/data-binding/script diagnostics |
| Runtime renderer/player | **Missing** | Dedicated Canvas/WebGL/GPU renderer, deterministic player, state machines/data binding/layout/scripts/listeners/audio/assets |
| Runtime asset swapping | **Missing** | Image/font/audio/artboard data-driven replacement APIs |
| Runtime/platform SDKs | **Missing** | Web first, then React, React Native, Flutter, Apple, Android, C++; game runtimes/integrations later (Unity/Unreal etc.) |
| Export/publishing | **SVG only** | Runtime package/export, backup, embed path, PNG/SVG, H.264, GIF, PNG/SVG sequence, WebM, render presets/queue; compact runtime representation |
| Collaboration/revision history | **Missing** | Durable revision history, multi-user editing/CRDT, presence, permissions/workspaces |
| Libraries | **Missing** | Publish/reuse shared components and data-driven assets across projects |
| AI agent/MCP | **Foundation partial** | Canonical project manifest + command/query/semantic APIs, MCP server, in-editor agent, script/shader tools, diagnostics; AI must cover every editor capability |

### 5.1 Parity tracking rule

Create a detailed machine-readable ledger (eventually generated to Markdown) with one entry for each Rive docs capability/page:

```text
riveFeatureId
sourceUrl
lastChecked
status: missing | model-only | partial | verified | intentionally-exceeded
veyraEntities
commands
tests
notes
```

A scheduled/manual parity audit compares `https://rive.app/docs/llms.txt` with the ledger. New Rive pages/features automatically appear as **UNREVIEWED**, never silently ignored.

---

## 6. Modern Rive architecture correction — Data Binding moves forward

The older Veyra roadmap treated View Models/data binding as a later advanced feature. That is no longer correct for a current-Rive parity target.

Rive now recommends Data Binding for new work instead of direct state-machine inputs/runtime event listening, and View Model properties cover:

```text
number, boolean, trigger, string, enum, color,
nested view model, list, image, artboard
```

Therefore:

- Keep current number/bool/trigger machine inputs for compatibility.
- Do **not** build the future interaction architecture primarily around them.
- Build View Models/Data Binding early and let state-machine conditions, blend states, listeners, text, images, components, lists, semantics and runtime code bind through the same data layer.

---

## 7. Execution plan — ordered milestones

## M0 — AI Identity & Control Foundation (**next architectural milestone**)

### M0.1 Universal references
- Extend typed refs to all current persistent entities first: `stateMachine`, `machineTransition`, `machineCondition`, `listener`, `track`, `keyframe`, `gradientStop`, `semanticRecord`.
- Give keyframes stable IDs and migrate old timelines deterministically.
- Make selection/query helpers generic over the registry rather than hard-coded node/rig subsets.

### M0.2 Universal semantics
- Generalize semantics from node-only to any typed ref.
- Add alias namespaces, canonical roles, relations, provenance, confidence/status.
- Expose semantic CRUD through property/command APIs.
- Add semantic cleanup/copy/migration rules.

### M0.3 Semantic index/resolver
- Build graph-derived descriptors and semantic resolution.
- Add query language/API for type, capabilities, relations, ownership, tags and spatial/graph predicates.
- Add structural/visual evidence scoring and ambiguity reporting.
- Names are ignored by default for AI resolution.

### M0.4 Unify manifest + command bus + browser API
- Expose `getManifest`, `queryEntities`, `resolveSemantic`, `dispatchCommand`, `previewCommand`, `verifyChange`.
- Generate browser/MCP action metadata from the canonical registry.
- Start refactoring human UI actions to use the same commands.
- Add contract tests preventing API/manifest/command drift.

### M0.5 Dependency/ownership graph
- Machine-readable dependencies and dependents.
- Property owner stack and conflicts.
- Inspector/debug visualization later; API first.

### M0 acceptance
- All names can be randomized without changing semantic-target test results.
- Every current entity type can be found by stable ref and manifest query.
- Every current command advertised by the manifest executes through the same dispatch surface.
- No keyframe identity depends on frame position.

---

## M1 — Close current interaction loop

- Execute listener `setInput`/`fire` runtime intents against persistent machine runtimes.
- Listener CRUD in store/command/manifest/UI.
- Add `click` semantics and exact event lifecycle.
- Exact evaluated hit testing for polygon/star/path/fill/stroke; account for transforms and later clips/layouts.
- End-to-end test: pointer → hit → listener → data/runtime change → state transition → evaluated frame → visible render.
- Preserve preview non-mutation and editor tool isolation.

This milestone finishes the current branch of work without making legacy machine inputs the long-term data architecture.

---

## M2 — Multi-artboard, Components and project graph

- Replace single-artboard assumption with stable artboard registry.
- Component source flag and component instances.
- Instance animation/state-machine playback.
- Instance fit/alignment, remap/mix/override semantics.
- Cross-artboard stable references and dependency graph.
- Component-safe semantics: an instance can inherit source semantics while still having instance-local aliases/context.
- Libraries-ready asset identity model.

AI gate: an agent can distinguish source component, instance and instance-local data without relying on their names.

---

## M3 — View Models & Data Binding (**modern interaction backbone**)

### M3.1 View Models
- View Model definitions and instances.
- Property types: number, bool, trigger, string, enum, color, nested View Model, list, image, artboard.
- Stable IDs for models, instances and properties; names remain display/API convenience only.

### M3.2 Binding engine
- One/two-way binding where supported.
- Bind arbitrary supported editor property addresses.
- Observability/change notifications.
- Clear source/target ownership and cycle diagnostics.
- Component/nested-property paths resolved internally by IDs, not fragile names.

### M3.3 Property Groups
- Artboard-local keyable properties.
- Timeline → property group → View Model and inverse direction semantics.
- Explicit graph prevents hidden View Model-to-View Model cycles.

### M3.4 Enums and converters
- User/system enums.
- Numeric/string/color/boolean/list/etc. converters as parity requires.
- Composable converter chains and custom script-converter hook.

### M3.5 Lists
- View Model lists and item instances.
- Artboard/component list rendering.
- Number-to-list converter.
- List item index and list mutations.

AI gate: an agent can ask "what runtime data controls this visual property?" and receive the full binding chain with stable refs.

---

## M4 — State Machine parity + visual graph editor

Rebuild the current state-machine model around layers and data binding while migrating existing files.

- Ordered layers with simultaneous evaluation and property priority.
- Entry / Exit / Any states.
- Single Animation states.
- 1D Blend states.
- Additive/Direct Blend states.
- State speed including reverse playback.
- State captions/editor metadata.
- State start/end actions.
- Transition sources: View Model properties, compatible events and built-in artboard values.
- Transition comparison against fixed or data-bound values.
- Duration, exit time, pause source, allow-exit-during-transition, interpolation.
- Transition start/end actions.
- Enable/disable transition.
- Randomize Exit with weighted outgoing paths.
- Visual graph, layer list, conditions/actions inspector, drag/snapping, debug/current-state visualization.
- Legacy machine inputs remain supported but are not the preferred new path.

AI gate: the entire graph is addressable by IDs and semantic aliases; moving states in the visual graph or renaming them never changes behavioral identity.

---

## M5 — Listener/Event/Accessibility interaction parity

### Listeners
- Targets: elements, artboards, component instances.
- Sources: pointer enter/exit/move/down/up/click, View Model property change, events, semantic actions.
- Opaque/pass-through hit behavior.
- Multiple ordered actions per listener.
- Actions: change property/data, align target, report/fire event, scripted action, compatibility input actions.
- Data-bind listener action arguments.

### Events
- Versioned event records and typed custom properties.
- Timeline/state/transition/listener emission.
- Audio events and compatible general/open-url behavior as required.

### Accessibility semantics
Keep accessibility semantics distinct from AI annotations:
- role, label/value/hint/properties;
- traits and state (selected/disabled/expanded/etc.);
- semantic actions (tap/increase/decrease);
- runtime semantic tree;
- reduced-motion policies.

AI may read accessibility semantics as evidence, but must never overwrite accessibility metadata merely to organize its own understanding.

---

## M6 — Drawing, Paint and Effects parity

### Shape/path architecture
- Separate Shape containers from one/more Path children where useful for parity.
- Rectangle, ellipse, polygon, star + custom paths with full procedural controls.
- Convert procedural shape → editable custom path.
- Compound/multi-path support.
- Shape Builder boolean merge/subtract workflow.
- Vertex modes/handles and high-quality edit tooling.

### Paint
- Multiple ordered fills and strokes per shape.
- Solid / linear / radial for both fill and stroke.
- Stable IDs for every paint layer and gradient stop.
- Fill rules.
- Stroke cap, join, width and transform-affects-stroke.
- Per-paint visibility/opacity/blend mode.
- On-canvas gradient controls.

### Effects
- Clipping (including relevant fill/inverse behavior).
- Trim Path.
- Dashed stroke/path.
- Vector feathering and effect groups.
- Scripted path-effect integration after scripting lands.

AI gate: every paint/effect layer has a stable ref; asking "make the second outline thinner" is resolved structurally by ordered stroke ref, not the object's display name.

---

## M7 — Text, Images, Assets and Media

### Text
- Text node, runs, styles and stable IDs.
- Font family/weight/size/line height/alignment/wrap.
- Multiple fills/strokes where applicable.
- Variable font axes/OpenType options required for parity.
- Text modifiers over characters/words/lines/glyphs.
- Text-path behavior.
- Timeline animation and Data Binding.

### Images/raster
- Raster image node and asset usage.
- Fit/alignment/origin/sampling.
- Runtime replacement.
- Mesh deformation/skinning on raster images.

### Import/assets
- JPEG/PNG/WebP.
- SVG → editable vector import.
- layered PSD import.
- TTF/OTF fonts and font metadata/glyph handling.
- MP3/WAV/FLAC, preview, clips and volume.
- `.lottie` import/asset support where parity requires.
- Custom blob assets for scripts/advanced workflows.
- Embedded/referenced/hosted-style source policies as our product architecture allows.
- Replace asset without breaking references.
- Compression/export options.

AI gate: all asset usages/dependents are queryable; replacing an image can be planned by semantic target or asset ref without searching by filename.

---

## M8 — Layout, N-Slicing, Scrolling and Solos

- Row/column layout containers.
- Relative/absolute participation.
- Hug/fill/fixed sizing.
- Padding, gap, alignment, direction, wrapping and other parity parameters.
- Nested layouts.
- Layout styles.
- Layout reflow animation/interpolation.
- N-slicing for vector/raster use cases.
- Scrolling + Scroll Constraints + list scrolling.
- Solos and active-child animation/binding.
- Layout ownership represented in the property ownership graph.

AI gate: layout-derived X/Y/size are marked derived; AI edits authored layout rules instead of fighting evaluated positions.

---

## M9 — Rigging parity

Build on the existing strong rig core:

- Detailed Rive-compatible bone behavior/tools.
- Mesh topology/UV and raster mesh workflows.
- Weighted Bezier handles where required.
- Joysticks (1D/2D), nesting/driving other joysticks, timeline/VM control.
- Full constraint parity and inspector options:
  - IK
  - Distance
  - Follow Path
  - Rotation
  - Scale
  - Transform
  - Translation
  - Scroll Constraint
- Transform/source/destination spaces, min/max, copy-axis modes, offsets and exact per-type semantics.
- Better rig diagnostics/auto-weighting/auto-rig hooks.

AI gate: semantic rig roles (`left_hand_target`, `head_look_control`) are aliases over stable refs and can be reconstructed from hierarchy/weights/constraints even after human renames.

---

## M10 — Animation/editor power parity

- Explicit Design vs Animate workflows where useful.
- Rich animation/timeline list.
- Stable track/keyframe IDs.
- Track grouping/collapse/filter/search.
- Multi-select/box select/copy/paste/duplicate keys.
- Work-area UI.
- Motion paths.
- Graph/easing editor.
- Correct cubic Bezier semantics including allowed overshoot rather than globally bounding all control values to 0..1.
- Keyable draw order.
- Layout animation keys.
- Audio/event tracks as appropriate.
- Better timeline performance for large projects.

AI gate: AI can reason about interpolation curves, key ownership and conflicting tracks without screen coordinates or row labels.

---

## M11 — Scripting + WGSL parity

Full current-Rive parity now includes code inside the editor/runtime. Treat this as a sandboxed subsystem, not arbitrary browser `eval`.

### Script assets/protocols
- Node scripts.
- Converter scripts.
- Layout scripts.
- Listener Action scripts.
- Path Effect scripts.
- Transition Condition scripts.
- Test scripts.
- Util/helper scripts.

### Script platform
- Typed script inputs exposed in editor.
- Data Binding access.
- Artboard/component/render APIs.
- Pointer, keyboard, focus/text-input and gamepad event surfaces required by parity.
- Image/font/audio/blob access through permissions/capabilities.
- Deterministic lifecycle and resource limits.
- Debug console, diagnostics, compile errors, source maps where useful.
- In-editor unit tests.

### WGSL/GPU
- Shader assets.
- Validated GPU resource/bind-group/pipeline surface.
- Preview/compile diagnostics.
- Sandboxing/resource budgets.

AI gate: scripts/shaders are first-class assets in the manifest; AI can read/search/edit/test them and correlate their inputs/outputs to the project dependency graph.

---

## M12 — Runtime, Publishing and SDKs

### Runtime core
- Compact runtime representation separate from editable authoring metadata where useful.
- High-performance Canvas/WebGL/GPU renderer.
- Artboards/components, animation, state machines, Data Binding, layouts, listeners, semantics, scripts, text, image, audio and asset swapping.
- Deterministic update/render loop and performance diagnostics.

### Publishing/export
- Runtime package/export.
- Backup/export source.
- Embed URL/player.
- Static: PNG, SVG.
- Animated/video: H.264/MP4-equivalent, GIF, PNG sequence, SVG sequence, WebM.
- Render presets and queue/local/cloud-ready abstraction.

### Platform order
1. Web low-level runtime + `<veyra-player>`.
2. React.
3. React Native.
4. Flutter.
5. Apple/iOS/macOS.
6. Android.
7. C++ embedding API.
8. Unity/Unreal and other integrations after the core ABI is stable.

AI gate: runtime APIs expose semantic/data contracts so host code can bind by durable exported contract, not brittle internal display names.

---

## M13 — Collaboration, Libraries, Debugging and production workflows

- Revision history with named restore points.
- CRDT/operation-log multi-user collaboration and presence.
- Permissions/workspaces/project organization.
- Shared/published component libraries.
- Debug panel: logs, validation problems, AI changes, tests, data binding, state machines, scripts and audio.
- File/project search and dependency diagnostics.
- Import/export audit trail.

AI changes should appear as first-class revision/provenance events, not invisible mutations.

---

## M14 — AI Agent + MCP product layer

Only after the canonical control plane is trustworthy:

- In-editor AI chat/agent.
- MCP server over the same manifest/query/command/preview/verify APIs.
- Agent tools for files/artboards, hierarchy, design, animation, state machines, data binding, layouts, assets, scripts and shaders.
- Semantic index maintenance and visual verification.
- Multi-step plan execution with checkpoints and rollback.
- Explain-why output: resolved target, evidence, owner/conflicts, commands, verification.
- Optional AI-generated aliases/tags persist in their own namespace.

**Critical:** the agent never needs the human to name an object correctly. Human names can make conversation friendlier, but semantic identity comes from stable references + annotations + structure.

---

## 8. Immediate implementation order

Do not jump directly into text/images/state-machine UI before the identity layer. The recommended next sequence is:

- [ ] **M0.1** Universal current-entity refs + stable keyframe IDs + migration.
- [ ] **M0.2** Generalize semantics to all current entity kinds; AI alias namespaces/provenance/confidence.
- [ ] **M0.3** Name-independent semantic query/resolver + adversarial rename tests.
- [ ] **M0.4** Unify project manifest, generic command dispatcher and browser API; drift tests.
- [ ] **M0.5** Dependency/ownership graph.
- [ ] **M1.1** Machine listener host bridge + listener CRUD/actions.
- [ ] **M1.2** Exact evaluated hit testing + pointer/click integration.
- [ ] **M2** Multi-artboard/components foundation.
- [ ] **M3** View Models/Data Binding/Property Groups/Enums/Converters/Lists.
- [ ] **M4** Full layered state machines + visual editor.
- [ ] Continue through M5–M14 in order, allowing isolated parallel work only when contracts are already frozen.

---

## 9. Next milestone acceptance checklist (M0)

M0 is not closed until all are true:

- [ ] Every current persistent entity has a stable typed reference; keyframes no longer use frame position as identity.
- [ ] Semantic records can target nodes, bones, meshes, controls, constraints, assets, timelines/tracks/keyframes, machines/states/transitions/conditions and listeners.
- [ ] AI aliases are namespaced and do not modify human `name` fields.
- [ ] Semantic records include provenance/confidence/status for inferred identities.
- [ ] `createProjectManifest()` includes generalized semantics, dependencies and ownership data.
- [ ] Canonical query API can locate entities by type/capability/semantic relation without using `name`.
- [ ] Generic command dispatcher is exposed through the running editor and agrees with the manifest action catalog.
- [ ] Existing direct editor interactions and tests remain green.
- [ ] **Rename torture test:** randomizing, duplicating and deliberately misleading all display names does not alter target resolution for confirmed semantics.
- [ ] **Zero-name test:** complex fixture remains machine-understandable with display names removed wherever schema permits.
- [ ] **Ambiguity test:** two structurally plausible untagged targets produce an explicit ambiguous result, not a random edit.
- [ ] `npm test` and `npm run check` are green on the settled committed tree.

---

## 10. Definition of "Veyra has everything Rive has"

Do **not** declare full parity from a hand-written feature list.

Full parity means:

1. Every editor capability in the pinned/current Rive docs parity ledger is `VERIFIED` or explicitly superseded by a stronger Veyra implementation.
2. Every required runtime capability has a tested Veyra equivalent on the agreed platform matrix.
3. Every feature passes the 12 completeness gates in §4.
4. The parity crawler/audit reports no unreviewed Rive feature pages.
5. Rename-invariance and semantic-resolution tests pass across representative complex files.
6. AI can perform the same complete workflows as a human using canonical commands: create artboards/components, design artwork, import assets, rig, animate, build data models/layouts/state machines/listeners, write/test scripts/shaders, preview, debug, publish and repair.
7. Human display names can be arbitrary without invalidating AI understanding.

Until then, status should be stated precisely as `PARTIAL`, even when a demo looks complete.

---

## 11. The core product advantage over Rive

Feature parity is the floor. Veyra's differentiator should be the semantic graph:

```text
Human sees:      "Layer 48" / "asdf" / "Thing"
Veyra stores:    stable typed IDs + dependencies + authored behavior
AI understands:  character.right_eye / blink_target / hover_button / price_text
AI records:      its own aliases/tags + confidence/evidence
Human renames:   anything they want
Behavior/AI:     unchanged
```

That turns a motion-design document from a pile of named layers into a **machine-understandable executable graph**. The AI is not guessing from layer names; it is reasoning from identity, structure, behavior, ownership and verified semantic annotations.