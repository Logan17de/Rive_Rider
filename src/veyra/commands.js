// Serializable command bus over the VeyraStore public API.
//
// dispatchVeyraCommand(store, descriptor) accepts a plain JSON-safe
// descriptor, validates it against the command table, and invokes exactly
// one public Store method (1:1 wiring — no mutation logic is duplicated
// here). Success returns { ok: true, action, result } with a JSON-safe
// result; failure returns { ok: false, action, error } and never mutates
// the document (Store transactions roll back atomically, and bus-level
// validation happens before any Store call).
//
// Descriptor shape:
//
//   {
//     "action": "setKeyframe",
//     "args":   { "timelineId": "tl", "address": "node:x/transform/x", "frame": 30 },
//     "command": { "label": "Key x", "source": "ai" }   // optional provenance
//   }
//
// Public Store methods that cannot cross a JSON boundary are not
// dispatchable: `execute`, `mutate`, and `subscribe` all require function
// arguments. They are listed in VEYRA_NON_DISPATCHABLE_ACTIONS so the
// command table stays exhaustive and auditable.

function isJsonSafe(value, path = 'args') {
  if (value === null) return;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite number.`);
      return;
    case 'object':
      if (Array.isArray(value)) {
        value.forEach((item, index) => isJsonSafe(item, `${path}[${index}]`));
        return;
      }
      for (const [key, item] of Object.entries(value)) isJsonSafe(item, `${path}.${key}`);
      return;
    default:
      throw new TypeError(`${path} must be JSON-serializable (got ${typeof value}).`);
  }
}

function isPlainObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
}

function checkString(value, path) {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string.`);
}

function checkNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number.`);
}

function checkBoolean(value, path) {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean.`);
}

function checkArray(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
}

function checkReference(value, path) {
  if (typeof value === 'string' && value) return;
  if (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.kind === 'string'
    && value.kind
    && typeof value.id === 'string'
    && value.id
  ) return;
  throw new TypeError(`${path} must be an id string or a { kind, id } reference.`);
}

function checkDocument(value, path) {
  isPlainObject(value, path);
}

const CHECKS = Object.freeze({
  string: checkString,
  number: checkNumber,
  boolean: checkBoolean,
  array: checkArray,
  reference: checkReference,
  object: (value, path) => isPlainObject(value, path),
  document: checkDocument,
  any: () => {},
});

function param(name, type, required = false) {
  return { name, type, required };
}

/**
 * Command table: action name → { summary, params, run }.
 *
 * `run` maps 1:1 onto a single public VeyraStore method. `command` is the
 * optional descriptor-level provenance object, forwarded as the Store's
 * commandDescriptor argument where the method accepts one.
 */
const COMMAND_TABLE = {
  select: {
    summary: 'Select a document object by reference (node, bone, mesh, control, constraint).',
    params: [param('reference', 'reference', true), param('kind', 'string', false)],
    run: (store, args) => {
      store.select(args.reference, args.kind ?? 'node');
      return null;
    },
  },
  replaceDocument: {
    summary: 'Replace the whole document with a JSON document payload and clear command history.',
    params: [param('document', 'document', true), param('reason', 'string', false)],
    run: (store, args) => {
      store.replaceDocument(args.document, args.reason ?? 'load');
      return null;
    },
  },
  begin: {
    summary: 'Open a transaction (requires a command with a label); pair with commit or cancel.',
    params: [],
    run: (store, args, command) => {
      store.begin(command ?? {});
      return null;
    },
  },
  commit: {
    summary: 'Commit the open transaction, if any.',
    params: [],
    run: (store) => store.commit(),
  },
  cancel: {
    summary: 'Cancel the open transaction, if any.',
    params: [],
    run: (store) => store.cancel(),
  },
  undo: {
    summary: 'Undo the last committed command, if any.',
    params: [],
    run: (store) => store.undo(),
  },
  redo: {
    summary: 'Redo the last undone command, if any.',
    params: [],
    run: (store) => store.redo(),
  },
  add: {
    summary: 'Add a node and select it.',
    params: [param('type', 'string', true), param('options', 'object', false)],
    run: (store, args) => store.add(args.type, args.options ?? {}),
  },
  remove: {
    summary: 'Remove a node, its descendants, and dependent records.',
    params: [param('nodeId', 'string', true)],
    run: (store, args) => store.remove(args.nodeId),
  },
  removeSelection: {
    summary: 'Remove the current selection through the shared cascade cleanup.',
    params: [],
    run: (store) => store.removeSelection(),
  },
  setProperty: {
    summary: 'Write a capability-checked property by address.',
    params: [param('address', 'string', true), param('value', 'any', true)],
    run: (store, args, command) => store.setProperty(command ?? {}, args.address, args.value),
  },
  addTimeline: {
    summary: 'Add a timeline (createTimeline options) and select it.',
    params: [param('overrides', 'object', false)],
    run: (store, args, command) => store.addTimeline(args.overrides ?? {}, command ?? {}),
  },
  removeTimeline: {
    summary: 'Delete a timeline (blocked while a machine state uses it).',
    params: [param('timelineId', 'string', true)],
    run: (store, args, command) => store.removeTimeline(args.timelineId, command ?? {}),
  },
  updateTimeline: {
    summary: 'Update timeline metadata (name, duration, fps, loop, work area).',
    params: [param('timelineId', 'string', true), param('changes', 'object', false)],
    run: (store, args, command) => store.updateTimeline(args.timelineId, args.changes ?? {}, command ?? {}),
  },
  setKeyframe: {
    summary: 'Create or replace a keyframe on an animatable property address.',
    params: [
      param('timelineId', 'string', true),
      param('address', 'string', true),
      param('frame', 'number', true),
      param('value', 'any', false),
      param('easing', 'string', false),
      param('easingParams', 'array', false),
    ],
    run: (store, args, command) => store.setKeyframe(
      {
        timelineId: args.timelineId,
        address: args.address,
        frame: args.frame,
        value: args.value,
        easing: args.easing,
        easingParams: args.easingParams,
      },
      command ?? {},
    ),
  },
  removeKeyframe: {
    summary: 'Delete a keyframe by timeline, address, and frame (false when absent).',
    params: [param('timelineId', 'string', true), param('address', 'string', true), param('frame', 'number', true)],
    run: (store, args, command) => store.removeKeyframe(args, command ?? {}),
  },
  moveKeyframe: {
    summary: 'Move a keyframe to a new frame within the same track (false when absent).',
    params: [
      param('timelineId', 'string', true),
      param('address', 'string', true),
      param('fromFrame', 'number', true),
      param('toFrame', 'number', true),
    ],
    run: (store, args, command) => store.moveKeyframe(args, command ?? {}),
  },
  addStateMachine: {
    summary: 'Add a state machine (createStateMachine overrides).',
    params: [param('overrides', 'object', false)],
    run: (store, args, command) => store.addStateMachine(args.overrides ?? {}, command ?? {}),
  },
  removeStateMachine: {
    summary: 'Delete a state machine (false when missing).',
    params: [param('machineId', 'string', true)],
    run: (store, args, command) => store.removeStateMachine(args.machineId, command ?? {}),
  },
  updateStateMachine: {
    summary: 'Update a machine name or initial state (false when missing).',
    params: [param('machineId', 'string', true), param('changes', 'object', false)],
    run: (store, args, command) => store.updateStateMachine(args.machineId, args.changes ?? {}, command ?? {}),
  },
  addMachineInput: {
    summary: 'Add a machine input (number/bool/trigger).',
    params: [param('machineId', 'string', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addMachineInput(args.machineId, args.overrides ?? {}, command ?? {}),
  },
  addMachineState: {
    summary: 'Add an animation state pointing at a document timeline.',
    params: [param('machineId', 'string', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addMachineState(args.machineId, args.overrides ?? {}, command ?? {}),
  },
  removeMachineState: {
    summary: 'Delete a machine state and the transitions referencing it.',
    params: [param('machineId', 'string', true), param('stateId', 'string', true)],
    run: (store, args, command) => store.removeMachineState(args.machineId, args.stateId, command ?? {}),
  },
  addMachineTransition: {
    summary: 'Add a machine transition (from/to state ids, duration, after, conditions).',
    params: [param('machineId', 'string', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addMachineTransition(args.machineId, args.overrides ?? {}, command ?? {}),
  },
  removeMachineTransition: {
    summary: 'Delete a machine transition (false when missing).',
    params: [param('machineId', 'string', true), param('transitionId', 'string', true)],
    run: (store, args, command) => store.removeMachineTransition(args.machineId, args.transitionId, command ?? {}),
  },
  updateMachineState: {
    summary: 'Update a machine state name or timeline retarget. Ids and endpoints are immutable; unknown states return false.',
    params: [param('machineId', 'string', true), param('stateId', 'string', true), param('changes', 'object', false)],
    run: (store, args, command) => store.updateMachineState(args.machineId, args.stateId, args.changes ?? {}, command ?? {}),
  },
  updateMachineInput: {
    summary: 'Update a machine input name, type, or authored value. Type changes that would make a dependent condition illegal are refused with a named blocker list.',
    params: [param('machineId', 'string', true), param('inputId', 'string', true), param('changes', 'object', false)],
    run: (store, args, command) => store.updateMachineInput(args.machineId, args.inputId, args.changes ?? {}, command ?? {}),
  },
  removeMachineInput: {
    summary: 'Delete a machine input. Refused while any transition condition still references it (remove those conditions first).',
    params: [param('machineId', 'string', true), param('inputId', 'string', true)],
    run: (store, args, command) => store.removeMachineInput(args.machineId, args.inputId, command ?? {}),
  },
  updateMachineTransition: {
    summary: 'Update a transition duration, after gate, or conditions. Conditions are replaced wholesale and validated against the operator/type matrix; endpoints are immutable.',
    params: [param('machineId', 'string', true), param('transitionId', 'string', true), param('changes', 'object', false)],
    run: (store, args, command) => store.updateMachineTransition(args.machineId, args.transitionId, args.changes ?? {}, command ?? {}),
  },
  addBone: {
    summary: 'Add a bone (createBone overrides) and select it.',
    params: [param('overrides', 'object', false)],
    run: (store, args, command) => store.addBone(args.overrides ?? {}, command ?? {}),
  },
  addMesh: {
    summary: 'Add a mesh (createMesh overrides) and select it.',
    params: [param('overrides', 'object', false)],
    run: (store, args, command) => store.addMesh(args.overrides ?? {}, command ?? {}),
  },
  addControl: {
    summary: 'Add a control (createControl overrides) and select it.',
    params: [param('overrides', 'object', false)],
    run: (store, args, command) => store.addControl(args.overrides ?? {}, command ?? {}),
  },
  addConstraint: {
    summary: 'Add a constraint of a given type (createConstraint overrides).',
    params: [param('type', 'string', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addConstraint(args.type, args.overrides ?? {}, command ?? {}),
  },
  addAsset: {
    summary: 'Add an asset (createAsset overrides).',
    params: [param('type', 'string', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addAsset(args.type, args.overrides ?? {}, command ?? {}),
  },
  removeBone: {
    summary: 'Remove a bone, its descendants, mesh weights, and dependent constraints.',
    params: [param('boneId', 'string', true)],
    run: (store, args, command) => store.removeBone(args.boneId, command ?? {}),
  },
  removeMesh: {
    summary: 'Remove a mesh (false when missing).',
    params: [param('meshId', 'string', true)],
    run: (store, args, command) => store.removeMesh(args.meshId, command ?? {}),
  },
  removeControl: {
    summary: 'Remove a control and the constraints targeting it (false when missing).',
    params: [param('controlId', 'string', true)],
    run: (store, args, command) => store.removeControl(args.controlId, command ?? {}),
  },
  removeConstraint: {
    summary: 'Remove a constraint (false when missing).',
    params: [param('constraintId', 'string', true)],
    run: (store, args, command) => store.removeConstraint(args.constraintId, command ?? {}),
  },
  removeAsset: {
    summary: 'Remove an asset (false when missing).',
    params: [param('assetId', 'string', true)],
    run: (store, args, command) => store.removeAsset(args.assetId, command ?? {}),
  },
};

export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);

export const VEYRA_COMMAND_ACTIONS = Object.freeze(Object.keys(COMMAND_TABLE).sort());

// Public VeyraStore methods that take function arguments and therefore
// cannot cross a JSON command boundary.
export const VEYRA_NON_DISPATCHABLE_ACTIONS = Object.freeze(['execute', 'mutate', 'subscribe']);

function fail(action, message) {
  return { ok: false, action, error: message };
}

/**
 * Dispatch one JSON-safe command against a VeyraStore.
 *
 * Never throws for descriptor, argument, or Store-level failures — it
 * resolves them into { ok: false, action, error } instead. Only a
 * non-Store first argument throws (the bus needs a valid store to route
 * to). Invalid input never mutates the document.
 */
export function dispatchVeyraCommand(store, descriptor) {
  if (!store || typeof store !== 'object' || typeof store.execute !== 'function') {
    return fail(null, 'dispatchVeyraCommand requires a VeyraStore.');
  }
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return fail(null, 'Command descriptor must be a plain object.');
  }
  const action = descriptor.action;
  const entry = typeof action === 'string' ? VEYRA_COMMAND_TABLE[action] : undefined;
  if (!entry) {
    return fail(
      typeof action === 'string' ? action : null,
      `Unknown Veyra command action: ${action === undefined ? 'missing' : String(action)}.`,
    );
  }

  const command = descriptor.command;
  let args;
  try {
    args = descriptor.args ?? {};
    isPlainObject(args, 'args');
    isJsonSafe(args, 'args');
    if (command !== undefined) {
      isPlainObject(command, 'command');
      isJsonSafe(command, 'command');
    }
    const declared = new Set(entry.params.map((spec) => spec.name));
    for (const key of Object.keys(args)) {
      if (!declared.has(key)) throw new TypeError(`Unexpected argument "${key}" for action ${action}.`);
    }
    for (const spec of entry.params) {
      const value = args[spec.name];
      if (spec.required && value === undefined) {
        throw new TypeError(`Missing required argument "${spec.name}" for action ${action}.`);
      }
      if (value !== undefined) CHECKS[spec.type](value, `args.${spec.name}`);
    }
  } catch (error) {
    return fail(action, error.message);
  }

  try {
    const result = entry.run(store, args, command);
    return { ok: true, action, result: result === undefined ? null : result };
  } catch (error) {
    return fail(action, String(error?.message ?? error));
  }
}
