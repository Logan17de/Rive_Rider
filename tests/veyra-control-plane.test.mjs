import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBone,
  createConstraint,
  createControl,
  createDocument,
  createKeyframe,
  createMachineInput,
  createMachineState,
  createNode,
  createSemanticRecord,
  createStateMachine,
  createTimeline,
  createTrack,
  normalizeDocument,
} from '../src/veyra/model.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';
import { VEYRA_COMMAND_ACTIONS, VEYRA_COMMAND_TABLE } from '../src/veyra/commands.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { getDependencyGraph } from '../src/veyra/dependencyGraph.js';
import {
  createVeyraControlPlane,
  getOwnership,
  previewVeyraCommand,
  readVeyra,
  verifyVeyraChange,
} from '../src/veyra/controlPlane.js';
import { VEYRA_SERVICE_NAMES, VEYRA_UI_MUTATION_PARITY_AUDIT } from '../src/veyra/serviceRegistry.js';

const ADDRESS_X = 'node:animated/transform/x';
const ADDRESS_Y = 'node:animated/transform/y';
const BONE_X = 'bone:bone_a/pose/x';

function fixture() {
  const root = createNode('group', { id: 'root', name: 'Face Layer' });
  const animated = createNode('ellipse', {
    id: 'animated', name: 'Human Right Eye', parent: 'root',
    transform: { x: 10, y: 20 }, geometry: { width: 80, height: 50 },
  });
  const plain = createNode('rectangle', {
    id: 'plain', name: 'Plain Layer', parent: 'root',
    transform: { x: 200, y: 100 }, geometry: { width: 100, height: 60 },
  });
  const bone = createBone({ id: 'bone_a', name: 'Eye Bone', length: 60, rest: { x: 0, y: 0 } });
  const control = createControl({ id: 'control_a', name: 'Eye Control', position: { x: 100, y: 50 } });
  const constraint = createConstraint('distance', {
    id: 'constraint_a', name: 'Distance Driver', bone: 'bone_a', target: 'control_a', distance: 20,
  });
  const track = createTrack(ADDRESS_X, {
    id: 'track_x',
    keyframes: [
      createKeyframe({ id: 'key_x0', frame: 0, value: 10, easing: 'linear' }),
      createKeyframe({ id: 'key_x30', frame: 30, value: 40, easing: 'linear' }),
    ],
  });
  const timeline = createTimeline({ id: 'timeline_x', name: 'Blink Motion', duration: 30, fps: 30, tracks: [track] });
  const input = createMachineInput({ id: 'input_enabled', name: 'Enabled', type: 'bool', value: true });
  const state = createMachineState({ id: 'state_anim', name: 'Animate', timeline: 'timeline_x' });
  const machine = createStateMachine({
    id: 'machine_a', name: 'Eye Machine', initial: { kind: 'machineState', id: 'state_anim' },
    inputs: [input], states: [state], transitions: [],
  });
  const semantic = createSemanticRecord({ kind: 'node', id: 'animated' }, {
    id: 'semantic_animated', canonicalRole: 'character.eye', tags: ['eye', 'right'], status: 'confirmed',
    aliases: [{ namespace: 'test', owner: 'agent', value: 'right_eye' }],
    provenance: { source: 'ai', confidence: 0.99 },
    relations: [{ predicate: 'controlled_by', target: { kind: 'control', id: 'control_a' } }],
  });
  return normalizeDocument(createDocument({
    id: 'm3_doc', name: 'M3 fixture', artboard: { width: 960, height: 640 },
    nodes: [root, animated, plain],
    bones: [bone], controls: [control], constraints: [constraint],
    timelines: [timeline], stateMachines: [machine], semantics: [semantic],
    listeners: [{
      id: 'listener_a', kind: 'pointer', event: 'pointerdown', action: 'play',
      target: { kind: 'node', id: 'animated' }, timeline: { kind: 'timeline', id: 'timeline_x' },
    }],
  }));
}

function reverseNamesAndOrder(document) {
  const copy = parseVeyra(serializeVeyra(document));
  copy.nodes = copy.nodes.slice().reverse().map((node, index) => ({ ...node, name: `banana_${index}` }));
  copy.bones = copy.bones.slice().reverse().map((bone, index) => ({ ...bone, name: `Thing_${index}` }));
  copy.controls = copy.controls.slice().reverse().map((control, index) => ({ ...control, name: `Thing_${index}` }));
  copy.constraints = copy.constraints.slice().reverse().map((constraint, index) => ({ ...constraint, name: `Thing_${index}` }));
  copy.timelines = copy.timelines.slice().reverse().map((timeline, index) => ({ ...timeline, name: `Timeline_${index}` }));
  copy.stateMachines = copy.stateMachines.slice().reverse().map((machine, index) => ({
    ...machine,
    name: `Machine_${index}`,
    states: machine.states.slice().reverse().map((state, stateIndex) => ({ ...state, name: `State_${stateIndex}` })),
    inputs: machine.inputs.slice().reverse().map((input, inputIndex) => ({ ...input, name: `Input_${inputIndex}` })),
  }));
  return normalizeDocument(copy);
}

function targetKey(target) {
  return target.address ? `address:${target.address}` : `ref:${target.ref.kind}:${target.ref.id}`;
}

const document = fixture();

// 1-2. Dependency graph: deterministic, name-independent, and reverses agree.
const graph = getDependencyGraph(document, null, { maxNodes: 5000, maxEdges: 10000, depth: 32 });
assert.equal(graph.status, 'ok');
const renamedGraph = getDependencyGraph(reverseNamesAndOrder(document), null, { maxNodes: 5000, maxEdges: 10000, depth: 32 });
assert.deepEqual(renamedGraph, graph, 'dependency graph identity must ignore human names and input ordering');
assert.ok(graph.edges.some((edge) => edge.type === 'animates' && edge.from.ref?.id === 'track_x' && edge.to.address === ADDRESS_X));
assert.ok(graph.edges.some((edge) => edge.type === 'controls' && edge.from.ref?.id === 'constraint_a' && edge.to.ref?.id === 'bone_a'));
assert.ok(graph.edges.some((edge) => edge.type === 'runtimeUses' && edge.from.ref?.id === 'listener_a'));
for (const edge of graph.edges) {
  assert.ok(graph.edges.some((candidate) => candidate.type === edge.inverseType
    && candidate.inverseType === edge.type
    && targetKey(candidate.from) === targetKey(edge.to)
    && targetKey(candidate.to) === targetKey(edge.from)
    && candidate.source === edge.source
    && JSON.stringify(candidate.detail) === JSON.stringify(edge.detail)), `missing reverse edge for ${edge.type}`);
}

// 3-6. Ownership: active animation, authored property, rig-derived property, and explicit runtime unknown.
const animatedOwnership = getOwnership(document, ADDRESS_X, { runtimeContext: { timelineId: 'timeline_x', frame: 30 } });
assert.equal(animatedOwnership.status, 'ok');
assert.equal(animatedOwnership.evaluatedSource, 'animation');
assert.equal(animatedOwnership.activeOwner.kind, 'animation-track');
assert.equal(animatedOwnership.activeOwner.ref.id, 'track_x');
assert.equal(animatedOwnership.authoredValue, 10);
assert.equal(animatedOwnership.evaluatedValue, 40);
assert.equal(animatedOwnership.writableSource.kind, 'animation-track');

const authoredOwnership = getOwnership(document, ADDRESS_Y);
assert.equal(authoredOwnership.status, 'ok');
assert.equal(authoredOwnership.activeOwner.kind, 'authored-property');
assert.equal(authoredOwnership.evaluatedSource, 'authored');

const rigOwnership = getOwnership(document, BONE_X);
assert.equal(rigOwnership.status, 'ok');
assert.equal(rigOwnership.evaluatedSource, 'constraints');
assert.equal(rigOwnership.activeOwner.kind, 'constraint-system');
assert.ok(rigOwnership.activeOwner.refs.some((ref) => ref.id === 'constraint_a'));
assert.equal(rigOwnership.writableSource.kind, 'constraint-inputs');
assert.ok(rigOwnership.warnings.some((warning) => /constraint-derived/.test(warning)));

const unknownRuntimeOwnership = getOwnership(document, ADDRESS_X);
assert.equal(unknownRuntimeOwnership.status, 'ok');
assert.equal(unknownRuntimeOwnership.activeOwner.kind, 'runtime-context-required');

// 7. Canonical read keeps authored/evaluated values and ownership separate.
const readAnimated = readVeyra(document, ADDRESS_X, { runtimeContext: { timelineId: 'timeline_x', frame: 30 }, includeDependencies: true });
assert.equal(readAnimated.status, 'ok');
assert.equal(readAnimated.authoredValue, 10);
assert.equal(readAnimated.evaluatedValue, 40);
assert.equal(readAnimated.ownership.activeOwner.ref.id, 'track_x');
assert.equal(readAnimated.dependencies.status, 'ok');
const readEntity = readVeyra(document, { kind: 'node', id: 'animated' }, { includeDependencies: true });
assert.equal(readEntity.status, 'ok');
assert.equal(readEntity.display.authoritative, false);
assert.ok(readEntity.semantics.some((record) => record.id === 'semantic_animated'));

// 8-9. Preview executes the real dispatcher against a sandbox and never mutates the source Store.
const previewStore = new VeyraStore(document);
const beforePreviewDocument = serializeVeyra(previewStore.document);
const beforePreviewRevision = previewStore.revision;
const beforePreviewHistory = JSON.stringify(previewStore.commandHistory);
const beforePreviewSelection = JSON.stringify(previewStore.selectedRef);
const validCommand = {
  action: 'setProperty',
  args: { address: ADDRESS_Y, value: 77 },
  command: { label: 'Preview y', source: 'ai' },
};
const previewA = previewVeyraCommand(previewStore, validCommand, { includeDependencies: true });
const previewB = previewVeyraCommand(previewStore, validCommand, { includeDependencies: true });
assert.equal(previewA.ok, true);
assert.equal(previewA.sideEffects, false);
assert.ok(previewA.changes.properties.some((property) => property.address === ADDRESS_Y && property.authoredBefore === 20 && property.authoredAfter === 77));
assert.deepEqual(previewB, previewA, 'preview must be deterministic for same document + command + options');
assert.equal(serializeVeyra(previewStore.document), beforePreviewDocument);
assert.equal(previewStore.revision, beforePreviewRevision);
assert.equal(JSON.stringify(previewStore.commandHistory), beforePreviewHistory);
assert.equal(JSON.stringify(previewStore.selectedRef), beforePreviewSelection);

const invalidPreview = previewVeyraCommand(previewStore, {
  action: 'setProperty', args: { address: 'node:animated/transform/notAProperty', value: 1 }, command: { label: 'Invalid', source: 'ai' },
});
assert.equal(invalidPreview.ok, false);
assert.equal(serializeVeyra(previewStore.document), beforePreviewDocument);
assert.equal(previewStore.revision, beforePreviewRevision);
assert.equal(JSON.stringify(previewStore.commandHistory), beforePreviewHistory);

// 10-11. Atomic plans: all-or-nothing, one history entry, step provenance preserved.
const planStore = new VeyraStore(document);
const plane = createVeyraControlPlane(planStore);
const revisionBeforePlan = planStore.revision;
const planResult = plane.dispatchPlan([
  { action: 'setProperty', args: { address: ADDRESS_Y, value: 88 }, command: { label: 'Set y', source: 'ai' } },
  { action: 'setProperty', args: { address: 'node:animated/opacity', value: 0.5 }, command: { label: 'Set opacity', source: 'ai' } },
], { label: 'M3 atomic edit', source: 'ai' });
assert.equal(planResult.ok, true);
assert.equal(planResult.applied, true);
assert.equal(planStore.revision, revisionBeforePlan + 1, 'plan commits as one atomic Store transaction');
assert.equal(readVeyra(planStore.document, ADDRESS_Y).authoredValue, 88);
assert.equal(readVeyra(planStore.document, 'node:animated/opacity').authoredValue, 0.5);
assert.equal(planStore.commandHistory.at(-1).planSteps.length, 2, 'ordered step provenance is preserved on the atomic history entry');
assert.equal(planResult.stableResultBindings.placeholdersSupported, false);

const failStore = new VeyraStore(document);
const failPlane = createVeyraControlPlane(failStore);
const beforeFailDocument = serializeVeyra(failStore.document);
const beforeFailRevision = failStore.revision;
const beforeFailHistory = JSON.stringify(failStore.commandHistory);
const failingPlan = failPlane.dispatchPlan([
  { action: 'setProperty', args: { address: ADDRESS_Y, value: 99 }, command: { label: 'Would set y', source: 'ai' } },
  { action: 'setProperty', args: { address: 'node:animated/transform/notAProperty', value: 1 }, command: { label: 'Fail', source: 'ai' } },
]);
assert.equal(failingPlan.ok, false);
assert.equal(failingPlan.applied, false);
assert.equal(failingPlan.failedStep, 1);
assert.equal(serializeVeyra(failStore.document), beforeFailDocument);
assert.equal(failStore.revision, beforeFailRevision);
assert.equal(JSON.stringify(failStore.commandHistory), beforeFailHistory);

// Deterministic implicit ids are shared by preview + dispatch for creation commands.
const createStore = new VeyraStore(document);
const createPlane = createVeyraControlPlane(createStore);
const createCommand = { action: 'add', args: { type: 'ellipse', options: { name: 'New Thing' } }, command: { label: 'Add thing', source: 'ai' } };
const createPreview = createPlane.previewCommand(createCommand);
const predictedRef = createPreview.changes.added.find((ref) => ref.kind === 'node');
assert.ok(predictedRef);
const createDispatch = createPlane.dispatchCommand(createCommand);
assert.equal(createDispatch.ok, true);
assert.equal(createDispatch.result.id, predictedRef.id, 'preview and execution must share deterministic generated stable ids');

// 12. verifyChange returns structured evidence for both passes and failures.
const verification = verifyVeyraChange(planStore.document, { assertions: [
  { type: 'entityExists', ref: { kind: 'node', id: 'animated' } },
  { type: 'authoredEquals', address: ADDRESS_Y, value: 88 },
  { type: 'semanticExists', semanticId: 'semantic_animated' },
  { type: 'dependencyEdge', edgeType: 'animates', from: { ref: { kind: 'track', id: 'track_x' } }, to: { address: ADDRESS_X } },
  { type: 'validDocument' },
] });
assert.equal(verification.ok, true);
assert.ok(verification.assertions.every((assertion) => assertion.pass));
const failedVerification = verifyVeyraChange(planStore.document, { type: 'authoredEquals', address: ADDRESS_Y, value: 999 });
assert.equal(failedVerification.ok, false);
assert.equal(failedVerification.assertions[0].pass, false);
assert.equal(failedVerification.assertions[0].evidence.actual, 88);

// 13-14. Browser/control-plane/manifest/command drift is mechanical.
assert.deepEqual(Object.keys(plane).sort(), VEYRA_SERVICE_NAMES);
const manifest = createProjectManifest(document);
assert.deepEqual(manifest.authoring.controlPlane.services.map((service) => service.name).sort(), VEYRA_SERVICE_NAMES);
assert.deepEqual(manifest.authoring.controlPlane.commandActions, VEYRA_COMMAND_ACTIONS);
assert.deepEqual(manifest.authoring.controlPlane.uiMutationParityAudit, VEYRA_UI_MUTATION_PARITY_AUDIT);
const commandActions = manifest.actions.filter((action) => action.command);
assert.equal(commandActions.length, VEYRA_COMMAND_ACTIONS.length);
for (const action of commandActions) {
  const command = VEYRA_COMMAND_TABLE[action.command];
  assert.ok(command, `manifest action ${action.ref.id} must map to a real command-table action`);
  assert.equal(action.commandDescriptor.action, action.command);
  assert.deepEqual(action.commandDescriptor.args, command.params.map((param) => ({ name: param.name, type: param.type, required: param.required })));
}
const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
for (const service of ['getManifest', 'read', 'previewCommand', 'dispatchCommand', 'dispatchPlan', 'validateDocument', 'verifyChange', 'getDependencyGraph', 'getOwnership']) {
  assert.match(browserSource, new RegExp(`${service}:.*controlPlane\\.${service}\\(`), `browser ${service} must be a thin canonical adapter`);
}

// 15. Serialize/load + rename/reorder preserves dependency/ownership identity.
const roundTripRenamed = reverseNamesAndOrder(parseVeyra(serializeVeyra(document)));
const roundTripGraph = getDependencyGraph(roundTripRenamed, null, { maxNodes: 5000, maxEdges: 10000, depth: 32 });
assert.deepEqual(roundTripGraph, graph);
const roundTripOwnership = getOwnership(roundTripRenamed, ADDRESS_X, { runtimeContext: { timelineId: 'timeline_x', frame: 30 } });
assert.deepEqual(roundTripOwnership.activeOwner, animatedOwnership.activeOwner);
assert.deepEqual(roundTripOwnership.writableSource, animatedOwnership.writableSource);
assert.deepEqual(roundTripOwnership.potentialControllers, animatedOwnership.potentialControllers);

// Control-plane validation is read-only and canonical.
const validationStore = new VeyraStore(document);
const validationPlane = createVeyraControlPlane(validationStore);
const validationBefore = serializeVeyra(validationStore.document);
assert.equal(validationPlane.validateDocument().ok, true);
assert.equal(serializeVeyra(validationStore.document), validationBefore);

console.log('veyra M3 unified control plane/dependency/ownership tests passed');
