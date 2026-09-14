import { cloneValue, machineById, machineLayers } from './model.js';
import { referenceId } from './references.js';
import { evaluateTimelines, interpolateValue } from './animation.js';
import { readProperty } from './properties.js';

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
    'add-layer',
    'update-layer',
    'remove-layer',
    'reorder-layer',
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
  const layers = machineLayers(machine)
    .map((layer) => [
      layer.id,
      layer.initial ? referenceId(layer.initial, 'machineState') : null,
      layer.states.map((state) => state.id),
      layer.transitions.map((transition) => [
        transition.id,
        referenceId(transition.from, 'machineState'),
        referenceId(transition.to, 'machineState'),
      ]),
    ])
    .sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify([
    machine.inputs.map((input) => [input.id, input.type]),
    layers,
  ]);
}

function transitionView(position) {
  if (!position?.transition) return null;
  const { transitionId, fromId, toId, duration, startedAt } = position.transition;
  const elapsed = position.stateTime - startedAt;
  return {
    id: transitionId,
    fromId,
    toId,
    duration,
    progress: duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1,
  };
}

function mergeLayerOverrides(document, target, source, weight) {
  if (weight <= 0) return target;
  for (const [address, value] of Object.entries(source || {})) {
    if (weight >= 1) {
      target[address] = value;
    } else if (target[address] !== undefined) {
      target[address] = interpolateValue(target[address], value, weight);
    } else {
      try {
        target[address] = interpolateValue(readProperty(document, address), value, weight);
      } catch {
        target[address] = value;
      }
    }
  }
  return target;
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
  #layers = new Map();
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
    snapshot.#layers = new Map([...this.#layers].map(([key, value]) => [key, cloneValue(value)]));
    snapshot.#signature = this.#signature;
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
    const machine = this.#reconcile();
    return this.#layers.get(machineLayers(machine)[0]?.id)?.stateId || null;
  }

  get state() {
    const machine = this.#reconcile();
    const layer = machineLayers(machine)[0];
    const stateId = this.#layers.get(layer?.id)?.stateId;
    return layer?.states.find((state) => state.id === stateId) || null;
  }

  get stateTime() {
    const machine = this.#reconcile();
    return this.#layers.get(machineLayers(machine)[0]?.id)?.stateTime || 0;
  }

  get transition() {
    const machine = this.#reconcile();
    return transitionView(this.#layers.get(machineLayers(machine)[0]?.id));
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
    this.#layers = new Map();
    for (const layer of machineLayers(machine)) {
      const initial = layer.initial
        ? layer.states.find((state) => state.id === referenceId(layer.initial, 'machineState'))
        : layer.states[0];
      this.#layers.set(layer.id, { stateId: initial?.id || null, stateTime: 0, transition: null });
    }
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

  #completeTransition(layer, position, events) {
    const { transitionId, fromId, toId, startedAt } = position.transition;
    // The incoming state kept running during the blend, so it owns the
    // elapsed time when the blend finishes and its timeline continues
    // seamlessly from there.
    position.stateTime -= startedAt;
    position.stateId = toId;
    position.transition = null;
    events.push({ type: 'transition-end', layerId: layer.id, transitionId, fromId, toId });
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
    if (!machine) return events;
    if (delta === 0) {
      this.#clearTriggers();
      return events;
    }

    const inputsById = this.#inputsById();
    for (const layer of machineLayers(machine)) {
      if (!layer.enabled || !layer.states.length) continue;
      const position = this.#layers.get(layer.id);
      if (!position) continue;
      if (position.transition) {
        position.stateTime += delta;
        if (position.stateTime - position.transition.startedAt >= position.transition.duration - 1e-9) {
          this.#completeTransition(layer, position, events);
        }
      } else {
        position.stateTime += delta;
        const outgoing = layer.transitions.filter(
          (transition) => referenceId(transition.from, 'machineState') === position.stateId
        );
        for (const transition of outgoing) {
          if (!transitionSatisfied(transition, position.stateTime, inputsById)) continue;
          const toId = referenceId(transition.to, 'machineState');
          if (transition.duration > 0) {
            position.transition = {
              transitionId: transition.id,
              fromId: position.stateId,
              toId,
              duration: transition.duration,
              startedAt: position.stateTime,
            };
            events.push({
              type: 'transition-start',
              layerId: layer.id,
              transitionId: transition.id,
              fromId: position.stateId,
              toId,
            });
          } else {
            const fromId = position.stateId;
            position.stateId = toId;
            position.stateTime = 0;
            events.push(
              { type: 'transition-start', layerId: layer.id, transitionId: transition.id, fromId, toId },
              { type: 'transition-end', layerId: layer.id, transitionId: transition.id, fromId, toId },
            );
          }
          break;
        }
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
    const layers = [];
    const overrides = {};
    const evaluatedTimelines = [];
    for (const layer of machineLayers(machine)) {
      const position = this.#layers.get(layer.id) || { stateId: null, stateTime: 0, transition: null };
      const timelineStates = [];
      if (layer.enabled && layer.weight > 0 && layer.states.length) {
        if (position.transition) {
          const { fromId, toId, startedAt, duration } = position.transition;
          const elapsed = position.stateTime - startedAt;
          const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
          const outgoing = layer.states.find((state) => state.id === fromId);
          const incoming = layer.states.find((state) => state.id === toId);
          if (outgoing?.timeline) timelineStates.push({
            timelineId: referenceId(outgoing.timeline, 'timeline'), time: position.stateTime, weight: 1,
          });
          if (incoming?.timeline) timelineStates.push({
            timelineId: referenceId(incoming.timeline, 'timeline'), time: elapsed, weight: progress,
          });
        } else {
          const current = layer.states.find((state) => state.id === position.stateId);
          if (current?.timeline) timelineStates.push({
            timelineId: referenceId(current.timeline, 'timeline'), time: position.stateTime, weight: 1,
          });
        }
      }
      const layerOverrides = evaluateTimelines(this.#document, timelineStates);
      mergeLayerOverrides(this.#document, overrides, layerOverrides, layer.weight);
      const observedTimelines = timelineStates.map((state) => ({ ...state, layerId: layer.id }));
      evaluatedTimelines.push(...observedTimelines);
      layers.push({
        ref: { kind: 'machineLayer', id: layer.id },
        id: layer.id,
        name: layer.name,
        enabled: layer.enabled,
        weight: layer.weight,
        stateId: position.stateId,
        stateName: layer.states.find((state) => state.id === position.stateId)?.name || null,
        stateTime: position.stateTime,
        transition: transitionView(position),
        overrides: layerOverrides,
        evaluatedTimelines: observedTimelines,
      });
    }
    const base = layers[0] || null;
    const result = {
      machineId: this.#machineId,
      stateId: base?.stateId || null,
      stateName: base?.stateName || null,
      stateTime: base?.stateTime || 0,
      transition: base?.transition || null,
      inputs: cloneValue(this.inputs),
      overrides,
      evaluatedTimelines,
      layers,
    };
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
