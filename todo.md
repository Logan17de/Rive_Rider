# Veyra — Agent TODO Queue

**Purpose:** turn `plan.md` into small, verifiable implementation tasks for coding agents.

**Authority:** `plan.md` defines the product direction. This file defines the current execution order.

## Status protocol

Use exactly these states:

- `[ ] READY` — agent may start this task only if it is the first READY task in the file.
- `[>] IN PROGRESS` — agent is actively implementing it.
- `[?] AWAITING VERIFICATION` — implementation is finished and the agent has stopped. Logan/ChatGPT must verify it.
- `[x] VERIFIED` — only Logan/ChatGPT may set this after independent code/test review.
- `[!] BLOCKED` — agent cannot proceed without violating scope or an architectural rule.
- `[-] LOCKED` — future task; do not implement yet.

## Mandatory instructions for every agent

These rules are part of every TODO below. Do not ignore them even if the implementation appears easier another way.

1. **Do one task only.** Work only on the first `[ ] READY` item. Do not implement LOCKED items, adjacent roadmap work, opportunistic refactors, or unrelated cleanup.
2. **Do not self-verify.** When the task satisfies its acceptance criteria, change it to `[?] AWAITING VERIFICATION`, add the required evidence to its Handoff block, commit, and stop. Never mark `[x] VERIFIED` yourself.
3. **Preserve the validation boundary.** Invalid documents/commands must fail before becoming committed state. Never silently repair malformed graph topology, dangling references, illegal transition conditions, unsupported property writes, or ambiguous AI targets.
4. **Names are display metadata, never identity.** Human-authored names may be duplicated, misleading, empty, localized, or changed at any time. Core lookup, references, graph relationships, AI control, tests, and persistence must use stable typed IDs/references. A human name may be returned as optional display context only.
5. **AI aliases must not rename human objects.** If an AI assigns `right_eye`, `mouth`, `idle_state`, etc., store that as semantic metadata/alias in an AI-owned namespace. Preserve the human's `name` field exactly unless the user explicitly asks to rename it.
6. **Fail closed on ambiguity.** Semantic resolution may use structure, type, hierarchy, geometry, position, symmetry, rig weights, constraints, animation ownership, listeners, state machines, data bindings, and AI semantic tags. If two candidates remain materially ambiguous, return an ambiguity result; do not guess from a convenient name.
7. **Stable references must survive cosmetic edits.** Renaming, hierarchy-row labels, graph-node labels, timeline labels, and other display changes must not break tracks, transitions, conditions, listeners, semantics, AI aliases, commands, or resolver results.
8. **Every new persistent entity needs AI visibility.** At minimum provide a stable typed reference, summary/manifest representation, capabilities, and read/query path. If the task introduces an editable entity, it also needs the canonical command/write path and undo/provenance coverage.
9. **Human UI and AI must share the same mutation model.** Do not create a second AI-only mutation implementation. Route both through the same VeyraStore/canonical command/property systems so validation, undo/redo, provenance, and side effects cannot drift.
10. **No UI-only features.** A feature is not complete if it works visually but cannot be discovered/read/controlled by AI. Likewise, an AI-only API is not complete if the corresponding product behavior cannot execute correctly.
11. **Do not mutate derived outputs.** Respect authored -> animation/data -> constraints/layout -> evaluated/rendered ownership. Write the highest-level authoritative source available; world transforms, solved poses, generated geometry, deformed vertices, render paths, etc. are read-back/diagnostic outputs unless explicitly defined otherwise.
12. **Keep capability declarations honest.** `capabilities.js`, `manifest.js`, command metadata, summaries, and runtime host-availability flags must reflect actual implementation. Never advertise a feature before the real path exists.
13. **Backward compatibility is explicit.** If persisted `.veyra` shape changes, add/adjust normalization/migration logic and tests. Existing supported documents must either load deterministically or fail with a precise intentional compatibility error; never reinterpret old data silently.
14. **Tests are part of the implementation.** Add positive, negative, boundary, persistence/round-trip, undo/redo, and rename/name-independence coverage appropriate to the task. Do not weaken, delete, skip, or rewrite an existing assertion merely to make tests pass.
15. **Run the complete verification commands.** Run `npm test` and `npm run check` before handoff, plus any task-specific tests. If either command cannot run in the agent environment, report that honestly in the Handoff instead of claiming success.
16. **Keep changes reviewable.** Prefer small modules and existing architectural seams. Avoid broad reformatting, generated-file churn, dependency changes, or moving unrelated files.
17. **No hidden fallback to names.** Search for and remove any name-based fallback introduced by your task. Friendly `nameOrId` APIs may remain only where explicitly documented for human convenience, but the canonical AI resolver/reference stored in documents must resolve to IDs before execution.
18. **Update docs only when the contract changes.** If the task changes the public document/manifest/command/AI contract, update the relevant documentation in the same commit. Do not rewrite `plan.md` unless the implementation proves the plan materially wrong.
19. **Do not claim Rive parity from one subfeature.** Use precise language such as `supported`, `partial`, or `not implemented`. Rive parity is reached only when the complete feature family and AI gates are satisfied.
20. **Stop after handoff.** Once the task is `[?] AWAITING VERIFICATION`, do not continue coding. Logan will ask ChatGPT to inspect the commit and either verify it, request corrections, or unlock the next TODO.

## Required handoff format

Every completed task must end with this filled-in block inside the task:

```text
Handoff
- Status: AWAITING VERIFICATION
- Commit: <sha>
- Changed files: <paths>
- Tests added/changed: <paths>
- npm test: PASS | FAIL | NOT RUN (<reason>)
- npm run check: PASS | FAIL | NOT RUN (<reason>)
- Task-specific checks: <commands/results>
- Persistence/migration impact: <none or exact description>
- AI/name-independence proof: <what was tested>
- Known limitations: <none or exact list>
```

A handoff that omits failures or limitations is incomplete.

---

# CURRENT MILESTONE — M0: Universal AI Identity

Goal: make Veyra's authored graph addressable by stable identity and semantics so AI never needs human object names to understand or control a file.

## TODO-001 — Universal identity inventory + stable IDs for current graph

**Status:** `[ ] READY`

### Objective

Establish a single audited identity contract for every persistent entity that exists **today** in the Veyra document model. Close the most serious current holes before building the semantic resolver.

### Current problems to fix

- `VEYRA_REFERENCE_KINDS` does not cover several existing authored entities such as state machines, transitions, conditions, listeners, tracks, and gradient stops.
- Keyframes currently do not have their own persistent IDs; their effective identity depends on timeline/track/frame, so moving a keyframe changes its address.
- Some entities are visible in summaries/manifests but do not have a canonical typed reference accepted across the system.
- Human names are still accepted as convenience fallback in a few runtime/state-machine paths; canonical document relationships must remain ID-backed.

### Required implementation

1. Inventory every persistent entity in the current model, including at least:
   - document
   - node
   - semantic record target
   - asset
   - fill/paint sub-entities where persistence requires independent identity
   - gradient stop
   - bone
   - mesh
   - mesh vertex
   - control
   - constraint
   - timeline
   - track
   - keyframe
   - state machine
   - machine input
   - machine state
   - machine transition
   - machine condition
   - listener
2. Define which of those require first-class typed refs and document the decision in code/docs. Do **not** invent standalone identity for a purely value-like object unless there is a real editing/reference need; explain such exclusions.
3. Extend the canonical reference system for all first-class current entities.
4. Give keyframes stable persistent IDs generated at creation and preserved when moved/edited/serialized.
5. Migrate/normalize existing keyframes without IDs deterministically enough for one load/round-trip. Do not regenerate a new ID every normalization pass.
6. Replace manifest-only synthetic keyframe identity with the real persistent keyframe ref.
7. Ensure track, transition, condition, listener, state-machine and gradient-stop refs appear canonically wherever those entities are exposed to AI.
8. Add helper lookup functions where needed so downstream code does not repeatedly scan by ad-hoc name/frame tuples.
9. Keep all existing valid `.veyra` documents loadable.
10. Update reference/manifest/document contract docs affected by the change.

### Explicit non-goals

- Do not build semantic inference yet.
- Do not add AI aliases yet.
- Do not add Rive features that Veyra does not already model.
- Do not build View Models, layouts, components, text, scripting, or state-machine UI in this task.
- Do not refactor the entire renderer/editor.

### Acceptance criteria

- Every first-class persistent entity that exists today has an explicit stable identity strategy.
- A keyframe keeps the exact same ID after changing frame position.
- Serialize -> parse/normalize -> serialize preserves all existing first-class IDs.
- Old keyframes without IDs gain IDs and retain them after the first normalized round-trip.
- Duplicate IDs in a scope are rejected with precise errors.
- No transition/condition/listener/track relationship depends on display names.
- The project manifest exposes real typed refs for the newly first-class entities.
- Existing editor behavior remains green.
- `npm test` passes.
- `npm run check` passes.

### Mandatory tests

Add a dedicated identity/reference test suite (or clearly scoped additions) proving at least:

1. keyframe ID survives move;
2. keyframe ID survives serialization round-trip;
3. legacy keyframe receives an ID and the normalized ID is stable on the next round-trip;
4. timeline rename does not change track/keyframe identity;
5. machine/state/input rename does not change transition/condition identity or references;
6. node rename does not change listener target identity;
7. duplicate first-class IDs are rejected;
8. manifest refs resolve back to the correct entities without consulting names.

### Handoff

```text
Handoff
- Status:
- Commit:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Task-specific checks:
- Persistence/migration impact:
- AI/name-independence proof:
- Known limitations:
```

---

## TODO-002 — Universal semantic metadata registry

**Status:** `[-] LOCKED`

Unlock only after TODO-001 is VERIFIED.

### Objective

Replace node-only semantics with a universal semantic metadata layer that can annotate any first-class Veyra entity without changing its human-authored name.

### Planned contract

Each semantic entry must be ID/ref-targeted and support, at minimum:

- `target` — stable typed reference
- `canonicalRole` — optional machine-oriented role such as `character.eye`
- `description`
- `tags[]`
- `aliases[]` with namespace/owner (for example AI-owned aliases)
- `relations[]` using typed target refs
- `source` / provenance (`user`, `ai`, `import`, `system`)
- optional confidence/evidence for inferred metadata

Human names remain separate display metadata.

### Required behavior

- Semantic metadata can target node, rig, animation, machine and interaction entities from TODO-001.
- AI aliases never overwrite `name`.
- Alias namespaces can coexist (`ai:default`, `user`, import source, etc.).
- Delete/cascade logic cannot leave dangling semantic relationships silently.
- Summary + manifest expose semantics without requiring display names.
- Semantic edits use canonical commands/store transactions and are undoable.
- Rename torture tests pass.

---

## TODO-003 — Name-independent entity resolver

**Status:** `[-] LOCKED`

Unlock only after TODO-002 is VERIFIED.

### Objective

Create the canonical AI entity resolver. Given semantic intent such as `right eye`, `hand control`, `idle state`, or `hover listener`, resolve to stable refs using graph evidence instead of human names.

### Required resolution evidence

Rank candidates using available structural facts such as:

- typed entity kind/capabilities
- semantic roles/tags/AI aliases
- hierarchy and parent/child relationships
- geometry/type/bounds/relative position
- left/right symmetry and pairing
- rig weights/bone/control/constraint topology
- animation track ownership
- timeline/state-machine relationships
- listener targets/actions
- future data-binding/component/layout relationships when they exist

### Hard rules

- Human names are optional hints only when the caller explicitly supplies a human name.
- Resolver output always returns stable typed refs.
- Ambiguous matches return ranked candidates + evidence and **do not execute a mutation**.
- Resolver explains why a candidate was selected.
- Resolver behavior is deterministic for the same document + query/options.

### Mandatory adversarial tests

- Every object has the same name (`Layer`).
- Names are empty.
- Names are random UUID-like strings.
- Right eye is deliberately named `left_eye`.
- Left/right objects are renamed/swapped after semantics were learned.
- Two truly symmetric unlabeled candidates return ambiguity instead of guessing.

---

## TODO-004 — AI graph/ownership/dependency summary

**Status:** `[-] LOCKED`

Unlock only after TODO-003 is VERIFIED.

### Objective

Give AI a compact graph explaining what each entity is connected to and who owns/drives each mutable property.

### Required graph edges

Include current relationships such as:

- parent/child
- bone hierarchy
- mesh -> weighted bones
- constraint -> controlled/target entities
- timeline -> track -> property target
- machine -> states -> timelines
- transition -> states/conditions
- condition -> machine input
- listener -> target -> action -> timeline/machine/input
- semantic relations

Also expose authored vs animated vs constrained/evaluated ownership so AI can choose the highest-level authoritative control instead of mutating a derived result.

---

## TODO-005 — Unified AI query/command contract

**Status:** `[-] LOCKED`

Unlock only after TODO-004 is VERIFIED.

### Objective

Make the manifest + command bus sufficient for an AI to inspect, resolve, plan, mutate, verify, and undo every currently supported Veyra feature without using `globalThis.veyra` ad-hoc methods or names as the primary API.

### Required flow

`inspect -> resolve -> capability check -> ownership check -> plan -> validate -> apply -> read back -> verify`

Every mutation must retain command provenance (`source: ai`) and normal undo/redo behavior.

---

# M1 — Close the current interaction loop

## TODO-006 — Machine-listener runtime bridge

**Status:** `[-] LOCKED`

Wire pointer listener `setInput`/`fire` intents to persistent machine runtimes and visible evaluated playback. Add exact end-to-end tests.

## TODO-007 — Visual state-machine editor

**Status:** `[-] LOCKED`

Build machine/input/state/transition/condition graph authoring UI using the same store/commands AI uses. Graph labels may be arbitrary; graph identity must remain ID-based.

## TODO-008 — Shape-accurate interaction hit testing

**Status:** `[-] LOCKED`

Replace approximate bound hits with correct polygon/star/path fill/stroke hit testing and transformed/deformed coverage.

---

# M2 — Rive visual-authoring parity foundations

## TODO-009 — Text system

**Status:** `[-] LOCKED`

Text nodes, font assets, runs/styles/alignment/wrapping, animation/data-binding-ready properties, renderer/editor/AI parity.

## TODO-010 — Image asset nodes

**Status:** `[-] LOCKED`

Image import/embedding/reference, fit/alignment/sampling/origin, image meshes where appropriate, editor + AI parity.

## TODO-011 — Complete paint/stroke model

**Status:** `[-] LOCKED`

Stroke joins/caps, transform-affects-stroke, gradient strokes, fill rules, paint visibility/opacity and missing Rive paint semantics.

## TODO-012 — Clipping, masks and blend modes

**Status:** `[-] LOCKED`

Clipping shapes, alpha masking, nested clips/masks and blend modes with correct render/evaluation/hit-testing semantics.

## TODO-013 — Path effects

**Status:** `[-] LOCKED`

Trim path, dash path and other Rive-compatible path-effect primitives, with authoritative-source and generated-output boundaries explicit to AI.

---

# M3 — Rive component/layout/data architecture

## TODO-014 — Components / nested artboards / instances

**Status:** `[-] LOCKED`

Reusable components, nested artboards, instances, overrides and stable instance/entity identity.

## TODO-015 — Layout system

**Status:** `[-] LOCKED`

Responsive layout/container sizing/alignment/gap/padding behavior, layout-owned property semantics, runtime/editor/AI parity.

## TODO-016 — N-Slicing and responsive asset behavior

**Status:** `[-] LOCKED`

Rive-compatible responsive image/vector slicing behavior integrated with layout/components.

## TODO-017 — View Models and typed data

**Status:** `[-] LOCKED`

First-class View Models with Number, Boolean, Trigger, String, Enum, Color, nested View Model, List, Image and Artboard values.

## TODO-018 — Data Binding and converters

**Status:** `[-] LOCKED`

Bind View Model data to properties, state/interaction behavior and nested instances; add converters/transforms and ownership graph support.

## TODO-019 — Lists / repeated data-driven content

**Status:** `[-] LOCKED`

Data-driven repeated content/list sources with deterministic instance identity and AI readability.

---

# M4 — Rive animation/state-machine parity

## TODO-020 — Timeline power-user editing

**Status:** `[-] LOCKED`

Multi-select, copy/paste, box selection, grouped tracks, easing graph/editor, work-area handles and other parity UX while retaining stable keyframe identity.

## TODO-021 — Advanced state-machine states and layers

**Status:** `[-] LOCKED`

Entry/Exit/Any states, layers, 1D blend, additive/direct blend and layer mixing/ownership.

## TODO-022 — Advanced transition behavior

**Status:** `[-] LOCKED`

Exit time, pause/continue semantics, interpolation/transition behavior, actions/events, randomized exits and complete transition authoring parity.

## TODO-023 — Advanced controls/constraints

**Status:** `[-] LOCKED`

Additional Rive control families such as joysticks, solos and any remaining constraint/control behavior required by the parity matrix.

---

# M5 — Scripting, procedural and GPU features

## TODO-024 — Script model and Luau-compatible authoring surface

**Status:** `[-] LOCKED`

Script assets/protocols/input-output contracts, editor/AI inspection and safe execution boundary.

## TODO-025 — Scripted path/procedural behavior

**Status:** `[-] LOCKED`

Script-driven path/effect behavior with generated-output boundaries and deterministic AI-readable inputs.

## TODO-026 — WGSL / GPU shader authoring surface

**Status:** `[-] LOCKED`

Shader assets/inputs/validation/editor/AI inspection and runtime integration where compatible with the Rive target feature set.

---

# M6 — AI-native creation layer

## TODO-027 — Declarative `buildScene(sceneSpec)`

**Status:** `[-] LOCKED`

Batch scene construction through canonical commands with validation/preview/rollback.

## TODO-028 — Auto-semantic tagging

**Status:** `[-] LOCKED`

Infer AI aliases/roles/relations from graph + visual evidence, record confidence/evidence, and never overwrite human names.

## TODO-029 — Auto-rigging

**Status:** `[-] LOCKED`

Generate bones/controls/constraints/weights from scene structure through canonical commands and verify deformation.

## TODO-030 — Auto-animation and interaction authoring

**Status:** `[-] LOCKED`

Generate timelines/state machines/listeners/data bindings from intent, then execute and verify them.

## TODO-031 — Natural-language plan/preview/apply/verify loop

**Status:** `[-] LOCKED`

Natural-language controller that resolves semantic targets, checks ownership/conflicts, previews, applies, reads back, visually/structurally verifies and repairs.

---

# M7 — Runtime/export parity

## TODO-032 — Dedicated high-performance Veyra player

**Status:** `[-] LOCKED`

Separate lightweight playback/runtime layer from the editor while preserving complete feature semantics.

## TODO-033 — Compact runtime/binary export

**Status:** `[-] LOCKED`

Deterministic runtime-focused format separate from editable `.veyra`, with versioning/migration contracts.

## TODO-034 — Framework/runtime integrations

**Status:** `[-] LOCKED`

React/web integration first, then additional supported platform runtimes according to parity requirements.

## TODO-035 — Additional exports/imports

**Status:** `[-] LOCKED`

SVG/Lottie-compatible paths where semantically possible, image/video/frame export, and required asset import workflows with explicit lossiness reporting.

---

# M8 — Collaboration/product infrastructure

## TODO-036 — Project/version history

**Status:** `[-] LOCKED`

Persistent revision history beyond local undo/redo.

## TODO-037 — Shared libraries/assets/components

**Status:** `[-] LOCKED`

Reusable shared components/assets with stable cross-project identity/versioning.

## TODO-038 — Multi-user collaboration

**Status:** `[-] LOCKED`

CRDT/operation model, presence, conflicts and permissions only after single-user document/runtime contracts are stable.

---

# Verification rule for unlocking tasks

After an agent submits a TODO:

1. Logan asks ChatGPT to verify it.
2. ChatGPT inspects the actual commit/diff and affected architecture.
3. ChatGPT checks task acceptance criteria and agent evidence.
4. ChatGPT checks tests/CI independently where possible.
5. ChatGPT specifically audits for hidden name dependence and manifest/AI drift.
6. If incomplete, the same TODO remains active and receives a **Verification fixes required** section. The next TODO stays LOCKED.
7. If correct, ChatGPT marks the task `[x] VERIFIED`, changes exactly the next task from `[-] LOCKED` to `[ ] READY`, and may refine that next task based on what the implementation revealed.

**Never unlock multiple implementation TODOs at once.** This queue is intentionally verifier-gated so architectural mistakes do not compound across agents.
