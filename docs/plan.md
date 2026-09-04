# Verya Plan & Live Status

**Owner:** Sheema (critic). Updated every time something meaningfully changes — a
commit lands, a block clears, acceptance moves, or scope shifts. This is the
single place to check "where are we."

**Last updated:** 2026-09-04 06:07 UTC · HEAD `bb4d298`

---

## 1. North star

Build Verya as a complete interactive design/animation/runtime platform —
Rive-class capability — where every part of a project (layers, components,
animation, timelines, interactions, state machines, variables, assets,
behavior) is structured so AI can understand and do the same work a human
can, using the same standard workflows, not a special AI-only path.

## 2. Where we are right now (one paragraph)

The pure-runtime interaction milestone (click → play an animation, with or
without a state machine) is **done, tested, and accepted** — `src/veyra/`
has hit-testing, an event→intent resolver, and schema support, all
independently verified. The **current, active milestone** is wiring that
runtime into the actual browser editor (`veyra.js`) so a click is *visibly*
interactive. Implementation is on its 5th correction round and is **blocked
in independent acceptance** — not because the underlying idea is wrong, but
because no test yet proves the real `veyra.js` file behaves correctly when a
real pointer event fires on it. See §5.

## 3. Completed milestones

### 3.1 Pure interaction runtime (CLOSED — commit `a3fd795`)
- Listener schema reopened for direct playback: `play`/`stop`/`seek` work
  with just a target + timeline, no state machine required (human ruling).
- `src/veyra/hitTest.js` — pure point-in-shape hit testing (zoom/pan aware).
- `src/veyra/listenersRuntime.js` — event → intent resolver, hover
  enter/leave, stateful `createListenerResolver()` wrapper.
- Warn-not-block on unfinished/empty state machines (human ruling), exact
  wording: `⚠️ No playable animation is configured for this interaction.`
- 18/18 automated suites pass, `npm run check` clean.
- Full 8-gate independent acceptance (schema truth, warn-tier, manifest
  canary, byte/history isolation under load, **mutation-proofed** guard,
  determinism, version rule, full battery). All 8 passed.
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

**Owner:** Asha (implementation). **Acceptance gate:** Sheema (independent,
adversarial — does not implement, only verifies against the brief).
**Scope ruling / unblocking:** Akash. **Review:** Logan.

### 4.1 What's landed so far (not yet accepted)
| Commit | What it did |
|---|---|
| `c2e1cc0` | First implementation: `src/veyra/shellBridge.js`, `veyra.js` wiring, focused test. |
| `ba560a9` | Fixed: added `setViewport()` seam on the resolver (ratified API instead of a 4th `.resolve()` arg). |
| `11d5773` | Fixed: coordinate double-transform (shell was converting to world coords, then the resolver converted *again*). Fixed pointermove-only derived-transition routing. |
| `a92737e` / `8e726d6` | Fixed: preview pointerdown only called `preventDefault()`, not `stopPropagation()`, so the renderer's own drag/select handler could still fire underneath a preview click. Added capture-phase isolation. |
| `bb4d298` | Fixed: a real browser-time crash — `center` was referenced but its declaration had been deleted in an earlier correction (`node --check` can't catch this; it only shows up when an eligible pointer event actually fires). Added more adapter-level regression coverage (no-hit, document-identity hover reset, Alt-routing). |

### 4.2 Why it's still blocked (as of `bb4d298`)
Every test added across all 5 rounds calls the **adapter module directly**
(`bridge.resolve(...)`, `isPreviewPointerEligible(...)`, `canvasPoint(...)`).
**None of them import or execute `veyra.js` itself**, dispatch a real event
through a real/fake DOM element, or assert that an observable state inside
`veyra.js` (e.g. playback actually started) changed. So there is still no
direct evidence that:
- clicking a `play` listener in preview mode actually starts playback,
- a select-mode click does *not* also trigger playback,
- the document/undo history stay byte-identical through a real interaction,
- Space/text-input behavior (human ruling) survives the new wiring,
- missing-target diagnostics are visible through the real path.

The required mutation proof (deliberately break the resolver→transport
wiring on a scratch copy and prove a visible test goes red) also has nothing
observable to attack yet, for the same reason.

### 4.3 The fix in progress
This codebase already has the right tool for this:
`tests/helpers/fake-dom.mjs` — a dependency-free fake DOM
(`installFakeDom()`, `pointerEvent()`, `FakeElement`) built specifically so
real UI code can be exercised in Node without a browser. It's already used
by `tests/veyra-browser.test.mjs` to run *other* browser code; it has never
yet been pointed at `veyra.js` itself.

**Asha is now writing one new test file** that:
1. Installs the fake DOM.
2. Imports the real `veyra.js` (not a re-implementation of its logic).
3. Dispatches a real `pointerdown` on the fake canvas element, in preview
   mode, on a target with a direct-`play` listener.
4. Asserts an externally-observable signal (e.g. via the existing
   `globalThis.veyra` debug surface) shows playback actually started.
5. Repeats for: no-hit (no-op), select-mode (no-op, still selects), and
   store/history byte-identity across all of the above.

This single file is expected to close most of the remaining acceptance
gates at once and give the mutation proof something real to break.

### 4.4 Acceptance gate list (Sheema checks all of these before ACCEPT)
1. Standard `npm test` + `npm run check` green on the settled tree.
2. Real shell route: preview click on `play` listener starts playback;
   no-hit/no-listener is a no-op — proven via the fake-DOM integration test.
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
9. **Mandatory scratch mutation proof:** deliberately disconnect
   resolver→transport in an uncommitted scratch copy, prove the observable
   playback assertion goes red, then delete the scratch copy. Never
   committed.

Only after ACCEPT: Logan wires the new test file into `scripts/run-suites.mjs`
(single edit), the tree is re-verified as a full green battery, and this
section moves to "closed."

## 5. Named, deliberate gaps (shipped stated, not hidden)

These are real, known, and intentionally **not** blocking current work:

- **Hit-testing geometry:** only ellipses get exact hit-testing; every other
  shape (star, polygon, custom path) hit-tests against its axis-aligned
  bounding box. A star's empty bbox corner currently registers as a hit.
  Not fixed yet; not part of this milestone.
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

- **Single-writer file ownership** is enforced throughout: Logan owns
  `scripts/run-suites.mjs`; Akash owns `package.json` and the contract doc;
  Asha owns runtime/model/shell source; Sheema verifies and reports only —
  never implements the thing she's accepting.
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
