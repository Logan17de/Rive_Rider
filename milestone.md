# Veyra — Current Milestone

`plan.md` is the product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. If an agent discovers useful follow-up work, append it to `suggestions` instead of expanding this milestone.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary: malformed documents, dangling refs, illegal semantic relations, unsupported writes, and ambiguous targets must fail before committed state.
2. Human names are display metadata, never identity. Stable typed refs are authoritative.
3. AI aliases/tags must never rename user objects.
4. Human UI and AI must share the same Store/command/property mutation paths; do not add an AI-only mutation implementation.
5. Persisted schema changes require deterministic migration/normalization and round-trip tests.
6. Every new persistent editable entity must be machine-readable through summary/manifest/query surfaces and must have an honest capability contract.
7. Do not mutate derived/evaluated outputs as authored source state.
8. Add positive, negative, compatibility, undo/redo, round-trip, and name-independence tests where relevant.
9. Do not weaken existing tests or capability declarations to make the milestone pass.
10. Run `npm test` and `npm run check` before handoff.
11. Keep unrelated refactors, dependency churn, geometry work, headless/CLI work, and future roadmap features out of this milestone.
12. Follow-up ideas belong in `suggestions`.

---

# MILESTONE M1 — Universal Semantic Metadata Layer

**Status:** `AWAITING VERIFICATION`

## Goal

Replace Veyra's current node-only semantic annotations with a universal, typed semantic layer that can describe **any current first-class entity** without depending on human-authored names.

The result must let AI attach its own stable understanding—roles, aliases, tags, relations, provenance, and confidence—to nodes, rig entities, animation entities, state-machine entities, listeners, geometry sub-entities, assets, and other current typed references while preserving the user's original names exactly.

This milestone is the semantic foundation required before a reliable name-independent resolver can be built.

## Why this milestone is next

Stable typed identity is now implemented and verified for the current graph, including real persistent keyframe IDs and typed refs for animation, machine, listener, geometry, and paint sub-entities.

The remaining semantic layer is still node-specific: `createSemanticRecord()` creates a node ref, `normalizeDocument()` requires semantic targets to be nodes, and `semanticFor()` accepts only a node ID. The next milestone must remove that architectural restriction rather than building resolver logic on top of it.

---

## Task 1 — Universal semantic-record identity and target contract

Replace the node-specific semantic record with a first-class persistent semantic record.

Required minimum shape:

```js
{
  id: 'semantic_...',
  target: { kind: '<typed-kind>', id: '<stable-id>' },
  canonicalRole: '',
  description: '',
  tags: [],
  aliases: [],
  relations: [],
  provenance: {},
  status: 'confirmed | inferred | rejected | stale'
}
```

Requirements:

- semantic records have their own stable persistent IDs;
- `target` accepts any currently supported first-class typed reference whose entity exists;
- target validation is generic and kind-aware;
- missing/wrong-kind targets fail precisely;
- duplicate semantic-record IDs are rejected;
- multiple semantic records may target the same entity when their namespaces/provenance differ;
- old node semantics remain loadable through deterministic migration.

## Task 2 — AI aliases, roles, tags, provenance, confidence

Support machine-owned semantic metadata without touching human display names.

At minimum support:

- `canonicalRole`;
- `description`;
- `tags[]`;
- `aliases[]` with namespace/owner and value;
- provenance/source such as `user`, `ai`, `import`, `system`;
- optional agent identifier;
- optional confidence;
- optional evidence/basis list;
- semantic status: `confirmed`, `inferred`, `rejected`, `stale`.

Rules:

- alias namespaces must coexist without overwriting one another;
- AI aliases never write to entity `name` fields;
- tags/aliases are normalized deterministically;
- invalid confidence/status/alias records fail validation rather than being silently repaired.

## Task 3 — Typed semantic relations

Add semantic relations between entities using typed refs.

Example:

```js
{
  predicate: 'part_of',
  target: { kind: 'node', id: 'node_face' }
}
```

Requirements:

- relation targets must resolve to real current entities;
- dangling relation refs are rejected or removed only through an explicit documented cascade operation;
- predicates are normalized deterministically;
- relations survive rename/save/load;
- deleting an entity cannot silently leave corrupted semantic relations.

Do not build inference logic in this milestone; only the storage/validation/control contract.

## Task 4 — Generic semantic lookup and canonical editing path

Replace node-only helpers such as `semanticFor(document, nodeId, ...)` with generic typed-reference APIs.

Provide a clear canonical way to:

- find semantic records by record ID;
- find semantics for a typed target ref;
- create semantic records;
- update roles/descriptions/tags/aliases/provenance/status;
- add/remove semantic relations;
- delete semantic records.

All mutations must use the existing canonical Store/command/transaction architecture so they participate in:

- validation;
- undo/redo;
- command provenance;
- AI/human parity.

Do not introduce a separate AI semantic mutation backend.

## Task 5 — Manifest, summary, capabilities, and query visibility

Expose universal semantics to AI through the existing machine-readable surfaces.

Requirements:

- summary/manifest include semantic-record refs and typed target refs;
- semantics are visible for non-node entities, including representative rig, timeline/keyframe, state-machine/condition, listener, asset, and geometry entities;
- capability declarations accurately describe which semantic fields/actions are readable/writable;
- semantic records can be located without consulting entity display names;
- no capability may claim universal semantics until its real path exists.

## Task 6 — Backward compatibility and lifecycle behavior

Migrate the existing semantic format safely.

Existing records like:

```js
{
  target: { kind: 'node', id: 'node_...' },
  role: '...',
  description: '...',
  tags: []
}
```

must continue to load deterministically.

Define and test:

- legacy `role` -> new canonical role behavior;
- deterministic creation of missing semantic-record IDs;
- repeated normalization does not regenerate IDs;
- entity deletion behavior;
- duplicate/copy behavior where applicable;
- round-trip serialization stability.

Do not silently reinterpret malformed semantic data.

## Task 7 — Adversarial name-independence and validation tests

Add a dedicated semantic test suite proving at least:

1. semantics can target node, bone/control/constraint, timeline/track/keyframe, state machine/state/input/transition/condition, listener, asset, mesh/path vertex, and gradient stop refs where supported;
2. renaming a target does not change semantic targeting;
3. duplicate human names do not change semantic targeting;
4. empty human names do not change semantic targeting;
5. deliberately misleading names do not override typed semantic targets;
6. AI aliases never mutate human `name` fields;
7. multiple alias namespaces coexist;
8. missing/wrong-kind target refs fail precisely;
9. dangling relation refs fail precisely;
10. legacy node semantic records migrate and remain stable on the next round-trip;
11. semantic edits are undoable/redoable through the canonical mutation path;
12. manifest/summary semantic refs resolve without name lookup.

---

## Explicit non-goals

Do not implement in this milestone:

- semantic inference from geometry/rigging/animation;
- natural-language entity resolution;
- candidate ranking or ambiguity scoring;
- headless Node API / CLI work from `suggestions`;
- Bézier/path hit-testing;
- path-topology commands;
- pointer-events expansion;
- state-machine feature expansion;
- View Models/Data Binding;
- components/layout/text/scripting/new Rive feature families.

---

## Acceptance criteria

The milestone is complete only when:

- semantics are no longer node-only;
- every current first-class typed entity kind has a defined semantic-target policy;
- semantic records have stable IDs;
- AI aliases/tags/roles/provenance/status can be stored without changing human names;
- typed semantic relations validate correctly;
- legacy node semantics migrate deterministically;
- semantic CRUD uses canonical Store/command paths with undo/redo;
- summary/manifest/capabilities expose the implemented semantic contract honestly;
- rename/duplicate/empty/misleading-name tests prove name independence;
- all new and existing tests pass;
- `npm test` passes;
- `npm run check` passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: Implement M1 universal semantic metadata [m1-applied]
- Changed files: src/veyra/semantics.js, references.js, model.js, store.js, capabilities.js, summary.js, manifest.js, tests/veyra-semantics.test.mjs, milestone.md
- Tests added/changed: tests/veyra-semantics.test.mjs (typed targets, validation, aliases/provenance/status, relations, migration, lifecycle cascade, undo/redo, manifest/summary, name independence)
- npm test: PASS (required before commit by the M1 workflow)
- npm run check: PASS (required before commit by the M1 workflow)
- Task-specific checks: universal typed target policy, stable semantic IDs, multiple records per target, strict alias/provenance/status validation, typed relations, canonical Store CRUD, explicit deletion cascade
- Persistence/migration impact: legacy node semantic role migrates deterministically to canonicalRole; missing semantic IDs are deterministic and stable after first round-trip; new aliases/relations/provenance/status persist canonically
- AI/name-independence proof: dedicated suite renames targets to duplicate/empty/misleading names and verifies typed semantic refs remain unchanged; AI aliases never write entity name fields
- Suggestions added to `suggestions`: none
- Known limitations: paint semantic refs use the stable owning node/mesh id; inference, natural-language resolution, ranking, and other explicit non-goals remain out of scope
```
