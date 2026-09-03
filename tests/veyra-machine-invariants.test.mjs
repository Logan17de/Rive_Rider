/**
 * Veyra machine invariants — independent arbiter for Milestone 3B.
 *
 * Authored by Logan (debater role) from `docs/VEYRA_INTERACTION_SURFACE.md`,
 * as the substitute for a tester on a team that has none. It is a
 * specification of the settled contract, not a description of any
 * implementation. Do not edit an assertion to make it pass: if a check here is
 * wrong, the contract document is what must change first.
 *
 * WHY PARTS OF THIS SUITE MAY BE RED
 * ---------------------------------------------------------------------------
 * Group I encodes the operator/type matrix — a LIVE defect on committed code:
 * `normalizeMachineCondition` gates operator membership but never
 * operator-vs-input-type, so a `.veyra` file with `{ input: <bool>, op: '>' }`
 * loads clean, silently rewrites an authored `0.5` into `true`, and yields a
 * machine that can never leave its initial state. That red is the §A0
 * deliverable, not a broken test. Wiring this file into `npm test` before §A0
 * lands makes the whole suite red *by design*.
 *
 * Groups II-V encode runtime-reconciliation invariants. Signature-keyed
 * reconciliation landed while this arbiter was being written, so most of them
 * are already green and are retained deliberately as REGRESSION GUARDS: the
 * failure mode they detect is an over-broad or later-relaxed fix — a
 * document-wide or value-wide reset, a reconcile that mutates the document, an
 * invalidation storm. A guard that passes today and would break tomorrow is
 * worth more than a defect assertion deleted the moment it goes green.
 *
 * Every check is labelled DEFECT (expected red before the fix) or GUARD
 * (behaviour that must not regress). The report lists both, so one run shows
 * every violation rather than only the first.
 *
 * Determinism: time advances only through explicit `step(delta)` deltas. No
 * wall-clock, no requestAnimationFrame, no DOM, no dependencies.
 */

import assert from 'node:assert/strict';
import {
  createSolidFill, createStarterDocument, machineById, normalizeDocument,
} from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';

// --------------------------------------------------------------------------
// Tiny collector: run everything, report everything.
// --------------------------------------------------------------------------
const results = [];
function check(kind, name, fn) {
  try {
    fn();
    results.push({ kind, name, ok: true });
  } catch (error) {
    results.push({ kind, name, ok: false, message: (error && error.message) || String(error) });
  }
}

const ORDERING_OPS = ['<', '<=', '>', '>='];
const COMPARISON_OPS = [...ORDERING_OPS, '==', '!='];

// --------------------------------------------------------------------------
// Fixtures.  Every legal condition used below stays legal under the matrix, so
// these fixtures do not need rewriting when §A0 lands.
// --------------------------------------------------------------------------

const asConditionList = (conditions) => (Array.isArray(conditions) ? conditions : [conditions]);

/** A v3 document carrying exactly one machine, built raw to test the format gate. */
function rawDocument(conditions, { transitions = true } = {}) {
  const document = createStarterDocument();
  document.timelines.push({
    id: 'tl_inv_a', name: 'Inv A', duration: 60, fps: 30, loop: 'none', tracks: [],
  });
  document.stateMachines.push({
    id: 'm_inv',
    name: 'Invariant Machine',
    initial: { kind: 'machineState', id: 'st_a' },
    inputs: [
      { id: 'in_num', name: 'Speed', type: 'number', value: 0 },
      { id: 'in_bool', name: 'Locked', type: 'bool', value: false },
      { id: 'in_trig', name: 'Tap', type: 'trigger', value: false },
    ],
    states: [
      { id: 'st_a', name: 'Idle', type: 'animation', timeline: { kind: 'timeline', id: 'tl_inv_a' } },
      { id: 'st_b', name: 'Active', type: 'animation', timeline: { kind: 'timeline', id: 'tl_inv_a' } },
    ],
    transitions: transitions
      ? [{
        id: 'tr_inv',
        from: { kind: 'machineState', id: 'st_a' },
        to: { kind: 'machineState', id: 'st_b' },
        duration: 0,
        after: null,
        conditions: asConditionList(conditions),
      }]
      : [],
  });
  return document;
}

function normalizeOutcome(document) {
  try {
    const normalized = normalizeDocument(document);
    const machine = machineById(normalized, 'm_inv');
    const transition = machine?.transitions?.[0] || null;
    return {
      accepted: true,
      transition,
      condition: transition?.conditions?.[0],
      conditions: transition?.conditions ?? null,
    };
  } catch (error) {
    return { accepted: false, message: (error && error.message) || String(error) };
  }
}

const normalizeAccepts = (conditions) => normalizeOutcome(rawDocument(conditions));

function conditionOn(inputId, op, value) {
  const condition = { id: 'c_inv', input: { kind: 'machineInput', id: inputId }, op };
  if (value !== undefined) condition.value = value;
  return condition;
}

/**
 * A store-backed machine for the reconciliation groups. `gated` adds an
 * sA -> sB transition conditioned on `Speed > 5`, so the machine stays in sA
 * until a test deliberately satisfies it.
 */
function harness({ gated = false, starter = false } = {}) {
  const store = new VeyraStore(starter ? createStarterDocument() : undefined);
  const timelineId = store.addTimeline({ id: 'tl_h', name: 'Harness Timeline' });
  const machineId = store.addStateMachine({ id: 'm_h', name: 'Harness' });
  const speedId = store.addMachineInput(machineId, { id: 'in_speed', name: 'Speed', type: 'number', value: 0 });
  const lockId = store.addMachineInput(machineId, { id: 'in_lock', name: 'Locked', type: 'bool', value: false });
  const stateA = store.addMachineState(machineId, { id: 'st_a', name: 'Idle', timelineId });
  const stateB = store.addMachineState(machineId, { id: 'st_b', name: 'Active', timelineId });
  const stateC = store.addMachineState(machineId, { id: 'st_c', name: 'Other', timelineId });
  store.updateStateMachine(machineId, { initial: stateA });
  const runtime = createMachineRuntime(() => store.document, machineId);
  const machine = () => machineById(store.document, machineId);
  const stateIds = () => machine().states.map((state) => state.id);
  return {
    store, machineId, timelineId, speedId, lockId, stateA, stateB, stateC,
    runtime, machine, stateIds,
  };
}

const referenceIdOf = (condition) => condition.input?.id ?? condition.input;

/** Delete an input the way the future `removeMachineInput` command must. */
function deleteInput(h, inputId) {
  if (typeof h.store.removeMachineInput === 'function') {
    h.store.removeMachineInput(h.machineId, inputId);
    return;
  }
  h.store.execute({ label: 'remove input (arbiter probe)', source: 'script' }, (document) => {
    const machine = machineById(document, h.machineId);
    machine.inputs = machine.inputs.filter((input) => input.id !== inputId);
    for (const transition of machine.transitions) {
      transition.conditions = transition.conditions.filter((condition) => (
        referenceIdOf(condition) !== inputId
      ));
    }
  });
}

// ==========================================================================
// GROUP I — operator / type matrix.  Format integrity: a `.veyra` file must
// never load into a transition that can provably never fire.
// ==========================================================================

for (const op of ORDERING_OPS) {
  check('DEFECT', `normalize rejects ordering op '${op}' against a bool input`, () => {
    const outcome = normalizeAccepts(conditionOn('in_bool', op, 0.5));
    assert.equal(outcome.accepted, false,
      `accepted '${op}' against a bool input and normalized to ${JSON.stringify(outcome.condition)}`);
  });
  check('DEFECT', `normalize rejects ordering op '${op}' against a trigger input`, () => {
    const outcome = normalizeAccepts(conditionOn('in_trig', op, 0.5));
    assert.equal(outcome.accepted, false,
      `accepted '${op}' against a trigger input and normalized to ${JSON.stringify(outcome.condition)}`);
  });
}

for (const op of ['==', '!=']) {
  check('DEFECT', `normalize rejects '${op}' against a trigger input`, () => {
    const outcome = normalizeAccepts(conditionOn('in_trig', op, op === '==' ? true : false));
    assert.equal(outcome.accepted, false,
      `accepted '${op}' against a trigger; 'fired'/'!fired' are the only legal trigger ops, and a `
      + 'trigger self-clears every step so an equality test on one is a timing trap');
  });
}

check('DEFECT', 'normalize never silently rewrites an authored condition value', () => {
  // The coercion is the observable trace of the missing type gate: the author
  // wrote 0.5, the loader stored true. Whatever the matrix decides, a value
  // that survives normalization must be the value that went in.
  const outcome = normalizeAccepts(conditionOn('in_bool', '>', 0.5));
  if (!outcome.accepted) return; // Rejection is the fix; nothing left to compare.
  assert.deepEqual(outcome.condition.value, 0.5,
    `the authored value 0.5 was rewritten to ${JSON.stringify(outcome.condition.value)} while the `
    + 'illegal operator was kept — the saved file no longer says what its author wrote');
});

check('DEFECT', 'normalize rejects a malformed conditions field instead of emptying it', () => {
  // Found while writing this arbiter, and a defect of the same family as the
  // listener rule ("an unknown listener kind must throw, never silently
  // drop"). A non-array `conditions` currently normalizes to `[]`, which turns
  // a gated transition into an unconditional one: the machine fires EARLIER
  // than authored, and nothing in the saved file records that a condition was
  // destroyed.
  const document = rawDocument(conditionOn('in_num', '>', 0.5));
  document.stateMachines[0].transitions[0].conditions = { input: 'in_num', op: '>', value: 0.5 };
  const outcome = normalizeOutcome(document);
  assert.equal(outcome.accepted, false,
    `a non-array conditions field was accepted and normalized to ${JSON.stringify(outcome.conditions)} `
    + '— a silently unconditional transition');
});

check('DEFECT', 'the command layer cannot author an illegal matrix condition either', () => {
  // Defense in depth plus the atomicity guarantee: normalize rejects, execute()
  // rolls back, and nothing observable about the store changes.
  const h = harness();
  const before = JSON.stringify(h.store.document);
  const revision = h.store.revision;
  const history = h.store.commandHistory.length;
  let threw = false;
  try {
    h.store.addMachineTransition(h.machineId, {
      from: h.stateA,
      to: h.stateB,
      duration: 0,
      conditions: [{ input: h.lockId, op: '>', value: 0.5 }],
    });
  } catch (error) {
    threw = true;
    assert.match(error.message, /bool|Locked|operator|type/i,
      `a rejection must name the offending input or type, got: ${error.message}`);
  }
  assert.equal(threw, true, "addMachineTransition accepted a bool input gated by '>'");
  assert.equal(JSON.stringify(h.store.document), before, 'a refused command must leave the document identical');
  assert.equal(h.store.revision, revision, 'a refused command must not bump the revision');
  assert.equal(h.store.commandHistory.length, history, 'a refused command must not enter the command history');
});

// --- Guards: the matrix must not over-reject. These pass today by design. ---

check('GUARD', 'a number input keeps ordering and equality ops, value preserved', () => {
  for (const op of COMPARISON_OPS) {
    const outcome = normalizeAccepts(conditionOn('in_num', op, 0.5));
    assert.equal(outcome.accepted, true, `legal '${op}' on a number was rejected: ${outcome.message}`);
    assert.deepEqual(outcome.condition.value, 0.5, 'an authored numeric value must survive unchanged');
  }
});

check('GUARD', 'a bool input keeps == and != against a boolean value', () => {
  for (const value of [true, false]) {
    const outcome = normalizeAccepts(conditionOn('in_bool', value ? '==' : '!=', value));
    assert.equal(outcome.accepted, true, `a legal bool condition was rejected: ${outcome.message}`);
    assert.equal(outcome.condition.value, value);
  }
});

check('GUARD', 'a trigger input keeps fired and !fired, and neither carries a value', () => {
  for (const op of ['fired', '!fired']) {
    const outcome = normalizeAccepts(conditionOn('in_trig', op));
    assert.equal(outcome.accepted, true, `${op} on a trigger was rejected: ${outcome.message}`);
    assert.equal('value' in outcome.condition, false, `${op} must not carry a value`);
  }
});

check('GUARD', 'fired and !fired stay rejected against non-trigger inputs', () => {
  for (const inputId of ['in_num', 'in_bool']) {
    for (const op of ['fired', '!fired']) {
      const outcome = normalizeAccepts(conditionOn(inputId, op));
      assert.equal(outcome.accepted, false, `${op} against ${inputId} must stay rejected`);
    }
  }
});

check('GUARD', 'comparisons still require a value on every input type', () => {
  for (const inputId of ['in_num', 'in_bool', 'in_trig']) {
    for (const op of COMPARISON_OPS) {
      const outcome = normalizeAccepts(conditionOn(inputId, op, undefined));
      assert.equal(outcome.accepted, false, `${op} without a value must stay rejected (${inputId})`);
    }
  }
});

check('GUARD', 'a transition with no conditions stays legal and normalizes to an empty list', () => {
  const outcome = normalizeOutcome(rawDocument([]));
  assert.equal(outcome.accepted, true, `an unconditional transition was rejected: ${outcome.message}`);
  assert.deepEqual(outcome.conditions, []);
});

// ==========================================================================
// GROUP II — reference integrity of runtime state.
// The four reconcile defects from the contract. Several are green since
// reconciliation landed; they remain as guards against re-introduction.
// ==========================================================================

function validState(h, context = '') {
  const evaluated = h.runtime.evaluate();
  const ids = h.stateIds();
  assert.ok(
    evaluated.stateId === null || ids.includes(evaluated.stateId),
    `${context}evaluate().stateId '${evaluated.stateId}' is not among the machine's states ${JSON.stringify(ids)}`,
  );
  assert.equal(
    evaluated.stateId === null,
    h.runtime.state === null,
    `${context}stateId (${String(evaluated.stateId)}) and state (${JSON.stringify(h.runtime.state)}) disagree`,
  );
  return evaluated;
}

check('GUARD', 'deleting the active state cannot leave a dangling stateId', () => {
  const h = harness({ gated: true });
  assert.equal(h.runtime.stateId, h.stateA);
  h.store.removeMachineState(h.machineId, h.stateA);
  validState(h, 'after deleting the active state: ');
  assert.notEqual(h.runtime.stateId, h.stateA, 'the removed state must not stay current');
  assert.ok(h.stateIds().includes(h.runtime.stateId),
    'a missing current state must fall back to a valid initial, else the first state');
});

check('GUARD', 'the machine is not permanently frozen after its active state is deleted', () => {
  // The original defect: step() filtered outgoing transitions by a dangling id,
  // so nothing ever matched again and the machine was silently dead.
  const h = harness({ gated: true });
  h.store.removeMachineState(h.machineId, h.stateA);
  const first = h.runtime.step(1);
  const second = h.runtime.step(1);
  assert.ok(Array.isArray(first) && Array.isArray(second), 'step() must keep returning events');
  validState(h, 'after stepping past a deleted state: ');
  assert.ok(Number.isFinite(h.runtime.stateTime) && h.runtime.stateTime >= 0,
    `state time must stay finite and non-negative, saw ${h.runtime.stateTime}`);
});

check('GUARD', 'deleting a blend target mid-blend cannot land on a removed state', () => {
  const h = harness();
  h.store.addMachineTransition(h.machineId, { from: h.stateA, to: h.stateB, duration: 1, conditions: [] });
  h.runtime.step(0.5);
  assert.ok(h.runtime.transition, 'the blend must be active before the deletion');
  h.store.removeMachineState(h.machineId, h.stateB);
  h.runtime.step(1);
  h.runtime.step(1);
  validState(h, 'after a blend over a deleted target: ');
  const transition = h.runtime.transition;
  assert.ok(!transition || (
    h.stateIds().includes(transition.fromId) && h.stateIds().includes(transition.toId)
  ), `an active transition must not expose endpoints outside the document (${transition
    ? `${transition.fromId}->${transition.toId}` : 'none'})`);
});

check('GUARD', 'inputs reported by the runtime always exist in the document', () => {
  const h = harness({ gated: true });
  h.runtime.setInput(h.speedId, 3);
  h.store.addMachineInput(h.machineId, { id: 'in_late', name: 'Later', type: 'number', value: 7 });
  h.store.removeMachineState(h.machineId, h.stateC);
  const ids = h.machine().inputs.map((input) => input.id);
  for (const input of h.runtime.inputs) {
    assert.ok(ids.includes(input.id), `the runtime exposes input '${input.id}' the document does not have`);
  }
});

check('GUARD', 'an override for a deleted input is dropped and the runtime still works', () => {
  const h = harness({ gated: true });
  const extra = h.store.addMachineInput(h.machineId, { id: 'in_tmp', name: 'Tmp', type: 'number', value: 1 });
  h.runtime.setInput(extra, 42);
  assert.equal(h.runtime.inputs.find((input) => input.id === extra).value, 42);
  deleteInput(h, extra);
  assert.equal(h.machine().inputs.some((input) => input.id === extra), false, 'precondition: input removed');
  assert.ok(h.runtime.inputs.every((input) => input.id !== extra),
    'the runtime must not keep overriding an input the document no longer has');
  validState(h, 'after deleting an overridden input: ');
});

// ==========================================================================
// GROUP III — one truth.  `globalThis.veyra.getMachine()` is
// `machineById(store.document, id)` and `getMachineState()` is
// `runtime.evaluate()`; `veyra.js` is a browser shell that cannot be imported
// headless, so the arbiter compares the two primitives directly.
// ==========================================================================

check('GUARD', 'authored input edits surface through the runtime (no shadowing)', () => {
  const h = harness({ gated: true });
  assert.equal(h.runtime.inputs.find((input) => input.id === h.speedId).value, 0);
  h.store.execute({ label: 'authored edit', source: 'script' }, (document) => {
    machineById(document, h.machineId).inputs.find((input) => input.id === h.speedId).value = 42;
  });
  const viaDocument = h.machine().inputs.find((input) => input.id === h.speedId).value;
  const viaRuntime = h.runtime.inputs.find((input) => input.id === h.speedId).value;
  assert.equal(viaDocument, 42);
  assert.equal(viaRuntime, viaDocument,
    'getMachine() and getMachineState() must not report different truth for one input');
});

check('GUARD', 'a live override wins over the authored value and survives a non-structural edit', () => {
  const h = harness({ gated: true });
  h.runtime.setInput(h.speedId, 42);
  assert.equal(h.runtime.inputs.find((input) => input.id === h.speedId).value, 42);
  h.store.execute({ label: 'authored edit elsewhere', source: 'script' }, (document) => {
    machineById(document, h.machineId).inputs.find((input) => input.id === h.lockId).value = true;
  });
  assert.equal(h.runtime.inputs.find((input) => input.id === h.speedId).value, 42,
    'a non-structural edit must not discard an explicit runtime override');
});

check('GUARD', 'a type change is structural: the override is dropped, the authored value wins', () => {
  const h = harness({ gated: true });
  h.runtime.setInput(h.speedId, 42);
  h.store.execute({ label: 'type change', source: 'script' }, (document) => {
    const machine = machineById(document, h.machineId);
    machine.inputs.find((candidate) => candidate.id === h.speedId).type = 'bool';
    machine.inputs.find((candidate) => candidate.id === h.speedId).value = true;
    // Drop the now-illegal condition so the document stays loadable: this
    // isolates the reconcile question from the matrix question.
    machine.transitions = [];
  });
  const input = h.runtime.inputs.find((candidate) => candidate.id === h.speedId);
  assert.equal(input.type, 'bool');
  assert.equal(typeof input.value, 'boolean',
    `an input that changed type must not keep a stale-typed override, saw ${JSON.stringify(input.value)}`);
  assert.equal(input.value, true, 'the authored value must win after a structural type change');
});

check('GUARD', 'reset() returns every input to its authored value', () => {
  const h = harness({ gated: true });
  h.runtime.setInput(h.speedId, 42);
  h.runtime.reset();
  assert.equal(h.runtime.inputs.find((input) => input.id === h.speedId).value, 0);
});

check('GUARD', 'fire() arms a trigger and the next step consumes it', () => {
  const h = harness({ gated: true });
  const tapId = h.store.addMachineInput(h.machineId, { id: 'in_tap', name: 'Tap', type: 'trigger' });
  assert.equal(h.runtime.fire(tapId), true);
  assert.equal(h.runtime.inputs.find((input) => input.id === tapId).value, true);
  h.runtime.step(0.1);
  assert.equal(h.runtime.inputs.find((input) => input.id === tapId).value, false,
    'a trigger must be consumed by the step that observes it');
  assert.throws(() => h.runtime.fire(h.speedId), /trigger/i, 'fire() must reject non-trigger inputs');
  assert.throws(() => h.runtime.setInput(tapId, true), /trigger/i,
    'setInput() must reject triggers; fire() is the only way to arm one');
});

check('GUARD', 'the runtime agrees with the document across undo and redo', () => {
  const h = harness({ gated: true });
  const added = h.store.addMachineInput(h.machineId, { id: 'in_u', name: 'Undoable', type: 'number', value: 3 });
  h.runtime.setInput(added, 11);
  h.store.undo();
  assert.equal(h.machine().inputs.some((input) => input.id === added), false,
    'undo must remove the input from the document');
  assert.ok(h.runtime.inputs.every((input) => input.id !== added),
    'undo must not leave the runtime overriding an input that no longer exists');
  h.store.redo();
  assert.equal(h.machine().inputs.some((input) => input.id === added), true);
  validState(h, 'after redo: ');
});

// ==========================================================================
// GROUP IV — reconcile scope and discipline.  These guard against the fix
// being too broad, which is what a document-wide reset would have shipped.
// ==========================================================================

check('GUARD', 'an unrelated document edit preserves runtime position', () => {
  const h = harness({ gated: true, starter: true });
  h.runtime.step(0.7);
  const { stateId, stateTime } = h.runtime;
  assert.ok(stateTime > 0, 'the runtime must have advanced before the unrelated edit');
  const target = h.store.document.nodes[0];
  h.store.execute({ label: 'unrelated fill', source: 'user' }, (document) => {
    document.nodes.find((node) => node.id === target.id).paint.fill = createSolidFill('#123456');
  });
  assert.equal(h.runtime.stateId, stateId, 'an unrelated edit reset the machine');
  assert.equal(h.runtime.stateTime, stateTime, 'an unrelated edit rewound the machine clock');
});

check('GUARD', 'a cosmetic edit to this machine preserves runtime position', () => {
  const h = harness({ gated: true });
  h.runtime.step(0.7);
  const { stateTime } = h.runtime;
  h.store.updateStateMachine(h.machineId, { name: 'Renamed Harness' });
  assert.equal(h.runtime.stateTime, stateTime, 'renaming a machine must not rewind its preview');
  h.store.execute({ label: 'rename state', source: 'user' }, (document) => {
    machineById(document, h.machineId).states.find((state) => state.id === h.stateA).name = 'Renamed State';
  });
  assert.equal(h.runtime.stateTime, stateTime, 'renaming a state must not rewind its preview');
});

check('GUARD', 'a structural change moves to a valid state instead of throwing', () => {
  const h = harness({ gated: true });
  h.runtime.step(0.7);
  h.store.addMachineTransition(h.machineId, { from: h.stateB, to: h.stateC, duration: 0, conditions: [] });
  validState(h, 'after a structural change: ');
  const ids = h.machine().inputs.map((input) => input.id);
  assert.ok(h.runtime.inputs.every((input) => ids.includes(input.id)));
});

check('GUARD', 'removing the whole machine never throws out of a step loop', () => {
  // `veyra.js` throws a TypeError for a missing machine. Inside a per-frame
  // preview loop that kills playback on an undo, so the runtime itself must be
  // the safe surface: reads and steps degrade, they never raise.
  const h = harness({ gated: true });
  h.runtime.step(0.4);
  h.store.removeStateMachine(h.machineId);
  assert.ok(!h.machine(), 'precondition: the machine is gone from the document');
  assert.equal(h.runtime.evaluate().stateId, null);
  assert.deepEqual(h.runtime.step(0.2), []);
  assert.deepEqual(h.runtime.inputs, []);
  assert.equal(h.runtime.state, null);
  assert.equal(h.runtime.transition, null);
});

check('GUARD', 'reconciliation never mutates the document', () => {
  const h = harness({ gated: true, starter: true });
  const tapId = h.store.addMachineInput(h.machineId, { id: 'in_tap2', name: 'TapTwo', type: 'trigger' });
  const stamp = JSON.stringify(h.store.document);
  h.runtime.step(0.3);
  h.runtime.evaluate();
  h.runtime.setInput(h.speedId, 8);
  h.runtime.fire(tapId);
  h.runtime.step(0.3);
  void h.runtime.transition;
  void h.runtime.stateId;
  void h.runtime.inputs;
  h.runtime.reset();
  h.runtime.scrub(2);
  assert.equal(JSON.stringify(h.store.document), stamp,
    'a runtime read or step must not change the authored document');
  assert.ok(h.machine().inputs.some((input) => input.id === tapId),
    'self-check: the harness installed the trigger before these reads ran');
});

check('GUARD', 'at most one invalidation per structural change, none for cosmetic edits', () => {
  const h = harness({ gated: true });
  if (typeof h.runtime.onInvalidate !== 'function') {
    throw new Error('onInvalidate(listener) is required by the contract (§The rule: at most one runtime-invalidated)');
  }
  let events = 0;
  const unsubscribe = h.runtime.onInvalidate(() => { events += 1; });

  h.runtime.step(0.2);
  h.runtime.evaluate();
  void h.runtime.inputs;
  assert.equal(events, 0, 'reads of an unchanged machine must not invalidate');

  h.store.updateStateMachine(h.machineId, { name: 'Cosmetic Rename' });
  h.runtime.evaluate();
  assert.equal(events, 0, 'a name-only edit is not structural and must not invalidate');

  h.store.addMachineInput(h.machineId, { id: 'in_new', name: 'New', type: 'number', value: 0 });
  h.runtime.evaluate();
  void h.runtime.stateId;
  h.runtime.step(0.1);
  assert.equal(events, 1, `one structural change must emit exactly one invalidation, saw ${events}`);

  unsubscribe();
  h.store.removeMachineState(h.machineId, h.stateC);
  h.runtime.evaluate();
  assert.equal(events, 1, 'an unsubscribed listener must receive no further events');
});

// ==========================================================================
// GROUP V — the gate: invariants must hold at EVERY revision of an
// interleaved command / undo / redo session driven on explicit deltas.
// ==========================================================================

check('GUARD', 'runtime and document agree at every revision of an interleaved session', () => {
  const h = harness({ gated: true, starter: true });
  const sequence = [
    () => h.runtime.step(0.4),
    () => h.runtime.setInput(h.speedId, 9),
    () => h.runtime.step(0.4),
    () => h.store.addMachineInput(h.machineId, { id: 'in_s1', name: 'Session', type: 'bool', value: false }),
    () => h.runtime.step(0.4),
    () => h.store.removeMachineState(h.machineId, h.stateC),
    () => h.runtime.step(0.4),
    () => h.store.addMachineTransition(h.machineId, { from: h.stateB, to: h.stateA, duration: 0.5, conditions: [] }),
    () => h.runtime.step(0.4),
    () => h.store.undo(),
    () => h.runtime.step(0.2),
    () => h.store.undo(),
    () => h.runtime.step(0.2),
    () => h.store.undo(),
    () => h.runtime.step(0.2),
    () => h.store.redo(),
    () => h.runtime.step(0.2),
    () => h.store.redo(),
    () => h.runtime.step(0.2),
    () => h.store.removeStateMachine(h.machineId),
    () => h.runtime.step(0.2),
    () => h.store.undo(),
    () => h.runtime.step(0.2),
    () => h.store.redo(),
    () => h.runtime.step(0.2),
  ];
  sequence.forEach((advance, index) => {
    advance();
    const machine = h.machine();
    if (!machine) {
      // The machine is temporarily absent: the runtime must degrade, never raise.
      assert.equal(h.runtime.evaluate().stateId, null,
        `revision ${index}: a state id leaked while the machine was absent`);
      return;
    }
    const ids = machine.states.map((state) => state.id);
    const evaluated = h.runtime.evaluate();
    assert.ok(evaluated.stateId === null || ids.includes(evaluated.stateId),
      `revision ${index}: stateId '${evaluated.stateId}' is not among ${JSON.stringify(ids)}`);
    assert.equal(evaluated.stateId === null, h.runtime.state === null,
      `revision ${index}: stateId and state disagree`);
    if (evaluated.transition) {
      assert.ok(ids.includes(evaluated.transition.fromId) && ids.includes(evaluated.transition.toId),
        `revision ${index}: transition endpoints ${evaluated.transition.fromId}->${evaluated.transition.toId} dangle`);
    }
    const inputsById = new Map(machine.inputs.map((input) => [input.id, input]));
    for (const input of h.runtime.inputs) {
      const authored = inputsById.get(input.id);
      assert.ok(authored, `revision ${index}: the runtime exposes unknown input '${input.id}'`);
      assert.equal(input.type, authored.type, `revision ${index}: input '${input.id}' type drifted`);
      if (authored.type === 'number') {
        assert.equal(typeof input.value, 'number',
          `revision ${index}: numeric input '${input.id}' reported ${JSON.stringify(input.value)}`);
        assert.ok(Number.isFinite(input.value), `revision ${index}: input '${input.id}' is not finite`);
      } else {
        assert.equal(typeof input.value, 'boolean',
          `revision ${index}: ${authored.type} input '${input.id}' reported ${JSON.stringify(input.value)}`);
      }
    }
    assert.ok(Number.isFinite(evaluated.stateTime) && evaluated.stateTime >= 0,
      `revision ${index}: state time is ${evaluated.stateTime}`);
  });
});

// ==========================================================================
// GROUP VI — store transaction discipline (3B-2 gate G4).
// The store has exactly ONE transaction slot and `begin()` returns early when
// one is already open, so a second descriptor is discarded rather than
// rejected. Two overlapping drags then merge into a single undo entry carrying
// the first command's label — pure-Node observable behaviour today, and
// precisely what a panel adds a second drag source to create.
// ==========================================================================

check('DEFECT', 'a second concurrent transaction is never silently absorbed', () => {
  const h = harness();
  const historyBefore = h.store.commandHistory.length;
  let rejected = false;
  try {
    h.store.begin({ label: 'Drag state', source: 'user' });
    h.store.begin({ label: 'Rename input', source: 'user' });
  } catch (error) {
    rejected = true;
    assert.match(error.message, /transaction|open/i,
      `a nested begin must explain itself, got: ${error.message}`);
  }
  h.store.mutate((document) => {
    machineById(document, h.machineId).name = 'Nested Transaction Probe';
  });
  h.store.commit();
  if (!rejected) {
    const labels = h.store.commandHistory.slice(historyBefore).map((entry) => entry.label);
    assert.ok(labels.some((label) => /Rename input/.test(String(label))),
      'the second begin() was discarded: two unrelated edits are now one undo entry labelled '
      + JSON.stringify(labels));
  }
  assert.doesNotThrow(() => h.store.execute({ label: 'Leak probe', source: 'user' }, () => {}),
    'a leaked open transaction must not block every later command');
});

check('GUARD', 'an abandoned drag can always be cancelled back to a clean store', () => {
  // A pointerup landing outside the window must never wedge the editor:
  // cancel() has to be total, and a mutate outside a transaction must fail
  // loudly rather than apply to the live document.
  const h = harness();
  const before = JSON.stringify(h.store.document);
  assert.throws(() => h.store.mutate(() => {}), /transaction/i,
    'mutate() without an open transaction must be refused');
  h.store.begin({ label: 'Abandoned drag', source: 'user' });
  assert.equal(h.store.cancel(), true, 'cancel() must report that it closed a transaction');
  assert.equal(JSON.stringify(h.store.document), before, 'cancel() must restore the pre-drag document');
  assert.doesNotThrow(() => h.store.execute({ label: 'After abandonment', source: 'user' }, () => {}),
    'the store must be usable again after an abandoned transaction');
});

check('GUARD', 'a rejected nested begin leaves the outer transaction intact and committable', () => {
  // The property that makes a THROWING begin() safe to ship at all. Without it,
  // loud refusal would mean "the editor is stuck"; with it, refusal is recoverable
  // by construction and a caller can clean up. Measured before it was written down,
  // because the artboard regression was described as "stranding a transaction" and
  // "wedging the editor" — neither of which is true, and a test written against a
  // stranded state could only ever be deleted.
  const h = harness();
  const label = { label: 'Gesture', source: 'user' };
  h.store.begin(label);
  h.store.mutate((document) => { document.artboard.width = 500; }, 'drag');
  assert.throws(() => h.store.begin(label), /transaction/i,
    'a nested begin must be refused, not silently absorbed');
  // Refusal must not damage the transaction already in flight.
  assert.doesNotThrow(() => h.store.mutate((document) => { document.artboard.width = 700; }, 'drag'),
    'the outer transaction must survive a rejected nested begin()');
  assert.equal(h.store.document.artboard.width, 700, 'mutate() after the refusal did not apply');
  assert.doesNotThrow(() => h.store.commit(),
    'commit() must still close the gesture — a refused begin() must not strand it');
  assert.equal(h.store.document.artboard.width, 700, 'committed value is not the last mutation');
  assert.doesNotThrow(() => h.store.execute({ label: 'Later command', source: 'user' }, () => {}),
    'the store must accept new commands after a refused nested begin()');
});

check('GUARD', 'a stale override address raises rather than silently doing nothing', () => {
  // 3B-2 must decide this explicitly: does the preview controller catch-and-
  // report around evaluateDocument, or guarantee validity by construction?
  // applyLayer throws on a non-animatable address, so override staleness is a
  // render-loop exception, not a degraded frame. Do not let it be discovered.
  const h = harness({ starter: true });
  const ghost = `${h.store.document.nodes[0].id}/ghost/x`;
  assert.throws(
    () => evaluateDocument(h.store.document, { animation: { [ghost]: 1 } }),
    /property/i,
    'a stale override must be reported, never dropped',
  );
});

// ==========================================================================
// Report
// ==========================================================================
const failed = results.filter((result) => !result.ok);
const redDefects = failed.filter((result) => result.kind === 'DEFECT');
const redGuards = failed.filter((result) => result.kind === 'GUARD');

console.log(`\nVeyra machine invariants — ${results.length - failed.length}/${results.length} checks green`);
console.log(`  ${redDefects.length} unenforced contract item(s), ${redGuards.length} guard regression(s)\n`);
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} [${result.kind.padEnd(6)}] ${result.name}`);
  if (!result.ok) console.log(`       ${result.message.split('\n').slice(0, 4).join('\n       ')}`);
}
console.log('');
if (failed.length) {
  if (redGuards.length) {
    console.log('A GUARD is a regression against settled behaviour: fix the implementation, not the assertion.');
  }
  if (redDefects.length) {
    console.log('DEFECT checks are the 3B contract not yet enforced (docs/VEYRA_INTERACTION_SURFACE.md).');
  }
  process.exitCode = 1;
} else {
  console.log('All invariants green: the operator/type matrix is enforced and no guard has regressed.');
}
