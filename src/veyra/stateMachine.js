import { cloneValue, machineById } from './model.js';
import { referenceId } from './references.js';
import { evaluateTimelines } from './animation.js';

export const VEYRA_MACHINE_EVENT_TYPES = Object.freeze([
  'transition-start',
  'transition-end',
]);

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
 * time, input values, active transition). Everything structural — states,
 * transitions, inputs, timelines — is read from the document on every call,
 * so editor edits are picked up without re-creation. Pass a document getter
 * (`() => store.document`) to stay current across document normalization.
 *
 * Time is measured in seconds. A transition's authored `duration` is in
 * seconds; `0` cuts immediately. Blending crossfades the outgoing and
 * incoming timeline contributions: addresses driven by both crossfade
 * linearly, outgoing-only addresses hold, incoming-only addresses ramp in
 * against their authored value.
 */
export class MachineRuntime {
  #documentOrGetter = null;
  #machineId = null;
  #inputValues = new Map();
  #stateId = null;
  #stateTime = 0;
  #transition = null;

  constructor(documentOrGetter, machineId) {
    this.#documentOrGetter = documentOrGetter;
    this.#machineId = String(machineId || '');
    const machine = machineById(resolveDocument(documentOrGetter), this.#machineId);
    if (!machine) {
      throw new TypeError(`State machine ${machineId} was not found in the document.`);
    }
    this.#resetRuntime(machine);
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

  get stateId() {
    return this.machine?.states.length ? this.#stateId : null;
  }

  get state() {
    return this.machine?.states.find((state) => state.id === this.#stateId) || null;
  }

  get stateTime() {
    return this.#stateTime;
  }

  get transition() {
    if (!this.#transition) return null;
    const { transition, fromId, toId, startedAt } = this.#transition;
    const elapsed = this.#stateTime - startedAt;
    const progress = transition.duration > 0 ? Math.min(1, Math.max(0, elapsed / transition.duration)) : 1;
    return {
      id: transition.id,
      fromId,
      toId,
      duration: transition.duration,
      progress,
    };
  }

  get inputs() {
    return (this.machine?.inputs || []).map((input) => ({
      id: input.id,
      name: input.name,
      type: input.type,
      value: this.#inputValues.get(input.id) ?? input.value,
    }));
  }

  #resetRuntime(machine) {
    this.#inputValues = new Map(machine.inputs.map((input) => [input.id, input.value]));
    const initial = machine.initial
      ? machine.states.find((state) => state.id === referenceId(machine.initial, 'machineState'))
      : machine.states[0];
    this.#stateId = initial?.id || null;
    this.#stateTime = 0;
    this.#transition = null;
  }

  #inputsById() {
    return new Map(this.inputs.map((input) => [input.id, input.value]));
  }

  #completeTransition(events) {
    const { transition, fromId, toId, startedAt } = this.#transition;
    // The incoming state kept running during the blend, so it owns the
    // elapsed time when the blend finishes and its timeline continues
    // seamlessly from there.
    this.#stateTime = this.#stateTime - startedAt;
    this.#stateId = toId;
    this.#transition = null;
    events.push({ type: 'transition-end', transitionId: transition.id, fromId, toId });
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
    const machine = this.machine;
    if (!machine || !machine.states.length) return events;
    if (delta === 0) {
      this.#clearTriggers();
      return events;
    }

    const inputsById = this.#inputsById();
    if (this.#transition) {
      this.#stateTime += delta;
      if (this.#stateTime - this.#transition.startedAt >= this.#transition.transition.duration - 1e-9) {
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
          this.#transition = { transition, fromId: this.#stateId, toId, startedAt: this.#stateTime };
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
      if (input.type === 'trigger' && this.#inputValues.get(input.id)) {
        this.#inputValues.set(input.id, false);
      }
    }
  }

  /** Set a number or bool input. Triggers must use `fire()`. */
  setInput(nameOrId, value) {
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
    this.#inputValues.set(input.id, normalized);
    return normalized;
  }

  /** Arm a trigger input; it stays true until the next step() consumes it. */
  fire(nameOrId) {
    const machine = this.machine;
    if (!machine) throw new TypeError(`State machine ${this.#machineId} is no longer in the document.`);
    const input = resolveInput(machine, nameOrId);
    if (!input) throw new TypeError(`Machine input "${nameOrId}" was not found on ${machine.name || this.#machineId}.`);
    if (input.type !== 'trigger') {
      throw new TypeError(`Input "${input.name || input.id}" is not a trigger; use setInput() for ${input.type} inputs.`);
    }
    this.#inputValues.set(input.id, true);
    return true;
  }

  /**
   * Evaluate the machine and return an animation-layer override map plus
   * runtime state. `overrides` uses the same property-address keys as
   * `evaluateTimelines`, so it can be passed straight into
   * `evaluateDocument(document, { animation: overrides })`.
   */
  evaluate() {
    const machine = this.machine;
    const result = {
      machineId: this.#machineId,
      stateId: this.stateId,
      stateName: this.state?.name || null,
      stateTime: this.#stateTime,
      transition: this.transition,
      inputs: cloneValue(this.inputs),
      overrides: {},
    };
    if (!machine || !machine.states.length) return result;

    const timelineStates = [];
    if (this.#transition) {
      const { transition, fromId, toId } = this.#transition;
      const elapsed = this.#stateTime - this.#transition.startedAt;
      const progress = transition.duration > 0 ? Math.min(1, Math.max(0, elapsed / transition.duration)) : 1;
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
    } else if (this.state?.timeline) {
      timelineStates.push({
        timelineId: referenceId(this.state.timeline, 'timeline'),
        time: this.#stateTime,
        weight: 1,
      });
    }
    result.overrides = evaluateTimelines(this.#document, timelineStates);
    return result;
  }

  /** Return the machine to its initial state with authored input values. */
  reset() {
    const machine = this.machine;
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
