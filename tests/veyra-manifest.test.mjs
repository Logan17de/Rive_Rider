import assert from 'node:assert/strict';
import {
  createAsset,
  createDocument,
  createKeyframe,
  createMachineInput,
  createMachineState,
  createStateMachine,
  createNode,
  createStarterDocument,
  createTimeline,
  createTrack,
  normalizeDocument,
  VEYRA_EASING_TYPES,
  VEYRA_LOOP_MODES,
  VEYRA_MACHINE_INPUT_TYPES,
  VEYRA_CONDITION_OPS,
  machineConditionViolation,
  VEYRA_NODE_TYPES,
  VEYRA_PROPERTY_BOUNDS,
} from '../src/veyra/model.js';
import { createMachineStateRef, createTimelineRef, VEYRA_REFERENCE_KINDS } from '../src/veyra/references.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSceneSummary } from '../src/veyra/summary.js';
import {
  createProjectManifest,
  serializeProjectManifest,
  VEYRA_MANIFEST_FORMAT,
  VEYRA_MANIFEST_VERSION,
} from '../src/veyra/manifest.js';
import { VEYRA_COMMAND_TABLE } from '../src/veyra/commands.js';
import {
  createProjectManifest as indexCreateProjectManifest,
  serializeProjectManifest as indexSerializeProjectManifest,
} from '../src/index.js';

const node = createNode('rectangle', { id: 'node_box', name: 'Box' });
const xAddress = nodePropertyAddress(node.id, 'transform/x');

function buildFixture() {
  return normalizeDocument(createDocument({
    id: 'document_manifest',
    name: 'Manifest Fixture',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [
      createAsset('image', {
        id: 'asset_hero',
        name: 'Hero',
        mimeType: 'image/png',
        source: { kind: 'external', uri: 'https://example.com/hero.png' },
        metadata: { width: 640, height: 480 },
      }),
      createAsset('audio', {
        id: 'asset_jingle',
        name: 'Jingle',
        mimeType: 'audio/mpeg',
        source: { kind: 'embedded', data: 'base64data' },
        metadata: { duration: 1.5 },
      }),
      createAsset('font', {
        id: 'asset_font',
        name: 'Display',
        mimeType: 'font/woff2',
        source: { kind: 'external', uri: 'https://example.com/display.woff2' },
      }),
    ],
    nodes: [node],
    timelines: [
      createTimeline({
        id: 'timeline_bob',
        name: 'Bob',
        duration: 60,
        fps: 30,
        loop: 'loop',
        tracks: [
          createTrack(xAddress, {
            id: 'track_bob_x',
            keyframes: [
              createKeyframe({ id: 'keyframe_bob_x_0', frame: 0, value: 0, easing: 'ease-in-out' }),
              createKeyframe({ id: 'keyframe_bob_x_30', frame: 30, value: 120, easing: 'cubic-bezier', easingParams: [0.42, 0, 0.58, 1] }),
            ],
          }),
        ],
      }),
    ],
    stateMachines: [
      createStateMachine({
        id: 'machine_bob',
        name: 'Bob Machine',
        initial: createMachineStateRef('state_a'),
        inputs: [createMachineInput({ id: 'input_hover', name: 'Hover', type: 'trigger' })],
        states: [createMachineState({ id: 'state_a', name: 'Idle', timeline: createTimelineRef('timeline_bob') })],
      }),
    ],
  }));
}

const document = buildFixture();

// --- Header, capabilities, and reference vocabulary -------------------------
const manifest = createProjectManifest(document);
assert.equal(manifest.format, VEYRA_MANIFEST_FORMAT);
assert.equal(manifest.format, 'veyra-project-manifest');
assert.equal(manifest.version, VEYRA_MANIFEST_VERSION);
assert.equal(manifest.version, 1);
assert.equal(manifest.document.id, 'document_manifest');
assert.equal(manifest.document.format, 'veyra');
assert.equal(manifest.document.version, 5);
assert.deepEqual(manifest.document.counts, {
  artboards: 1,
  components: 0,
  componentInstances: 0,
  assets: 3,
  nodes: 1,
  semantics: 0,
  bones: 0,
  meshes: 0,
  controls: 0,
  constraints: 0,
  timelines: 1,
  stateMachines: 1,
  listeners: 0,
});
assert.ok(manifest.capabilities.includes('assets.registry'));
assert.ok(manifest.capabilities.includes('animation.timelines'));
assert.ok(manifest.capabilities.includes('animation.state-machines'));
assert.ok(manifest.capabilities.includes('properties.addressed-write'));
assert.equal(manifest.capabilities.includes('rig.bones'), false, 'Fixture has no rig; rig capabilities must be derived.');
assert.deepEqual(manifest.references.document, [...VEYRA_REFERENCE_KINDS]);
assert.deepEqual(manifest.references.manifest, ['action']);
assert.ok(manifest.references.document.includes('keyframe'));
assert.ok(manifest.references.document.includes('track'));
assert.deepEqual(manifest.references.propertyAddress.grammar, '<kind>:<id>/<segment>[/<segment>]');

// --- Enumerable machine/listener authoring contract ---------------------------
const contract = manifest.authoring;
assert.deepEqual(contract.machineState.required, ['id', 'timeline'], 'manifest names machine-state required fields');
assert.deepEqual(contract.machineCondition.required, ['id', 'input', 'op'], 'manifest names machine-condition required fields');
assert.deepEqual(contract.listener.required, ['id', 'target', 'event', 'action'], 'manifest names listener common required fields');
const samples = { number: 0, bool: false, trigger: undefined };
for (const [inputType, advertised] of Object.entries(contract.machineCondition.allowedOperatorsByInputType)) {
  const accepted = VEYRA_CONDITION_OPS.filter((op) => machineConditionViolation(op, samples[inputType], inputType) === null);
  assert.deepEqual(advertised, accepted, `manifest operator matrix matches validator for ${inputType}`);
  assert.equal(advertised.includes('bogus'), false, `manifest rejects unknown operator for ${inputType}`);
}
assert.deepEqual(contract.machineCondition.operators, [...VEYRA_CONDITION_OPS]);
assert.equal(contract.listener.action.enum.includes('play'), true, 'manifest advertises the supported direct-play listener action');
assert.deepEqual(contract.listener.variants.machine.actions, ['setInput', 'fire']);
assert.deepEqual(contract.listener.variants.timeline.actions, ['play', 'stop', 'seek']);

// --- Deterministic output ----------------------------------------------------
const first = serializeProjectManifest(createProjectManifest(document));
const second = serializeProjectManifest(createProjectManifest(document));
assert.equal(first, second, 'Manifest serialization must be byte-stable.');
assert.deepEqual(JSON.parse(first), manifest, 'Serialized manifest must round-trip as JSON.');
assert.deepEqual(createProjectManifest(document), createProjectManifest(document), 'Manifests must be value-equal.');
assert.deepEqual(indexCreateProjectManifest(document), manifest, 'src/index.js must re-export the same manifest API.');
assert.equal(indexSerializeProjectManifest(createProjectManifest(document)), first, 'src/index.js serializer must match the module serializer.');
assert.equal(serializeProjectManifest(createProjectManifest(buildFixture())), first, 'Rebuilding the same document must yield the same manifest.');

const documentBefore = JSON.stringify(document);
createProjectManifest(document);
assert.equal(JSON.stringify(document), documentBefore, 'Creating a manifest must not mutate the document.');
const snapshot = createProjectManifest(document);
const snapshotJson = JSON.stringify(snapshot);
document.nodes[0].transform.x += 1;
assert.equal(JSON.stringify(snapshot), snapshotJson, 'Snapshot must not alias document state.');
document.nodes[0].transform.x -= 1;

// --- Timeline / track / keyframe references ---------------------------------
const timeline = manifest.timelines[0];
assert.equal(manifest.timelines.length, 1);
assert.deepEqual(timeline.ref, { kind: 'timeline', id: 'timeline_bob' });
assert.equal(timeline.name, 'Bob');
assert.equal(timeline.duration, 60);
assert.equal(timeline.fps, 30);
assert.equal(timeline.loop, 'loop');
assert.deepEqual(timeline.counts, { tracks: 1, keyframes: 2 });
assert.deepEqual(timeline.capabilities.writable, ['name', 'duration', 'fps', 'loop', 'workStart', 'workEnd', 'tracks']);

const track = timeline.tracks[0];
assert.deepEqual(track.ref, {
  kind: 'track',
  id: 'track_bob_x',
  timeline: { kind: 'timeline', id: 'timeline_bob' },
});
assert.equal(track.address, xAddress);
assert.equal(track.keyframeCount, 2);
assert.equal(track.keyframes.length, 2);

const [firstKeyframe, secondKeyframe] = track.keyframes;
assert.deepEqual(firstKeyframe.ref, {
  kind: 'keyframe',
  id: 'keyframe_bob_x_0',
  timeline: { kind: 'timeline', id: 'timeline_bob' },
  track: { kind: 'track', id: 'track_bob_x' },
});
assert.equal(firstKeyframe.address, xAddress);
assert.equal(firstKeyframe.frame, 0);
assert.equal(firstKeyframe.order, 0);
assert.equal(firstKeyframe.easing, 'ease-in-out');
assert.equal(firstKeyframe.value, undefined, 'Keyframe values are redacted unless includeKeyframeValues is set.');
assert.equal(firstKeyframe.easingParams, undefined);
assert.equal(secondKeyframe.ref.id, 'keyframe_bob_x_30');
assert.equal(secondKeyframe.order, 1);
assert.equal(secondKeyframe.easing, 'cubic-bezier');

const valued = createProjectManifest(document, { includeKeyframeValues: true });
const valuedTrack = valued.timelines[0].tracks[0];
assert.equal(valuedTrack.keyframes[0].value, 0);
assert.equal(valuedTrack.keyframes[0].easingParams, undefined);
assert.deepEqual(valuedTrack.keyframes[1].easingParams, [0.42, 0, 0.58, 1]);
assert.equal(valuedTrack.keyframes[1].value, 120);
const valuedJson = serializeProjectManifest(createProjectManifest(document, { includeKeyframeValues: true }));
assert.equal(
  serializeProjectManifest(createProjectManifest(document, { includeKeyframeValues: true })),
  valuedJson,
  'includeKeyframeValues output must be deterministic too.',
);

const keyframeIds = manifest.timelines.flatMap((item) => item.tracks.flatMap((itemTrack) => itemTrack.keyframes.map((keyframe) => keyframe.ref.id)));
assert.equal(new Set(keyframeIds).size, keyframeIds.length, 'Keyframe references must be unique.');

// Keyframes created through the store must surface with the same reference
// scheme, including auto-created tracks.
const store = new VeyraStore(document);
store.setKeyframe(
  { timelineId: 'timeline_bob', address: nodePropertyAddress(node.id, 'transform/rotation'), frame: 15, value: 0.5 },
  { source: 'ai', label: 'Key rotation' },
);
const updated = createProjectManifest(store.document, { includeKeyframeValues: true });
const rotationTrack = updated.timelines[0].tracks.find((candidate) => candidate.address === nodePropertyAddress(node.id, 'transform/rotation'));
assert.ok(rotationTrack, 'Store-created track must appear in the manifest.');
assert.equal(updated.timelines[0].counts.keyframes, 3);
assert.equal(rotationTrack.keyframeCount, 1);
assert.equal(
  rotationTrack.keyframes[0].ref.id,
  store.document.timelines[0].tracks.find((candidate) => candidate.id === rotationTrack.ref.id).keyframes[0].id,
);
assert.equal(rotationTrack.keyframes[0].value, 0.5);
assert.equal(rotationTrack.keyframes[0].order, 0);

// --- Assets -------------------------------------------------------------------
assert.equal(manifest.assets.length, 3);
const hero = manifest.assets.find((asset) => asset.ref.id === 'asset_hero');
assert.deepEqual(hero.ref, { kind: 'asset', id: 'asset_hero' });
assert.equal(hero.type, 'image');
assert.equal(hero.mimeType, 'image/png');
assert.deepEqual(hero.source, { kind: 'external', uri: 'https://example.com/hero.png' });
assert.deepEqual(hero.metadata, { width: 640, height: 480, duration: null });
assert.deepEqual(hero.capabilities.writable, ['name', 'mimeType', 'metadata.width', 'metadata.height', 'source.uri']);
assert.deepEqual(hero.capabilities.animatable, []);

const jingle = manifest.assets.find((asset) => asset.ref.id === 'asset_jingle');
assert.equal(jingle.type, 'audio');
assert.deepEqual(jingle.source, { kind: 'embedded', dataLength: 10 });
assert.ok(!('data' in jingle.source), 'Embedded payload must never be copied into the manifest by default.');
assert.ok(jingle.capabilities.writable.includes('source.data'));
assert.ok(jingle.capabilities.writable.includes('metadata.duration'));
assert.equal(jingle.metadata.duration, 1.5);

const withAssetData = createProjectManifest(document, { includeAssetData: true });
const jingleWith = withAssetData.assets.find((asset) => asset.ref.id === 'asset_jingle');
assert.deepEqual(jingleWith.source, { kind: 'embedded', data: 'base64data' }, 'includeAssetData must expose the embedded payload.');
assert.deepEqual(
  withAssetData.assets.find((asset) => asset.ref.id === 'asset_hero').source,
  { kind: 'external', uri: 'https://example.com/hero.png' },
  'includeAssetData must not change external asset sources.',
);

const font = manifest.assets.find((asset) => asset.ref.id === 'asset_font');
assert.equal(font.type, 'font');
assert.deepEqual(font.capabilities.writable, ['name', 'mimeType', 'source.uri']);

// --- State machines -------------------------------------------------------------
assert.equal(manifest.stateMachines.length, 1);
const machine = manifest.stateMachines[0];
assert.deepEqual(machine.ref, { kind: 'stateMachine', id: 'machine_bob' });
assert.equal(machine.name, 'Bob Machine');
assert.deepEqual(machine.initial, { kind: 'machineState', id: 'state_a' });
assert.deepEqual(machine.inputs[0].ref, { kind: 'machineInput', id: 'input_hover' });
assert.equal(machine.inputs[0].type, 'trigger');
assert.deepEqual(machine.states[0].timeline, { kind: 'timeline', id: 'timeline_bob' });
assert.deepEqual(machine.capabilities.inputTypes, [...VEYRA_MACHINE_INPUT_TYPES]);
assert.deepEqual(machine.capabilities.graph, [
  'set-name', 'set-initial', 'add-input', 'remove-input', 'update-input',
  'add-state', 'update-state', 'remove-state',
  'add-transition', 'update-transition', 'remove-transition',
]);
assert.deepEqual(machine.capabilities.runtime, ['set-input', 'fire', 'step', 'scrub', 'reset', 'evaluate']);
assert.deepEqual(
  machine,
  { ...manifest.scene.stateMachines[0], capabilities: machine.capabilities },
  'Annotated machines must extend the scene summary machines unchanged.',
);

// --- Action schema --------------------------------------------------------------
const actions = manifest.actions;
assert.equal(actions.length, 76, 'Action catalog grows additively with the 12 canonical M6 and 11 canonical M7 path/group mutations.');
const actionIds = actions.map((item) => item.ref.id);
assert.equal(new Set(actionIds).size, actionIds.length, 'Action ids must be unique.');
for (const item of actions) {
  assert.equal(item.ref.kind, 'action');
  assert.ok(typeof item.ref.id === 'string' && item.ref.id.length > 0, 'Action references need stable ids.');
  assert.ok(item.name.length > 0, `${item.ref.id} needs a name.`);
  assert.ok(item.description.length > 0, `${item.ref.id} needs a description.`);
  assert.ok(typeof item.targetKind === 'string' && item.targetKind.length > 0, `${item.ref.id} needs a targetKind.`);
  const noParameterActions = new Set(['begin', 'commit', 'cancel', 'undo', 'redo', 'remove-selection']);
  assert.ok(item.parameters.length > 0 || noParameterActions.has(item.ref.id), `${item.ref.id} needs parameters unless it is a no-argument transaction/history command.`);
  assert.ok(item.transport === 'command' || item.transport === 'read' || item.transport === 'runtime', `${item.ref.id} needs a transport classification.`);
  assert.ok(typeof item.hostAvailability === 'string' && item.hostAvailability.length > 0, `${item.ref.id} needs host availability.`);
  const parameterNames = new Set();
  for (const parameter of item.parameters) {
    assert.ok(parameter.name, `${item.ref.id} has an unnamed parameter.`);
    assert.ok(!parameterNames.has(parameter.name), `${item.ref.id} repeats parameter ${parameter.name}.`);
    parameterNames.add(parameter.name);
    assert.ok(parameter.type, `${item.ref.id}.${parameter.name} needs a type.`);
    assert.equal(typeof parameter.required, 'boolean', `${item.ref.id}.${parameter.name} needs a required flag.`);
    assert.ok(parameter.description.length > 0, `${item.ref.id}.${parameter.name} needs a description.`);
    if (parameter.type === 'enum') {
      assert.ok(Array.isArray(parameter.enum) && parameter.enum.length > 0, `${item.ref.id}.${parameter.name} enum needs values.`);
    }
  }
  assert.ok(Array.isArray(item.capabilities) && item.capabilities.length > 0, `${item.ref.id} needs capabilities.`);
  assert.ok(item.capabilities.every((capability) => typeof capability === 'string'));
  if (!item.capabilities.includes('non-mutating')) {
    assert.ok(
      item.capabilities.includes('undoable')
      || item.capabilities.includes('runtime-only')
      || item.capabilities.includes('history')
      || item.capabilities.includes('transaction')
      || item.capabilities.includes('clears-history'),
      `${item.ref.id} must advertise recovery, transaction, runtime, or history semantics.`,
    );
  }
}

const writeProperty = actions.find((item) => item.ref.id === 'write-property');
assert.deepEqual(writeProperty.parameters.map((parameter) => parameter.name), ['address', 'value']);
assert.deepEqual(writeProperty.capabilities, ['writable-only', 'transactional', 'undoable']);
const setKeyframe = actions.find((item) => item.ref.id === 'set-keyframe');
assert.ok(setKeyframe.capabilities.includes('animatable-only'));
assert.ok(setKeyframe.parameters.find((parameter) => parameter.name === 'easing').enum.join(' ') === VEYRA_EASING_TYPES.join(' '));
const addNode = actions.find((item) => item.ref.id === 'add-node');
assert.deepEqual(addNode.parameters.find((parameter) => parameter.name === 'type').enum, [...VEYRA_NODE_TYPES]);
const createTimelineAction = actions.find((item) => item.ref.id === 'create-timeline');
assert.deepEqual(createTimelineAction.parameters.find((parameter) => parameter.name === 'loop').enum, [...VEYRA_LOOP_MODES]);
const removeTimelineAction = actions.find((item) => item.ref.id === 'remove-timeline');
assert.ok(removeTimelineAction.capabilities.includes('blocked-while-used-by-machines'));
for (const id of ['update-machine-input', 'remove-machine-input', 'update-machine-state', 'update-machine-transition']) {
  const item = actions.find((action) => action.ref.id === id);
  assert.ok(item, `3B-1 edit command ${id} must be exposed in the manifest action catalog.`);
  assert.ok(item.capabilities.includes('undoable'), `${id} is a document command and must be tagged undoable.`);
}
assert.ok(
  actions.find((item) => item.ref.id === 'remove-machine-input').capabilities.includes('blocked-while-referenced-by-conditions'),
  'remove-machine-input must advertise its refusal semantics.',
);
const runtimeActions = actions.filter((item) => item.capabilities.includes('runtime-only'));
assert.deepEqual(
  runtimeActions.map((item) => item.ref.id).sort(),
  ['fire-machine-input', 'reset-machine', 'scrub-machine', 'set-machine-input', 'step-machine'],
);

// The command table is the canonical registry: every dispatchable command is
// generated exactly once, while the six explicit read/runtime affordances map
// to no Store command.
const commandActions = actions.filter((item) => item.transport === 'command');
assert.equal(commandActions.length, Object.keys(VEYRA_COMMAND_TABLE).length);
for (const [commandName, command] of Object.entries(VEYRA_COMMAND_TABLE)) {
  const matches = commandActions.filter((item) => item.command === commandName);
  assert.equal(matches.length, 1, `${commandName} must generate exactly one manifest action.`);
  assert.equal(matches[0].ref.id, command.manifestId);
}
const nonCommandActions = actions.filter((item) => item.transport !== 'command');
assert.equal(nonCommandActions.length, 6);
assert.deepEqual(
  nonCommandActions.map((item) => item.ref.id).sort(),
  ['fire-machine-input', 'read-property', 'reset-machine', 'scrub-machine', 'set-machine-input', 'step-machine'],
);
assert.ok(!nonCommandActions.some((item) => 'command' in item));

const publishedActionIds = [
  'read-property', 'write-property', 'add-node', 'remove-node', 'create-timeline',
  'update-timeline', 'remove-timeline', 'set-keyframe', 'remove-keyframe', 'move-keyframe',
  'create-state-machine', 'update-state-machine', 'remove-state-machine', 'add-machine-input',
  'add-machine-state', 'remove-machine-state', 'add-machine-transition', 'remove-machine-transition',
  'update-machine-input', 'remove-machine-input', 'update-machine-state', 'update-machine-transition',
  'set-machine-input', 'fire-machine-input', 'step-machine', 'scrub-machine', 'reset-machine',
];
for (const id of publishedActionIds) assert.ok(actions.some((item) => item.ref.id === id), `${id} must remain stable.`);
for (const id of [
  'add-bone', 'add-mesh', 'add-control', 'add-constraint', 'remove-bone', 'remove-mesh',
  'remove-control', 'remove-constraint', 'add-asset', 'remove-asset', 'begin', 'commit', 'cancel',
  'undo', 'redo', 'select', 'replace-document', 'remove-selection',
 ]) assert.ok(serializeProjectManifest(manifest).includes(`\"id\": \"${id}\"`), `${id} must be discoverable.`);
assert.equal(manifest.authoring.listener.variants.machine.hostAvailability, 'available');
assert.equal(manifest.authoring.listener.variants.machine.runtimeState, 'ephemeral');
assert.equal(manifest.authoring.listener.variants.timeline.hostAvailability, 'available');

// Action parameters must expose the shared validation bounds.
assert.deepEqual(
  createTimelineAction.parameters.find((parameter) => parameter.name === 'duration').bounds,
  VEYRA_PROPERTY_BOUNDS['timeline.duration'],
);
assert.deepEqual(
  createTimelineAction.parameters.find((parameter) => parameter.name === 'fps').bounds,
  VEYRA_PROPERTY_BOUNDS['timeline.fps'],
);
assert.deepEqual(
  createTimelineAction.parameters.find((parameter) => parameter.name === 'workEnd').bounds,
  VEYRA_PROPERTY_BOUNDS['timeline.workEnd'],
);
assert.deepEqual(
  setKeyframe.parameters.find((parameter) => parameter.name === 'frame').bounds,
  VEYRA_PROPERTY_BOUNDS['keyframe.frame'],
);
assert.deepEqual(
  setKeyframe.parameters.find((parameter) => parameter.name === 'easingParams').bounds,
  VEYRA_PROPERTY_BOUNDS['keyframe.easingParams.*'],
);
const moveKeyframe = actions.find((item) => item.ref.id === 'move-keyframe');
assert.deepEqual(
  moveKeyframe.parameters.find((parameter) => parameter.name === 'toFrame').bounds,
  VEYRA_PROPERTY_BOUNDS['keyframe.frame'],
);
const addTransition = actions.find((item) => item.ref.id === 'add-machine-transition');
assert.deepEqual(
  addTransition.parameters.find((parameter) => parameter.name === 'duration').bounds,
  VEYRA_PROPERTY_BOUNDS['machineTransition.duration'],
);
assert.deepEqual(
  addTransition.parameters.find((parameter) => parameter.name === 'after').bounds,
  VEYRA_PROPERTY_BOUNDS['machineTransition.after'],
);

// --- Shared bounds table must match document validation -----------------------
function rawTimeline(overrides = {}) {
  return {
    id: 'tl_probe',
    name: 'Probe',
    duration: 60,
    fps: 30,
    loop: 'none',
    workStart: 0,
    workEnd: 60,
    tracks: [],
    ...overrides,
  };
}

function rawMachine(overrides = {}) {
  return {
    id: 'm_probe',
    name: 'Probe',
    initial: null,
    inputs: [],
    states: [
      { id: 's_a', name: 'A', type: 'animation', timeline: { kind: 'timeline', id: 'tl_probe' } },
      { id: 's_b', name: 'B', type: 'animation', timeline: { kind: 'timeline', id: 'tl_probe' } },
    ],
    transitions: [
      {
        id: 'mt_probe',
        from: { kind: 'machineState', id: 's_a' },
        to: { kind: 'machineState', id: 's_b' },
        duration: 0,
        after: null,
        conditions: [],
      },
    ],
    ...overrides,
  };
}

function probeDocument(timelines, machines = []) {
  return createDocument({ id: 'document_probe', nodes: [], timelines, stateMachines: machines });
}

assert.deepEqual(VEYRA_PROPERTY_BOUNDS['timeline.duration'], { min: 1, max: 1000000, integer: true });
assert.deepEqual(VEYRA_PROPERTY_BOUNDS['timeline.fps'], { min: 1, max: 240, integer: true });
assert.deepEqual(VEYRA_PROPERTY_BOUNDS['keyframe.frame'], { min: 0, max: 100000, integer: true });
assert.deepEqual(VEYRA_PROPERTY_BOUNDS['keyframe.easingParams.*'], { min: 0, max: 1 });
assert.deepEqual(VEYRA_PROPERTY_BOUNDS['machineTransition.duration'], { min: 0, max: 10000 });
assert.deepEqual(VEYRA_PROPERTY_BOUNDS['machineTransition.after'], { min: 0, max: 100000 });

assert.throws(() => normalizeDocument(probeDocument([rawTimeline({ duration: 0 })])), /timelines\[0\]\.duration/);
assert.throws(() => normalizeDocument(probeDocument([rawTimeline({ duration: 1000001 })])), /timelines\[0\]\.duration/);
assert.doesNotThrow(() => normalizeDocument(probeDocument([rawTimeline({ duration: 1, workEnd: 1 })])));
assert.doesNotThrow(() => normalizeDocument(probeDocument([rawTimeline({ duration: 1000000 })])));
assert.throws(() => normalizeDocument(probeDocument([rawTimeline({ fps: 0 })])), /timelines\[0\]\.fps/);
assert.throws(() => normalizeDocument(probeDocument([rawTimeline({ fps: 241 })])), /timelines\[0\]\.fps/);
assert.doesNotThrow(() => normalizeDocument(probeDocument([rawTimeline({ fps: 240 })])));

const probeKeyframes = (keyframes) => rawTimeline({
  tracks: [{ id: 'tr_probe', address: 'node:probe/opacity', keyframes }],
});
assert.throws(
  () => normalizeDocument(probeDocument([probeKeyframes([{ frame: -1, value: 1, easing: 'linear' }])])),
  /keyframes\[0\]\.frame/,
);
assert.throws(
  () => normalizeDocument(probeDocument([probeKeyframes([{ frame: 100001, value: 1, easing: 'linear' }])])),
  /keyframes\[0\]\.frame/,
);
assert.doesNotThrow(() => normalizeDocument(probeDocument([probeKeyframes([
  { frame: 0, value: 0, easing: 'linear' },
  { frame: 100000, value: 1, easing: 'linear' },
])])));
assert.throws(
  () => normalizeDocument(probeDocument([probeKeyframes([{ frame: 5, value: 1, easing: 'cubic-bezier', easingParams: [0, 0, 0, 2] }])])),
  /easingParams/,
);
assert.doesNotThrow(() => normalizeDocument(probeDocument([probeKeyframes([{ frame: 5, value: 1, easing: 'cubic-bezier', easingParams: [0, 0, 0, 1] }])])));

const probeTransition = (overrides) => rawMachine({
  transitions: [{
    id: 'mt_probe',
    from: { kind: 'machineState', id: 's_a' },
    to: { kind: 'machineState', id: 's_b' },
    duration: 0,
    after: null,
    conditions: [],
    ...overrides,
  }],
});
assert.throws(
  () => normalizeDocument(probeDocument([rawTimeline()], [probeTransition({ duration: 10001 })])),
  /transitions\[0\]\.duration/,
);
assert.throws(
  () => normalizeDocument(probeDocument([rawTimeline()], [probeTransition({ duration: -1 })])),
  /transitions\[0\]\.duration/,
);
assert.throws(
  () => normalizeDocument(probeDocument([rawTimeline()], [probeTransition({ after: 100001 })])),
  /transitions\[0\]\.after/,
);
assert.doesNotThrow(() => normalizeDocument(probeDocument([rawTimeline()], [probeTransition({ duration: 10000, after: 100000 })])));

// --- Scene summary passthrough and existing behavior ----------------------------
assert.deepEqual(manifest.scene, createSceneSummary(document), 'Manifest scene must be the unmodified createSceneSummary output.');
const starter = createStarterDocument();
const starterManifest = createProjectManifest(starter);
assert.deepEqual(starterManifest.scene, createSceneSummary(starter));
assert.equal(starterManifest.document.name, 'Veyra Bloom Rig');
assert.equal(starterManifest.assets.length, 0);
assert.equal(starterManifest.timelines.length, 0);
assert.equal(starterManifest.stateMachines.length, 0);
assert.ok(starterManifest.capabilities.includes('rig.bones'));
assert.ok(starterManifest.capabilities.includes('semantics.records'));
const starterSmile = createSceneSummary(starter).objects.find((object) => object.type === 'path');
assert.equal(starterSmile.geometrySummary.vertexCount, 3, 'createSceneSummary behavior must be preserved.');
assert.equal(starterSmile.geometry, undefined);

console.log('veyra manifest tests passed');
