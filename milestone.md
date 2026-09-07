# Veyra — Current Milestone

`plan.md` is the product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. If an agent discovers useful follow-up work, append it to `suggestions` instead of expanding this milestone.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary: malformed documents, dangling refs, illegal semantic relations, unsupported writes, and ambiguous targets must fail before committed state.
2. Human names are display metadata, never identity. Stable typed refs are authoritative.
3. AI aliases/tags must never rename user objects.
4. Human UI and AI must share the same Store **and JSON-safe command bus** mutation path. Do not advertise an AI capability that the canonical dispatcher cannot execute.
5. Persisted schema/reference changes require deterministic migration/normalization and round-trip tests.
6. Every machine-readable capability declaration must match the real executable path.
7. Do not weaken existing tests or capability declarations to obtain green tests.
8. Run `npm test` and `npm run check` before handoff.
9. Follow-up ideas belong in `suggestions`.

---

# MILESTONE M1 — Universal Semantic Metadata Layer — CORRECTION PASS

**Status:** `AWAITING VERIFICATION`

## Verification result

The main M1 implementation is accepted in principle:

- semantic records now have persistent IDs;
- typed targets cover the existing graph;
- aliases, roles, tags, provenance, confidence, status, and typed relations are implemented;
- legacy node semantics migrate deterministically;
- Store-level semantic CRUD participates in validation and undo/redo;
- summary/manifest visibility and adversarial name-independence tests exist;
- latest main-branch CI is green.

Do **not** rework those completed parts unless needed by the corrections below.

The milestone cannot be marked VERIFIED yet because independent review found contract mismatches that affect AI control and stable identity.

---

## Correction 1 — Put semantic CRUD on the canonical JSON-safe command bus

### Problem

`VeyraStore` now exposes semantic mutations, but `src/veyra/commands.js` does not expose corresponding dispatch actions. At the same time the project manifest advertises semantic transactional writes.

This creates exactly the drift the architecture is intended to prevent: direct JavaScript callers can mutate semantics, while an AI using the canonical JSON-safe command/manifest path cannot execute the advertised actions.

### Required implementation

Add first-class command-bus actions mapping **1:1** to the existing Store methods:

- `addSemantic`
- `updateSemantic`
- `removeSemantic`
- `addSemanticRelation`
- `removeSemanticRelation`

Requirements:

- no mutation logic duplicated in `commands.js`;
- typed target refs and relation refs cross the JSON boundary safely;
- command provenance (`source: ai`, labels, etc.) is forwarded to the Store;
- invalid references/patches fail before committed state;
- command table, generated manifest action catalog, and advertised semantic capabilities agree mechanically;
- semantic actions appear in the same canonical action surface an agent uses for other editor mutations.

### Mandatory tests

Prove through `dispatchVeyraCommand`, not direct Store calls only, that:

1. an AI command can add a semantic record to a non-node typed target;
2. an AI command can update aliases/role/status without changing the target's human name;
3. an AI command can add/remove a typed semantic relation;
4. an AI command can remove a semantic record;
5. undo/redo works after dispatched semantic mutations;
6. invalid typed refs/invalid semantic patches return failure and leave document + revision/history unchanged;
7. the manifest/action catalog advertises exactly the semantic actions that are actually dispatchable.

---

## Correction 2 — Make `paint` semantic identity unambiguous

### Problem

Current semantic `paint` refs use this shape:

```js
{ kind: 'paint', id: <owning-node-or-mesh-id> }
```

`node` IDs and `mesh` IDs are different typed namespaces, so a node and a mesh may legally share the same ID. With the current `paint` representation, both become the same `paint:<id>` reference. `entityByReference()` then resolves one by search order rather than by stable identity.

That violates the name-independent/stable-reference contract.

### Required implementation

Define one canonical, persisted or owner-qualified paint identity that is **globally unambiguous** for semantic targeting.

Acceptable approaches include:

- real persistent paint IDs; or
- an owner-qualified paint reference/address that encodes the owning typed ref without relying on display names.

Do not simply prohibit node/mesh IDs from matching each other; those are separate typed namespaces and cross-kind ID equality should remain legal.

Update all affected reference, normalization, semantic lookup, summary/manifest, lifecycle-cascade, and compatibility paths consistently.

### Mandatory tests

Create a document where:

- a node has ID `shared_owner`;
- a mesh also has ID `shared_owner`;
- both have paints.

Then prove:

1. each paint has a distinct stable semantic target;
2. semantics resolve to the correct paint deterministically;
3. save/load preserves the distinction;
4. deleting one owner cascades only semantics/relations for that owner's paint;
5. renaming either owner changes nothing;
6. manifest/summary refs remain unambiguous.

---

## Correction 3 — Make the `semanticRecord` target policy explicit and enforced

### Problem

`semanticRecord` is now a typed reference kind. The capability contract excludes it from semantic target kinds, but generic target normalization/entity lookup can still accept a `semanticRecord` target.

The declared contract and executable behavior must not disagree.

### Required implementation

Choose and enforce exactly one policy:

- **Supported:** semantic records may themselves be semantic targets; expose this in capabilities/manifest and add lifecycle/cycle tests; or
- **Unsupported:** reject `semanticRecord` as a semantic-record `target` with a precise validation error while still allowing semantic relations to reference semantic records if that remains intentional.

The chosen policy must be identical in:

- creation/normalization;
- validation;
- capabilities;
- manifest/summary contract;
- tests/documentation.

---

## Acceptance criteria

M1 is complete only when all of the following are true:

- the original M1 semantic tests remain green;
- semantic CRUD is dispatchable through the canonical JSON-safe command bus;
- command-bus actions and manifest semantic-write capabilities cannot drift;
- `paint` semantic identity is unambiguous even when node and mesh owner IDs collide;
- `semanticRecord` target support/exclusion is explicit and enforced consistently;
- invalid semantic commands fail atomically;
- AI aliases still never alter human names;
- round-trip compatibility remains deterministic;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: Implement M1 correction pass [m1-corrected]
- Changed files: src/veyra/references.js, semantics.js, model.js, capabilities.js, summary.js, commands.js, manifest.js, tests/veyra-semantics-corrections.test.mjs, tests/veyra-manifest.test.mjs, milestone.md
- Tests added/changed: dedicated correction suite covering command-bus CRUD/atomicity, owner-qualified paint collision identity/cascade/round-trip/summary-manifest refs, and semanticRecord target exclusion; manifest action count remains strict at 50
- npm test: PASS (required by correction workflow before commit)
- npm run check: PASS (required by correction workflow before commit)
- Command-bus semantic CRUD proof: all five VEYRA_SEMANTIC_COMMAND_ACTIONS dispatch 1:1 to Store methods; AI provenance is forwarded; invalid refs/patches return failure without document/revision/history mutation; capability actions resolve mechanically to generated manifest action refs
- Paint identity collision proof: paint refs are owner-qualified as paint id node:<owner-id> or mesh:<owner-id>; same node/mesh owner IDs remain legal and resolve/cascade independently; legacy unqualified paint refs migrate only when unique and fail precisely when ambiguous
- semanticRecord target policy: unsupported as a semantic-record target and rejected during creation/normalization/validation; still supported intentionally as a typed semantic relation target
- Persistence/migration impact: canonical paint semantic refs are owner-qualified; legacy unqualified paint refs deterministically qualify from owner kind when unique; semantic IDs remain unchanged; save/load preserves qualified identity
- AI/name-independence proof: dispatched AI alias/role/status edits leave human names untouched; owner renames do not alter paint semantic refs
- Suggestions added to `suggestions`: none
- Known limitations: legacy unqualified paint refs are inherently ambiguous when a node and mesh already share the owner ID, so normalization rejects them and requires an explicit owner-qualified ref
```
