# Veyra — team handover

> **STATUS BANNER (added by Akash, 2026-09-04, commit `0d048c5`):** the tree has
> moved since this document was written. The atomic green commit `7223a1e`
> landed after it: listeners suite committed and wired, golden fixtures
> re-blessed, battery fully green at 14/14. The current authoritative picture is
> `docs/VEYRA_PROJECT_STATUS.md`. This document remains the deeper reference for
> per-suite measurement, test doctrine (§6), and environment traps (§9); where
> its numbers conflict with the status doc, the status doc is newer.

**Written:** 2026-09-03, updated same day · **Tree:** local commit `1d0c65e` + uncommitted `package.json`/`model.js`/docs, 29 ahead / 3 behind `origin/main`
**Verification command:** `npm test` (14 wired suites) · `npm run check` (17 modules)
**Standing orders from the human:** **local only — no push, no pull, no fetch.** `renderer.js` is locked. No destructive git (`stash`, `reset`, `checkout --`, `clean`) — the working tree carries unpushed work that a `stash` would strand.

Everything below is either **measured** (I ran it, at this commit) or **attributed** (someone reported it and I did not verify). Where a claim is attributed, it says so. That distinction is the point of the document.

---

## 1. What Veyra is

An interactive design, animation, and runtime platform at the level of tools like Rive, built so that **AI can understand the project and perform the same work a human can**. Core principle: *anything a human can do inside Veyra must also be possible for an AI to understand and perform.*

Practical consequence for anyone working here: an undocumented capability is a **missing feature**, not a detail. When a human-only path exists (a drag handler with no command behind it, a required field discoverable only by an exception), that is a defect against the goal, not tech debt.

---

## 2. Current state — measured, individually

**`npm test` exits 1.** The failure is one golden assertion. Critically, `npm test` is a `&&` chain, so **the first red silently suppresses every suite after it** — golden is 9th in the list, which means suites 10–13 (arbiter, browser seam, renderer interaction, override-merge) **do not run at all** when goldens are red. I therefore ran all 14 files individually. Per-suite truth:

| Suite | Exit | Result |
| --- | --- | --- |
| `architecture-modules` | 0 | passed |
| `veyra-model` | 0 | passed |
| `veyra-foundation` | 0 | passed |
| `veyra-rigging` | 0 | passed |
| `veyra-animation` | 0 | all passed |
| `veyra-statemachine` | 0 | all passed |
| `veyra-manifest` | 0 | passed |
| `veyra-store` | 0 | passed |
| **`veyra-golden`** | **1** | `AssertionError: animated must remain canonical JSON.` |
| `veyra-machine-invariants` | 0 | **41/41 green** |
| `veyra-browser` | 0 | **15/15 green** |
| `veyra-renderer-interaction` | 0 | passed |
| `veyra-override-merge` | 0 | **19/19 green, debt cap 0** |
| **`veyra-listeners`** | 0 | all passed standalone — **wired, but never reached by the chain; see B1** |

**14 test files on disk, 14 now referenced in `package.json`.** But because the chain aborts at position 9, **only 9 of the 14 actually execute in `npm test` today** — the arbiter, the browser seam, the renderer-interaction suite, the override-merge suite and the listeners suite are all shadowed by the golden failure. Their green above comes from my **individual** runs, not from the battery. "Battery green" and "battery complete" are different claims; don't conflate them, and don't cite this table as evidence that `npm test` covers them.

**Corroboration for B2 from the test's own output:** the canonical diff the golden suite prints is exactly `'  "listeners": [],\n'` — one inserted line per fixture.

---

## 3. Repo map

**Runtime (`src/veyra/`, ~5,000 lines, zero dependencies, all Node-testable):**

| Module | Lines | Responsibility |
| --- | --- | --- |
| `model.js` | 1498 | Document schema, `normalizeDocument`, all validation, version constants |
| `store.js` | 736 | `VeyraStore`: transactions, commands, undo/redo, cascade deletion |
| `renderer.js` | 705 | DOM/SVG renderer, vertex + bezier handles, drag capture — **LOCKED** |
| `stateMachine.js` | 414 | Runtime machine: `step`, inputs, transitions, reconciliation |
| `commands.js` | 385 | Command catalog with `params` and `summary` — the AI-facing action surface |
| `manifest.js` | 372 | Capability/manifest export (what an agent can enumerate) |
| `animation.js` | 336 | Timelines, keyframes, `createAnimationPlayback` |
| `rigging.js` | 305 | Bones, IK, constraints |
| `geometry.js` | 231 | `renderSvgString`, path/shape emission, SVG `<metadata>` |
| `properties.js` | 162 | Property addressing: `nodePropertyAddress`, `parsePropertyAddress`, `writeProperty` |
| `capabilities.js` | 144 | Per-node-type animatable/writable property tables |
| `evaluation.js` | 121 | Layer composition + provenance attribution |
| `summary.js` | 111 | Compact document summary for AI |
| `contracts.js` | 119 | Shared invariants |
| `references.js` | 69 | Reference objects (`id` + `name` persistence) |
| `io.js` | 51 | `parseVeyra` / `serializeVeyra` / download helpers |

**Shell:** `veyra.js` (~2,500 lines, browser), `veyra.html` (**89 distinct element ids**), `index.html`, `app.js`, `deep.js`, `veyra.css`. The shell imports `src/veyra/*`; nothing in `src/` imports the shell.

**Fixtures:** `tests/fixtures/veyra/*.veyra` — five, **LF line endings, no BOM**, extension `.veyra` (not `.json`).

---

## 4. The parts with sharp edges

### Versioning (measured at `model.js`)

```js
L22  export const VEYRA_VERSION = 3;                        // default stamp
L23  export const VEYRA_LISTENER_VERSION = 4;               // content marker
L24  export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4]);
L1258 if (!VEYRA_SUPPORTED_VERSIONS.includes(inputVersion)) throw ...
L1354 version: listeners.length > 0 ? VEYRA_LISTENER_VERSION : VEYRA_VERSION,
```

- Stamping is **conditional**, and `4` **is reachable**. Proven by building a legal listener-bearing document through the command layer: stamps `v4`, round-trips to `v4` with the listener intact; the same document with `listeners: []` stamps `v3`. **An empty listener array is not v4 content.**
- `normalizeDocument` **always emits `listeners: []`** (leader ruling, with precedent: `stateMachines: []` has always been emitted in the v3 fixtures). Reason given: a document's shape shouldn't depend on which optional registries happen to be empty.
- **`node --check` cannot detect an undefined identifier** — it is a syntax gate, not a resolution gate. This bit us for real: `VEYRA_LEGACY_VERSION` was deleted while four call sites still referenced it, `--check` passed, and every test failed at *import*. Only importing a module proves its names resolve.

### Evaluation and provenance (`evaluation.js`)

`evaluateDocument(authoredDocument, layers, animationPlayback)`. Layers apply in ascending precedence; **later application wins**, and `sources[address]` records the winner. Published order and applied order now match, and `veyra-override-merge` enforces that they *continue* to match (its 19th check derives precedence by feeding one address to two contributors and compares the measured winner to the published array).

- Machine overrides attribute as `'animation'`; **playback attributes as `'playback'`** — a deliberate split, because both previously flattened into `'animation'` and a collision was unreportable. Blast radius measured: exactly one consumer observed the conflated value; no production code branches on it.
- Collisions are reported as `diagnostics.collisions` entries `{address, sources:['animation','playback']}`, **recorded even when both contributors agree on the value.**
- **Precedence ruling (leader):** playback wins over machine animation. Unchanged by all of the above.

### Store transactions (`store.js`)

`begin(descriptor)` **throws on re-entry**, before touching any state, and reports the open command's label back to the caller. Measured consequences of a rejected nested `begin()`: the outer transaction survives, `mutate` still applies, `commit()` closes it, and a multi-move gesture yields **exactly one undo entry**. **A rejected `begin()` strands nothing.** (This corrects an earlier claim in circulation that it "wedged the editor" — that was asserted, then disproven by running it.)

**`store.inTransaction` does not exist** (zero matches repo-wide). So a caller cannot ask whether a transaction is open; the only available pattern is try/catch. Deliberately left as an open item, not a bug — see §8.

### State machine runtime (`stateMachine.js`)

Reconciles lazily via `#reconcile()` before **every public read and mutator**, keyed by a **structural signature** (`machineSignature`: initial state, input ids/types, state ids, transition ids/endpoints — deliberately excluding names, values, durations, conditions). Structural change → reset; cosmetic change → no reset. `#reconcile()` must never throw (it runs inside `step()`); construction may. Four reconciliation defects (dangling state, dangling active transition mid-blend, shadowed inputs, asymmetric reset) are fixed and pinned by the 41-check arbiter.

---

## 5. The invariant arbiter — and its one known flaw

`tests/veyra-machine-invariants.test.mjs`, **41/41 green**. Written by a non-implementer **before** the implementation existed, against the contract rather than the code, and never softened to fit a shipped design. It is the acceptance gate everyone codes against.

Structure: `check('DEFECT' | 'GUARD', name, fn)` — DEFECT may be red pre-fix; **GUARD must never go red**, and a GUARD failure is an unconditional build failure regardless of any debt state.

**Known flaw, recorded rather than hidden:** the check `a stale override address raises rather than silently doing nothing` **passes for the wrong reason**. It feeds `` `${nodeId}/ghost/x` ``, which fails `parsePropertyAddress` (no `kind:` prefix) and so never reaches the animatability guard it claims to exercise; the assertion `/property/i` matches all three error classes. Correct coverage exists in `veyra-override-merge`, which compares error-message *templates* with the address substituted out. Fixing the arbiter check would turn it red, which would break the acceptance gate mid-milestone, so it was scheduled, not dropped. **Do not treat that check as evidence about stale overrides.**

---

## 6. Test doctrine (this is the part worth preserving)

1. **The debt ratchet.** A suite carrying known-red DEFECTs sets `EXPECTED_RED_DEBT`. GUARD regression → exit 1 always. `red > cap` → exit 1 BLOCKING. `red == cap` → exit 0 with a loud banner. `red < cap` → exit 0 demanding the cap be lowered. Debt must be **named, capped, and in the battery** — never an unwired file, never prose in a document. It worked end-to-end this cycle: carried 5 debts, reported 18/18 when the fix landed, was lowered to 0 by the suite's owner rather than left stale.
2. **A green test is not evidence about a path it never touches.** Two named instances: a store-level nested-`begin` test would pass with a live shell-level misuse present; a renderer-cancel test was cited as proof of a browser API it never calls.
3. **Assertions must be able to fail.** New or edited checks get mutation-tested: break the invariant (or the check's input), show the check go red, restore. This caught two tautologies in first drafts — one comparing full error messages that always embed different addresses, one comparing "is this a real Address object" instead of the wire format.
4. **Conditional guards cannot detect absence.** `if (x >= 0) assert(...)` passes silently when the thing vanishes. Assert presence unconditionally. Caught in my own file.
5. **A wired suite is not private scratch space.** Announce before editing, prefer one atomic write over a chain of edits, and report others' broken files rather than editing them. (A wired file was transiently unparseable mid-edit and another member tripped on it.)
6. **`package.json` is the graveyard.** Both `test` and `check` are hardcoded file lists. A new module missing from `check` is silently unlinted; a test file missing from `test` is silently unrun — which is exactly how a pre-existing suite carried an assertion the renderer could not satisfy for an entire milestone.

---

## 7. Blockers, in priority order

**B1 — `tests/veyra-listeners.test.mjs` is wired but STILL DOES NOT EXECUTE.** Status: untracked → now referenced once in `package.json` (wired by Asha during this write-up). But `npm test` is a `&&` chain and the suite sits at **position 10, immediately after `veyra-golden` at position 9** — so while B2 is red, **the chain aborts before it runs.** I confirmed this by looking for its summary line in the battery output and finding none: the only `listener` matches were the echoed command string and the golden diff text.

**Wired ≠ executed, and this is the exact distinction that hid a stale assertion for a whole milestone.** Acceptance is not "it's in `package.json`" — it is **`veyra-listeners` printing its own pass line in a full `npm test`.** That cannot happen until B2 is fixed, which makes B2 **coverage-blocking, not merely green-blocking**: the last prerequisite's gate is invisible to the battery until goldens are re-blessed. If you need to unblock coverage *before* B2, move `veyra-listeners` earlier in the chain — one-line change, same file, one writer.

**B2 — the golden re-bless has no owner.** `npm test` exits 1 on `animated must remain canonical JSON`. Measured per fixture (line-count diff of stored vs `serializeVeyra(normalizeDocument(parseVeyra(stored)))`):

| fixture | lines stored → canonical | delta |
| --- | --- | --- |
| `animated.veyra` | 159 → 159 | `"listeners": [],` added |
| `bezier-face.veyra` | 149 → 149 | same |
| `gradients.veyra` | 147 → 147 | same |
| `ik-arm.veyra` | 213 → 213 | same |
| `rectangle.veyra` | 87 → 87 | same |

**Read this table carefully, because my own probe initially lied to me.** The line totals are *equal* and the diff shows `+1 / -1`: the added line is the real change, and the removed line is a **trailing blank line that my probe counted but the test does not** — `tests/veyra-golden.test.mjs:24` compares `serializeVeyra(document)` against **`raw.trimEnd()`**. So under the test's own comparison the delta is exactly one inserted line per fixture, and the stored fixtures carry **no `listeners` key at all**. If you write your own diff to confirm, `trimEnd()` both sides or you will chase a difference that cannot fail the build.

The fix is therefore mechanical, and the two people entitled to bless goldens are unavailable.

Three things whoever does it must know:
- **Write with `fs.writeFileSync`, not PowerShell `Set-Content`/`Out-File`** — the latter emit CRLF and the fixtures are LF-only, which would rewrite every line of all five files and hide a one-key change inside a whole-file diff.
- **`tests/veyra-golden.test.mjs:24` asserts canonical *before* `:28` asserts the SVG hash, so a canonical failure means the SVG check never runs.** Fix the ordering or run them separately — otherwise "goldens green" won't tell you whether SVG was ever verified in that run.
- **The SVG hash is version-sensitive:** `geometry.js:243` embeds `formatVersion: scene.version` in SVG `<metadata>`. All five fixtures are v3 so their hashes stay identical today — but the first *listener-bearing* fixture will stamp v4, and its SVG hash will move with no rendering change. Don't let a future contributor read that as a renderer bug.
- Put the reason in the commit message. A re-blessed golden with a bland message is indistinguishable from someone silencing a red.

**B3 — shell drag paths have zero coverage, and that let a real regression through.** `store.begin('Resize artboard')` sat inside `onMove`, firing per `pointermove`. Thirteen green suites didn't catch it. Akash added shims (`localStorage`, `KeyboardEvent`, `matchMedia` at `4678773`), moving the import failure to `Cannot set properties of null` — the shell resolves **89 ids** via `$ = (id) => document.getElementById(id)` (`veyra.js:52`). So shell-level testing is **reachable but needs a `veyra.html` DOM builder** — not impossible (wrong), not ~20 lines (also wrong; my estimate). My "20 lines" error is the lesson: **a failure-point measurement is not a total-cost estimate** — the first missing global tells you the ordering of blockers, never their number.

**B4 — `renderer.js` is locked**, so the `.bezierHandle` 4-vs-6 question (contract **KD-1**) cannot be resolved by whoever owns the interaction surface. Needs an owner or an unlock.

---

## 8. Decisions that need authority, not analysis

- **Do pointer listeners require a state machine?** `normalizeListener` (`model.js:1223-1241`) requires a valid `machine` **and** a machine `input` *unconditionally*, for both actions; the only `action` branch is `setInput` needing `value`. Actions are `['setInput','fire']`; kinds `['pointer']`; target must be an existing **node**. Consequences: `fire` is no cheaper than `setInput`; **"click → play this animation" is not expressible** (no `play`/`stop`/`seek`); and a fresh `createStarterDocument()` holds **zero** listeners (no machine, and a machine state needs a real timeline). Defensible as "pointer events drive machines, machines own playback" — but the 3B-2 panel will be built on whichever reading wins.
- **A zero-state machine is legal and a listener can point at it.** Measured: `addStateMachine` creates a machine with `states: []`; such a document normalizes, stamps v4, and round-trips. Result: **a wired, valid, permanently inert interaction** — silent-no-op, invisible to every check we have, and undiagnosable by an agent from any signal we emit. Possibly legitimate as an in-progress authoring state, in which case the invariant belongs at the listener instead. Undecided, and nobody should decide it by accident.
- **Space-key policy** during machine preview — open since before 3B-2 was scoped; gates the precedence question.
- **`store.inTransaction`** — build it (cheap prevention at future drag sites) or declare try/catch sufficient and write the contract accordingly. Open since the arbiter's G4 check.
- **Does any Veyra build exist outside this tree?** Unanswered by the human, and it sets the real cost of the whole version-stamping exercise: if no other build exists, the bump protects nobody yet and can be built cheaply; if one exists, bump before listeners ship.

---

## 9. Environment gotchas (all cost someone time this session)

- `grep` and `glob` **both fail** in this sandbox (`ripgrep launch failed`). Use `pwsh` + `Select-String`, and **list directories rather than guessing paths** — three members independently burned cycles on invented paths (`fixtures/`, `tests/golden/`, `tests/veyra-architecture.test.mjs`). Real locations: `tests/fixtures/veyra/*.veyra`, `tests/architecture-modules.test.mjs`.
- The `read` tool takes `limit`/`offset` (1-based), **not** `lines`.
- PowerShell: here-strings (`@' … '@`) for multi-line JS; apostrophes inside double-quoted strings terminate them; `-First` truncates pipelines mid-expression.
- **`team_read_board` returns unread counts with zero bodies** — broken for at least one member, and polling marks posts consumed. Treat the board as write-only; **direct messages to the leader arrive reliably.**
- Fixture files are **LF, no BOM**; `serializeVeyra` output must be compared after BOM/CRLF normalisation or you'll chase phantom diffs.
- When copying a test file to a temp dir to mutation-test it, the copy loses `package.json`'s `type: module` context — keep temp files inside the repo and delete them in the same command that ran them.

---

## 10. What was settled this milestone (don't re-litigate without new evidence)

Reconcile-not-reset, keyed to the machine's structural signature · refusal-not-cascade for referenced inputs, with machine-readable named blockers · operator/type matrix enforced **in one shared authority** (`machineConditionViolation`) used by both loader and edit command · `conditions: 'always'` rejected outright (it was being coerced to `[]`, turning a gated transition into an unconditional one) · `value: 0.5` vs a number no longer coerced to `true` · conditional v4 stamping with **raw-presence detection before validation** (detecting from the *surviving* array would let invalid input be stripped, downgraded, and silently lost — the one case a simulated old reader cannot catch) · always-emit `listeners: []` · playback precedence unchanged, attribution split · event→intent→command as the shape for all shell gesture logic · the three-place vocabulary consistency rule (emission, evaluation order, manifest).

---

## 11. Two honesty notes about this document

- **The full arc of one bad claim, kept because it's the most instructive thing in this document.** I asserted to the team that "all five fixtures differ by exactly one line." Then I discovered I had **written the diff probe and deleted it without running it** — so I had stated a measurement I never took, the exact failure I had been policing in others all milestone. I rewrote the probe and ran it, and it **contradicted** me: equal line totals, `+1 / -1`, with a spurious removed blank line. Only then did I find the third layer: that blank line was **my own artifact** — I compared without `trimEnd()`, while `veyra-golden.test.mjs:24` compares against `raw.trimEnd()`. So the claim was ultimately right, but for a reason I had to discover by being wrong twice. **An unrun probe is not evidence, and a probe that disagrees with you is not necessarily telling you the truth either — check its assumptions before you accept its verdict.**
- I retracted a claim of my own mid-milestone (`inTransaction` being the load-bearing risk) after the design removed the risk; and my "~20 lines" shell estimate was wrong by an order of magnitude. Where a number appears above without "measured," treat it as attributed.
