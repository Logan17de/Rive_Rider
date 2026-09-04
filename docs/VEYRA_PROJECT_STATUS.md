# Verya/Veyra — Project Status & Team Handover

**Written by Akash (team leader) at commit `7223a1e`, 2026-09-04. Every number
below was measured at that commit, not recalled.**

For deeper detail see:
- `docs/VEYRA_TEAM_HANDOVER.md` (Logan) — per-suite measurement, test doctrine §6, blockers §7, environment traps §9
- `docs/HANDOFF_VERYA_STATE.md` (Asha) — architecture narrative, milestone history
- `docs/VEYRA_INTERACTION_SURFACE.md` — the **normative contract**; when this summary and the contract disagree, the contract wins

---

## 1. One-line status

**The model layer is complete and verified; the tree is green; the interactive
panel is designed on paper but unbuilt; four product questions need the human.**

`npm test` → **EXIT 0, all 14 suites execute and pass.** Working tree clean.
Git: `main`, **31 ahead / 3 behind `origin/main`** — **nothing has ever been
pushed, pulled, or fetched**; the remote's 3 diverged commits touch only
`tools/patch_rive.py` and `vendor/rive-tools/*`, orthogonal to this work.

## 2. What is being built

**Veyra**: an AI-readable vector/character design, animation, and interaction
platform (Rive-class ambitions). File format `.veyra` = UTF-8 JSON,
`format: "veyra"`. The governing principle:

> Anything that can be done inside Verya by a human should also be possible
> for AI to understand and perform.

Consequences that shape every decision: stable ids over names in persisted
references; loud refusal over silent discard; capabilities enumerable from a
manifest; contracts written down before code; tests that prove they can fail.

## 3. Milestone ledger

| Milestone | State | Evidence |
|---|---|---|
| **3B-1** machine edit commands + MachineRuntime reconciliation | **COMPLETE** | Arbiter `tests/veyra-machine-invariants.test.mjs` — **41/41**, written by a non-implementer *before* the implementation, never softened |
| **3B-2** interaction surface — gates (i) DOM seam, (i-b) partial re-render + pointer drag | **CLOSED** | Seam 15/15; renderer-interaction passing; both wired into `npm test` |
| **3B-2** collision policy (playback vs machine overrides) | **CLOSED** | `tests/veyra-override-merge.test.mjs` — **19/19**, debt cap driven 5 → 0 by the ratchet working as designed |
| **3B-4** listener registry + conditional v4 stamping | **COMPLETE** | `tests/veyra-listeners.test.mjs` passing with positive AND negative controls; landed atomically at `7223a1e` |
| **3B-2** panel (state graph UI, MachinePreviewController, listeners wiring) | **NOT STARTED** | Contract written; blocked on the four open questions below |

## 4. Architecture — where things live

| Path | Role |
|---|---|
| `src/veyra/model.js` | Canonical document model; normalize/validate gate; version stamping |
| `src/veyra/io.js` | parse/serialize (parse validates through model.js) |
| `src/veyra/store.js` | Commands, transactions (`begin`/`commit`/`cancel`), undo history |
| `src/veyra/stateMachine.js` | `MachineRuntime` — reconcile-on-read, structural signature, never mutates the document |
| `src/veyra/evaluation.js` | Layer evaluation: authored → animation → playback → constraints → interactive; collision recording |
| `src/veyra/animation.js`, `geometry.js`, `properties.js`, `constraints` | Timeline evaluation, SVG render, property bounds |
| `src/veyra/manifest.js`, `summary.js` | AI-facing capability/action catalog |
| `tests/helpers/fake-dom.mjs` | Dependency-free fake DOM; `rAF` throws by design (explicit deltas only) |
| `veyra.js` | Browser shell — **not a module; cannot be imported in Node** beyond missing DOM surface |
| `renderer.js` | Unowned; **locked** pending a KD-1 decision (zero-offset drag targets) |

**Versioning (post-3B-4):** `VEYRA_SUPPORTED_VERSIONS = [1,2,3,4]` frozen
append-only; default stamp **3**; documents with listeners stamp **4**.
Presence is read from the **raw authored key before validation** — the
back-door safeguard. Both emitted versions are provably in the support list
(listeners suite asserts it).

## 5. The test doctrine — the part worth preserving

1. **Independent arbiter.** The 41-check arbiter was written by someone who did
   not implement the code, before the code existed, and was never softened.
2. **Every assertion names whose behaviour it observes** — model, store,
   renderer, or harness — and is paired with a control proving it can fail.
   A test that passes without the feature is not a test.
3. **Mutation testing settles disputes.** "Does this test test anything?" was
   answered four times by mutating scratch copies, never by arguing.
4. **Debt ratchet.** Intentional debt is a capped counter the build enforces;
   the override-merge suite carried 5 debts to 0 and lowered its cap. A cap
   that never rejects is decoration.
5. **Wired ≠ executed.** `npm test` is a `&&` chain: a red suite shadows
   everything after it. Acceptance = the suite's own pass line appears in the
   full run. Golden was restructured so one assertion failing cannot hide the
   rest. (Durable fix still open: replace the `&&` chain with an
   always-run-all runner — recommended, unassigned.)
6. **Published description must match mechanism.** Layer-order guard derives
   precedence from behaviour and compares it to the manifest array. Same cure
   applies to version support.

## 6. Key decisions (all recorded in the contract doc)

- **`event → intent → command`** is a binding 3B-2 constraint: drag
  orchestration must live in `src/veyra/` as pure functions, because shell
  drag paths are structurally untestable (the `begin()` regression proved it —
  13 green suites watched working code break).
- **Precedence:** playback wins over machine overrides; collisions recorded at
  merge as `{address, sources: ['animation','playback']}` and surfaced in
  diagnostics. Attribution split (`'animation'` = machine-driven,
  `'playback'` = transport) exists so collisions can name both contributors.
- **Space key:** transports mutually exclusive (decided; implementation open).
- **Refuse with named blockers** over silent cascade-prune; single authority
  `machineConditionViolation()` shared by loader and commands so they cannot drift.
- **Listeners are structurally married to state machines** — `normalizeListener`
  requires a valid machine + machine input unconditionally. See open question 3.

## 7. Open questions for the human (decision-blocking)

1. **Does any Veyra build exist outside this working tree?** The whole
   conditional-v4 design protects older readers from silently eating a
   `listeners` registry. If no external build exists, that machinery protects
   nobody today. Asked repeatedly; still unanswered.
2. **Space-key during machine preview** — decided in contract as
   mutually-exclusive transports; needs sign-off + implementation.
3. **Should pointer listeners require a state machine?** Today: yes,
   unconditionally. So "click this button → play that animation" is **not
   expressible** without adding `play`/`stop`/`seek` actions, and a fresh
   starter document cannot hold any listener. The panel will be built against
   one reading or the other — decide before building.
4. **Zero-state machines are legal** and a listener can attach to one: a wired,
   valid, **permanently inert button** that no emitted signal can detect.
   Against the AI-accessibility principle. Recommend: refuse or warn.

## 8. Remaining work queue

1. **Answer the four questions above** (blocks the panel).
2. `store.inTransaction` getter + stranded-transaction recovery test
   (the safety valve for throwing refusal; half-fixed).
3. `event → intent → command` extraction (binding constraint, unstarted).
4. Panel: state-graph UI, MachinePreviewController, listener wiring (3B-2 body).
5. KD-1 decision on `renderer.js` zero-offset drag targets, then unlock it.
6. Conditional v4 stamping documentation in `docs/VEYRA_STATE_MACHINES.md`.
7. Make required-field/enum metadata enumerable from the manifest (currently
   discoverable only by throwing — flagged as an accessibility gap).
8. Replace the `&&` test chain with an always-run-all runner.

## 9. Standing orders (from the human, still in force)

- **LOCAL ONLY.** Never push, pull, fetch, or touch the remote. Local
  checkpoint commits are welcome.
- No destructive git: `stash`, `checkout --`, `reset`, `clean` are banned.
- Commit **named files**, never `git add -A` (it swept throwaway probes once).
- Do not set `sandbox_permissions` — approval prompts are disabled and
  escalation auto-rejects.
- `grep`/`glob` tools fail in this sandbox; use `Select-String` via pwsh.
  ConstrainedLanguage pwsh: cmdlets and core types only.
- One writer per file; announce before editing a wired test file; a broken
  wired file is reported, never touched by a second party.

## 10. Team roster (as of the stop)

- **Akash** — leader/debater (active); owns contract doc, `package.json`
  decisions, fake-dom, browser seam, animation test, golden ruling
- **Logan** — debater; owns arbiter + override-merge suites, handover doc
- **Asha** — worker; owns store/commands/stateMachine/model edits/manifest/
  summary/`veyra.js` + their tests
- **Natalie** — worker/debater; owns evaluation.js, properties.js,
  renderer-interaction test, listener suite

All members were stopped by the user except Akash. Nothing reaches a stopped
member until switched back on.

---

**Verification snapshot at `7223a1e`:** architecture ✓ · model ✓ · foundation ✓ ·
rigging ✓ · validation ✓ · animation ✓ · statemachine ✓ · manifest ✓ · store ✓ ·
listeners ✓ · golden ✓ · invariants 41/41 ✓ · browser seam 15/15 ✓ ·
renderer-interaction ✓ · override-merge 19/19 ✓ — **EXIT 0**.
