# Veyra — Current Milestone

`plan.md` is the authoritative product roadmap. This file contains only the **current implementation milestone**.

Agents may complete every task inside this milestone, but must not start work outside its scope. Follow-up ideas belong in `suggestions`.

When the milestone is complete, set its status to `AWAITING VERIFICATION`, fill the handoff, commit, and stop.

## Mandatory agent rules

1. Preserve the validation boundary and atomic Store semantics.
2. Human names are display metadata only; stable typed refs/addresses are authoritative.
3. Do not create a second command path to fix these issues. Repair the canonical control plane / Store-command wiring.
4. Preview and execution must share the same prepared command for the same current snapshot without making repeated legitimate creates collide.
5. AI/script/user provenance supplied to canonical commands must not silently become another source or label.
6. Browser compatibility APIs with command equivalents must be thin aliases over the canonical control plane; remaining unavoidable direct seams must be explicitly machine-audited.
7. Do not weaken M0–M3 tests or capability declarations.
8. Run `npm test` and `npm run check` before handoff.

---

# MILESTONE M3 — Unified AI/Human Control Plane + Dependency & Ownership Graph — CORRECTION PASS

**Status:** `AWAITING VERIFICATION`

## Verification result

The main M3 implementation is accepted in principle:

- canonical DOM-free service registry/control plane exists;
- dependency graph provides deterministic forward/reverse typed edges;
- authored/evaluated ownership inspection exists;
- canonical read exposes ownership/source context;
- preview uses the real dispatcher on an isolated Store;
- atomic plan preflight/rollback exists;
- structured `verifyChange` exists;
- manifest service/command declarations are mechanically generated;
- dedicated M3 adversarial tests exist;
- latest `main` GitHub Actions Tests run is green.

Do **not** rewrite those completed systems. Fix only the contract gaps below.

---

## Correction 1 — Repeated canonical create commands must not reuse the same generated ID

### Problem

`prepareCommandDescriptor()` currently derives implicit IDs from:

```js
{ documentId, descriptor, salt }
```

and standalone preview + dispatch both use the constant salt `canonical`.

Because the seed contains only the document **ID**, not the current document state/generation context, dispatching the same valid create descriptor again after the first successful create produces the same generated entity ID. The second create can therefore fail as a duplicate instead of creating another object.

This affects implicit-ID creation paths such as:

- `add`;
- `addSemantic`;
- `addTimeline`;
- rig/asset creation commands;
- state-machine child creation;
- `setKeyframe` when it must create a track/keyframe;
- any other prepared create action using the same scheme.

### Required behavior

For one current Store/document snapshot:

- preview and the immediately corresponding dispatch of the same descriptor must predict/use the same stable ID;
- after that successful mutation changes the current state, repeating the same create descriptor must generate a **different valid stable ID**;
- no wall-clock/random value may be required merely to avoid collision;
- explicit caller-supplied IDs remain authoritative;
- atomic-plan deterministic explicit-ID behavior remains intact;
- duplicate explicit IDs must still fail precisely.

Use a deterministic current-state/generation seed or another canonical mechanism that satisfies all of the above. Do not turn `add` into accidental idempotency.

### Mandatory tests

1. preview `add` -> dispatch `add`: predicted and actual refs match;
2. repeat the identical `add` descriptor on the now-changed Store: succeeds with a different ref;
3. preview before the second dispatch predicts that second ref correctly;
4. same repeated-create behavior for at least one non-node registry (`addSemantic`, `addTimeline`, rig entity, or machine child);
5. explicit duplicate ID still fails atomically;
6. failed preview/dispatch does not consume or corrupt the next deterministic generated ID;
7. undo/redo followed by preview/dispatch has deterministic, documented behavior and does not silently collide.

---

## Correction 2 — Preserve canonical command provenance for every mutating command

### Problem

The control plane accepts JSON command provenance such as:

```js
command: { source: 'ai', label: '...' }
```

but some command-table entries still call older Store methods that do not accept/forward that descriptor. For example, `add` dispatches to `store.add(type, options)`, while `VeyraStore.add()` commits with its own string label. The supplied AI/script provenance is therefore lost and can be recorded as the default user source.

A canonical control plane cannot claim common provenance while silently dropping it for part of the command catalog.

### Required behavior

Audit every mutating `VEYRA_COMMAND_TABLE` action.

For commands that create a committed Store history entry:

- supplied `source`, `label`, property addresses, and supported provenance metadata must reach that history entry;
- human/UI callers that omit a descriptor keep sensible existing defaults;
- no mutation logic is duplicated in `commands.js`;
- transaction/history-only actions retain their intentional semantics;
- plan-level provenance and ordered `planSteps` remain correct.

If a command intentionally cannot preserve descriptor provenance, declare it mechanically and do not advertise a stronger contract.

### Mandatory tests

At minimum prove through `createVeyraControlPlane(...).dispatchCommand()` that:

1. `add` with `source: ai` records `source: ai` and the supplied label;
2. a delete/removal command preserves supplied provenance;
3. one timeline/rig/state-machine mutation preserves supplied provenance;
4. invalid commands create no provenance/history entry;
5. a mechanical audit covers all mutating command-table actions so future actions cannot silently drop provenance.

---

## Correction 3 — Finish the browser mutation-plane convergence promised by M3

### Problem

The new M3 services are exposed through `controlPlane`, but `globalThis.veyra` still contains compatibility mutation helpers that directly call `VeyraStore` even when a canonical command equivalent already exists.

Examples currently include browser helpers such as timeline/keyframe mutations that call Store methods directly. `queryEntities` / `resolveSemantic` also bypass the control-plane wrapper for source-code compatibility, even though the control plane already exposes them.

M3 explicitly requires the browser AI surface to be a thin adapter over the same canonical services and requires direct seams to be visible rather than hidden.

### Required behavior

- Route compatibility browser mutation helpers through `controlPlane.dispatchCommand()` whenever an equivalent command-table action exists.
- Preserve their public return shapes where reasonable so compatibility is not needlessly broken.
- Route canonical read/query/resolve browser methods through the control plane, or replace brittle source-regex compatibility tests with behavior/identity tests that prove both surfaces use the same underlying implementation.
- Expand `VEYRA_UI_MUTATION_PARITY_AUDIT` (or rename/generalize it if appropriate) to include **browser/globalThis mutation seams**, not only human UI seams.
- Any remaining direct Store mutation with no command equivalent must be explicitly listed with reason and follow-up category.
- Do not hide direct mutation paths behind comments while manifest metadata claims full convergence.

### Mandatory tests

1. browser compatibility `createTimeline`/equivalent command-backed helper reaches the same canonical dispatcher and provenance path;
2. browser keyframe add/remove/move helpers with command equivalents use the canonical dispatcher;
3. browser canonical query/resolver results equal direct control-plane results without duplicating resolver logic;
4. a mechanical browser mutation audit identifies every remaining direct Store mutation helper;
5. no command-backed browser mutation helper bypasses the canonical dispatcher;
6. existing public compatibility tests remain behaviorally valid.

---

## Acceptance criteria

M3 is VERIFIED only when:

- all original M3 architecture/tests remain green;
- repeated identical implicit-ID create descriptors remain valid after prior successful creates and do not collide;
- preview and dispatch still predict/use identical IDs for the same current snapshot;
- canonical mutating commands preserve supplied provenance consistently;
- command-backed browser mutation compatibility helpers use the canonical dispatcher;
- remaining direct UI/browser Store seams are machine-readable and honest;
- dependency/ownership/read/preview/plan/verify behavior remains unchanged except for the required fixes;
- all M0/M1/M2 tests remain green;
- `npm test` passes;
- `npm run check` passes;
- latest GitHub Actions Tests run passes.

## Handoff

```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: 5c4f916f85763bfe553004fbd9eab240be41c0d1 — Fix M3 control-plane convergence blockers [m3-corrected]
- Changed files: src/veyra/controlPlane.js, src/veyra/store.js, src/veyra/commands.js, src/veyra/serviceRegistry.js, src/veyra/manifest.js, src/index.js, veyra.js, tests/veyra-resolver.test.mjs, tests/veyra-control-plane-corrections.test.mjs, milestone.md
- Tests added/changed: dedicated M3 correction suite for repeated implicit creates, snapshot preview/dispatch alignment, failed-command seed stability, undo/redo generation behavior, provenance preservation/mechanical audit, browser canonical-dispatch mapping/direct-seam audit; M2 browser resolver test strengthened from brittle direct-wrapper regex to control-plane behavioral parity + thin-adapter check
- npm test: PASS in correction workflow gate
- npm run check: PASS in correction workflow gate
- Repeated-create deterministic-id proof: implicit ids seed from a deterministic stable-id generation snapshot; successful creates alter the snapshot, failed attempts do not, explicit ids remain authoritative
- Preview/dispatch id-alignment proof: preview and standalone dispatch prepare from the same current snapshot + canonical salt; repeated create after mutation gets a new id; undo reuses an absent undone id deterministically and redo advances because the id exists again
- Command provenance audit proof: node add/remove/removeSelection now forward descriptors; Store records metadata; every undoable VEYRA_COMMAND_TABLE action is mechanically exercised with a marker and module initialization fails if provenance is not forwarded
- Browser canonical-dispatch proof: command-backed globalThis.veyra compatibility helpers route through dispatchCompatibilityCommand -> controlPlane.dispatchCommand; query/resolve are thin control-plane adapters
- Remaining direct mutation seams: setMeshVertexWeights has no current command equivalent and is explicitly audited; playback/machine runtime helpers are marked runtime-only; human continuous gestures and document-shell seams remain explicitly audited
- Dependency/ownership regression proof: original M3 suite remains unchanged and green
- Name-independence proof: original M2/M3 name-randomization/reorder suites remain green
- Suggestions added to `suggestions`: none
- Known limitations: bulk mesh-vertex weight replacement still lacks a command-table action and remains an explicit audited direct Store seam; runtime-only playback/machine state remains outside persistent Store history by design
```
