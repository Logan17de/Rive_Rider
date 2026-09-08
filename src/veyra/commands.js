import {
  VEYRA_EASING_TYPES,
  VEYRA_LOOP_MODES,
  VEYRA_LISTENER_ACTIONS,
  VEYRA_LISTENER_EVENTS,
  VEYRA_MACHINE_INPUT_TYPES,
  VEYRA_NODE_TYPES,
  VEYRA_PROPERTY_BOUNDS,
} from './model.js';
import { VEYRA_SEMANTIC_COMMAND_ACTIONS } from './semantics.js';

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
    run: (store, args, command) => store.add(args.type, args.options ?? {}, command ?? {}),
  },
  remove: {
    summary: 'Remove a node, its descendants, and dependent records.',
    params: [param('nodeId', 'string', true)],
    run: (store, args, command) => store.remove(args.nodeId, command ?? {}),
  },
  removeSelection: {
    summary: 'Remove the current selection through the shared cascade cleanup.',
    params: [],
    run: (store, args, command) => store.removeSelection(command ?? {}),
  },
  addSemantic: {
    summary: 'Add a semantic record for a typed target reference.',
    params: [param('target', 'reference', true), param('overrides', 'object', false)],
    run: (store, args, command) => store.addSemantic(args.target, args.overrides ?? {}, command ?? {}),
  },
  updateSemantic: {
    summary: 'Update an existing semantic record by stable semantic-record id.',
    params: [param('semanticId', 'string', true), param('patch', 'object', true)],
    run: (store, args, command) => store.updateSemantic(args.semanticId, args.patch, command ?? {}),
  },
  removeSemantic: {
    summary: 'Remove a semantic record by stable semantic-record id.',
    params: [param('semanticId', 'string', true)],
    run: (store, args, command) => store.removeSemantic(args.semanticId, command ?? {}),
  },
  addSemanticRelation: {
    summary: 'Add one typed semantic relation to a semantic record.',
    params: [param('semanticId', 'string', true), param('relation', 'object', true)],
    run: (store, args, command) => store.addSemanticRelation(args.semanticId, args.relation, command ?? {}),
  },
  removeSemanticRelation: {
    summary: 'Remove one typed semantic relation from a semantic record.',
    params: [param('semanticId', 'string', true), param('relation', 'object', true)],
    run: (store, args, command) => store.removeSemanticRelation(args.semanticId, args.relation, command ?? {}),
  },
  addListener: {
    summary: 'Add a validated current pointer listener.',
    params: [param('overrides', 'object', true)],
    run: (store, args, command) => store.addListener(args.overrides, command ?? {}),
  },
  updateListener: {
    summary: 'Update a current pointer listener by stable listener id.',
    params: [param('listenerId', 'string', true), param('changes', 'object', true)],
    run: (store, args, command) => store.updateListener(args.listenerId, args.changes, command ?? {}),
  },
  removeListener: {
    summary: 'Remove a current pointer listener by stable listener id.',
    params: [param('listenerId', 'string', true)],
    run: (store, args, command) => store.removeListener(args.listenerId, command ?? {}),
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
      param('trackId', 'string', false),
      param('keyframeId', 'string', false),
    ],
    run: (store, args, command) => store.setKeyframe(
      {
        timelineId: args.timelineId,
        address: args.address,
        frame: args.frame,
        value: args.value,
        easing: args.easing,
        easingParams: args.easingParams,
        trackId: args.trackId,
        keyframeId: args.keyframeId,
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

function manifestParameter(name, type, required, description, extras = {}) {
  return { name, type, required, description, ...extras };
}

const bounds = (key) => ({ bounds: { ...VEYRA_PROPERTY_BOUNDS[key] } });

const COMMAND_MANIFEST_OVERRIDES = {
  select: {
    targetKind: 'selection',
    capabilities: ['selection', 'non-mutating'],
  },
  replaceDocument: {
    targetKind: 'transaction',
    capabilities: ['document-replacement', 'clears-history'],
  },
  begin: { targetKind: 'transaction', capabilities: ['transaction'] },
  commit: { targetKind: 'transaction', capabilities: ['transaction'] },
  cancel: { targetKind: 'transaction', capabilities: ['transaction'] },
  undo: { targetKind: 'history', capabilities: ['history', 'recoverable'] },
  redo: { targetKind: 'history', capabilities: ['history', 'recoverable'] },
  removeSelection: {
    targetKind: 'selection',
    capabilities: ['selection', 'transactional', 'undoable'],
  },
  addSemantic: {
    manifestId: 'add-semantic',
    name: 'Add semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable', 'returns-id'],
  },
  updateSemantic: {
    manifestId: 'update-semantic',
    name: 'Update semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable'],
  },
  removeSemantic: {
    manifestId: 'remove-semantic',
    name: 'Remove semantic',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'transactional', 'undoable'],
  },
  addSemanticRelation: {
    manifestId: 'add-semantic-relation',
    name: 'Add semantic relation',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'typed-relation', 'transactional', 'undoable'],
  },
  removeSemanticRelation: {
    manifestId: 'remove-semantic-relation',
    name: 'Remove semantic relation',
    targetKind: 'semanticRecord',
    capabilities: ['semantic-write', 'typed-relation', 'transactional', 'undoable'],
  },
  addListener: {
    manifestId: 'add-listener',
    name: 'Add listener',
    targetKind: 'listener',
    parameters: [
      manifestParameter('overrides', 'object', true, 'Pointer listener with stable target refs, event/action and typed runtime/transport targets.', {
        eventEnum: [...VEYRA_LISTENER_EVENTS], actionEnum: [...VEYRA_LISTENER_ACTIONS],
      }),
    ],
    capabilities: ['interaction-write', 'transactional', 'undoable', 'returns-id'],
  },
  updateListener: {
    manifestId: 'update-listener',
    name: 'Update listener',
    targetKind: 'listener',
    capabilities: ['interaction-write', 'transactional', 'undoable'],
  },
  removeListener: {
    manifestId: 'remove-listener',
    name: 'Remove listener',
    targetKind: 'listener',
    capabilities: ['interaction-write', 'transactional', 'undoable'],
  },
  setProperty: {
    manifestId: 'write-property',
    name: 'Write property',
    targetKind: 'propertyAddress',
    parameters: [
      manifestParameter('address', 'propertyAddress', true, 'A property address such as node:<id>/geometry/width.'),
      manifestParameter('value', 'any', true, 'A value valid for the property.'),
    ],
    capabilities: ['writable-only', 'transactional', 'undoable'],
  },
  add: {
    manifestId: 'add-node',
    name: 'Add node',
    targetKind: 'node',
    parameters: [
      manifestParameter('type', 'enum', true, 'One of the Veyra node types.', { enum: [...VEYRA_NODE_TYPES] }),
      manifestParameter('name', 'string', false, 'Display name.'),
      manifestParameter('parentId', 'string', false, 'Id of the parent node.'),
      manifestParameter('transform', 'object', false, 'Transform overrides.'),
      manifestParameter('paint', 'object', false, 'Paint overrides.'),
      manifestParameter('geometry', 'object', false, 'Geometry overrides.'),
    ],
    capabilities: ['transactional', 'undoable', 'selects-result'],
  },
  remove: {
    manifestId: 'remove-node',
    name: 'Remove node',
    targetKind: 'node',
    parameters: [manifestParameter('nodeId', 'string', true, 'Id of the node to remove.')],
    capabilities: ['cascades-descendants', 'transactional', 'undoable'],
  },
  addTimeline: {
    manifestId: 'create-timeline',
    name: 'Create timeline',
    targetKind: 'timeline',
    parameters: [
      manifestParameter('name', 'string', false, 'Timeline name.'),
      manifestParameter('duration', 'number', false, 'Duration in frames.', bounds('timeline.duration')),
      manifestParameter('fps', 'number', false, 'Frames per second.', bounds('timeline.fps')),
      manifestParameter('loop', 'enum', false, 'Loop mode.', { enum: [...VEYRA_LOOP_MODES] }),
      manifestParameter('workStart', 'number', false, 'Work area start frame.', bounds('timeline.workStart')),
      manifestParameter('workEnd', 'number', false, 'Work area end frame.', bounds('timeline.workEnd')),
    ],
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  updateTimeline: {
    manifestId: 'update-timeline',
    name: 'Update timeline',
    targetKind: 'timeline',
    parameters: [
      manifestParameter('timelineId', 'string', true, 'Id of the timeline.'),
      manifestParameter('name', 'string', false, 'New name.'),
      manifestParameter('duration', 'number', false, 'New duration in frames.', bounds('timeline.duration')),
      manifestParameter('fps', 'number', false, 'New frames per second.', bounds('timeline.fps')),
      manifestParameter('loop', 'enum', false, 'New loop mode.', { enum: [...VEYRA_LOOP_MODES] }),
      manifestParameter('workStart', 'number', false, 'New work area start frame.', bounds('timeline.workStart')),
      manifestParameter('workEnd', 'number', false, 'New work area end frame.', bounds('timeline.workEnd')),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  removeTimeline: {
    manifestId: 'remove-timeline',
    name: 'Remove timeline',
    targetKind: 'timeline',
    parameters: [manifestParameter('timelineId', 'string', true, 'Id of the timeline.')],
    capabilities: ['blocked-while-used-by-machines', 'transactional', 'undoable'],
  },
  setKeyframe: {
    manifestId: 'set-keyframe',
    name: 'Set keyframe',
    targetKind: 'keyframe',
    parameters: [
      manifestParameter('timelineId', 'string', true, 'Id of the timeline.'),
      manifestParameter('address', 'propertyAddress', true, 'An animatable property address.'),
      manifestParameter('frame', 'number', true, 'Frame of the keyframe.', bounds('keyframe.frame')),
      manifestParameter('value', 'any', false, 'Value to key. Defaults to the current authored value.'),
      manifestParameter('easing', 'enum', false, 'Easing toward the next keyframe.', { enum: [...VEYRA_EASING_TYPES] }),
      manifestParameter('easingParams', 'array', false, 'Four numbers when easing is cubic-bezier; each parameter is bounded.', bounds('keyframe.easingParams.*')),
      manifestParameter('trackId', 'string', false, 'Optional explicit stable id when a new track is created.'),
      manifestParameter('keyframeId', 'string', false, 'Optional explicit stable id when a new keyframe is created.'),
    ],
    capabilities: ['animatable-only', 'creates-track-if-needed', 'transactional', 'undoable'],
  },
  removeKeyframe: {
    manifestId: 'remove-keyframe',
    name: 'Remove keyframe',
    targetKind: 'keyframe',
    parameters: [
      manifestParameter('timelineId', 'string', true, 'Id of the timeline.'),
      manifestParameter('address', 'propertyAddress', true, 'Property address of the track.'),
      manifestParameter('frame', 'number', true, 'Frame of the keyframe.', bounds('keyframe.frame')),
    ],
    capabilities: ['removes-empty-track', 'transactional', 'undoable'],
  },
  moveKeyframe: {
    manifestId: 'move-keyframe',
    name: 'Move keyframe',
    targetKind: 'keyframe',
    parameters: [
      manifestParameter('timelineId', 'string', true, 'Id of the timeline.'),
      manifestParameter('address', 'propertyAddress', true, 'Property address of the track.'),
      manifestParameter('fromFrame', 'number', true, 'Current frame of the keyframe.', bounds('keyframe.frame')),
      manifestParameter('toFrame', 'number', true, 'New frame of the keyframe.', bounds('keyframe.frame')),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  addStateMachine: {
    manifestId: 'create-state-machine',
    name: 'Create state machine',
    targetKind: 'stateMachine',
    parameters: [
      manifestParameter('name', 'string', false, 'Machine name.'),
      manifestParameter('inputs', 'array', false, 'Machine input records.'),
      manifestParameter('states', 'array', false, 'Machine state records.'),
      manifestParameter('transitions', 'array', false, 'Machine transition records.'),
      manifestParameter('initial', 'reference', false, 'machineState reference for the initial state.'),
    ],
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  updateStateMachine: {
    manifestId: 'update-state-machine',
    name: 'Update state machine',
    targetKind: 'stateMachine',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('name', 'string', false, 'New name.'),
      manifestParameter('initial', 'reference', false, 'New machineState reference for the initial state.'),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  removeStateMachine: {
    manifestId: 'remove-state-machine',
    name: 'Remove state machine',
    targetKind: 'stateMachine',
    parameters: [manifestParameter('machineId', 'string', true, 'Id of the machine.')],
    capabilities: ['transactional', 'undoable'],
  },
  addMachineInput: {
    manifestId: 'add-machine-input',
    name: 'Add machine input',
    targetKind: 'machineInput',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('name', 'string', false, 'Unique input name within the machine.'),
      manifestParameter('type', 'enum', false, 'Input type.', { enum: [...VEYRA_MACHINE_INPUT_TYPES] }),
      manifestParameter('value', 'any', false, 'Authored value.'),
    ],
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  addMachineState: {
    manifestId: 'add-machine-state',
    name: 'Add machine state',
    targetKind: 'machineState',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('name', 'string', false, 'State name.'),
      manifestParameter('timelineId', 'string', true, 'Id of a timeline in the document.'),
    ],
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  removeMachineState: {
    manifestId: 'remove-machine-state',
    name: 'Remove machine state',
    targetKind: 'machineState',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('stateId', 'string', true, 'Id of the state.'),
    ],
    capabilities: ['cascades-transitions', 'transactional', 'undoable'],
  },
  addMachineTransition: {
    manifestId: 'add-machine-transition',
    name: 'Add machine transition',
    targetKind: 'machineTransition',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('from', 'string', true, 'Source machine state id.'),
      manifestParameter('to', 'string', true, 'Target machine state id.'),
      manifestParameter('duration', 'number', false, 'Transition duration in seconds.', bounds('machineTransition.duration')),
      manifestParameter('after', 'number', false, 'Optional transition delay.', bounds('machineTransition.after')),
      manifestParameter('conditions', 'array', false, 'Conditions that gate the transition.'),
    ],
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  removeMachineTransition: {
    manifestId: 'remove-machine-transition',
    name: 'Remove machine transition',
    targetKind: 'machineTransition',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('transitionId', 'string', true, 'Id of the transition.'),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  updateMachineState: {
    manifestId: 'update-machine-state',
    name: 'Update machine state',
    targetKind: 'machineState',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('stateId', 'string', true, 'Id of the state.'),
      manifestParameter('name', 'string', false, 'New state name.'),
      manifestParameter('timelineId', 'string', false, 'Replacement timeline id.'),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  updateMachineInput: {
    manifestId: 'update-machine-input',
    name: 'Update machine input',
    targetKind: 'machineInput',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('inputId', 'string', true, 'Id of the input.'),
      manifestParameter('name', 'string', false, 'New input name.'),
      manifestParameter('type', 'enum', false, 'New input type.', { enum: [...VEYRA_MACHINE_INPUT_TYPES] }),
      manifestParameter('value', 'any', false, 'New authored value.'),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  removeMachineInput: {
    manifestId: 'remove-machine-input',
    name: 'Remove machine input',
    targetKind: 'machineInput',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('inputId', 'string', true, 'Id of the input.'),
    ],
    capabilities: ['blocked-while-referenced-by-conditions', 'transactional', 'undoable'],
  },
  updateMachineTransition: {
    manifestId: 'update-machine-transition',
    name: 'Update machine transition',
    targetKind: 'machineTransition',
    parameters: [
      manifestParameter('machineId', 'string', true, 'Id of the machine.'),
      manifestParameter('transitionId', 'string', true, 'Id of the transition.'),
      manifestParameter('duration', 'number', false, 'New transition duration.', bounds('machineTransition.duration')),
      manifestParameter('after', 'number', false, 'New transition delay.', bounds('machineTransition.after')),
      manifestParameter('conditions', 'array', false, 'Replacement transition conditions.'),
    ],
    capabilities: ['transactional', 'undoable'],
  },
  addBone: {
    targetKind: 'bone',
    capabilities: ['transactional', 'undoable', 'selects-result'],
  },
  addMesh: {
    targetKind: 'mesh',
    capabilities: ['transactional', 'undoable', 'selects-result'],
  },
  addControl: {
    targetKind: 'control',
    capabilities: ['transactional', 'undoable', 'selects-result'],
  },
  addConstraint: {
    targetKind: 'constraint',
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  addAsset: {
    targetKind: 'asset',
    capabilities: ['transactional', 'undoable', 'returns-id'],
  },
  removeBone: {
    targetKind: 'bone',
    capabilities: ['cascades-dependents', 'transactional', 'undoable'],
  },
  removeMesh: {
    targetKind: 'mesh',
    capabilities: ['transactional', 'undoable'],
  },
  removeControl: {
    targetKind: 'control',
    capabilities: ['cascades-constraints', 'transactional', 'undoable'],
  },
  removeConstraint: {
    targetKind: 'constraint',
    capabilities: ['transactional', 'undoable'],
  },
  removeAsset: {
    targetKind: 'asset',
    capabilities: ['transactional', 'undoable'],
  },
};

const COMMAND_DESCRIPTIONS = Object.freeze({
  setProperty: 'Set a writable property by address. The write is rejected unless the address is in the target capability list.',
  add: 'Create a node and append it to the document in draw order.',
  remove: 'Remove a node, its descendants, and the semantic records and path constraints that point at them.',
  addTimeline: 'Add a timeline to the document.',
  updateTimeline: 'Update the metadata of an existing timeline.',
  removeTimeline: 'Delete a timeline. Blocked while a state machine state still uses it.',
  setKeyframe: 'Create or replace a keyframe for an animatable property address; the track is created when missing.',
  removeKeyframe: 'Delete a keyframe by timeline, address, and frame. The track is removed when it becomes empty.',
  moveKeyframe: 'Move a keyframe to a new frame within the same track.',
  addStateMachine: 'Add a state machine with its inputs, states, and transitions.',
  updateStateMachine: 'Update the name or initial state of a machine.',
  removeStateMachine: 'Delete a state machine.',
  addMachineInput: 'Add a number, bool, or trigger input to a machine.',
  addMachineState: 'Add an animation state pointing at a document timeline.',
  removeMachineState: 'Delete a state and the transitions that reference it; clears initial when it pointed there.',
  addMachineTransition: 'Add a transition between two states of the same machine.',
  removeMachineTransition: 'Delete a transition.',
  updateMachineInput: 'Update an input name, type, or authored value in place. Renames must stay unique within the machine; a type change is refused, naming every dependent condition, unless the operator/type matrix stays satisfied.',
  removeMachineInput: 'Delete an input. Refused while any transition condition references it — remove those conditions first.',
  updateMachineState: 'Rename a state or retarget its timeline, in place; the state id is immutable.',
  updateMachineTransition: 'Update duration, after gate, or conditions (replaced wholesale, validated against the operator/type matrix). Endpoints are immutable — re-add the transition to re-point.',
});

function kebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function titleCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function genericManifestParameters(entry) {
  return entry.params.map((spec) => manifestParameter(
    spec.name,
    spec.type === 'string' && spec.name === 'type' ? 'string' : spec.type,
    spec.required,
    `${titleCase(spec.name)} for this command.`,
  ));
}

function provenanceAuditValue(type) {
  return {
    string: 'audit',
    number: 0,
    boolean: false,
    array: [],
    reference: { kind: 'node', id: 'audit' },
    object: {},
    document: {},
    any: null,
  }[type];
}

function auditCommandProvenance(commandName, entry) {
  if (!entry.capabilities.includes('undoable')) {
    return Object.freeze({ status: 'not-history-mutation', reason: 'command does not advertise an undoable committed Store history mutation' });
  }
  const marker = Object.freeze({ __veyraProvenanceAudit: commandName });
  let forwarded = false;
  const fakeStore = new Proxy({}, {
    get: () => (...args) => {
      if (args.includes(marker)) forwarded = true;
      return null;
    },
  });
  const args = Object.fromEntries(entry.params.map((spec) => [spec.name, provenanceAuditValue(spec.type)]));
  try {
    entry.run(fakeStore, args, marker);
  } catch (error) {
    throw new TypeError(`Command provenance audit could not exercise ${commandName}: ${error?.message || error}`);
  }
  if (!forwarded) {
    throw new TypeError(`Undoable command ${commandName} does not forward canonical command provenance to its Store method.`);
  }
  return Object.freeze({
    status: 'preserved',
    fields: Object.freeze(['source', 'label', 'propertyAddresses', 'metadata']),
  });
}

for (const [commandName, entry] of Object.entries(COMMAND_TABLE)) {
  const override = COMMAND_MANIFEST_OVERRIDES[commandName] || {};
  const manifestId = override.manifestId || kebabCase(commandName);
  Object.assign(entry, {
    manifestId,
    name: override.name || titleCase(manifestId),
    description: COMMAND_DESCRIPTIONS[commandName] || entry.summary,
    targetKind: override.targetKind || 'document',
    parameters: override.parameters || genericManifestParameters(entry),
    capabilities: override.capabilities || ['transactional', 'undoable'],
    transport: 'command',
    hostAvailability: 'available',
  });
  entry.provenance = auditCommandProvenance(commandName, entry);
}

for (const action of VEYRA_SEMANTIC_COMMAND_ACTIONS) {
  if (!COMMAND_TABLE[action]) throw new TypeError(`Missing semantic command-bus action: ${action}`);
}

export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);

export const VEYRA_COMMAND_ACTIONS = Object.freeze(Object.keys(COMMAND_TABLE).sort());

export const VEYRA_COMMAND_PROVENANCE_AUDIT = Object.freeze(Object.fromEntries(
  VEYRA_COMMAND_ACTIONS.map((action) => [action, VEYRA_COMMAND_TABLE[action].provenance]),
));

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
