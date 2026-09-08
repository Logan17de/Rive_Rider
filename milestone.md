# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary. Invalid commands, dangling refs, unsupported writes, ownership conflicts, and ambiguous targets must fail before committed state.
2. Human names are display metadata only. Stable typed refs, property addresses, semantic records, and canonical command IDs are authoritative.
3. Do not create a second AI-only model, command system, dependency graph, or mutation path.
4. Human UI, browser AI, future MCP/headless adapters, scripts, and tests must reuse the same canonical services.
5. Authored values and evaluated/derived values must remain distinct. Never mutate evaluated output as if it were authored source.
6. Dependency and ownership results must be deterministic, JSON-safe, evidence-backed, and name-independent.
7. Preview/dry-run operations must never mutate document, revision, history, selection, runtime state, or semantic records.
8. Multi-command plans must be atomic: either the authorized plan commits completely or committed state remains unchanged.
9. Do not silently invent ownership for systems that are not active or whose runtime state is unavailable. Return explicit `unknown`, `inactive`, or `runtime-context-required` information instead.
10. Do not implement new Rive feature families, MCP, CLI/headless transport, Components, View Models/Data Binding, Layout, Text, advanced state machines, scripting/WGSL, or geometry hit-testing in this milestone.
11. Do not weaken existing M0/M1/M2 tests or capability declarations.
12. Run `npm test` and `npm run check` before handoff.

---

# MILESTONE M3 — Unified AI/Human Control Plane + Dependency & Ownership Graph

**Status:** `AWAITING VERIFICATION`

## Goal

Close the remaining P0 control-plane gap before adding major Rive feature families.

After M3, Veyra must have one canonical machine-readable service layer through which an AI or human-facing adapter can:

- inspect the project manifest;
- query/resolve stable entities;
- read authored and evaluated values;
- inspect dependencies and dependents;
- understand who currently owns/overrides a property;
- preview a command without side effects;
- dispatch one validated command;
- dispatch an atomic multi-command plan;
- validate the document;
- verify the result of an edit.

The browser-facing `globalThis.veyra` surface must become a thin adapter over those same canonical services rather than an independently maintained feature list.

This milestone covers **current Veyra entity kinds and current evaluation systems only**. Future Components, Data Binding, Layout, scripts, etc. must be able to plug into the same contracts later.

---

## Task 1 — Create one canonical Veyra service/control registry

Introduce a DOM-free canonical service module/registry that composes the existing authoritative systems rather than duplicating them:

- `createProjectManifest()`;
- `buildSemanticIndex()` / `queryEntities()` / `resolveSemantic()`;
- property addressing/read APIs;
- `VEYRA_COMMAND_TABLE` / `dispatchVeyraCommand()`;
- document validation/normalization;
- dependency/ownership services added by this milestone.

Target public direction from `plan.md`:

```text
veyra.getManifest(options)
veyra.queryEntities(query, options)
veyra.resolveSemantic(intent, options)
veyra.read(refOrAddress, options)
veyra.previewCommand(command, options)
veyra.dispatchCommand(command)
veyra.dispatchPlan(commands, policy)
veyra.validateDocument()
veyra.verifyChange(expected, options)
veyra.getDependencyGraph(refOrAddress?, options)
veyra.getOwnership(refOrAddress, options)
```

### Requirements

- one implementation per operation;
- JSON-safe inputs/outputs;
- no DOM dependency in the core service layer;
- browser/MCP/headless layers are adapters only;
- capability metadata and real callable services agree mechanically;
- service names/actions cannot drift from the manifest/command table silently.

Do not delete useful existing APIs merely to satisfy naming. Preserve compatibility through thin aliases/adapters where sensible.

---

## Task 2 — Build the deterministic current-graph dependency model

Create a reusable dependency graph for current persistent entities and relevant property addresses.

The graph must distinguish at least:

```text
dependsOn
usedBy / dependents
owns / ownedBy
reads
writes / controls
animates / animatedBy
references / referencedBy
runtimeUses
semanticRelation
```

Cover current relationships where applicable:

### Scene / hierarchy / paint

- node parent/child;
- paint owner and gradient-stop owner;
- path/mesh-vertex ownership;
- asset references that exist in the current model.

### Rigging

- bone parent/child;
- mesh weights -> bones;
- constraints -> bones/controls/paths;
- control/constraint relationships.

### Animation

- timeline -> tracks -> keyframes;
- track -> property address -> target entity/property;
- machine state -> timeline.

### State machines / interactions

- machine -> states/inputs/transitions/conditions;
- transitions -> endpoint states;
- conditions -> machine inputs;
- listeners -> targets/timelines/machines/inputs.

### Semantics

- semantic record -> target;
- semantic relation edges;
- semantic record lifecycle dependencies.

### Requirements

- stable typed refs/property addresses only;
- names never participate in graph identity;
- deterministic ordering;
- forward and reverse traversal;
- bounded traversal (`depth`, `maxNodes`, `maxEdges` or equivalent);
- missing/invalid refs fail precisely;
- no document mutation.

Do not duplicate resolver relationship logic blindly. Extract/share graph construction where practical so semantic indexing and dependency inspection cannot contradict each other.

---

## Task 3 — Implement authored/evaluated ownership inspection

Add a canonical ownership API for a property address or supported entity/property target.

For a property, an AI must be able to ask:

```text
What is the authored value?
What is the evaluated value?
Which systems can affect it?
Which system currently supplies/overrides the evaluated value?
What would overwrite a direct authored edit?
```

For the systems Veyra currently implements, ownership analysis must recognize where applicable:

- direct authored property;
- timeline track/keyframe animation;
- active/current state-machine timeline contribution when sufficient runtime context is supplied;
- rig constraints / evaluated transforms;
- mesh deformation / bone influence where relevant;
- runtime/listener-driven state when the necessary runtime context is available.

### Result contract

Use a machine-readable shape that separates potential controllers from active ownership, for example:

```js
{
  target: { address: 'node:.../transform/x' },
  authoredValue: 100,
  evaluatedValue: 140,
  activeOwner: {
    kind: 'animation-track',
    ref: { kind: 'track', id: '...' },
    evidence: [...]
  },
  ownerStack: [...],
  potentialControllers: [...],
  writableSource: { ... },
  warnings: [...]
}
```

Exact shape may evolve, but it must explicitly communicate when runtime context is required rather than guessing.

### Hard rule

If the visible/evaluated value is derived, the API must identify the authored source an edit should target instead of encouraging writes to derived output.

---

## Task 4 — Canonical read API with source/ownership context

Implement `read(refOrAddress, options)` or an equivalent canonical service.

For property addresses, support at least:

- authored value;
- evaluated value when requested;
- capability information;
- ownership result;
- direct dependencies/dependents where requested.

For entity refs, return a bounded machine-readable entity view containing:

- stable typed ref;
- advisory display metadata;
- semantics;
- capabilities;
- dependency summary;
- ownership/source summary where meaningful.

### Requirements

- read-only;
- name-independent;
- JSON-safe;
- bounded options;
- precise unknown/missing/unsupported results;
- no need for callers to scrape internal Store/model objects.

---

## Task 5 — Side-effect-free command preview / dry run

Implement canonical command preview using the same real command validation/mutation path as execution.

A preview must answer, as applicable:

- would the command succeed?;
- what stable entities/property addresses would change?;
- authored before/after values;
- relevant evaluated before/after values where deterministic;
- dependencies/dependents affected;
- ownership conflicts or overwrite warnings;
- lifecycle cascades;
- validation errors;
- whether the change is reversible/undoable.

### Hard requirements

- do not reimplement command mutation logic;
- run against an isolated clone/sandbox Store or equivalent;
- real dispatcher validation must be exercised;
- original Store document/revision/history/selection/runtime state remain byte-for-byte/logically unchanged;
- preview result is deterministic for the same document + command + options.

---

## Task 6 — Atomic multi-command plan dispatch

Implement `dispatchPlan(commands, policy)` over the canonical command system.

Minimum requirements:

- ordered JSON-safe command descriptors;
- preflight validation/preview of the full plan;
- atomic application;
- rollback of the entire plan if any command fails;
- one machine-readable result containing each step outcome;
- command provenance preserved;
- no partial document/history state after failure;
- stable refs produced by earlier plan steps can be referenced by later steps through an explicit, deterministic mechanism if supported; otherwise explicitly declare that limitation rather than guessing.

The plan API must not resolve human names during execution. Semantic intent must already have been resolved to stable refs/addresses before destructive application.

---

## Task 7 — Verification and change assertions

Add a canonical `verifyChange(expected, options)` service suitable for both AI and tests.

It must support deterministic assertions over current Veyra capabilities such as:

- entity exists / does not exist by stable ref;
- authored property equals expected value;
- evaluated property equals expected value;
- semantic record/relation exists;
- dependency edge exists / does not exist;
- ownership matches expected controller/source;
- command/plan produced no unexpected dangling refs or validation errors.

Return structured pass/fail evidence rather than only booleans.

This service is read-only and must never "fix" failed expectations.

---

## Task 8 — Browser adapter + command/manifest/UI drift prevention

Refactor `globalThis.veyra` so the new services are thin calls into the canonical control plane.

At minimum expose/reuse:

```text
getManifest
queryEntities
resolveSemantic
read
previewCommand
dispatchCommand
dispatchPlan
validateDocument
verifyChange
getDependencyGraph
getOwnership
```

### Drift prevention

Add mechanical tests proving:

- every dispatchable command advertised to AI maps to a real `VEYRA_COMMAND_TABLE` action;
- browser `dispatchCommand` uses the same dispatcher;
- browser query/resolution uses the same resolver implementation;
- manifest capability/service declarations map to real callable services;
- newly added current-editor mutation commands cannot be exposed in one machine-readable surface but absent from the others.

Audit current human editor mutation paths. For current operations that already have command-table equivalents, route the UI through the canonical dispatcher/service path where practical in this milestone. Where a direct Store mutation remains temporarily necessary, document it in a **machine-readable parity audit** rather than hiding it.

The goal is measurable convergence toward one mutation plane, not a cosmetic wrapper around several divergent APIs.

---

## Task 9 — Adversarial integration suite

Add dedicated tests covering at least:

1. dependency graph is identical after human names are randomized;
2. dependency reverse edges agree with forward edges;
3. timeline-track ownership of an animated property is reported correctly;
4. an unanimated authored property reports authored ownership;
5. constraint/rig-derived ownership or influence is reported without pretending derived values are directly writable;
6. runtime-context-required ownership is reported explicitly when state-machine/runtime state is absent;
7. `read()` distinguishes authored and evaluated values;
8. preview of a valid command reports changes but mutates nothing;
9. preview of an invalid command fails with zero side effects;
10. a successful plan applies all commands in order;
11. a failing plan leaves document/revision/history unchanged;
12. verifyChange returns structured evidence for pass and fail cases;
13. browser service adapters return the same results as direct canonical services;
14. service/manifest/command registry drift tests are mechanical rather than hard-coded duplicate lists;
15. serialize/load + rename/reorder preserves dependency and ownership identity;
16. all M0/M1/M2 tests remain green.

---

## Explicit non-goals

Do not implement in M3:

- MCP server;
- headless CLI/transport;
- new component/artboard system;
- View Models/Data Binding;
- new layout system;
- richer listener/state-machine feature parity;
- Bézier/path hit-testing;
- path-topology authoring;
- Text;
- scripting/WGSL;
- collaboration;
- runtime SDK/export work.

Those systems will plug into this control/ownership contract later rather than inventing their own AI surfaces.

---

## Acceptance criteria

M3 is complete only when:

- one canonical DOM-free control/service layer exists for the current project model;
- dependency graph supports deterministic forward/reverse inspection over the current graph;
- ownership inspection clearly separates authored, evaluated, potential and active controllers;
- canonical read exposes source/ownership context;
- command preview uses the real dispatcher with zero side effects;
- multi-command plans are atomic and rollback completely on failure;
- deterministic change verification exists;
- browser AI APIs are thin adapters over the same services;
- manifest/service/command capability drift is mechanically tested;
- names never participate in dependency/ownership identity;
- derived output is never presented as a directly writable authored source;
- all existing tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: M3 canonical service registry/dependency graph/control plane integration
- Changed files: src/veyra/serviceRegistry.js, src/veyra/dependencyGraph.js, src/veyra/controlPlane.js, src/veyra/store.js, src/veyra/commands.js, src/veyra/manifest.js, src/index.js, veyra.js, tests/veyra-control-plane.test.mjs, milestone.md
- Tests added/changed: dedicated M3 adversarial integration suite for name-invariant dependency graph, reverse edges, animation/authored/constraint/runtime ownership, authored-vs-evaluated reads, zero-side-effect preview, deterministic preview ids, atomic plan success/rollback/provenance, structured verification, browser/service/manifest/command drift, serialize/load rename/reorder invariance
- npm test: PASS
- npm run check: PASS
- Canonical service registry proof: VEYRA_SERVICE_DEFINITIONS is neutral metadata; createVeyraControlPlane mechanically asserts its callable names equal VEYRA_SERVICE_NAMES; manifest and browser consume the same registry/services
- Dependency graph proof: graph derives current structural facts from the M2 semantic index, adds property-address nodes and explicit typed forward/reverse edges with inverseType metadata, deterministic ordering and bounded traversal; display names are absent from graph identity
- Ownership/source proof: getOwnership separates authored/evaluated values, activeOwner, ownerStack, potentialControllers and writableSource; animation tracks, state-machine runtime-context requirements and rig constraints are reported without treating derived output as authored source
- Authored-vs-evaluated read proof: readVeyra/read returns authored/evaluated values, evaluated source, ownership/capabilities and optional direct dependency context for addresses; entity reads return bounded stable-ref views, advisory display metadata, semantics and dependency summary
- Preview zero-side-effect proof: previewVeyraCommand runs the actual dispatchVeyraCommand path on an isolated VeyraStore clone; valid/invalid previews leave source document/revision/history/selection untouched and deterministic command ids keep create previews aligned with canonical dispatch
- Atomic plan/rollback proof: dispatchVeyraPlan preflights every ordered step through the real dispatcher on an isolated sandbox and commits the validated final document once; any failed preflight leaves source document/revision/history unchanged; history keeps ordered planSteps provenance
- verifyChange proof: structured assertions cover entity presence/absence, authored/evaluated equality, semantics, dependency edges, ownership and document validity/no-dangling-ref validation with pass/fail evidence
- Browser/manifest/command drift proof: globalThis.veyra M3 methods are thin controlPlane calls; manifest controlPlane service names are generated from VEYRA_SERVICE_DEFINITIONS; command actions are generated from VEYRA_COMMAND_TABLE and now expose the actual command descriptor arg schema mechanically
- UI mutation parity audit: VEYRA_UI_MUTATION_PARITY_AUDIT explicitly records canonical control-plane browser services, continuous Store transaction gestures, direct Store CRUD paths with command equivalents, and temporary document-shell direct paths
- Name-independence proof: dependency graph excludes display names and adversarial tests randomize names plus reorder registries before exact graph comparison; ownership controller identity survives serialize/load + rename/reorder
- Suggestions added to `suggestions`: none
- Known limitations: atomic-plan result placeholders are intentionally unsupported; later steps must use explicit stable ids. Runtime ownership can identify active state-machine timeline contribution only when sufficient runtimeContext is supplied. UI continuous gestures remain on the canonical Store transaction port and several editor controls still call command-equivalent Store methods directly as documented by the parity audit.
```
