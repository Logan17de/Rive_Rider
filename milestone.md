# Veyra — Current Milestone

`plan.md` is the product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary. Resolution/query code must never mutate the document and destructive ambiguity must always fail closed.
2. Human names are display metadata, not semantic identity. Names must be ignored by default for AI resolution.
3. Stable typed refs and the M1 semantic registry are authoritative.
4. Do not create a second AI-only graph model. Build from the canonical normalized document, semantic records, summary/manifest, and existing evaluation/model relationships.
5. Resolver results must be deterministic for the same normalized document + query/options.
6. Every resolved candidate must include machine-readable evidence; never return a naked guessed ID.
7. Ambiguous candidates must remain ambiguous. Do not hide uncertainty by selecting the first matching entity.
8. No resolver/query operation may bypass capability or ownership boundaries for future writes.
9. Do not expand into new Rive feature families, headless/CLI work, geometry hit-testing, state-machine expansion, View Models, components, layout, text, or scripting.
10. Tests must include duplicate, empty, random, misleading, and renamed human names.
11. Do not weaken existing M0/M1 tests or capability declarations.
12. Run `npm test` and `npm run check` before handoff.

---

# MILESTONE M2 — Name-Independent Semantic Indexer & Resolver

**Status:** `READY`

## Goal

Make Veyra capable of finding and explaining the correct project entity from **semantic intent and graph evidence**, without depending on the human-authored `name` field.

After this milestone, an AI should be able to inspect/query the current Veyra graph and ask for concepts such as a known semantic role, alias, rig control, animated target, listener target, paired structure, or structurally described entity and receive:

- a stable typed target ref when confidence is sufficient;
- the semantic concept that matched;
- confidence/score information;
- explicit evidence;
- ranked alternatives where useful;
- `ambiguous` or `notFound` instead of a guess when evidence is insufficient.

This milestone operates on **current Veyra entity kinds only**. Future Components, View Models, Layouts, Text, scripts, etc. will plug into the same index/resolver later.

---

## Task 1 — Build a deterministic semantic/structural entity index

Create a DOM-free module that builds a bounded machine-readable index from a normalized Veyra document.

Each indexed entity must include at least:

- stable typed ref;
- entity kind/type/capabilities;
- advisory display name, clearly marked non-authoritative;
- semantic records targeting it;
- aliases, canonical roles, tags, status, provenance/confidence;
- parent/child or owner relationships where applicable;
- geometry/bounds/relative-position descriptors where available;
- rig relationships: bone hierarchy, mesh weights, controls, constraints;
- animation relationships: timeline -> track -> property target -> keyframe;
- state-machine relationships: machine/input/state/transition/condition;
- listener target/action relationships;
- paint/asset/geometry ownership;
- semantic relations from M1.

The index must be generated from stable refs and graph relationships, not from names.

### Requirements

- deterministic ordering;
- no document mutation;
- no DOM/browser dependency;
- bounded output suitable for AI inspection;
- exact refs survive rename/reorder/save/load;
- duplicate display names are harmless.

---

## Task 2 — Canonical entity query API

Add a read-only query API over the index.

Target shape may evolve, but must support structured queries such as:

```js
queryEntities(document, {
  kinds: ['node', 'bone', 'control'],
  semantic: {
    alias: 'right_eye',
    role: 'character.eye',
    tags: ['eye']
  },
  relatedTo: { kind: 'bone', id: '...' },
  relation: 'influenced_by'
})
```

Required query dimensions where the current graph supports them:

- kind/type/capability;
- exact stable ref;
- semantic alias/role/tag/status/source;
- semantic relation predicate/target;
- parent/child/owner relationships;
- rig connectivity;
- animation ownership/usage;
- machine/listener relationships;
- spatial side/relative-position descriptors where deterministic geometry exists.

Names may be returned as display context but must not participate unless an explicit `displayName`/human-name query option is supplied.

---

## Task 3 — Semantic evidence scoring

Implement deterministic candidate scoring for semantic intent.

Use the strongest available evidence in roughly this priority order:

1. explicit stable typed ref;
2. confirmed semantic alias/canonical role;
3. confirmed semantic relation;
4. inferred semantic alias/role weighted by provenance confidence;
5. tags + graph relationships;
6. structural/behavioral evidence from hierarchy, geometry, rigging, animation, machines, listeners, assets/paint;
7. explicit human-name hint **only when the caller opts into human-name matching**.

### Hard rules

- display names contribute **zero score by default**;
- rejected/stale semantics must not be treated as confirmed evidence;
- confidence/provenance must affect inferred semantic evidence predictably;
- scoring rules must be documented and testable;
- deterministic ties remain ties.

Do not add opaque LLM calls inside the resolver. The resolver must be inspectable and deterministic; an external AI may use it as a grounded tool.

---

## Task 4 — Resolver result contract and fail-closed ambiguity

Add the canonical resolver API, e.g.:

```js
resolveSemantic(document, intent, options)
```

Return one of these explicit outcomes:

```js
{
  status: 'resolved',
  target: { kind, id },
  semantic: 'right_eye',
  confidence: 0.94,
  evidence: [...],
  alternatives: [...]
}
```

```js
{
  status: 'ambiguous',
  candidates: [...],
  reason: '...'
}
```

```js
{
  status: 'notFound',
  reason: '...'
}
```

### Requirements

- exact typed refs resolve first and wrong-kind/missing refs fail precisely;
- close competitors return `ambiguous` rather than auto-selecting;
- confidence thresholds/options are explicit and bounded;
- every candidate exposes stable ref + score/confidence + evidence;
- candidate ordering is deterministic;
- resolution is read-only.

---

## Task 5 — Structural inference for the current graph

Support useful name-independent structural evidence for the feature families Veyra already has.

At minimum derive evidence from:

### Scene / geometry

- parent/child hierarchy;
- entity type;
- evaluated/local bounds where available;
- relative left/right/top/bottom position inside an owner/group;
- simple mirrored/paired-candidate detection when evidence is deterministic;
- paint/style similarity as weak evidence.

### Rigging

- bone parent/child relationships;
- controls targeting/influencing bones;
- constraints and their targets;
- mesh vertex weights/influence relationships.

### Animation

- timeline/track ownership;
- property addresses animated by a track;
- groups of entities/properties animated together.

### State machines / interactions

- state -> timeline;
- transition endpoints and condition inputs;
- listener target/action/timeline/machine/input relationships.

Do not invent anatomical meaning from geometry alone. For example, two perfectly symmetric unlabeled eye-like candidates without semantic evidence should remain ambiguous.

---

## Task 6 — Explicit human-name mode without name dependence

Human users may explicitly say things such as `select the object named Layer 5`.

Support this as a clearly separate, opt-in resolver/query mode.

Requirements:

- default semantic resolution ignores display names completely;
- explicit display-name mode may find matching entities;
- duplicate names return ambiguity unless another explicit criterion disambiguates them;
- misleading names never override a stronger stable ref/confirmed semantic target;
- resolver evidence must mark name matching as `display-name-hint`, not semantic proof.

---

## Task 7 — Canonical AI read surface integration

Expose the index/query/resolver through the canonical machine-readable surfaces without creating another mutation layer.

At minimum:

- export stable public functions/modules for semantic indexing, querying, and resolution;
- expose query/resolver capability metadata in the project manifest;
- make the browser-facing `globalThis.veyra` layer, where applicable, a thin adapter over the same implementation rather than duplicating resolution logic;
- keep results JSON-safe;
- make it possible for future MCP/headless adapters to reuse the same APIs unchanged.

Target API direction from `plan.md`:

```text
veyra.queryEntities(query)
veyra.resolveSemantic(intent, options)
```

Do not implement MCP or the headless CLI itself in this milestone.

---

## Task 8 — Adversarial name-invariance and ambiguity suite

Create a dedicated resolver/index test suite proving at least:

1. exact typed-ref resolution works without names;
2. confirmed AI alias resolves after the human target is renamed;
3. canonical role/tag resolution survives random names;
4. all display names set to `Layer` does not change semantic results;
5. empty names do not change semantic results;
6. deliberately misleading names such as right-eye entity named `left_eye` do not override confirmed semantic evidence;
7. explicit display-name mode can intentionally query that misleading human label and reports that evidence as a name hint;
8. two equally plausible unlabeled symmetric candidates return `ambiguous`;
9. wrong-kind typed refs fail precisely;
10. missing refs return `notFound` rather than throwing an unrelated error;
11. state-machine/listener/animation relationships can resolve targets without names;
12. rig/control/constraint relationships can resolve targets without names;
13. resolver output/candidate ordering is deterministic across repeated calls;
14. serialize/load and rename/reorder operations preserve resolution results;
15. a resolution plan storing the resulting stable ref still points to the same entity after the human renames it before execution;
16. no query/resolver call mutates document, revision, history, or semantic records.

---

## Explicit non-goals

Do not implement in M2:

- automatic vision-model/image inference;
- hidden LLM calls inside the resolver;
- headless Node API / CLI;
- MCP server;
- dependency/ownership graph beyond relationships needed for current resolution evidence;
- preview/apply/verify mutation planning;
- Bézier/path hit-testing;
- path-topology commands;
- pointer-event expansion;
- new state-machine features;
- Components, View Models/Data Binding, Layout, Text, scripting/WGSL, or other new Rive feature families.

---

## Acceptance criteria

M2 is complete only when:

- a deterministic entity/semantic index exists for the current graph;
- AI can query entities by typed identity, semantics, and current structural relationships;
- canonical semantic resolution returns `resolved`, `ambiguous`, or `notFound` with evidence;
- display names have zero semantic weight by default;
- explicit human-name mode is separate and ambiguity-safe;
- current rig/animation/machine/listener relationships provide resolver evidence;
- resolver/query output is JSON-safe and available through the canonical AI read surface;
- renamed/random/duplicate/empty/misleading-name adversarial tests pass;
- truly ambiguous structures remain ambiguous;
- all M0/M1 tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Index/query proof:
- Resolver proof:
- Structural evidence proof:
- Ambiguity/fail-closed proof:
- Name-independence proof:
- Browser/manifest integration:
- Persistence impact:
- Suggestions added to `suggestions`:
- Known limitations:
```
