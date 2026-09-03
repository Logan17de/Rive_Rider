# Veyra interaction surface (Milestone 3B) — settled contract

Status: **agreed by debate, not yet implemented.** 3B-1 dispatched; 3B-2 gated.

This document records decisions that were *settled against workspace evidence*,
including one premise in the original brief that turned out to be false. It is
the normative reference for 3B-1 and 3B-2. Where it contradicts
`ROADMAP_AI_NATIVE_EDITOR.md`, this document wins.

## Why this milestone exists

Veyra's core principle is that anything a human can do, AI can also do, and the
reverse. State machines are the one place where that principle is **inverted**:
`globalThis.veyra` exposes a 15-call machine API and `createSceneSummary`
reports every machine, while a human has **no UI at all**. `veyra.html` has a
`timelinePanel` and an `inspectorPanel` and nothing for machines.

Restoring parity is therefore P0 by the project's own charter.

## Corrected premise

The original brief claimed 3B would "route every UI action through the existing
store commands." **That is false.** `store.js:576` whitelists exactly
`['name', 'initial']`. There is no command to rename a state, retarget a
state's timeline, edit a transition's `duration`/`after`/conditions, or
edit/remove an input.

A panel built on that premise would have been forced to mutate the document
outside the command system — destroying undo *and* inverting the parity goal the
milestone exists to serve. The command layer must therefore be **built first,
as its own shippable task**.

## Split

| Task | Contents | Verifiable by |
| ---- | -------- | ------------- |
| **3B-1** | Machine edit commands + runtime reconciliation | `npm test` alone (zero DOM) |
| **3B-2** | State graph panel, pointer listeners, preview controller | Node presenter tests + bounded browser smoke |

3B-1 is a **parity lift on its own**: it gives AI in-place machine editing it does
not have today, independent of any UI. It ships alone and first.

## Runtime reconciliation policy (normative)

`MachineRuntime` calls `#resetRuntime()` at exactly two sites — construction
(line 84) and `reset()` (line 307). Nothing reconciles on document change, while
the store cascade-removes. Four defects follow, all verified by reading:

1. **Dangling current state** (lines 99–105). `stateId` returns a stale truthy id
   while `state` returns `null`. `evaluate()` (line 265) propagates the pair, and
   `step()`'s `outgoing` filter (lines 185–187) then matches nothing *ever*: the
   machine is silently dead until `reset()`.
2. **Shadowed authored inputs** (lines 130, 135). The override Map is
   pre-populated at reset for every input, so `?? input.value` is dead code and
   authored edits never surface. Inputs created *after* reset behave differently.
   Consequence: `veyra.getMachine()` and `veyra.getMachineState()` report
   different truth for the same input — a live parity violation today, with no
   panel involved.
3. **Dangling active transition** (lines 178–192). `#transition` captures
   `{ transition, fromId, toId }` **by reference**, so `#completeTransition`
   (line 154) can set `#stateId = toId` onto a state deleted mid-blend. Distinct
   from (1): the blend was legal when it started.
4. **Asymmetric reset.** Only `deleteMachine` clears the runtime map
   (`veyra.js:2410`). Undoing an *edit* leaves stale runtime state running, so
   some undos reset and some do not, and nothing documents which.

### The rule

**Reconcile; never blanket-reset.** Reconciliation is keyed to *this machine's*
record, not to document revision. Editing an unrelated node's fill, or dragging
a node on canvas, **must not** disturb a running preview — a document-wide reset
would replace one bug with a worse one.

### Structural signature (refined during implementation)

The contract originally said "keyed to the machine record." Implementation
produced a **finer and better rule**, adopted here as normative: the key is a
*structural signature* containing only the fields the runtime's **position** is
expressed in —

- `initial` pointer,
- input **ids and types**,
- state **ids**,
- transition **ids and endpoints**.

Deliberately **excluded**: names, authored input values, transition `duration`,
`after` gates, and condition payloads. These are read fresh on every evaluation,
so changing them must **not** reset a live preview. Renaming a state or tuning a
blend duration therefore leaves the preview running, where the coarser
machine-level rule would have dropped it.

The distinction is *structural vs cosmetic within the machine*, not merely
*machine vs document*.

Two consequences worth stating:

- Transition **order is semantic** (first eligible transition wins), so it
  belongs in the signature.
- State order matters only for the `states[0]` initial fallback, so an
  incidental reorder resetting the preview is a known, accepted edge.

Supporting mechanics: `#overrideValues` holds only inputs explicitly set since
the last reset, which restores `?? input.value` for clean inputs (defect 2); the
active transition stores `{ transitionId, fromId, toId, duration, startedAt }`
as **primitives** rather than a record reference, which removes defect 3 at its
root; and `onInvalidate(listener)` returns an unsubscribe, mirroring
`VeyraStore.subscribe`.

**Known cost, deferred to 3B-2:** reconciliation runs before every public read,
so a naive signature comparison stringifies the machine structure on each getter
access — O(machine size) per read inside a per-frame preview loop. Gating
recomputation on the store's `revision` counter preserves the semantics exactly
and is the intended optimisation *if* the runtime can observe `revision` through
its document getter.

- Structural change to this machine → `reset()`.
- Dangling `stateId` / transition endpoint / input id → **reset-and-continue,
  never throw**. (`veyra.js:2343` throws `TypeError` today; inside a per-frame
  loop, an undo removing a machine would kill the loop.)
- Missing current state → valid `initial`, else first state, else `null`.
- Prune dirty overrides for deleted inputs; revalidate transition endpoints.
- Legal input type change → drop the dirty override, fall back to the authored
  value, count as structural.
- Reconciliation **must not mutate the document**.
- Emit **at most one** `runtime-invalidated` per effective machine change, so
  multi-part commands do not flicker the panel.

Authored input shadowing is fixed with an explicit **dirty set** of inputs
actually set since reset, restoring `?? input.value` and making both input ages
behave identically.

## Operator/type integrity: fix in normalize, reject in command

**Corrected mid-debate.** This was first written as a hazard that
`updateMachineInput` would *create*. That is wrong. It is a **live defect on
current code**, demonstrated by a zero-dependency repro against the unmodified
workspace:

```
RESULT-1 normalizeDocument ACCEPTED a bool input gated by op >
RESULT-2 normalized condition: {..., "op": ">", "value": true}
RESULT-4 stateId after 20s sim (target sB never reached): sA
```

`normalizeMachineCondition` checks only membership in `VEYRA_CONDITION_OPS`
(`model.js:1043-1046`) and coerces `value` by the input's type (`:1057`) **without
type-gating the operator**. So `{ input: bool, op: '>' }` loads clean: the loader
silently rewrites an authored `0.5` into `true`, keeps the illegal operator, and
produces a machine that **can never leave its initial state**. Reachable today via
any AI- or hand-authored `.veyra` file, independent of both workstreams.

`VEYRA_STATE_MACHINES.md` §Validation says `fired`/`!fired` on a non-trigger is a
validation error — but the *ordering and comparison* operators are not gated at
all. The document describes an invariant the loader does not enforce.

**Therefore the operator/type matrix belongs in `normalize`, not in a
special-case guard inside the new command.** The reason is **format integrity**:
a `.veyra` file is a portable artifact that must not load into a silently dead
state, whoever wrote it.

An earlier argument for putting it in the command — "otherwise AI bypasses the
check" — was withdrawn as unsound: `VEYRA_COMMAND_SOURCES` includes `'ai'`
(`store.js:32`), so AI already flows through the same commands as the human. Same
conclusion, sounder premise.

The command layer still rejects: `updateMachineInput` refuses a type change that
would invalidate existing conditions, throwing with a **named list** of the
blocking conditions/transitions — matching the `store.removeTimeline` precedent,
which throws with a named list of blocking states. Normalize protects the format;
the command gives the editor an actionable error instead of a silent repair.

Pre-flight confirmed this costs less than feared: all five `.veyra` fixtures carry
`"stateMachines": []`, and every existing test condition is already matrix-legal
(ordering ops only on numbers; `==` only on bools). **No migration or version gate
is required.**

A type change that would invalidate existing conditions is **refused**, throwing
with a **named list** of the blocking conditions/transitions — matching the
existing `store.removeTimeline` precedent, which throws with a named list of
blocking states.

Rejected alternative: silent cascade-prune. The named list is directly
actionable by AI (read blockers → clear them → retry); silent pruning gives AI
no signal that anything was destroyed.

## Referential integrity is already total (verified)

Every store command funnels through `execute()` → `normalizeDocument()`
(`store.js:120`), and normalize rejects **every** dangling machine reference:
state `.timeline` must exist (`model.js:1069-1072`); transition `from`/`to` must
exist and `from !== to` (`:1082-1087`); condition input must exist with a
type-legal operator (`:1039-1056`); `initial` must exist (`:1133-1136`);
duplicate input ids **and names**, state ids, and transition ids all throw
(`:1110-1115, 1122, 1130`).

**Therefore no persisted or live Veyra document can contain a broken machine
reference,** and the entire machine-integrity defect surface is
`MachineRuntime`'s four private fields. This is the argument for the split: the
riskiest deliverable is provably one class in one file.

### Global acceptance invariant (replaces a checklist)

For **any** interleaving of machine commands with `undo()`/`redo()`:

1. `runtime.evaluate().stateId` is `null` **or** present in `machine.states`;
2. `runtime.transition` is `null` **or** both `fromId`/`toId` resolve;
3. every entry in `runtime.inputs` has an id present in `machine.inputs`;
4. `stateTime >= 0` and monotonic within a state.

All four are falsifiable in pure Node with no DOM.

## Refusal, not cascade, for referenced inputs

The store contains **both** patterns, so the choice cannot be made by analogy:

- `removeMachineState` **cascades** (`store.js:619-625`) because a transition
  *cannot exist* without endpoints. Pruning is forced.
- `removeTimeline` **refuses** (`store.js:450-459`), collecting
  `machine/state` users and throwing an actionable message before touching
  anything.

`removeMachineInput` **refuses**. The deciding reason is behavioural, not
structural: cascade-pruning a condition does **not** delete the transition — it
leaves the transition alive with *fewer* conditions, so it **fires more easily
than the author intended**. That is a silent behaviour change to a running
machine, with nothing in the document looking wrong. Refusal names the blockers
and lets the author act deliberately.

Missing target → return `false`; blocked target → throw with names. No panel-side
rollback is needed: `execute()` restores and rethrows atomically
(`store.js:121-124`).

## Store transaction re-entrancy (missed state — fix in 3B-2)

`store.js:134` is `if (this.#transaction) return;` — a second `begin()` is
**silently discarded**, not rejected. `commit()` (`:151-154`) restores, emits
`'cancel'`, and **then throws** — inside a `pointerup` handler that is an
uncaught exception leaving UI state half-updated.

Consequence for the panel: two overlapping drags, or a stray `pointerup` outside
the window, **merge two unrelated edits into one undo entry** carrying the first
command's label. Undo granularity degrades silently and no current test catches
it.

Requirement: **one owner for the store transaction** across canvas, panel, and
preview, with an explicit re-entrancy rule — `store.inTransaction` (or
`tryBegin()` returning boolean) and every drag path wrapped in
`finally { if (store.inTransaction) store.cancel(); }`.

The failing test (`begin(A); begin(B); mutate(x); commit()` asserting B is not
absorbed) is written **before** the panel exists, in the pre-implementation
arbiter. The fix is scoped to 3B-2.

## Listener targets persist ids, never names

`model.js:1036-1038` states the house rule in-code: inputs are addressed by
stable id, a unique name is *accepted* for authoring convenience, and **both
normalize to the stable id reference** (`:1047`).

**3B-1 creates the hazard**: once `updateMachineInput` exists, **renames become
reachable**, so any listener that persisted a name would silently dead-end a
click handler after a rename. Name-uniqueness (`:1111-1113`) is not a reason to
persist names. A listener authored as `{ pointer: 'down', onState: <name> }`
normalizes to ids **or throws**; nothing name-shaped survives into the saved
document.

## Schema: conditional v4 stamping

**Reopened and reversed after the additive-v3 position was accepted.** Recorded
in full because the reversal turns on a mechanism worth remembering.

`normalizeDocument` returns a **fresh object literal** stamped
`version: VEYRA_VERSION` unconditionally, carrying only keys it knows
(`model.js:1230-1232`). So an older reader opening a listener-bearing document
**silently strips the listeners and re-saves a valid-looking v3**. Silent data
loss, no error, no trace.

The additive-v3 position rested on the claim that a version bump "doesn't fix
this anyway." That claim is **false**: the accept-list is `[1,2,3]`, so a v4 file
makes an old reader **throw**. Bumping converts silent corruption into a loud,
diagnosable failure. For this project's goal specifically — humans and AI on the
same project — an AI-authored interaction evaporating without trace when a human
opens the file in an older build is close to the worst outcome the format can
produce.

But an *unconditional* v4 restamps **every** save, gratuitously breaking old
readers for documents containing no listeners at all.

**Decision: conditional stamping.** Emit v4 only when the listeners registry is
non-empty; otherwise keep v3. Files that use the feature are protected by a loud
error; files that don't stay universally readable.

**Ordering safeguard (the trap this decision depends on):** the presence of an
authored `listeners` registry must be detected **before** normalization. Normalize
would otherwise discard the unknown key, after which the document would be
stamped v3 — defeating the entire protection. Malformed listener data is
**rejected, never discarded-and-downgraded**.

Cross-version acceptance: prove an old accept-list reader **rejects** v4 *before*
lossy normalization, and that ordinary v3 documents remain compatible.

Capability flag follows the house precedent at `manifest.js:42`
(`animation.state-machines`, pushed conditionally on registry population):
expose `interaction.listeners` the same way.

Supporting evidence: `evaluation.js` already reserves the `interactive` layer in
`VEYRA_EVALUATION_ORDER` (lines 7–12, applied at 71 and 80, ownership at 77).
Precisely: listeners feed `setInput`/`fire` into `MachineRuntime`, whose
overrides travel via the **animation** layer — they do not write the interactive
layer directly. Either way listeners add **no new evaluation stage**, so the
additive position holds on the format's own bump test.

With teeth:

- An unknown listener `kind`/`event` **throws at normalize**, never silently
  drops. A silent drop means a click binding evaporates across save/reload and is
  undiagnosable.
- Listener cascade mirrors `store.js:619-625`: deleting a state prunes listeners
  targeting it; deleting a machine prunes its listeners.
- Listeners are surfaced in `summary.js` and `manifest.js`. A capability
  invisible to the manifest breaks the core principle worse than a missing panel.

## Preview scope: one active machine, controller shaped for many

**Policy:** exactly one previewed machine, in module-level editor state
`previewMachineId`.

**Precedent:** `activeTimelineId` (`veyra.js:125`) is editor state kept
deliberately separate from `store.selectedId`, and `veyra.js:1143-1144` already
reconciles it on render — falling back to the first entry when the id no longer
resolves. Preview is **not** pushed into `store.select()`, whose kind-based
single `selectedId` does not model it cleanly.

**Shape:** `MachinePreviewController` accepts a **set** of machine ids, today
always of size one. Single-machine *policy*, multi-machine-capable *structure*.

**The seam that matters:** the merge step implements a documented, tested
address-collision policy **even while the set is size one** (where it trivially
finds none). When two machines eventually drive the same property address, the
collision surfaces as a diagnostic instead of silent last-writer-wins.
Multi-machine conflict resolution for the Phase 5 runtime player is recorded here
as a **named open question**, not decided by omission.

The controller steps on **explicit deltas, never wall-clock `rAF`**, so the
identical script runs headless in Node and in the browser.

## Verification strategy

The harness is dependency-free Node `.mjs`. `package.json:7` runs nine suites and
**omits** `tests/veyra-browser.js`; `package.json:6` hardcodes each module path,
so a new file is silently never syntax-checked. **Anything new must be added to
both lists.**

Today all human canvas interaction — `renderer.js`, 27KB, 13 `addEventListener`
sites — has zero automated coverage. That is a pre-existing hole, not merely a
constraint to design around.

- **The cut is `event → intent → command`**, not `presenter → DOM`.
  `machinePanelIntent(event)` is a **pure function returning a command
  descriptor**; the DOM handler's only job is to call it. Behaviour becomes
  Node-testable and the DOM proves exactly one thing: wiring.
- **Presenter purity:** consumes the normalized model, never mutates it. It
  **surfaces** model diagnostics (self-loops, cross-machine references) and never
  re-implements or filters invariants — `from ≠ to` is enforced in
  `normalizeDocument`, and duplicating it would let two rejection rules drift
  apart and hide *why* an edge was refused. Presenter reports; model decides.
- **Pure-function coverage:** deterministic layout, transition path/arrow
  geometry, condition/input validation diagnostics, and `hitTest(point, viewport)`
  under zoom/pan, degenerate dimensions, and overlapping nodes with stable
  topmost ordering.
- **Golden fixtures:** presenter → SVG model serialization is hashed with the
  same deterministic pattern `tests/veyra-golden.test.mjs` already uses. This is
  **mandatory**, not "if feasible" — it turns the panel into a golden target.
- **Assertions target `store.document`**, never DOM markup strings. DOM shape
  churns; document state is the contract.
- **Fake-DOM seam:** `tests/helpers/fake-dom.mjs`, dependency-free, able to
  synthesize pointer events. **No jsdom** — `package-lock.json` is 125 bytes and
  this project is deliberately zero-dependency.
- **Bounded:** bringing `veyra-browser.js` headless is scoped to its *current*
  assertion level. If it overruns, it becomes its own task rather than silently
  absorbing 3B-2.
- UI behaviour is **never** claimed as verified by Node alone; a browser smoke
  check covers panel mount and keyboard focus and is explicitly not the primary
  correctness proof.

## Ownership

`veyra.js` (106KB) and `package.json` (hardcoded `check`/`test` lists) are
**single-owner, frozen** for the duration of the task that holds them. 3B-1 and
3B-2 are split by layer, not by feature, so their file scopes are disjoint.

## Open questions

1. Multi-machine property-address conflict resolution (deferred to Phase 5).
2. Whether `reject` or `cascade` is right for input type change if a case emerges
   where refusing blocks a legitimate workflow.
