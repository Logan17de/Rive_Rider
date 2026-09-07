# Verya Plan & Live Status

**Maintainer:** Asha (leader). Updated every time something meaningfully changes — a
commit lands, a block clears, acceptance moves, or scope shifts. This is the
single place to check "where are we."

**Last updated:** 2026-09-07 · T1 battery relight and shell-handler extraction in progress

---

## 1. North star

Build Verya as a complete interactive design/animation/runtime platform —
Rive-class capability — where every part of a project (layers, components,
animation, timelines, interactions, state machines, variables, assets,
behavior) is structured so AI can understand and do the same work a human
can, using the same standard workflows, not a special AI-only path.

**Naming note:** Verya is the product name; `Veyra` remains the technical
identifier for the `.veyra` file format and persisted contracts for compatibility.

## 2. Where we are right now (one paragraph)

The pure-runtime interaction milestone (click → play an animation, with or
without a state machine) is **done, tested, and accepted** — `src/veyra/`
has hit-testing, an event→intent resolver, and schema support, all
independently verified. The **current, active milestone** is wiring that
runtime into the actual browser editor (`veyra.js`) so a click is *visibly*
interactive. The handler extraction, deterministic battery, and checker are
implemented in T1; independent acceptance is still pending on the settled,
committed tree. Transport intent emission is covered, while the separate
intent→playback dispatcher remains T2. See §4.

## 3. Completed milestones

### 3.1 Pure interaction runtime (CLOSED — commit `a3fd795`)
- Listener schema reopened for direct playback: `play`/`stop`/`seek` work
  with just a target + timeline, no state machine required (human ruling).
- `src/veyra/hitTest.js` — pure point-in-shape hit testing (zoom/pan aware).
- `src/veyra/listenersRuntime.js` — event → intent resolver, hover
  enter/leave, stateful `createListenerResolver()` wrapper.
- Warn-not-block on unfinished/empty state machines (human ruling), exact
  wording: `⚠️ No playable animation is configured for this interaction.`
- **Historical correction:** the earlier claim that 18/18 automated suites passed
  and the full battery was green was not true after `c2e1cc0`. The new shell
  suite was not in the runner's hand-maintained list, so its sync guard threw
  before executing any suite; **the battery was dark**. No standard 18/18
  result was produced during that period.
- The related earlier statement that all 8 acceptance gates passed is also
  corrected: the full-battery gate did not execute after the runner drift, so
  the overall 8-gate result was unproven. The runner and acceptance record are
  being repaired in §4 before this milestone is called accepted.
- One real defect found and fixed pre-ship: a `play` listener carrying
  leftover machine/input data silently lost that data on file load (guard
  existed in the constructor helper but not in the actual load path). Fixed
  in both directions, verified three ways.

### 3.2 Prior foundation work (see git history, not re-summarized here)
Document model, rigging, animation core, state machines, renderer, golden
scenes, gesture extraction — all pre-existing and stable before this
session. Not part of this plan's active tracking; `git log` is authoritative
for that era.

## 4. Active milestone: browser-shell interaction bridge

**Goal:** make direct click→play *visible* in the actual editor. `veyra.js`
adapts real DOM pointer events → the accepted runtime → visible playback,
without touching schema, without breaking any existing editor tool (pan,
select, drag, pencil, artboard handles), and without ever writing to the
document/undo history from the pointer path.

**Status (2026-09-07):** the handler factory extraction and integration suite
are present in the working tree, but the standard battery has been relit only
in T1 and independent acceptance is still pending. This section remains open
until the committed tree passes both standard commands and the acceptance
mutation proof.

**Implementation:** Logan (worker). **Independent acceptance:** Alex (tester)
— verifies and never implements what he accepts. **Scope / debate:** Asha
(leader) and Sara (debater); Asha rules after Sara answers. The earlier Owner,
Acceptance gate, Scope ruling, and Review names belonged to a prior session and
are superseded.

### 4.1 What's landed so far (not yet accepted)
| Commit / state | What it did |
|---|---|
| `c2e1cc0` | First implementation: `src/veyra/shellBridge.js`, `veyra.js` wiring, focused test. |
| `ba560a9` | Fixed: added `setViewport()` seam on the resolver (ratified API instead of a 4th `.resolve()` arg). |
| `11d5773` | Fixed: coordinate double-transform (shell was converting to world coords, then the resolver converted *again*). Fixed pointermove-only derived-transition routing. |
| `a92737e` / `8e726d6` | Fixed: preview pointerdown only called `preventDefault()`, not `stopPropagation()`, so the renderer's own drag/select handler could still fire underneath a preview click. Added capture-phase isolation. |
| `bb4d298` | Fixed: a real browser-time crash — `center` was referenced but its declaration had been deleted in an earlier correction (`node --check` can't catch this; it only shows up when an eligible pointer event actually fires). Added more adapter-level regression coverage (no-hit, document-identity hover reset, Alt-routing). |
| Working tree (T1) | Extracted `createPreviewPointerHandlers` so `veyra.js` registers the exact handlers covered by `tests/veyra-shell-integration.test.mjs`; deterministic runner and syntax-check-chain repairs are in progress. |

### 4.2 Why acceptance remains open
The earlier blocker was that all shell tests called the adapter module directly
and never exercised the handlers registered by `veyra.js`. That is addressed by
the T1 extraction below, but acceptance is not implied by the extraction:

- `tests/veyra-shell-integration.test.mjs` calls the exact handler functions
  that `veyra.js` registers and checks their emitted transport intent,
  propagation control, diagnostics, coordinate conversion, and store/history
  identity.
- The test builds its own bridge whose `onIntent` records an array. Therefore
  **transport intent emitted is not playback proven**: the real
  `veyra.js` `dispatchInteractionIntent` chain remains a separate integration
  boundary and is not built or claimed by T1.
- The required mutation proof was independently completed: breaking
  resolver→transport in a scratch copy made the handler assertions fail, and
  the scratch copy was deleted without a commit (see gate 9).

### 4.3 Current implementation and test boundary
A full fake-DOM boot of monolithic `veyra.js` is deliberately not part of this
milestone: it expects roughly 89 DOM element ids with `.value`/`.checked`
behavior, while `tests/helpers/fake-dom.mjs` does not provide that form surface.
Instead, `src/veyra/shellBridge.js` exports `createPreviewPointerHandlers`, and
`veyra.js` registers the exact three functions returned by that factory for
`pointermove`, `pointerup`, and `pointerdown` in capture phase. The integration
test invokes those same functions with a fake canvas, spyable events, and a real
`VeyraStore`, avoiding a parallel reimplementation that could drift from the
shell wiring. A later full-app boot test can address the remaining boundary.

The integration suite covers preview hits and misses, select-mode no-op
routing, coordinate conversion, resolver refresh after document replacement,
unsupported-machine diagnostics, pointer transition behavior, and
propagation/default-prevention rules. It is now part of T1's deterministic
battery rather than a hand-maintained runner exception.


### 4.4 Acceptance gate list (Alex checks these independently before ACCEPT)
1. Standard `npm test` + `npm run check` green on the settled tree.
2. Real shell route: preview click on a `play` listener emits the expected
   transport intent; no-hit/no-listener is a no-op — proven via the exact
   handler integration test. This does not claim the separate
   `veyra.js` dispatch-to-playback chain, which is T2.
3. Coordinate conversion actually tested: canvas offset, zoom/pan, CSS/DPR.
4. Persistent resolver: no churn on repeated unchanged moves; real `leave`
   when the scene changes under a static cursor; resolver refreshes on
   every `store.document` identity change (ordinary edits/undo/redo too,
   not just file load) with no stale-hover leak.
5. Preview-only dispatch: select mode never also plays; pan, drag, pencil,
   artboard-handle behavior is provably untouched.
6. Pointer path never writes `store.document` or command history (byte- and
   length-identical across a live `VeyraStore`).
7. Human ruling R2 preserved: Space media-control behavior, literal Space
   in text inputs.
8. Missing-target/unsupported-machine diagnostics are visible, not
   swallowed; the empty-machine warning still shows.
9. **Mandatory scratch mutation proof — independently completed:** Alex copied
   the source and integration test to a scratch directory, disconnected
   resolver→transport, and ran the mutated integration. It exited 1 with
   GATE 1, GATE 3, and GATE 7 red (19/22 checks passed); the scratch copy was
   deleted and nothing was committed. This proves the handler gate is sensitive
   rather than vacuous.

After ACCEPT, this section moves to "closed"; the deterministic runner and
checker are already part of T1, and the settled tree must be independently
re-verified as a full green battery before that status changes.

## 5. Named, deliberate gaps (shipped stated, not hidden)

These are real, known, and intentionally **not** blocking current work:

- **Hit-testing geometry:** B1 gives polygons and stars exact nonzero fill
  containment plus straight-edge stroke-band hits in transformed screen space;
  rectangles and ellipses retain their existing exact tests. Custom Bézier paths
  intentionally remain on axis-aligned bounds until B2, including the starter's
  open, stroke-only mouth path. Path flattening is a separate known gap.
- **Runtime API robustness:** `resolveListenerIntents`/`createListenerResolver`
  silently ignore an unrecognized option key instead of throwing. Found when
  the leader passed a plausible-but-wrong `resolver:` option and got
  confidently wrong (not crashed) output. This is exactly the kind of trap
  an AI caller would hit. Named as the first item for the milestone after
  this one; not fixed now on purpose (mid-acceptance is the wrong time to
  change a signature).
- **No editor visual change until §4 closes.** Until the shell bridge is
  accepted and wired, clicking a shape in the running app does nothing new.

## 6. Process notes worth keeping

- **Single-writer file ownership** is enforced throughout: Logan owns the
  test runner/checker, `package.json`, and `docs/plan.md`; Asha owns
  runtime/model/shell source; Alex verifies and reports only — never edits the
  repository while accepting the thing under test.
- **Acceptance is adversarial by design.** Five correction rounds on the
  shell bridge is the process working, not failing: each round found a real,
  reproducible defect (double coordinate transform, event-propagation leak
  into the editor's own drag handler, a real runtime crash `node --check`
  can't see) before it reached the user.
- **A green individual test is not evidence by itself.** The standing rule
  used throughout: run the *standard* entry points (`npm test`, `npm run
  check`) on the *settled, committed* tree, independently, and require a
  deliberate mutation to prove a check can actually fail — not just that it
  currently passes.
- History of false alarms and self-corrections (leave-transition "defect,"
  a mis-attributed test suite, wrong exit-code readings from a merged
  PowerShell stream) all resolved by direct re-measurement rather than
  deferring to whoever spoke first, including the team leader. None reached
  the code.

## 7. How to read this file

- §2 is the one-paragraph answer if you only read one thing.
- §4.2 is "why isn't it done yet" whenever it looks slow.
- §5 is the honest list of what's known-imperfect on purpose.
- Everything else in `docs/` that used to carry rolling status has been
  removed in favor of this file; `docs/VEYRA_INTERACTION_SURFACE.md` remains
  as the normative technical contract (rulings, schema, wording) that this
  plan implements against — it changes rarely and is not a status file.
