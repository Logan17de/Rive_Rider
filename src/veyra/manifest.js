import {
  cloneValue,
  VEYRA_EASING_TYPES,
  VEYRA_LOOP_MODES,
  VEYRA_MACHINE_INPUT_TYPES,
  VEYRA_MACHINE_STATE_TYPES,
  VEYRA_CONDITION_OPS,
  VEYRA_MACHINE_ORDERING_OPS,
  VEYRA_LISTENER_KINDS,
  VEYRA_LISTENER_EVENTS,
  VEYRA_LISTENER_ACTIONS,
  machineConditionViolation,
  VEYRA_NODE_TYPES,
  VEYRA_PROPERTY_BOUNDS,
} from './model.js';
import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';
import { VEYRA_PROPERTY_TARGET_KINDS } from './properties.js';
import { VEYRA_REFERENCE_KINDS } from './references.js';
import { createSceneSummary } from './summary.js';

export const VEYRA_MANIFEST_FORMAT = 'veyra-project-manifest';
export const VEYRA_MANIFEST_VERSION = 1;

// Reference kinds that exist only inside the manifest (not in authored
// documents). Document-level kinds come from VEYRA_REFERENCE_KINDS.
const MANIFEST_ONLY_REFERENCE_KINDS = Object.freeze(['action', 'keyframe', 'track']);

const BASE_PROJECT_CAPABILITIES = Object.freeze([
  'properties.addressed-read',
  'properties.addressed-write',
  'properties.animatable-check',
  'commands.transactional',
  'commands.undo-redo',
  'commands.provenance',
  'scene.summary',
  'scene.evaluation',
  'scene.svg-export',
]);

function projectCapabilities(document) {
  const capabilities = [...BASE_PROJECT_CAPABILITIES];
  if (document.assets.length) capabilities.push('assets.registry');
  if (document.semantics.length) capabilities.push('semantics.records');
  if (document.bones.length) capabilities.push('rig.bones');
  if (document.meshes.length) capabilities.push('rig.meshes');
  if (document.controls.length) capabilities.push('rig.controls');
  if (document.constraints.length) capabilities.push('rig.constraints');
  if (document.timelines.length) capabilities.push('animation.timelines');
  if ((document.stateMachines || []).length) capabilities.push('animation.state-machines');
  if ((document.listeners || []).length) capabilities.push('interaction.listeners');
  return capabilities;
}

const ASSET_WRITABLE_PROPERTIES = Object.freeze({
  image: ['name', 'mimeType', 'metadata.width', 'metadata.height'],
  font: ['name', 'mimeType'],
  audio: ['name', 'mimeType', 'metadata.duration'],
});

function summarizeAsset(asset, { includeAssetData }) {
  const embedded = asset.source.kind === 'embedded';
  return {
    ref: { kind: 'asset', id: asset.id },
    name: asset.name,
    type: asset.type,
    mimeType: asset.mimeType,
    source: embedded
      ? (includeAssetData
        ? { kind: 'embedded', data: asset.source.data }
        : { kind: 'embedded', dataLength: String(asset.source.data || '').length })
      : { kind: 'external', uri: asset.source.uri },
    metadata: cloneValue(asset.metadata),
    capabilities: {
      writable: [
        ...(ASSET_WRITABLE_PROPERTIES[asset.type] || []),
        embedded ? 'source.data' : 'source.uri',
      ],
      animatable: [],
    },
  };
}

function summarizeKeyframe(timeline, track, keyframe, order, { includeKeyframeValues }) {
  const summary = {
    // Keyframes have no authored ids; the stable address is the owning
    // timeline, track, and frame. `order` disambiguates the degenerate case
    // of two keyframes on the same frame.
    ref: {
      kind: 'keyframe',
      id: `${timeline.id}:${track.id}#${keyframe.frame}`,
      timeline: { kind: 'timeline', id: timeline.id },
      track: { kind: 'track', id: track.id },
    },
    address: track.address,
    frame: keyframe.frame,
    order,
    easing: keyframe.easing,
  };
  if (includeKeyframeValues) {
    if (Array.isArray(keyframe.easingParams)) summary.easingParams = cloneValue(keyframe.easingParams);
    summary.value = cloneValue(keyframe.value);
  }
  return summary;
}

function summarizeTrack(timeline, track, options) {
  const keyframes = track.keyframes.map((keyframe, order) => summarizeKeyframe(timeline, track, keyframe, order, options));
  return {
    ref: { kind: 'track', id: track.id, timeline: { kind: 'timeline', id: timeline.id } },
    address: track.address,
    keyframeCount: keyframes.length,
    keyframes,
  };
}

const TIMELINE_WRITABLE_PROPERTIES = Object.freeze([
  'name',
  'duration',
  'fps',
  'loop',
  'workStart',
  'workEnd',
  'tracks',
]);

function summarizeTimeline(timeline, options) {
  const tracks = timeline.tracks.map((track) => summarizeTrack(timeline, track, options));
  return {
    ref: { kind: 'timeline', id: timeline.id },
    name: timeline.name,
    duration: timeline.duration,
    fps: timeline.fps,
    loop: timeline.loop,
    workStart: timeline.workStart,
    workEnd: timeline.workEnd,
    counts: {
      tracks: tracks.length,
      keyframes: tracks.reduce((total, track) => total + track.keyframeCount, 0),
    },
    capabilities: {
      writable: [...TIMELINE_WRITABLE_PROPERTIES],
      animatable: [],
    },
    tracks,
  };
}

function summarizeStateMachines(sceneSummary) {
  return sceneSummary.stateMachines.map((machine) => ({
    ...machine,
    capabilities: cloneValue(VEYRA_MACHINE_CAPABILITIES),
  }));
}

function parameter(name, type, required, description, extra = {}) {
  return { name, type, required, description, ...extra };
}

function machineConditionRules() {
  const sample = { number: 0, bool: false, trigger: undefined };
  return Object.fromEntries(VEYRA_MACHINE_INPUT_TYPES.map((inputType) => [
    inputType,
    VEYRA_CONDITION_OPS.filter((op) => machineConditionViolation(op, sample[inputType], inputType) === null),
  ]));
}

function authoringContract() {
  return {
    machineInput: {
      required: ['id', 'type'],
      type: { enum: [...VEYRA_MACHINE_INPUT_TYPES] },
    },
    machineState: {
      required: ['id', 'timeline'],
      type: { enum: [...VEYRA_MACHINE_STATE_TYPES] },
    },
    machineCondition: {
      required: ['id', 'input', 'op'],
      operators: [...VEYRA_CONDITION_OPS],
      orderingOperators: [...VEYRA_MACHINE_ORDERING_OPS],
      allowedOperatorsByInputType: machineConditionRules(),
      valueRequiredFor: VEYRA_CONDITION_OPS.filter((op) => op !== 'fired' && op !== '!fired'),
      triggerOperators: ['fired', '!fired'],
    },
    listener: {
      required: ['id', 'target', 'event', 'action'],
      kind: { enum: [...VEYRA_LISTENER_KINDS] },
      event: { enum: [...VEYRA_LISTENER_EVENTS] },
      action: { enum: [...VEYRA_LISTENER_ACTIONS] },
      variants: {
        machine: { required: ['machine', 'input'], actions: ['setInput', 'fire'] },
        timeline: { required: ['timeline'], actions: ['play', 'stop', 'seek'] },
      },
    },
  };
}

function action(id, name, description, targetKind, parameters, capabilities) {
  return {
    ref: { kind: 'action', id },
    name,
    description,
    targetKind,
    parameters,
    capabilities: [...capabilities],
  };
}

// The bounded catalog of editable affordances an agent can perform on a
// Veyra project. Every entry maps to a real store / runtime operation; the
// manifest never invents capabilities the platform does not implement.
function projectActions() {
  return [
    action('read-property', 'Read property', 'Read the authored value of a property by address.', 'propertyAddress', [
      parameter('address', 'propertyAddress', true, 'A property address such as node:<id>/transform/x.'),
    ], ['non-mutating']),
    action('write-property', 'Write property', 'Set a writable property by address. The write is rejected unless the address is in the target capability list.', 'propertyAddress', [
      parameter('address', 'propertyAddress', true, 'A property address such as node:<id>/geometry/width.'),
      parameter('value', 'any', true, 'A value valid for the property.'),
    ], ['writable-only', 'transactional', 'undoable']),
    action('add-node', 'Add node', 'Create a node and append it to the document in draw order.', 'node', [
      parameter('type', 'enum', true, 'One of the Veyra node types.', { enum: [...VEYRA_NODE_TYPES] }),
      parameter('name', 'string', false, 'Display name.'),
      parameter('parentId', 'string', false, 'Id of the parent node.'),
      parameter('transform', 'object', false, 'Transform overrides.'),
      parameter('paint', 'object', false, 'Paint overrides.'),
      parameter('geometry', 'object', false, 'Geometry overrides.'),
    ], ['transactional', 'undoable', 'selects-result']),
    action('remove-node', 'Remove node', 'Remove a node, its descendants, and the semantic records and path constraints that point at them.', 'node', [
      parameter('nodeId', 'string', true, 'Id of the node to remove.'),
    ], ['cascades-descendants', 'transactional', 'undoable']),
    action('create-timeline', 'Create timeline', 'Add a timeline to the document.', 'timeline', [
      parameter('name', 'string', false, 'Timeline name.'),
      parameter('duration', 'number', false, 'Duration in frames.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.duration'] } }),
      parameter('fps', 'number', false, 'Frames per second.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.fps'] } }),
      parameter('loop', 'enum', false, 'Loop mode.', { enum: [...VEYRA_LOOP_MODES] }),
      parameter('workStart', 'number', false, 'Work area start frame.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.workStart'] } }),
      parameter('workEnd', 'number', false, 'Work area end frame.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.workEnd'] } }),
    ], ['transactional', 'undoable', 'returns-id']),
    action('update-timeline', 'Update timeline', 'Update the metadata of an existing timeline.', 'timeline', [
      parameter('timelineId', 'string', true, 'Id of the timeline.'),
      parameter('name', 'string', false, 'New name.'),
      parameter('duration', 'number', false, 'New duration in frames.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.duration'] } }),
      parameter('fps', 'number', false, 'New frames per second.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.fps'] } }),
      parameter('loop', 'enum', false, 'New loop mode.', { enum: [...VEYRA_LOOP_MODES] }),
      parameter('workStart', 'number', false, 'New work area start frame.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.workStart'] } }),
      parameter('workEnd', 'number', false, 'New work area end frame.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['timeline.workEnd'] } }),
    ], ['transactional', 'undoable']),
    action('remove-timeline', 'Remove timeline', 'Delete a timeline. Blocked while a state machine state still uses it.', 'timeline', [
      parameter('timelineId', 'string', true, 'Id of the timeline.'),
    ], ['blocked-while-used-by-machines', 'transactional', 'undoable']),
    action('set-keyframe', 'Set keyframe', 'Create or replace a keyframe for an animatable property address; the track is created when missing.', 'keyframe', [
      parameter('timelineId', 'string', true, 'Id of the timeline.'),
      parameter('address', 'propertyAddress', true, 'An animatable property address.'),
      parameter('frame', 'number', true, 'Frame of the keyframe.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['keyframe.frame'] } }),
      parameter('value', 'any', false, 'Value to key. Defaults to the current authored value.'),
      parameter('easing', 'enum', false, 'Easing toward the next keyframe.', { enum: [...VEYRA_EASING_TYPES] }),
      parameter('easingParams', 'array', false, 'Four numbers when easing is cubic-bezier; each parameter is bounded.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['keyframe.easingParams.*'] } }),
    ], ['animatable-only', 'creates-track-if-needed', 'transactional', 'undoable']),
    action('remove-keyframe', 'Remove keyframe', 'Delete a keyframe by timeline, address, and frame. The track is removed when it becomes empty.', 'keyframe', [
      parameter('timelineId', 'string', true, 'Id of the timeline.'),
      parameter('address', 'propertyAddress', true, 'Property address of the track.'),
      parameter('frame', 'number', true, 'Frame of the keyframe.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['keyframe.frame'] } }),
    ], ['removes-empty-track', 'transactional', 'undoable']),
    action('move-keyframe', 'Move keyframe', 'Move a keyframe to a new frame within the same track.', 'keyframe', [
      parameter('timelineId', 'string', true, 'Id of the timeline.'),
      parameter('address', 'propertyAddress', true, 'Property address of the track.'),
      parameter('fromFrame', 'number', true, 'Current frame of the keyframe.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['keyframe.frame'] } }),
      parameter('toFrame', 'number', true, 'New frame of the keyframe.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['keyframe.frame'] } }),
    ], ['transactional', 'undoable']),
    action('create-state-machine', 'Create state machine', 'Add a state machine with its inputs, states, and transitions.', 'stateMachine', [
      parameter('name', 'string', false, 'Machine name.'),
      parameter('inputs', 'array', false, 'Machine input records.'),
      parameter('states', 'array', false, 'Machine state records.'),
      parameter('transitions', 'array', false, 'Machine transition records.'),
      parameter('initial', 'reference', false, 'machineState reference for the initial state.'),
    ], ['transactional', 'undoable', 'returns-id']),
    action('update-state-machine', 'Update state machine', 'Update the name or initial state of a machine.', 'stateMachine', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('name', 'string', false, 'New name.'),
      parameter('initial', 'reference', false, 'New machineState reference for the initial state.'),
    ], ['transactional', 'undoable']),
    action('remove-state-machine', 'Remove state machine', 'Delete a state machine.', 'stateMachine', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
    ], ['transactional', 'undoable']),
    action('add-machine-input', 'Add machine input', 'Add a number, bool, or trigger input to a machine.', 'machineInput', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('name', 'string', false, 'Unique input name within the machine.'),
      parameter('type', 'enum', false, 'Input type.', { enum: [...VEYRA_MACHINE_INPUT_TYPES] }),
      parameter('value', 'any', false, 'Authored value.'),
    ], ['transactional', 'undoable', 'returns-id']),
    action('add-machine-state', 'Add machine state', 'Add an animation state pointing at a document timeline.', 'machineState', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('name', 'string', false, 'State name.'),
      parameter('timelineId', 'string', true, 'Id of a timeline in the document.'),
    ], ['transactional', 'undoable', 'returns-id']),
    action('remove-machine-state', 'Remove machine state', 'Delete a state and the transitions that reference it; clears initial when it pointed there.', 'machineState', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('stateId', 'string', true, 'Id of the state.'),
    ], ['cascades-transitions', 'transactional', 'undoable']),
    action('add-machine-transition', 'Add machine transition', 'Add a transition between two states of the same machine.', 'machineTransition', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('from', 'string', true, 'Source machine state id.'),
      parameter('to', 'string', true, 'Target machine state id.'),
      parameter('duration', 'number', false, 'Blend duration in seconds.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['machineTransition.duration'] } }),
      parameter('after', 'number', false, 'Minimum seconds in the source state before the transition may fire.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['machineTransition.after'] } }),
      parameter('conditions', 'array', false, 'Input conditions that must all hold.'),
    ], ['transactional', 'undoable', 'returns-id']),
    action('remove-machine-transition', 'Remove machine transition', 'Delete a transition.', 'machineTransition', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('transitionId', 'string', true, 'Id of the transition.'),
    ], ['transactional', 'undoable']),
    action('update-machine-input', 'Update machine input', 'Update an input name, type, or authored value in place. Renames must stay unique within the machine; a type change is refused, naming every dependent condition, unless the operator/type matrix stays satisfied.', 'machineInput', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('inputId', 'string', true, 'Id of the input.'),
      parameter('name', 'string', false, 'New unique name.'),
      parameter('type', 'enum', false, 'New type; refused when dependent conditions would become illegal.', { enum: [...VEYRA_MACHINE_INPUT_TYPES] }),
      parameter('value', 'any', false, 'New authored value.'),
    ], ['transactional', 'undoable']),
    action('remove-machine-input', 'Remove machine input', 'Delete an input. Refused while any transition condition references it — remove those conditions first.', 'machineInput', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('inputId', 'string', true, 'Id of the input.'),
    ], ['blocked-while-referenced-by-conditions', 'transactional', 'undoable']),
    action('update-machine-state', 'Update machine state', 'Rename a state or retarget its timeline, in place; the state id is immutable.', 'machineState', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('stateId', 'string', true, 'Id of the state.'),
      parameter('name', 'string', false, 'New name.'),
      parameter('timelineId', 'string', false, 'Id of a timeline to retarget.'),
    ], ['transactional', 'undoable']),
    action('update-machine-transition', 'Update machine transition', 'Update duration, after gate, or conditions (replaced wholesale, validated against the operator/type matrix). Endpoints are immutable — re-add the transition to re-point.', 'machineTransition', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('transitionId', 'string', true, 'Id of the transition.'),
      parameter('duration', 'number', false, 'New blend duration in seconds.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['machineTransition.duration'] } }),
      parameter('after', 'number', false, 'New after gate; null clears it.', { bounds: { ...VEYRA_PROPERTY_BOUNDS['machineTransition.after'] } }),
      parameter('conditions', 'array', false, 'Replacement condition list.'),
    ], ['transactional', 'undoable']),
    action('set-machine-input', 'Set machine input', 'Set a number or bool input on the machine runtime. Triggers must use fire-machine-input.', 'machineInput', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('nameOrId', 'string', true, 'Unique input name or id.'),
      parameter('value', 'any', true, 'New input value.'),
    ], ['runtime-only', 'trigger-forbidden']),
    action('fire-machine-input', 'Fire machine input', 'Arm a trigger input until the next step consumes it.', 'machineInput', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('nameOrId', 'string', true, 'Unique trigger name or id.'),
    ], ['runtime-only', 'trigger-only']),
    action('step-machine', 'Step machine', 'Advance the machine runtime by a delta in seconds and return the events that fired.', 'stateMachine', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('deltaSeconds', 'number', true, 'Non-negative time delta in seconds.'),
    ], ['runtime-only', 'emits-events']),
    action('scrub-machine', 'Scrub machine', 'Reset the machine and deterministically re-simulate a duration.', 'stateMachine', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
      parameter('seconds', 'number', true, 'Duration to re-simulate.'),
    ], ['runtime-only', 'deterministic']),
    action('reset-machine', 'Reset machine', 'Return the machine runtime to its initial state with authored input values.', 'stateMachine', [
      parameter('machineId', 'string', true, 'Id of the machine.'),
    ], ['runtime-only']),
  ];
}

/**
 * Build the bounded, deterministic, AI-facing manifest for a Veyra document.
 *
 * The manifest covers the whole project: document metadata, feature
 * capabilities, assets, timelines with tracks and keyframes, state machines,
 * the full scene summary (nodes, rig, semantics), and the bounded catalog of
 * editable actions with parameter schemas and shared validation bounds.
 * Every entry carries a stable reference, and every registry carries its
 * capability list, so an agent can plan edits from the manifest alone.
 *
 * Bounding options (all default to false for minimal output):
 * - includeGeometry: embed authored geometry in the scene summary.
 * - includeKeyframeValues: embed keyframe values and easing parameters.
 * - includeAssetData: embed asset payloads instead of `dataLength` redaction.
 *
 * The document is never mutated.
 */
export function createProjectManifest(document, options = {}) {
  const manifestOptions = {
    includeGeometry: Boolean(options.includeGeometry),
    includeKeyframeValues: Boolean(options.includeKeyframeValues),
    includeAssetData: Boolean(options.includeAssetData),
  };
  const scene = createSceneSummary(document, { includeGeometry: manifestOptions.includeGeometry });
  return {
    format: VEYRA_MANIFEST_FORMAT,
    version: VEYRA_MANIFEST_VERSION,
    document: {
      id: document.id,
      name: document.name,
      format: document.format,
      version: document.version,
      artboard: cloneValue(document.artboard),
      conventions: cloneValue(document.conventions),
      counts: {
        assets: document.assets.length,
        nodes: document.nodes.length,
        semantics: document.semantics.length,
        bones: document.bones.length,
        meshes: document.meshes.length,
        controls: document.controls.length,
        constraints: document.constraints.length,
        timelines: document.timelines.length,
        stateMachines: (document.stateMachines || []).length,
      },
    },
    capabilities: projectCapabilities(document),
    authoring: authoringContract(),
    references: {
      document: [...VEYRA_REFERENCE_KINDS],
      manifest: [...MANIFEST_ONLY_REFERENCE_KINDS],
      propertyAddress: {
        grammar: '<kind>:<id>/<segment>[/<segment>]',
        kinds: [...VEYRA_PROPERTY_TARGET_KINDS],
      },
    },
    assets: document.assets.map((asset) => summarizeAsset(asset, manifestOptions)),
    timelines: document.timelines.map((timeline) => summarizeTimeline(timeline, manifestOptions)),
    stateMachines: summarizeStateMachines(scene),
    scene,
    actions: projectActions(),
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

/** Serialize a manifest to canonical two-space JSON (stable key order). */
export function serializeProjectManifest(manifest) {
  return JSON.stringify(canonicalize(manifest), null, 2);
}
