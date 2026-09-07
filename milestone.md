# Veyra — Agent Milestone Queue

**Purpose:** increase `plan.md` completion one verified step at a time.

**Rule:** this file contains **one current milestone** and **one active TODO only**. Do not pre-create future TODOs. After the current TODO is completed, Logan/ChatGPT verifies the implementation and then adds the next TODO under the same milestone. When the milestone acceptance criteria are fully satisfied, Logan/ChatGPT closes the milestone and creates the next milestone.

`plan.md` remains the product roadmap and source of truth. `todo.md` is only the immediate execution queue.

---

## Agent workflow

Use these states:

- `[ ] READY` — agent may implement this TODO.
- `[>] IN PROGRESS` — agent is working on it.
- `[?] AWAITING VERIFICATION` — agent believes the TODO is complete and must stop.
- `[x] VERIFIED` — only Logan/ChatGPT may set this after independent review.
- `[!] BLOCKED` — task cannot be completed safely within scope.

### Mandatory instructions

1. **Implement only the TODO currently present in this file.** Do not start the next logical task, even if it appears obvious.
2. **Do not self-verify.** When finished, set the TODO to `[?] AWAITING VERIFICATION`, fill the Handoff section, commit, and stop.
3. **Do not add the next TODO yourself.** Logan/ChatGPT will inspect the code and tests first. Only after verification will the next TODO be written.
4. **Preserve the validation boundary.** Invalid documents, references, commands, graph topology, conditions, or AI targets must fail before becoming committed state. Never silently repair dangerous malformed input.
5. **Names are display metadata, not identity.** Human names may be duplicate, empty, misleading, localized, or changed. Persistence, graph relationships, commands, AI control, and tests must use stable typed IDs/references.
6. **AI-owned names never overwrite human names.** Future AI aliases/tags such as `right_eye` must live in semantic metadata/AI namespaces rather than changing the user's `name` field.
7. **Fail closed on ambiguity.** AI must never guess an entity from a convenient human name when structural/semantic evidence is insufficient.
8. **Human UI and AI must share the same mutation system.** Do not create a second AI-only implementation. Use canonical Store/command/property paths.
9. **Every persistent editable feature must eventually be AI-readable.** Stable reference, summary/manifest visibility, capabilities, query/read path, and canonical mutation path are required for feature completion.
10. **Do not mutate derived outputs.** Respect authored -> animation/data -> constraints/layout -> evaluated/rendered ownership.
11. **Keep capability declarations honest.** Manifest/capability flags must describe what actually works.
12. **Persisted schema changes require compatibility handling and tests.** Existing supported `.veyra` documents must continue to load deterministically or fail with an intentional precise error.
13. **Tests are implementation work.** Add positive, negative, boundary, round-trip, undo/redo, and name-independence tests where relevant. Never weaken existing assertions just to obtain green tests.
14. Run `npm test` and `npm run check` before handoff. Report failures or inability to run them truthfully.
15. Avoid unrelated refactors, dependency churn, broad reformatting, or roadmap work outside the TODO.
16. If the public document, command, manifest, or AI contract changes, update the relevant documentation in the same implementation.
17. Once status becomes `[?] AWAITING VERIFICATION`, **stop coding**.

### Required handoff

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

---

# MILESTONE M0 — AI-Native Identity & Understanding Foundation

**Milestone status:** ACTIVE

### Milestone goal

Make the complete Veyra graph understandable and addressable by AI **without depending on human-authored names**.

An AI should ultimately be able to look at an arbitrary project where objects are named things like `Layer 47`, `asdf`, `thing`, duplicate names, misleading names, or no names at all, and still reason about the correct objects using stable identity, semantic metadata, structure, relationships, geometry, rigging, animation ownership, interactions, and other graph evidence.

AI may later assign its own aliases/tags such as `right_eye`, `mouth`, `idle_state`, or `hand_target`, but those aliases are separate from human display names and resolve back to immutable Veyra references.

### Milestone completion criteria

This milestone remains open until the foundation supports, at minimum:

- stable typed identity for all first-class authored entities;
- stable identity across rename/edit/save/load operations;
- semantic metadata that can target all relevant entity kinds, not only scene nodes;
- AI-owned aliases/tags without renaming user objects;
- a deterministic name-independent entity resolver;
- ambiguity reporting instead of guessing;
- graph relationships and ownership/dependency information AI can inspect;
- a canonical AI query/control surface using the same commands as the human editor;
- adversarial tests using duplicate, random, empty, and deliberately misleading names.

**Important:** these are milestone-level outcomes, **not permission to implement all of them now**. Only the TODO below is currently authorized.

---

## TODO M0.1 — Stable Identity Contract for the Existing Graph

**Status:** `[?] AWAITING VERIFICATION`

### Objective

Establish a complete stable-identity contract for every first-class persistent entity that exists in Veyra **today**, before semantic inference or advanced AI resolution is built.

### Current gaps observed in the code

- `VEYRA_REFERENCE_KINDS` does not currently represent every authored graph entity exposed elsewhere in the model/manifest.
- Keyframes do not have their own persistent IDs; their effective identity depends on timeline/track/frame, so moving one can change how it is identified.
- Several graph entities are exposed to AI but lack a single canonical typed-reference contract across the system.
- Some friendly APIs accept names for convenience; persisted relationships and canonical AI references must remain ID-backed.

### Required implementation

1. Audit every persistent entity currently represented by the Veyra document model, including at least:
   - document
   - node
   - asset
   - gradient stop / independently editable paint sub-entities where appropriate
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
   - existing semantic-record targets
2. Decide explicitly which entities require first-class typed references. Do not invent IDs for purely value-like objects without an editing/reference need; document exclusions.
3. Extend the canonical reference system for every current first-class entity.
4. Give keyframes stable persistent IDs at creation time.
5. Preserve keyframe IDs when frame/easing/value changes or when keyframes move.
6. Normalize/migrate legacy keyframes without IDs so the ID is created once and remains stable after the first normalized save/load round-trip.
7. Replace synthetic manifest-only keyframe identity with the actual persistent keyframe reference.
8. Ensure state machines, transitions, conditions, listeners, tracks, gradient stops, and other newly first-class entities expose canonical typed refs wherever AI can inspect them.
9. Add lookup helpers where needed so downstream code does not recreate identity using names or ad-hoc frame tuples.
10. Keep all currently valid supported `.veyra` documents loadable.
11. Update affected reference/manifest/document contract documentation.

### Explicit non-goals

Do **not** implement yet:

- semantic inference;
- universal semantic metadata;
- AI aliases;
- the semantic entity resolver;
- ownership/dependency graph work beyond what identity requires;
- new Rive feature families;
- View Models, layouts, components, text, scripting, or state-machine UI.

Those may become later TODOs, but only after this TODO is independently verified.

### Acceptance criteria

- Every current first-class persistent entity has an explicit stable identity strategy.
- Keyframes have real persistent IDs.
- Moving a keyframe preserves its exact ID.
- Serialize -> normalize/load -> serialize preserves existing first-class IDs.
- A legacy keyframe without an ID gains one and retains it on the next round-trip.
- Duplicate IDs are rejected in the appropriate scope with precise errors.
- Timeline/machine/state/input/node renames do not change related entity identities or stored graph references.
- Manifest refs for covered entities resolve to the correct entity without consulting human names.
- Existing editor behavior remains functional.
- `npm test` passes.
- `npm run check` passes.

### Mandatory tests

Prove at least:

1. keyframe ID survives move;
2. keyframe ID survives serialization round-trip;
3. legacy keyframe receives a stable ID after first normalization;
4. timeline rename does not alter track/keyframe identity;
5. machine/state/input rename does not alter transition/condition identity or references;
6. node rename does not alter listener target identity;
7. duplicate first-class IDs are rejected;
8. manifest typed refs resolve without name lookup.

### Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Commit: d5b4e73 (identity) + 246daea (pathVertexById correction) + 358da30 (handoff)
- Changed files: docs/plan.md; src/veyra/manifest.js; src/veyra/model.js; src/veyra/references.js; src/veyra/store.js; src/veyra/summary.js; tests/fixtures/veyra/animated.veyra; tests/veyra-manifest.test.mjs; tests/veyra-identity.test.mjs; milestone.md (handoff status)
- Tests added/changed: tests/veyra-identity.test.mjs plus persistent-ID fixture/manifest assertions
- npm test: PASS — 21 of 21 suites passed
- npm run check: PASS — 30 of 30 source files passed syntax check
- Task-specific checks: keyframe create/edit/move/round-trip stability; deterministic legacy migration; timeline and machine/state/input rename stability; node listener-target stability; duplicate node/keyframe/entity rejection; manifest typed refs resolve by ID; gradient-stop/path-vertex/mesh-vertex lookup and refs; `pathVertexById` regression
- Persistence/migration impact: normalized legacy keyframes receive deterministic `keyframe_<trackId>_<index>` IDs; existing IDs are preserved through normalize/save/load and same-frame setKeyframe edits. Existing supported documents remain loadable; canonical JSON gains keyframe IDs.
- AI/name-independence proof: manifest refs use persistent typed IDs for document, timeline, track, keyframe, state machine, machine entities, listeners, geometry vertices, and gradient stops; rename tests resolve graph relationships without human-name lookup.
- Known limitations: value-only transforms/geometry/colors/condition values remain owner-addressed; semantic inference, aliases, universal metadata, resolver, dependency graph, and editor UI remain out of scope. Independent verification has not yet run.
```

---

## What happens next

Nothing is pre-assigned.

When **M0.1** is completed, Logan tells ChatGPT to verify it. ChatGPT will inspect the actual implementation and tests against `plan.md` and this milestone. Then exactly one of these happens:

- verification fails -> M0.1 remains active and exact corrections are requested;
- verification passes but M0 is incomplete -> M0.1 becomes VERIFIED and ChatGPT adds **one new M0 TODO** based on the remaining highest-priority gap;
- verification proves all M0 criteria are satisfied -> M0 closes and ChatGPT creates the next milestone with its first TODO.
