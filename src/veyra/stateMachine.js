import { cloneValue, machineById } from './model.js';
import { referenceId } from './references.js';
import { evaluateTimelines } from './animation.js';

export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
]);

// The one machine capability surface, shared by `manifest.js`, `summary.js`,
// and the browser API so the catalogs cannot drift (contract §Surface:
// manifest + scene summary in the same change that exposes a command).
// `graph` names edit operations 1:1 with Store commands; `runtime` names
// operations 1:1 with `MachineRuntime` methods.
export const VEYRA_MACHINE_CAPABILITIES = Object.freeze({
  inputTypes: Object.freeze(['number', 'bool', 'trigger']),
  stateTypes: Object.freeze(['animation']),
  graph: Object.freeze([
    'set-name',
    'set-initial',
    'add-input',
    'remove-input',
    'update-input',
    'add-state',
    'update-state',
    'remove-state',
    'add-transition',
    'update-transition',
    'remove-transition',
  ]),
  runtime: Object.freeze(['set-input', 'fire', 'step', 'scrub', 'reset', 'evaluate']),
});

// Emitted through `onInvalidate` when reconciliation finds that the machine
// record this runtime tracks changed in a way that resets its position (or
// that the machine disappeared or came back). One event per effective change.
export const VEYRA_MACHINE_INVALIDATION_EVENT = 'runtime-invalidated';

// Structural identity of the machine — only the fields the runtime's position
// is expressed in: input ids/types, state ids, transition ids/endpoints, and
// the initial pointer. Names, authored values, durations, `after` gates, and
// condition payloads are deliberately absent: changing them must NOT reset a
// live preview (they are read fresh on every evaluation anyway).
const NO_MACHINE = 'no-machine';

function machineSignature(machine) {
  if (!machine) return NO_MACHINE;
  return JSON.stringify([
    machine.initial ? referenceId(machine.initial, 'machineState') : null,
    machine.inputs.map((input) => [input.id, input.type]),
    machine.states.map((state) => state.id),
    machine.transitions.map((transition) => [
      transition.id,
      referenceId(transition.from, 'machineState'),
      referenceId(transition.to, 'machineState'),
    ]),
  ]);
}

function resolveDocument(documentOrGetter) {
  if (typeof documentOrGetter === 'function') {
    const document = documentOrGetter();
    if (!document || typeof document !== 'object') {
      throw new TypeError('Document getter must return a Veyra document.');
    }
    return document;
  }
  if (!documentOrGetter || typeof documentOrGetter !== 'object') {
    throw new TypeError('Machine runtime requires a Veyra document or document getter.');
  }
  return documentOrGetter;
}

function resolveInput(machine, nameOrId) {
  const key = String(nameOrId || '');
  return machine.inputs.find((input) => input.id === key || input.name === key) || null;
}

function evaluateCondition(condition, inputsById) {
  const inputId = referenceId(condition.input, 'machineInput');
  const inputValue = inputsById.get(inputId);
  switch (condition.op) {
    case '<': return inputValue < condition.value;
    case '<=': return inputValue <= condition.value;
    case '>': return inputValue > condition.value;
    case '>=': return inputValue >= condition.value;
    case '==': return inputValue === condition.value;
    case '!=': return inputValue !== condition.value;
    case 'fired': return inputValue === true;
    case '!fired': return inputValue !== true;
    default:
      throw new TypeError(`Unsupported condition operator: ${condition.op}`);
  }
}

function transitionSatisfied(transition, stateTime, inputsById) {
  if (transition.after != null && stateTime < transition.after) return false;
  for (const condition of transition.conditions) {
    if (!evaluateCondition(condition, inputsById)) return false;
  }
  return true;
}

/**
 * Deterministic runtime for one Veyra state machine.
 *
 * The runtime owns per-machine *runtime state only* (current state, state
 * time, input overrides, active transition). Everything structural — states,
 * transitions, inputs, timelines — is read from the document on every call,
 * so editor edits are picked up without re-creation. Pass a document getter
 * (`() => store.document`) to stay current across edits, undo, and redo.
 *
 * Reconciliation runs before every public read and mutation, keyed strictly
 * to THIS machine's structural signature:
 * - an edit to any other part of the document never disturbs the preview;
 * - a structural change to this machine (state/transition/input added or
 *   removed, endpoint or type changed, `initial` re-pointed) resets the
 *   runtime to a valid position derived from the current record — it never
 *   throws, so a preview loop survives undo;
 * - deleted inputs drop their overrides with the reset; authored-value
 *   shadowing cannot occur because overrides only ever hold inputs that were
 *   explicitly `setInput`/`fire`d since the last reset (`?? input.value`
 *   therefore always surfaces live edits for clean inputs);
 * - a change emits at most one `runtime-invalidated` event through
 *   `onInvalidate(listener)` per effective (net) change observed, so
 *   multi-part commands cannot flicker.
 * Reconciliation never mutates the document.
 *
 * Time is measured in seconds. A transition's authored `duration` is in
 * seconds; `0` cuts immediately. Blending crossfades the outgoing and
 * incoming timeline contributions: addresses driven by both crossfade
 * linearly, outgoing-only addresses hold, incoming-only addresses ramp in
 * against their authored value. Active blends are captured as value
 * snapshots, so deleting a blend's endpoints can never land the machine on a
 * dangling state id.
 */
export class MachineRuntime {
  #documentOrGetter = null;
  #machineId = null;
  #overrideValues = new Map();
  #stateId = null;
  #stateTime = 0;
  #transition = null;
  #signature = NO_MACHINE;
  #invalidateListeners = new Set();

  constructor(documentOrGetter, machineId) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
    if (!machine) {
      throw new TypeError(`State machine ${machineId} was not found in the document.`);
    }
    this.#resetRuntime(machine);
  }

  // Read-only hosts reconcile only this private snapshot, never the live clock
  // or its invalidation listeners. The evaluator remains unchanged.
  fork() {
    const snapshot = new MachineRuntime(this.#documentOrGetter, this.#machineId);
    snapshot.#overrideValues = new Map([...this.#overrideValues].map(([key, value]) => [key, cloneValue(value)]));
    snapshot.#stateId = this.#stateId; snapshot.#stateTime = this.#stateTime;
    snapshot.#transition = cloneValue(this.#transition); snapshot.#signature = this.#signature;
    return snapshot;
  }

  get machineId() {
    return this.#machineId;
  }

  get machine() {
    return machineById(this.#document, this.#machineId);
  }

  get #document() {
    return resolveDocument(this.#documentOrGetter);
  }

  /**
   * Subscribe to `runtime-invalidated` notifications. Returns an unsubscribe
   * function, mirroring `VeyraStore.subscribe`.
   */
  onInvalidate(listener) {
    this.#invalidateListeners.add(listener);
    return () => this.#invalidateListeners.delete(listener);
  }

  get stateId() {
    this.#reconcile();
    return this.#stateId;
  }

  get state() {
    this.#reconcile();
    return this.machine?.states.find((state) => state.id === this.#stateId) || null;
  }

  get stateTime() {
    this.#reconcile();
    return this.#stateTime;
  }

  get transition() {
    this.#reconcile();
    if (!this.#transition) return null;
    const { transitionId, fromId, toId, duration, startedAt } = this.#transition;
    const elapsed = this.#stateTime - startedAt;
    const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
    return {
      id: transitionId,
      fromId,
      toId,
      duration,
      progress,
    };
  }

  get inputs() {
    this.#reconcile();
    return (this.machine?.inputs || []).map((input) => ({
      id: input.id,
      name: input.name,
      type: input.type,
      value: this.#overrideValues.get(input.id) ?? input.value,
    }));
  }

  #resetRuntime(machine) {
    this.#overrideValues = new Map();
    const states = machine ? machine.states : [];
    const initial = machine
      ? (machine.initial
        ? states.find((state) => state.id === referenceId(machine.initial, 'machineState'))
        : states[0])
      : null;
    this.#stateId = initial?.id || null;
    this.#stateTime = 0;
    this.#transition = null;
    this.#signature = machineSignature(machine);
  }

  /**
   * Re-read the machine and, when its structural signature changed since the
   * last observation, reset the runtime to a valid position derived from the
   * current record and emit one invalidation event. Never throws on a
   * machine change; a broken document getter surfaces as before (caller bug).
   */
  #reconcile() {
    const machine = this.machine;
    const signature = machineSignature(machine);
    if (signature === this.#signature) return machine;
    const previous = this.#signature;
    this.#resetRuntime(machine);
    const reason = !machine
      ? 'machine-removed'
      : (previous === NO_MACHINE ? 'machine-restored' : 'structural');
    this.#notifyInvalidated(reason);
    return machine;
  }

  #notifyInvalidated(reason) {
    const event = { type: VEYRA_MACHINE_INVALIDATION_EVENT, machineId: this.#machineId, reason };
    for (const listener of [...this.#invalidateListeners]) listener(event);
  }

  #inputsById() {
    return new Map(this.inputs.map((input) => [input.id, input.value]));
  }

  #completeTransition(events) {
    const { transitionId, fromId, toId, startedAt } = this.#transition;
    // The incoming state kept running during the blend, so it owns the
    // elapsed time when the blend finishes and its timeline continues
    // seamlessly from there.
    this.#stateTime = this.#stateTime - startedAt;
    this.#stateId = toId;
    this.#transition = null;
    events.push({ type: 'transition-end', transitionId, fromId, toId });
  }

  /**
   * Advance the machine by deltaSeconds and return the events that fired
   * (`transition-start` / `transition-end`). Trigger inputs are consumed at
   * the end of every step, whether or not a transition used them.
   */
  step(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta < 0) {
      throw new TypeError('step() requires a finite, non-negative delta in seconds.');
    }
    const events = [];
    const machine = this.#reconcile();
    if (!machine || !machine.states.length) return events;
    if (delta === 0) {
      this.#clearTriggers();
      return events;
    }

    const inputsById = this.#inputsById();
    if (this.#transition) {
      this.#stateTime += delta;
      if (this.#stateTime - this.#transition.startedAt >= this.#transition.duration - 1e-9) {
        this.#completeTransition(events);
      }
    } else {
      this.#stateTime += delta;
      const outgoing = machine.transitions.filter(
        (transition) => referenceId(transition.from, 'machineState') === this.#stateId
      );
      for (const transition of outgoing) {
        if (!transitionSatisfied(transition, this.#stateTime, inputsById)) continue;
        const toId = referenceId(transition.to, 'machineState');
        if (transition.duration > 0) {
          this.#transition = {
            transitionId: transition.id,
            fromId: this.#stateId,
            toId,
            duration: transition.duration,
            startedAt: this.#stateTime,
          };
          events.push({
            type: 'transition-start',
            transitionId: transition.id,
            fromId: this.#stateId,
            toId,
          });
        } else {
          const fromId = this.#stateId;
          this.#stateId = toId;
          this.#stateTime = 0;
          events.push(
            { type: 'transition-start', transitionId: transition.id, fromId, toId },
            { type: 'transition-end', transitionId: transition.id, fromId, toId },
          );
        }
        break;
      }
    }
    this.#clearTriggers();
    return events;
  }

  #clearTriggers() {
    for (const input of this.machine?.inputs || []) {
      if (input.type === 'trigger' && (this.#overrideValues.get(input.id) ?? input.value)) {
        this.#overrideValues.set(input.id, false);
      }
    }
  }

  /** Set a number or bool input. Triggers must use `fire()`. */
  setInput(nameOrId, value) {
    this.#reconcile();
    const machine = this.machine;
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type === 'trigger') {
      throw new TypeError(`Input "${input.name || input.id}" is a trigger; use fire() to activate it.`);
    }
    const normalized = input.type === 'number'
      ? Number(value)
      : Boolean(value);
    if (input.type === 'number' && !Number.isFinite(normalized)) {
      throw new TypeError(`Input "${input.name || input.id}" requires a finite number.`);
    }
    this.#overrideValues.set(input.id, normalized);
    return normalized;
  }

  /** Arm a trigger input; it stays true until the next step() consumes it. */
  fire(nameOrId) {
    this.#reconcile();
    const machine = this.machine;
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type !== 'trigger') {
      throw new TypeError(`Input "${input.name || input.id}" is not a trigger; use setInput() for ${input.type} inputs.`);
    }
    this.#overrideValues.set(input.id, true);
    return true;
  }

  /**
   * Evaluate the machine and return an animation-layer override map plus
   * runtime state. `overrides` uses the same property-address keys as
   * `evaluateTimelines`, so it can be passed straight into
   * `evaluateDocument(document, { animation: overrides })`.
   */
  evaluate() {
    const machine = this.#reconcile();
    const result = {
      machineId: this.#machineId,
      stateId: this.#stateId,
      stateName: machine?.states.find((state) => state.id === this.#stateId)?.name || null,
      stateTime: this.#stateTime,
      transition: this.transition,
      inputs: cloneValue(this.inputs),
      overrides: {},
    };
    if (!machine || !machine.states.length) return result;

    const timelineStates = [];
    if (this.#transition) {
      const { fromId, toId, startedAt, duration } = this.#transition;
      const elapsed = this.#stateTime - startedAt;
      const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
      const outgoing = machine.states.find((state) => state.id === fromId);
      const incoming = machine.states.find((state) => state.id === toId);
      if (outgoing?.timeline) {
        timelineStates.push({
          timelineId: referenceId(outgoing.timeline, 'timeline'),
          time: this.#stateTime,
          weight: 1,
        });
      }
      if (incoming?.timeline) {
        timelineStates.push({
          timelineId: referenceId(incoming.timeline, 'timeline'),
          time: elapsed,
          weight: progress,
        });
      }
    } else {
      const current = machine.states.find((state) => state.id === this.#stateId);
      if (current?.timeline) {
        timelineStates.push({
          timelineId: referenceId(current.timeline, 'timeline'),
          time: this.#stateTime,
          weight: 1,
        });
      }
    }
    result.overrides = evaluateTimelines(this.#document, timelineStates);
    return result;
  }

  /** Return the machine to its initial state with authored input values. */
  reset() {
    const machine = this.#reconcile();
    if (!machine) return;
    this.#resetRuntime(machine);
  }

  /**
   * Deterministic scrub: reset the machine and re-simulate `seconds` with no
   * external input changes, then return the resulting state.
   */
  scrub(seconds) {
    this.reset();
    this.step(Number(seconds));
    return cloneValue(this.evaluate());
  }
}

export function createMachineRuntime(documentOrGetter, machineId) {
  return new MachineRuntime(documentOrGetter, machineId);
}
