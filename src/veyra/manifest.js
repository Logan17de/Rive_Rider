import {
  cloneValue,
  normalizeDocument,
  VEYRA_MACHINE_INPUT_TYPES,
  VEYRA_MACHINE_STATE_TYPES,
  VEYRA_CONDITION_OPS,
  VEYRA_MACHINE_ORDERING_OPS,
  VEYRA_LISTENER_KINDS,
  VEYRA_LISTENER_EVENTS,
  VEYRA_LISTENER_ACTIONS,
  machineConditionViolation,
} from './model.js';
import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';
import { VEYRA_SEMANTIC_CAPABILITIES } from './capabilities.js';
import { VEYRA_PROPERTY_TARGET_KINDS } from './properties.js';
import {
  VEYRA_REFERENCE_KINDS,
  createDocumentRef,
  createKeyframeRef,
  createTrackRef,
  createTimelineRef,
} from './references.js';
import { VEYRA_COMMAND_TABLE } from './commands.js';
import { createSceneSummary } from './summary.js';

export const VEYRA_MANIFEST_FORMAT = 'veyra-project-manifest';
export const VEYRA_MANIFEST_VERSION = 1;

// Actions are manifest-only; all project entities, including tracks and
// keyframes, carry typed refs in the authored document itself.
const MANIFEST_ONLY_REFERENCE_KINDS = Object.freeze(['action']);

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
  'semantics.universal-read',
  'semantics.transactional-write',
  'semantics.typed-relations',
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
    // Keyframes are first-class authored entities. Their refs are independent
    // of frame position, track order, timeline names, and duplicate frames.
    ref: {
      ...createKeyframeRef(keyframe.id),
      timeline: createTimelineRef(timeline.id),
      track: createTrackRef(track.id),
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
    ref: { ...createTrackRef(track.id), timeline: createTimelineRef(timeline.id) },
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
    ref: createTimelineRef(timeline.id),
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

    semanticRecord: {
      required: ['id', 'target', 'status'],
      target: { kind: 'typedReference', kinds: [...VEYRA_SEMANTIC_CAPABILITIES.targetKinds] },
      readable: [...VEYRA_SEMANTIC_CAPABILITIES.readable],
      writable: [...VEYRA_SEMANTIC_CAPABILITIES.writable],
      actions: [...VEYRA_SEMANTIC_CAPABILITIES.actions],
      status: { enum: [...VEYRA_SEMANTIC_CAPABILITIES.statuses] },
      provenanceSource: { enum: [...VEYRA_SEMANTIC_CAPABILITIES.provenanceSources] },
      identity: 'semantic record id and typed target refs; display names are never identity',
    },
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
        machine: {
          required: ['machine', 'input'],
          actions: ['setInput', 'fire'],
          transport: 'runtime',
          hostAvailability: 'unsupported',
          reason: 'The current editor host has no state-machine interaction bridge.',
        },
        timeline: {
          required: ['timeline'],
          actions: ['play', 'stop', 'seek'],
          transport: 'runtime',
          hostAvailability: 'available',
        },
      },
    },
  };
}

function action(id, name, description, targetKind, parameters, capabilities, metadata = {}) {
  return {
    ref: { kind: 'action', id },
    name,
    description,
    targetKind,
    parameters: cloneValue(parameters),
    capabilities: [...capabilities],
    ...metadata,
  };
}

const NON_COMMAND_ACTIONS = Object.freeze([
  action('read-property', 'Read property', 'Read the authored value of a property by address.', 'propertyAddress', [
    parameter('address', 'propertyAddress', true, 'A property address such as node:<id>/transform/x.'),
  ], ['non-mutating'], { transport: 'read', hostAvailability: 'available' }),
  action('set-machine-input', 'Set machine input', 'Set a number or bool input on the machine runtime. Triggers must use fire-machine-input.', 'machineInput', [
    parameter('machineId', 'string', true, 'Id of the machine.'),
    parameter('nameOrId', 'string', true, 'Unique input name or id.'),
    parameter('value', 'any', true, 'New input value.'),
  ], ['runtime-only', 'trigger-forbidden'], { transport: 'runtime', hostAvailability: 'runtime-only' }),
  action('fire-machine-input', 'Fire machine input', 'Arm a trigger input until the next step consumes it.', 'machineInput', [
    parameter('machineId', 'string', true, 'Id of the machine.'),
    parameter('nameOrId', 'string', true, 'Unique trigger name or id.'),
  ], ['runtime-only', 'trigger-only'], { transport: 'runtime', hostAvailability: 'runtime-only' }),
  action('step-machine', 'Step machine', 'Advance the machine runtime by a delta in seconds and return the events that fired.', 'stateMachine', [
    parameter('machineId', 'string', true, 'Id of the machine.'),
    parameter('deltaSeconds', 'number', true, 'Non-negative time delta in seconds.'),
  ], ['runtime-only', 'emits-events'], { transport: 'runtime', hostAvailability: 'runtime-only' }),
  action('scrub-machine', 'Scrub machine', 'Reset the machine and deterministically re-simulate a duration.', 'stateMachine', [
    parameter('machineId', 'string', true, 'Id of the machine.'),
    parameter('seconds', 'number', true, 'Duration to re-simulate.'),
  ], ['runtime-only', 'deterministic'], { transport: 'runtime', hostAvailability: 'runtime-only' }),
  action('reset-machine', 'Reset machine', 'Return the machine runtime to its initial state with authored input values.', 'stateMachine', [
    parameter('machineId', 'string', true, 'Id of the machine.'),
  ], ['runtime-only'], { transport: 'runtime', hostAvailability: 'runtime-only' }),
]);

function generatedCommandAction(commandName, command) {
  return action(
    command.manifestId,
    command.name,
    command.description,
    command.targetKind,
    command.parameters,
    command.capabilities,
    { command: commandName, transport: command.transport, hostAvailability: command.hostAvailability },
  );
}

// The catalog is generated from the canonical command registry. Non-command
// runtime/read affordances are explicit above because they have no Store method.
function projectActions() {
  const actions = [
    ...Object.entries(VEYRA_COMMAND_TABLE).map(([commandName, command]) => {
      if (!command.manifestId || !command.name || !command.description || !command.targetKind) {
        throw new TypeError(`Command ${commandName} is missing manifest metadata.`);
      }
      return generatedCommandAction(commandName, command);
    }),
    ...NON_COMMAND_ACTIONS.map((item) => cloneValue(item)),
  ].sort((left, right) => left.ref.id.localeCompare(right.ref.id));
  const ids = new Set();
  for (const item of actions) {
    if (ids.has(item.ref.id)) throw new TypeError(`Duplicate manifest action id: ${item.ref.id}`);
    ids.add(item.ref.id);
  }
  return actions;
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
  document = normalizeDocument(document);
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
      ref: createDocumentRef(document.id),
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
