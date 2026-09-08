import { machineById } from './model.js';
import { createMachineRuntime } from './stateMachine.js';
import { referenceId } from './references.js';

function diagnostic(code, message, detail = {}) {
  return { ok: false, applied: false, code, message, ...detail };
}

function mergeOverrides(target, source) {
  for (const [address, value] of Object.entries(source || {})) target[address] = value;
  return target;
}

/**
 * Persistent, DOM-free runtime bridge for listener setInput/fire intents.
 * One MachineRuntime is retained per machine id for the current document
 * getter. MachineRuntime itself reconciles structural edits; this bridge
 * removes stale instances when a machine disappears and never writes authored
 * document/history state.
 */
export function createMachineInteractionBridge({
  getDocument,
  onInvalidate = () => {},
  interactionStepSeconds = 1 / 60,
} = {}) {
  if (typeof getDocument !== 'function') throw new TypeError('createMachineInteractionBridge requires getDocument().');
  const runtimes = new Map();

  const document = () => {
    const value = getDocument();
    if (!value || typeof value !== 'object') throw new TypeError('Machine interaction document getter returned no document.');
    return value;
  };

  function prune() {
    const current = document();
    for (const machineId of [...runtimes.keys()]) {
      if (!machineById(current, machineId)) runtimes.delete(machineId);
    }
  }

  function runtimeFor(machineIdValue) {
    const machineId = referenceId(machineIdValue, 'stateMachine') || String(machineIdValue || '');
    if (!machineId) return null;
    const current = document();
    if (!machineById(current, machineId)) {
      runtimes.delete(machineId);
      return null;
    }
    let runtime = runtimes.get(machineId);
    if (!runtime) {
      runtime = createMachineRuntime(() => document(), machineId);
      runtime.onInvalidate?.((event) => onInvalidate({ kind: 'machine-runtime-invalidated', ...event }));
      runtimes.set(machineId, runtime);
    }
    return runtime;
  }

  function validateTarget(machineIdValue, inputIdValue) {
    const machineId = referenceId(machineIdValue, 'stateMachine') || String(machineIdValue || '');
    const inputId = referenceId(inputIdValue, 'machineInput') || String(inputIdValue || '');
    const machine = machineById(document(), machineId);
    if (!machine) return diagnostic('missing-machine', `Interaction state machine not found: ${machineId}`, { machineId, inputId });
    const input = machine.inputs.find((candidate) => candidate.id === inputId);
    if (!input) return diagnostic('missing-input', `Interaction machine input not found: ${machineId}/${inputId}`, { machineId, inputId });
    return { ok: true, machine, input, machineId, inputId };
  }

  function dispatch(intent) {
    if (!intent || intent.kind !== 'runtime') return diagnostic('unsupported-intent', 'Machine interaction bridge requires a runtime intent.');
    const target = validateTarget(intent.machineId, intent.inputId);
    if (!target.ok) return target;
    const runtime = runtimeFor(target.machineId);
    if (!runtime) return diagnostic('missing-machine', `Interaction state machine not found: ${target.machineId}`);
    try {
      let value;
      if (intent.op === 'setInput') value = runtime.setInput(target.inputId, intent.value);
      else if (intent.op === 'fire') value = runtime.fire(target.inputId);
      else return diagnostic('unsupported-runtime-op', `Unsupported interaction runtime operation: ${intent.op}`, { machineId: target.machineId, inputId: target.inputId });
      // A small deterministic step lets freshly updated conditions react in the
      // same interaction turn and consumes triggers exactly once.
      const events = runtime.step(interactionStepSeconds);
      const evaluation = runtime.evaluate();
      const result = {
        ok: true,
        applied: true,
        runtimeApplied: true,
        op: intent.op,
        machineId: target.machineId,
        inputId: target.inputId,
        value,
        events,
        evaluation,
      };
      onInvalidate({ kind: 'machine-runtime-updated', machineId: target.machineId, inputId: target.inputId, op: intent.op, events });
      return result;
    } catch (error) {
      return diagnostic('runtime-validation-error', String(error?.message || error), { machineId: target.machineId, inputId: target.inputId });
    }
  }

  function step(machineIdValue, deltaSeconds) {
    const runtime = runtimeFor(machineIdValue);
    const machineId = referenceId(machineIdValue, 'stateMachine') || String(machineIdValue || '');
    if (!runtime) return diagnostic('missing-machine', `Interaction state machine not found: ${machineId}`, { machineId });
    try {
      const events = runtime.step(deltaSeconds);
      const evaluation = runtime.evaluate();
      onInvalidate({ kind: 'machine-runtime-stepped', machineId, events });
      return { ok: true, applied: true, runtimeApplied: true, machineId, events, evaluation };
    } catch (error) {
      return diagnostic('runtime-validation-error', String(error?.message || error), { machineId });
    }
  }

  function evaluateAll() {
    prune();
    const overrides = {};
    const evaluations = [];
    for (const machineId of [...runtimes.keys()].sort()) {
      const runtime = runtimes.get(machineId);
      const evaluation = runtime.evaluate();
      evaluations.push(evaluation);
      mergeOverrides(overrides, evaluation.overrides);
    }
    return { overrides, evaluations };
  }

  function reset(machineIdValue = null) {
    if (machineIdValue == null) {
      runtimes.clear();
      onInvalidate({ kind: 'machine-runtime-reset-all' });
      return true;
    }
    const machineId = referenceId(machineIdValue, 'stateMachine') || String(machineIdValue || '');
    const runtime = runtimeFor(machineId);
    if (!runtime) return false;
    runtime.reset();
    onInvalidate({ kind: 'machine-runtime-reset', machineId });
    return true;
  }

  return Object.freeze({
    dispatch,
    evaluateAll,
    prune,
    reset,
    runtimeFor,
    step,
    get runtimeCount() { prune(); return runtimes.size; },
    get machineIds() { prune(); return [...runtimes.keys()].sort(); },
  });
}
