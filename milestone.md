# Veyra — Current Milestone

`plan.md` is the product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary. Resolver/query code is read-only and ambiguity must fail closed.
2. Human names remain display metadata only; names have zero semantic weight unless explicit display-name mode is requested.
3. Stable typed refs and M1 semantic records are authoritative.
4. Rejected/stale semantics must never become positive resolver evidence through forward **or reverse** graph relationships.
5. Semantic status/source filters must be real filters, not metadata-only annotations.
6. Candidate ranking and ambiguity decisions must use a non-lossy deterministic comparison; do not collapse materially different scores into an artificial tie.
7. Do not weaken existing M0/M1/M2 tests or capability declarations.
8. Run `npm test` and `npm run check` before handoff.
9. Follow-up ideas belong in `suggestions`.

---

# MILESTONE M2 — Name-Independent Semantic Indexer & Resolver — CORRECTION PASS

**Status:** `CORRECTIONS REQUIRED`

## Verification result

The main M2 implementation is accepted in principle:

- a DOM-free deterministic semantic/structural index exists;
- `queryEntities()` and `resolveSemantic()` are implemented;
- resolver outcomes are explicit (`resolved`, `ambiguous`, `notFound`);
- stable refs, semantic aliases/roles/tags, hierarchy, rig, animation, machines and listeners are indexed;
- display names are ignored by default and exposed only through explicit display-name matching;
- browser and manifest read surfaces use the same resolver module;
- adversarial rename/duplicate/empty/misleading-name tests exist;
- latest main-branch GitHub Actions Tests run is green.

Do not rewrite those completed parts unless required by the corrections below.

---

## Correction 1 — Enforce semantic status/source filters and relation provenance in both directions

### Problem A — status/source-only queries are not actually filtering

In `semanticMatches()`, records are filtered into `eligible`, but if the query contains only:

```js
{ semantic: { status: 'confirmed' } }
```

or only:

```js
{ semantic: { source: 'ai' } }
```

there is no requirement that `eligible.length > 0`. The function therefore returns `true` for entities with no matching semantic records and even entities with no semantic records at all.

### Required behavior

If any semantic filter is supplied (`alias`, `role`, `tags`, `status`, `source`, or future semantic qualifiers), an entity must satisfy that semantic constraint from actual matching semantic record(s).

At minimum:

- `status: confirmed` excludes entities whose semantics are only inferred/rejected/stale;
- `source: ai` excludes entities with no AI semantic record;
- combined status/source filters apply to the same eligible semantic set used for alias/role/tag matching;
- entities with no semantics do not match a semantic-only query.

### Problem B — reverse semantic relations can lose provenance/status

The index currently adds a forward semantic relation to the described entity and a reverse `semantic_relation_from` relationship to the relation target.

For forward resolution, the semantic record can be found on the entity and its status/confidence is used. On the reverse side, the semantic record is owned by the *other* entity, so `scoreCandidate()` may fail to find it locally and falls back to full/confirmed relation weight.

That means an **inferred, rejected, or stale** semantic record can become confirmed-strength evidence when traversed in reverse.

### Required behavior

Semantic relation evidence must carry enough provenance to score identically regardless of traversal direction.

For every semantic relation edge, preserve or recover at least:

- semantic record ID;
- status;
- provenance source;
- provenance confidence where applicable.

Hard rules:

- rejected/stale relation evidence contributes zero positive resolver score in either direction;
- inferred relation evidence is confidence-weighted in either direction;
- confirmed relation evidence receives confirmed weight in either direction;
- forward/reverse traversal must not change semantic strength merely because the semantic record is stored on the other endpoint.

### Mandatory tests

Add tests proving:

1. `queryEntities(..., { semantic: { status: 'confirmed' } })` returns only entities with confirmed semantic records;
2. `source: 'ai'` alone is a real semantic filter;
3. status + source combinations work together;
4. an entity with no semantic records does not match semantic-only filters;
5. a rejected semantic relation produces no positive resolver evidence forward or reverse;
6. a stale semantic relation produces no positive resolver evidence forward or reverse;
7. an inferred relation with confidence `0.2` receives the same confidence-weighted strength in both directions;
8. a confirmed relation receives the same semantic strength in both directions.

---

## Correction 2 — Fix ambiguity ranking after score saturation

### Problem

`publicCandidate()` currently derives:

```js
confidence = min(1, score / 100)
```

and `resolveSemantic()` decides ambiguity using the **clamped confidence** difference.

Once two candidates both score above 100, both confidence values become `1.0`, even if their raw scores are materially different.

Example class of failure:

```text
candidate A score = 175
candidate B score = 120

public confidence A = 1.0
public confidence B = 1.0
```

The resolver can therefore return `ambiguous` even though the scoring model itself strongly prefers A. This violates the M2 rule that only close competitors should remain ambiguous.

### Required behavior

Use a deterministic, non-lossy ranking/ambiguity metric.

Acceptable designs include:

- compare raw scores for ambiguity and expose a separately normalized confidence;
- normalize candidate scores with a monotonic non-saturating comparison model;
- otherwise preserve ordering distance after scores exceed 100.

Requirements:

- public confidence remains bounded `[0, 1]`;
- materially different evidence totals must not collapse into a tie;
- truly equal/near-equal candidates still return `ambiguous`;
- changing presentation normalization must not change deterministic candidate ordering;
- thresholds/margins remain explicit and testable.

### Mandatory tests

Construct candidates where:

1. both raw scores exceed 100 but one is materially stronger -> resolver must choose the stronger candidate;
2. both exceed 100 and are genuinely equal -> resolver returns `ambiguous`;
3. the weaker candidate is within the configured ambiguity margin -> resolver returns `ambiguous`;
4. deterministic ordering/output is unchanged across repeated calls.

---

## Correction 3 — Implement the required weak paint/style-similarity evidence

### Problem

M2 Task 5 explicitly required current-scene structural evidence to include **paint/style similarity as weak evidence**.

The current index exposes paint ownership (`owner`, `owns_paint`, gradient-stop ownership), but independent review found no deterministic paint/style-similarity descriptor or relationship used by query/resolution.

### Required implementation

Add conservative deterministic style similarity for current Veyra paint capabilities only.

A suitable minimal implementation may use a canonical style fingerprint derived from currently authored paint fields such as:

- fill type/value/gradient structure;
- stroke value/width where supported;
- other current normalized paint properties that are semantically stable.

Requirements:

- no display-name input;
- no visual/LLM inference;
- deterministic canonical comparison;
- similarity is **weak evidence**, below explicit semantics and strong structural relationships;
- do not infer anatomy or meaning from matching color/style;
- paint similarity must be queryable/inspectable as evidence rather than hidden magic;
- bounded behavior on large documents.

### Mandatory tests

Prove that:

1. two current entities with equivalent normalized paint/style receive a deterministic weak similarity relationship/descriptor;
2. a materially different style does not match;
3. renaming/reordering entities does not change style-similarity evidence;
4. style similarity alone cannot override confirmed semantic evidence;
5. style similarity between otherwise symmetric/unlabeled candidates does not manufacture semantic meaning and may still remain ambiguous.

---

## Acceptance criteria

M2 is VERIFIED only when:

- all original M2 tests remain green;
- semantic status/source-only query filters behave correctly;
- rejected/stale semantic relations contribute zero positive evidence in both directions;
- inferred/confirmed semantic relation strength is direction-invariant;
- ambiguity uses a non-lossy deterministic comparison and does not create false ties after score saturation;
- genuine close/equal candidates still fail closed;
- current paint/style similarity exists as explicit weak structural evidence;
- display names remain zero-weight by default;
- resolver/index/query remain read-only;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Semantic filter proof:
- Forward/reverse semantic relation provenance proof:
- Saturated-score ambiguity proof:
- Paint/style similarity proof:
- Name-independence proof:
- Suggestions added to `suggestions`:
- Known limitations:
```
