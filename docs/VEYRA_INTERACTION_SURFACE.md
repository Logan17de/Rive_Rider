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

**Ordering safeguard (the trap this decision depends on).** Determine v4 from the
**raw authored presence of the `listeners` key** — including malformed or
non-empty raw input — and only **then** validate and reject malformed entries.

The subtlety, and the hole in a weaker phrasing of this rule: "detect before
normalization" is not enough. If validation runs first and *strips* invalid
listeners, the registry ends up empty, the document is stamped v3, and **the
silent-loss bug returns through the back door**. Presence must be read from the
raw key, never from the post-validation result.

Corollaries:

- A conditional downgrade to v3 is safe **only** after an intentional command
  removes the final listener — never as a side effect of validation.
- A raw `listeners` key with an invalid shape **throws**; the key must never
  vanish silently.
- v3↔v4 movement is **not** nondeterminism — it is a deterministic feature
  projection. Document the intentional downgrade, and test
  `serialize(normalize(doc))` twice for byte-stable output across add/remove
  transitions.

**Cross-version acceptance:** fixture a listener-bearing v4 and assert the
current parser preserves listeners; simulate the old reader's verified `[1,2,3]`
accept-list and assert it **rejects v4 before normalization**, so the lossy
projection is never invoked; fixture a plain v3 and assert the old reader still
accepts and preserves it.

**Honesty constraint:** a simulated old reader does **not** prove the behaviour
of arbitrary old binaries. State the contract explicitly rather than
overclaiming.

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

**The seam that matters — and it is NOT vacuous at size one.**

*Correcting a leader error.* An earlier revision of this document claimed the
collision policy "trivially finds none" at set size one, and the requirement was
briefly withdrawn on the strength of an argument attributed to a debater who had
argued the **opposite**. The withdrawal was wrong. Recorded here because the
mistake is instructive: the collision does not need two *machines* to occur.

**The collision is live today.** Verified at `evaluation.js:61-65`:

```js
let animationLayer = layers.animation || {};
if (animationPlayback && typeof animationPlayback.evaluate === 'function') {
  const playbackOverrides = animationPlayback.evaluate();
  animationLayer = { ...animationLayer, ...playbackOverrides };  // silent
}
```

Machine overrides travel through `layers.animation`; `AnimationPlayback`
overrides spread **over** them. Any shared property address is resolved by
silent last-writer-wins, playback winning, with **no diagnostic**. This is
reachable from the script API right now — `veyra.playTimeline(...)` together
with `veyra.stepMachine(...)` — and becomes UI-reachable the instant 3B-2 lands,
because `Space` → `playAnimation()` (`veyra.js:2306`) will coexist with machine
preview.

Requirements:

1. **The documented policy lives at that merge**, not in the controller.
2. **Report provenance and conflicts rather than spreading silently.**

   **Corrected — my original requirement here was not implementable.** I wrote
   that the collision should be reported through the existing `sources[address]`
   vocabulary (`evaluation.js:28, 104`, surfaced via `propertySource()`
   `:108-111`), on the assumption that attribution could name the losing
   contributor. It cannot: the merge at `:64` **collapses both contributors into
   a single object before attribution happens at `:67`.** By the time `sources`
   is written, the information that a collision occurred no longer exists. The
   channel is fine; the data never reaches it.

   The requirement is therefore: **attribution must happen AT the merge, not
   downstream of it.** The merge produces both the merged layer *and* a record of
   which addresses had more than one contributor, and that record is surfaced
   alongside `sources` in the evaluated scene. `sources` remains the delivery
   vehicle — it just has to be fed from the merge rather than inferred after it.

   Found by the gate author while implementing against the brief, which is the
   correct time to discover an unimplementable requirement.
3. **What `Space` does while a machine previews — DECIDED.**

   **`Space` controls the active transport. Machine preview and timeline
   playback are mutually exclusive: starting either stops the other.**

   Rejected alternatives and why:
   - *Space starts timeline playback over a running preview* — incoherent, since
     the machine is already driving those same timelines. Two playheads on one
     timeline has no sensible meaning.
   - *Refuse playback while previewing* — makes `Space` silently do nothing,
     which reads as a broken key rather than a policy.

   `Space` is the universal play/pause affordance, so while a preview is active
   it toggles **that** preview. This matches the existing single-active-entity
   pattern (`activeTimelineId`, `previewMachineId`) rather than inventing a
   second concurrency model. **HUMAN RATIFICATION (Logesh, 2026-09-04, §7 Q2):** Space behaves as normal media controls — running→pause, paused→resume, finished→replay-from-start — AND must remain a literal space character whenever focus is inside a text field (no key-hijacking while typing). Binding for the panel cut; supersedes the earlier mutual-exclusion framing, which survives only as "exactly one transport is active."

   **Consequence for precedence:** at the *editor* level this dissolves the
   collision — the two can no longer drive the same address concurrently.

   **Reporting is still required**, and this is the important part: the **script
   API can still do both**. `veyra.playTimeline(...)` and `veyra.stepMachine(...)`
   remain independently callable, which is exactly the AI-facing path. So the
   editor decision removes the *human* route into the collision while leaving the
   *AI* route open — and under our core principle, a hazard an AI can reach and a
   human cannot is the worse of the two. Merge-level reporting is therefore
   defence in depth, not redundancy.

### Precedence ruling (leader decision)

**Current precedence stands: playback wins over machine overrides. Report the
collision; do not change who wins.**

Reasoning, and the reason this is split from the reporting work:

- Changing precedence is a **behaviour change to existing documents**, and no
  test or user report currently demands it. Reporting is strictly **additive**.
- All five capped debts are clearable *today* under unchanged precedence, so the
  fix is unblocked without waiting on a design argument.
- The conflict may prove **moot**: it is an editor-mode collision (a human
  pressing `Space` while a machine previews), not a runtime one. If `Space`
  stops the preview, the two never drive the same address concurrently — which
  would settle precedence by removing the case rather than ranking the layers.

So: **land reporting now with precedence unchanged; decide precedence separately,
with the `Space` decision made first**, since it may dissolve the question.

A note on `AI_CONTROL_MODEL.md`'s highest-level-first principle, which argues the
machine (semantic) should outrank raw timeline playback: that is a real argument
*for* machine-wins, and it is deliberately **not** being acted on yet — precisely
because it is an argument from principle, and the collision it would resolve may
not survive the `Space` decision. Recorded so it is not lost.
4. **Test at the function boundary, not the product boundary.** Call the merge
   directly with two synthetic layers sharing an address. A size-one set that
   "tests a collision" by asserting none occurred proves nothing and reads as
   coverage.

Multi-*machine* conflict resolution for the Phase 5 runtime player remains a
**named open question**, not decided by omission.

### Override staleness is an exception, not a degraded frame

`applyLayer` **throws** on a non-animatable address
(`evaluation.js:24-26`), and machine overrides pass through it at `:67`. So any
staleness in the override map is a **render-loop exception**, not a soft
failure. The brief must state which discipline applies: the preview controller
either catches and reports around `evaluateDocument`, or guarantees validity by
construction. Do not leave this to implementation.

### Frame budget

`evaluateDocument` re-normalizes the document **three times per call**
(`:57, :72, :81`). Per-frame machine preview inherits that cost. This is already
true for timeline playback and is not a blocker, but measure `evaluateDocument`
on a large fixture in Node and record a number, so "preview stutters" arrives as
a budget rather than a bug report.

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

## Known defects (named, with owners required before action)

Recorded here rather than in test comments, which disappear the next time
someone touches the file.

### KD-1 — zero-offset vertices expose live drag targets

`renderer.js:436-465` iterates `vertices × ['in','out']` and appends a
`bezierHandle` circle **unconditionally**; the `Math.abs(offset) >= 0.0001`
guard at `:444` wraps only the `handleLine`, not the handle. Handle count is
structurally `vertices * 2`.

Consequence: a three-point path with **no authored bezier data** still gets six
`pointerdown` targets (`:463` binds `#startHandleDrag`), each sitting exactly on
top of its vertex and invisible. Grabbing one silently converts a corner into a
curve.

Surfaced by counting the DOM under the headless seam — not visible by looking at
a canvas. The stale `.bezierHandle === 4` assertion that revealed it had been
wrong for as long as the file went unrun.

**Status: unowned.** `renderer.js` is in no one's file scope, and this is a
behaviour change to how every path edits. It needs an assigned decision, not an
opportunistic fix. The test pins current behaviour (`6`) and explicitly does not
bless it.

### KD-3 — a deleted node and a non-animatable property are indistinguishable

`isAnimatableProperty` (`properties.js:153-162`) ends in
`return Boolean(node && supportsNodeProperty(...))`. A **missing node** and a
**valid node with a non-animatable path** both return `false`, with no
distinction. `applyLayer` (`evaluation.js:24-26`) then throws a single message:

```
${source} cannot drive non-animatable property ${address}
```

`properties.js:108`'s more specific diagnostic is never reached, because the
predicate returned `false` rather than throwing.

**Why this matters more than a normal message-quality nit:** the two causes have
*opposite* remediations. If the node was deleted, the fix is to restore or
recreate it. If the property is not animatable, the fix is to choose a different
address. An AI reading this error cannot tell which — so it cannot self-correct,
and will guess. That is a direct hit on the project's core principle: a human
debugging this would inspect the document and see the node missing; the AI is
handed strictly less information than the human has.

Found by the arbiter author while a **guard** failed for an unexpected reason —
i.e. the test suite discovered it, which is the argument for guards that pass
today being retained rather than deleted.

**Status: unowned.** `properties.js` and `evaluation.js` are in nobody's scope.

### KD-2 — the headless browser suite exercises first render only (gate i-b)

`renderer.js` uses `:scope >` partial-update paths at `:147`, `:148`, `:734`,
`:738` (`replaceWith` of `.rigMeshes` / `.rigOverlay`, and lookups of
`.sceneShape` / `.vertexControls` during node update). The seam now supports
them, but `tests/veyra-browser.js` performs a single `render()` and never
re-renders, so **those paths are supported but unexercised**.

A suite that reads as "browser coverage" while proving only first render is the
same class of trap as an unwired suite. The `pointerEvent` export plus those four
call sites are the seed of a drag-and-live-update test — the one thing that would
catch this bug class, and which the state graph panel will depend on.

**Gate (i-b): partial re-render and pointer-drag coverage must exist before the
panel is dispatched.**

## Shell drag paths are structurally untestable — and this is now binding

**A store-level test cannot catch a shell-level misuse.** The `begin()`
regression proved it: `store.begin()` was called from inside a `pointermove`
handler (`veyra.js:2239`), firing every move while `commit()` ran only on
`pointerup`. The **store behaved correctly throughout**. A
`begin×3 → one transaction → one undo` test passes with that bug fully present,
because the defect was never in the store.

Worse: `veyra.js` **cannot be imported in Node at all** — it is a browser script
with no module boundary. So no Node suite can reach the drag orchestration, and
13 green suites watched working code break.

### The requirement

**Drag orchestration must live in `src/veyra/` as a pure function returning a
command descriptor — `event → intent → command`.**

This is the same cut already required for the panel (see *Verification
strategy*), arrived at independently from a second direction, which is the
strongest argument for it. Consequences:

- "begin exactly once per gesture" becomes **structurally obvious** rather than a
  convention every call site must remember.
- The gesture becomes Node-testable without a browser.
- The panel inherits a working pattern instead of needing `try`/`catch`
  discipline replicated at every site.

**This is a stated constraint on the 3B-2 brief, not optional refactoring.** Any
new drag path in the panel that calls `store.begin()` directly from a DOM handler
repeats the exact defect.

### Inventory (measured 2026-09-04): the renderer already complies; only the shell does not

Measured by reading every pointer-orchestration site, not assumed. This narrows
the extraction — it is **not** a rebuild of the canvas, it is bringing the shell
up to the standard the renderer already meets.

**Renderer drags already implement `event → intent → command`** (the model to
copy). Each gesture in `renderer.js` calls `callbacks.begin(label)` once, then
`callbacks.move*()` per move, then `callbacks.commit()` — one transaction, one
undo entry per gesture, with `callbacks.cancel()` on `pointercancel`
(`renderer.js:498-522` capture helper; node `:552-565`, group `:585-595`,
curve-create `:602-618`, handle `:630-642`, vertex `:658-671`, control
`:691-702`, bone `:720-733`). The shell wires these to the store
(`veyra.js:158,236-237`). **Do not touch this path — it is the reference
implementation.**

**Shell drags are the imperative outliers that need extracting.** Three
patterns, all in `veyra.js`:

1. **Live-mutate, transaction per gesture** — artboard resize (`veyra.js:2228-2267`).
   `begin` on first move, `mutate` per move, `commit`/`cancel` on end. This is
   the exact site of the G4 regression; today it is protected only by an inline
   `!resizing` guard plus a `try{commit}catch{cancel}`. Highest-priority extract.
2. **Commit-at-end, single command** — keyframe drag (`veyra.js:1280-1327`) and
   work-area band (`veyra.js:2025-2076`). During the gesture only DOM/style
   changes; one store command on pointerup. Already correct in *shape*; the
   orchestration just lives inline in the shell rather than in a pure function.
3. **View-only, no store** — canvas pan (`veyra.js:2189-2207`) and the artboard
   pan strip. No transaction needed; out of scope for extraction except to keep
   it from being accidentally transactionalised.

**Consequence for the extraction brief:** the target is a set of pure intent
functions in `src/veyra/` that the shell's three pattern-(1)/(2) sites delegate
to, mirroring the renderer's `begin/move*/commit` contract. The arbiter for that
task asserts "begin exactly once per gesture" against those functions in Node,
which is precisely what the inline shell code cannot be tested for today.

## Editing a wired file is no longer private

The moment a suite is wired into `npm test`, it stops being scratch space. A
five-call `edit` chain on a wired file left it unparseable between calls, and
another member ran the battery in that window and reported a `SyntaxError` in
someone else's file.

- **Announce before editing a wired file, not only after.**
- Prefer **one atomic `write`** over a chain of `edit`s on a wired file.
- A member hitting a broken wired file **reports it and does not touch it** —
  which is what happened, and is the correct behaviour.

## Version support must be an append-only list, not a derived pair

The v4 work briefly made **every existing v3 document unreadable**. The accept-list
was written as `[1, 2, VEYRA_VERSION]` — *derived* from the version constant — so
bumping the constant to 4 silently dropped 3 from the accepted set. Nothing
warned; the list looked correct at a glance.

The repair introduced `VEYRA_LEGACY_VERSION = 3`, giving `[1, 2, LEGACY, VERSION]`.
**That defers the same bug rather than fixing it**, because it is a single slot:

```
today:  VERSION=4, LEGACY=3  -> accepts [1,2,3,4]
next:   VERSION=5, LEGACY=4  -> accepts [1,2,4,5]   <- v3 silently gone
```

A one-slot "legacy" variable asserts *there will never be more than one old
version* — precisely the assumption that just broke the tree.

**Required shape: an append-only frozen `VEYRA_SUPPORTED_VERSIONS` list, with
`VEYRA_VERSION` derived from it** (the last entry), not the reverse.

The decisive argument is how the two read **in review**: deleting an element from
a list named `SUPPORTED_VERSIONS` looks dangerous and invites a question, whereas
editing `LEGACY = 3` to `LEGACY = 4` reads as routine bookkeeping. Make the
dangerous operation *look* dangerous.

### This is the third instance of one pattern

A **published description** drifting from the **mechanism**:

1. `sources` emitted `'playback'` while `VEYRA_EVALUATION_ORDER` omitted it.
2. An accept-list claiming four versions while one slot holds two of them.
3. (Earlier) the manifest describing capabilities the commands did not have.

The cure is the same each time and is already proven: **derive the description
from behaviour and assert they match** — the override-merge guard now pins "the
published layer order matches the order the evaluator actually applies." Apply
the same treatment to version support.

### Version coverage gap

**Only v1 has legacy load coverage** (`veyra-foundation.test.mjs:56-59`). Nothing
loads a v3 document — which is exactly why this class of break ships green: the
fixtures do not span the versions the code claims to accept.

**Required:** a load test per accepted version. An accept-list is a claim about
behaviour, and an unexercised claim is documentation.

## HUMAN RULINGS 2026-09-04 — §7 answered; schema reopened (authority: human > contract > debater > leader)

Logesh answered the four open product questions directly (recorded by Sheema,
corroborated by Logan and measured against the shipped code). R2 (`Space`) is
appended in the precedence section above. R1 and R3/R4 follow.

**R1 — External builds:** unknown; nothing has ever been pushed or pulled; the
project stays local. The **no-v4-gate** position stands unchanged (a format bump
is cheap, a broken loader is not; the frozen supported-versions list already
prevents the one-slot-legacy drift).

**R3 — Listener/machine coupling REVERSED (schema reopens 3B-4).** Direct
click→play-animation must work with **no state machine**: machines are the
advanced path, not a prerequisite. Measured consequence: the shipped schema
cannot express the default case — `normalizeListener` requires `machine` and
`input` unconditionally and `VEYRA_LISTENER_ACTIONS = [setInput, fire]`.
Required shape:

- Actions grow a **play family**: `play`, `stop`, `seek` (exact enum ratified at
  the schema cut; `seek` carries a numeric `value`, `play` may carry a
  `restart: true` modifier (LEADER INFERENCE from R2's replay-from-start intent — NOT attributed to the human; ratify or drop at the schema cut).
- Conditional required refs: `setInput`/`fire` ⇒ `machine` + `input` required;
  play-family ⇒ `timeline` required, machine/input forbidden. Unknown-combination
  shapes **throw** (a binding that silently degrades is the evaporation bug in
  new clothes).
- Version rule unchanged: any `listeners` key ⇒ v4.
- The sibling-team's committed authoring contract (`f9a1230`) and its
  "play-not-advertised" test now encode the *old* doctrine; at the schema cut
  they must flip red and be re-anchored in the **same atomic commit**. That red
  is the canary working.

**R4 — Empty/unfinished machine targets: WARN, do not refuse.** Editing-time:
non-blocking warning with the offender's address; runtime: explicit log, never
silent; publish-time: escalate to a strong warning. This **supersedes** the
debater/leader "refuse loudly at normalize" position ratified at 01:51–01:54Z;
the arbiter check written against refusal must be rewritten to warning tiers
before it counts as green.

**Process note (honesty, in place):** during the concurrent-teams incident this
doc briefly recorded rulings as "RATIFIED by debater Natalie." Natalie turned
out to be real — a debater on the human's *other* team (separate chat, same
workspace, ended by the human 2026-09-04). Their ratifications governed their
board; the authoritative record for this workspace and its tests remains this
contract and our ratifiers. Where both teams ratified the same decision
independently, that is convergence — recorded as evidence, not as confusion.

## KD-1 — zero-offset bezier handles (RATIFIED by debater Logan, 2026-09-04)

> **Attribution correction (2026-09-04, by leader ruling after the human's
> decision on the concurrent-session incident):** this section was committed
> crediting the ratification to "debater Natalie" — a member off this roster
> since before the ratification existed. The actual ratifier is **Logan**, on
> the team board at 01:51Z ("I ratified the remaining gates ... applying the
> KD-1 suppression proposal"). The proposal's evidence stands untouched — only
> the process record is corrected, in place, never silently.

**Evidence (measured from `renderer.js:436-478`, not recalled):**

- For every path vertex the renderer emits BOTH `in` and `out` handle circles
  unconditionally (`:439-465`), regardless of offset.
- The offset guard at `:444` wraps only the `handleLine`, never the handle
  circle. A zero-offset handle sits at exactly `(vertex.x, vertex.y)`.
- The vertex point (`r = 5/zoom`) is appended AFTER the handles (`:467`), so it
  paints on top of the coincident handle (`r = 4/zoom`) and receives every
  pointer hit. **A zero-offset handle is invisible AND ungrabbable.**
- Consequence: for a corner vertex (both offsets zero) a human can never grab a
  handle to drag curvature into existence. The capability is reachable only via
  the script API — `veyra.moveHandle` (`veyra.js:168`) — which AI uses directly.
- So this is the INVERSE of the core principle: something AI can do that a human
  cannot do from the canvas.

**Proposed ruling:**

1. **Suppress zero-offset handles at render time** — circle AND line. The guard
   already exists for the line; extend it to the circle. A control that can never
   receive a click is noise, and "the control exists in the document" does not
   oblige the presenter to paint it where it cannot be touched.
2. Re-anchor the seam pin `tests/veyra-browser.js` (`.bezierHandle === 6`,
   currently marked PINS-CURRENT-BEHAVIOUR-NOT-APPROVED) to the non-zero-offset
   handle count, with the rationale inline.
3. **"Corner → smooth from the canvas" is recorded as a NAMED GAP** until a
   vertex-type affordance ships with the panel. Named, not silent — the same
   discipline as the listener/machine coupling.
4. Rejected alternatives: emitting handles at synthetic non-zero offsets (the
   presenter would fabricate document state — model decides, presenter reports);
   reordering paint so handles sit on top (the hit ambiguity moves, it does not
   resolve).

**Status: RATIFIED and LANDED.** Ratified by debater **Logan** (board, 2026-09-04
01:51Z, alongside the v4-gate and zero-state rulings); implemented and pinned in
`a3beae0` (zero-offset circle+line suppressed; seam pins re-anchored with
measurements; corner→smooth recorded as the named gap above). `renderer.js` is
no longer locked. See the attribution correction at the head of this section for
how this page briefly mis-credited the ratification.

## Test discipline: name whose behaviour you observe

Adopted after **three tests went green for the wrong reason in three files within
one hour**, each written by a careful author:

1. An error-message comparison that embedded the address in both sides, so the
   strings always differed and the check could never fail.
2. A stale-override check whose address failed to *parse*, so it threw before
   ever reaching the guard it claimed to exercise.
3. A lost-pointer-capture check that asserted on `FakeElement.hasPointerCapture`
   — the **test harness's own bookkeeping** — while its message declared a
   renderer defect. `renderer.js:505-515` handles `pointercancel` correctly:
   it removes all three listeners, clears `dragging`/`dragKind`, and fires
   `callbacks.cancel`.

None was sloppy. Each asserted something *true* about a **convenient stand-in for
the thing that matters**. The harm is not the false green: it is that the next
reader "fixes" correct source to satisfy a test that was only ever measuring the
harness.

**Rule: every assertion must name whose behaviour it observes — model, store,
renderer, or harness. If it observes the harness, the test must say so.**

Corollary for the renderer: assert renderer state (`dragging === false`,
`dragKind === null`) and, most importantly, that a `pointermove` *after*
cancellation causes **no further document mutation** — which proves the
`removeEventListener` calls actually worked. That is the "assert against the
model" rule applied one level in.

**Open, and deliberately not asserted:** whether `pointerCancel` omitting an
explicit `releasePointerCapture` is correct because browsers implicitly release
capture on cancel. Web search is unavailable in this session, so **no member has
verified it**. It is recorded as an open question rather than settled from
memory.

## Wiring policy: unwired must never mean forgotten

`veyra-browser.js` carried an impossible assertion for months because it was
never in `npm test`. The fix is not "wire everything immediately" — a suite with
intentional reds would make the build permanently red, which trains everyone to
ignore it (the same rot by a different route).

The rule:

- A suite is wired into `npm test` **when it is green**.
- Until then it is a **named acceptance gate**, listed below with an owner and
  the work that will make it green.
- An unwired suite that is not listed here is a bug in our process.

### The debt ratchet

The dilemma — wire a suite carrying genuine unfixed debt and the build is
permanently red; leave it unwired and it rots — is resolved by a **capped debt
count**. The suite asserts *how much* is unenforced, rather than that nothing is:

```
KNOWN DEBT (capped at 5): 5 unenforced contract items — the override-merge
collision policy, 3B-2 scope. This run passes by design. It stops passing the
moment the count rises.
```

The suite can therefore be wired **immediately**: it exits 0 today, fails the
instant debt grows, and prompts lowering the cap as debt shrinks. Debt becomes a
number the build enforces instead of prose nobody re-reads.

Verified across all three branches by execution: cap 5 → exit 0; cap 4 → **exit
1**; cap 6 → exit 0 with a "lower the cap" note. *A cap that never rejects is
decoration.*

**Every future suite carrying intentional reds uses this pattern.**

| Suite | Status | Gate for |
| ----- | ------ | -------- |
| `veyra-machine-invariants.test.mjs` | wired, 40/40 | 3B-1 (closed) |
| `veyra-browser.test.mjs` | wired, 15/15 | 3B-2 gate (i) (closed) |
| `veyra-renderer-interaction.test.mjs` | green, exit 0 — **wire now** | 3B-2 gate (i-b) |
| `veyra-override-merge.test.mjs` | exit 0 via ratchet (5 capped) | 3B-2 collision policy |

### Positive controls are part of the rule

A corrected assertion still needs to prove it *can* fail. So the discipline has
two halves, and the second is the one everyone forgets:

1. Name whose behaviour the assertion observes.
2. Demonstrate the assertion can fail — a negative control for absence, a
   positive control for presence.

**Recorded correction.** A fourth instance of the pattern was alleged against the
*fix* for instance (3), on the grounds that it lacked a positive control. The
allegation was **retracted by its author after a mutation test on a throwaway
copy of the file proved the assertion does fail when the behaviour regresses.**
The claim had already been committed here and is corrected rather than quietly
removed.

This is the rule working as intended, applied to a reviewer instead of an
implementer: a disputed claim was settled by **running an experiment rather than
arguing a third time**, and the durable record was fixed the moment the evidence
landed. Mutation testing — deliberately breaking the source on a scratch copy to
confirm the test goes red — is the cheapest available proof that an assertion is
load-bearing, and is the preferred way to settle "does this test actually test
anything?"

### Measured frame budget

From the override-merge suite: **16.70 ms/frame, within the 60 fps budget**, and
**288 ms of work per second of preview**. The override merge itself is free; the
`evaluateDocument` triple-normalize (`:57, :72, :81`) is ~9-10% of every
evaluation — real, worth fixing eventually, **not** a 3B-2 blocker.

## Definition of done for gate (i)

Building the seam is not closing the gate. `package.json:6-7` are hardcoded
lists, and an unwired suite is exactly how `veyra-browser.js` asserted a handle
count the renderer could not produce, undetected. Gate (i) is closed only when
`tests/veyra-browser.test.mjs` **and** `tests/veyra-machine-invariants.test.mjs`
are green **inside `npm test`**, not when they pass by hand.

Ordering constraint: the arbiter carries intentional reds until §A0 lands, so
both files are wired in **one edit, by the `package.json` owner, as the last step
of §A0**. Two agents editing the same `"test"` string is how one addition is
lost silently.

## Open questions

1. Multi-machine property-address conflict resolution (deferred to Phase 5).
2. Whether `reject` or `cascade` is right for input type change if a case emerges
   where refusing blocks a legitimate workflow.
3. **Whether any Veyra build exists outside this tree.** This sets the real cost
   of the version decision — with no external readers, conditional v4 stamping is
   nearly free; with them, it is the difference between a loud rejection and
   silent listener loss. This is a question for the human, not the team.
