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
  createMachineTransition,
  createNode,
  createSemanticRecord,
  createStateMachine,
  createTimeline,
  createTrack,
  normalizeDocument,
} from '../src/veyra/model.js';
import { serializeVeyra, parseVeyra } from '../src/veyra/io.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { VeyraStore } from '../src/veyra/store.js';
import { buildSemanticIndex, queryEntities, resolveSemantic } from '../src/veyra/resolver.js';

function fixture(overrides = {}) {
  const face = createNode('group', { id: 'face_group', name: 'Layer' });
  const left = createNode('ellipse', {
    id: 'eye_left', name: 'right_eye', parent: 'face_group',
    transform: { x: 350, y: 220 }, geometry: { width: 80, height: 50 },
  });
  const right = createNode('ellipse', {
    id: 'eye_right', name: 'left_eye', parent: 'face_group',
    transform: { x: 610, y: 220 }, geometry: { width: 80, height: 50 },
  });
  const bone = createBone({ id: 'bone_eye', name: 'Layer', length: 40, rest: { x: 610, y: 220 } });
  const control = createControl({ id: 'control_eye', name: 'Layer', position: { x: 650, y: 220 } });
  const constraint = createConstraint('distance', {
    id: 'constraint_eye', name: 'Layer', bone: bone.id, target: control.id, distance: 40,
  });
  const track = createTrack('node:eye_right/transform/x', {
    id: 'track_eye',
    keyframes: [createKeyframe({ id: 'key_eye', frame: 0, value: 610 })],
  });
  const timeline = createTimeline({ id: 'timeline_blink', name: 'Layer', tracks: [track] });
  const machine = createStateMachine({
    id: 'machine_face', name: 'Layer', initial: 'state_idle',
    inputs: [createMachineInput({ id: 'input_blink', name: 'Layer', type: 'bool', value: false })],
    states: [
      createMachineState({ id: 'state_idle', name: 'Layer', timeline: timeline.id }),
      createMachineState({ id: 'state_blink', name: 'Layer', timeline: timeline.id }),
    ],
    transitions: [createMachineTransition({
      id: 'transition_blink', from: 'state_idle', to: 'state_blink',
      conditions: [{ id: 'condition_blink', input: 'input_blink', op: '==', value: true }],
    })],
  });
  const semantics = [
    createSemanticRecord({ kind: 'node', id: 'eye_right' }, {
      id: 'semantic_right_eye', canonicalRole: 'character.eye', tags: ['eye', 'right'],
      aliases: [{ namespace: 'vision', owner: 'agent', value: 'right_eye' }],
      provenance: { source: 'ai', confidence: 0.98 }, status: 'confirmed',
      relations: [{ predicate: 'controlled_by', target: { kind: 'control', id: 'control_eye' } }],
    }),
    createSemanticRecord({ kind: 'node', id: 'eye_left' }, {
      id: 'semantic_left_eye', canonicalRole: 'character.eye', tags: ['eye', 'left'],
      aliases: [{ namespace: 'vision', owner: 'agent', value: 'left_eye' }],
      provenance: { source: 'ai', confidence: 0.96 }, status: 'confirmed',
    }),
  ];
  return normalizeDocument(createDocument({
    id: 'resolver_document', name: 'Resolver fixture', artboard: { width: 960, height: 640 },
    nodes: [face, left, right], bones: [bone], controls: [control], constraints: [constraint],
    timelines: [timeline], stateMachines: [machine],
    listeners: [{ id: 'listener_eye', kind: 'pointer', event: 'pointerdown', action: 'play', target: right.id, timeline: timeline.id }],
    semantics,
    ...overrides,
  }));
}

const document = fixture();
const frozen = serializeVeyra(document);
const indexA = buildSemanticIndex(document);
const indexB = buildSemanticIndex(document);
assert.deepEqual(indexA, indexB, 'semantic index is deterministic');
assert.equal(serializeVeyra(document), frozen, 'indexing does not mutate the document');
assert.ok(indexA.entities.some((entity) => entity.ref.kind === 'machineCondition'));
assert.ok(indexA.entities.some((entity) => entity.ref.kind === 'track'));
const rightEntry = indexA.entities.find((entity) => entity.ref.kind === 'node' && entity.ref.id === 'eye_right');
assert.ok(rightEntry.semantics.some((record) => record.canonicalRole === 'character.eye'));
assert.ok(rightEntry.relationships.some((item) => item.relation === 'animated_by' && item.target.id === 'track_eye'));
assert.ok(rightEntry.relationships.some((item) => item.relation === 'listener_target' && item.target.id === 'listener_eye'));
assert.equal(rightEntry.displayName.authoritative, false);

const aliasQuery = queryEntities(document, { kinds: ['node'], semantic: { alias: 'right_eye', status: 'confirmed', source: 'ai' } });
assert.equal(aliasQuery.count, 1);
assert.deepEqual(aliasQuery.entities[0].ref, { kind: 'node', id: 'eye_right' });
assert.ok(aliasQuery.entities[0].matches.some((item) => item.kind === 'semantic-alias-filter'));

const exact = resolveSemantic(document, { ref: { kind: 'node', id: 'eye_right' } });
assert.equal(exact.status, 'resolved');
assert.deepEqual(exact.target, { kind: 'node', id: 'eye_right' });
assert.equal(exact.evidence[0].kind, 'stable-ref');

const alias = resolveSemantic(document, 'right_eye');
assert.equal(alias.status, 'resolved');
assert.equal(alias.target.id, 'eye_right', 'confirmed alias beats deliberately misleading human names');
assert.ok(alias.evidence.some((item) => item.kind === 'semantic-alias'));

const roleTag = resolveSemantic(document, { kinds: ['node'], role: 'character.eye', tags: ['right'] });
assert.equal(roleTag.status, 'resolved');
assert.equal(roleTag.target.id, 'eye_right');

const allLayer = fixture({
  nodes: document.nodes.map((node) => ({ ...node, name: 'Layer' })),
  bones: document.bones.map((bone) => ({ ...bone, name: 'Layer' })),
  controls: document.controls.map((control) => ({ ...control, name: 'Layer' })),
});
assert.equal(resolveSemantic(allLayer, 'right_eye').target.id, 'eye_right');
const emptyNames = fixture({ nodes: document.nodes.map((node) => ({ ...node, name: '' })) });
assert.equal(resolveSemantic(emptyNames, 'right_eye').target.id, 'eye_right');
const randomNames = fixture({ nodes: document.nodes.map((node, index) => ({ ...node, name: `x_${index}_9f8a` })) });
assert.equal(resolveSemantic(randomNames, { role: 'character.eye', tags: ['right'] }).target.id, 'eye_right');

const humanName = resolveSemantic(document, { kinds: ['node'], displayName: 'right_eye' });
assert.equal(humanName.status, 'resolved');
assert.equal(humanName.target.id, 'eye_left', 'explicit human-name mode intentionally follows the misleading display name');
assert.ok(humanName.evidence.some((item) => item.kind === 'display-name-hint'));

const duplicateNameDoc = fixture({ nodes: document.nodes.map((node) => ({ ...node, name: node.type === 'ellipse' ? 'same' : node.name })) });
const duplicateName = resolveSemantic(duplicateNameDoc, { kinds: ['node'], type: 'ellipse', displayName: 'same' });
assert.equal(duplicateName.status, 'ambiguous', 'duplicate explicit human names fail closed');

const unlabeled = normalizeDocument(createDocument({
  id: 'ambiguous_doc', artboard: { width: 960, height: 640 },
  nodes: [
    createNode('group', { id: 'owner', name: '' }),
    createNode('ellipse', { id: 'candidate_a', name: '', parent: 'owner', transform: { x: 360, y: 200 }, geometry: { width: 60, height: 40 } }),
    createNode('ellipse', { id: 'candidate_b', name: '', parent: 'owner', transform: { x: 600, y: 200 }, geometry: { width: 60, height: 40 } }),
  ],
}));
const ambiguous = resolveSemantic(unlabeled, { kinds: ['node'], type: 'ellipse', relatedTo: { kind: 'node', id: 'owner' }, relation: 'parent' });
assert.equal(ambiguous.status, 'ambiguous');
assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.target.id), ['candidate_a', 'candidate_b']);

const wrongKind = resolveSemantic(document, { ref: { kind: 'bone', id: 'eye_right' } });
assert.equal(wrongKind.status, 'notFound');
assert.match(wrongKind.reason, /exists as: node/);
const missing = resolveSemantic(document, { ref: { kind: 'node', id: 'missing_ref' } });
assert.equal(missing.status, 'notFound');
assert.match(missing.reason, /does not exist/);

const animatedTarget = resolveSemantic(document, { kinds: ['node'], relatedTo: { kind: 'track', id: 'track_eye' }, relation: 'animated_by' });
assert.equal(animatedTarget.status, 'resolved');
assert.equal(animatedTarget.target.id, 'eye_right');
const listenerTarget = resolveSemantic(document, { kinds: ['node'], relatedTo: { kind: 'listener', id: 'listener_eye' }, relation: 'listener_target' });
assert.equal(listenerTarget.status, 'resolved');
assert.equal(listenerTarget.target.id, 'eye_right');
const timelineFromState = resolveSemantic(document, { kinds: ['timeline'], relatedTo: { kind: 'machineState', id: 'state_idle' }, relation: 'used_by_state' });
assert.equal(timelineFromState.status, 'resolved');
assert.equal(timelineFromState.target.id, 'timeline_blink');
const controlFromConstraint = resolveSemantic(document, { kinds: ['control'], relatedTo: { kind: 'constraint', id: 'constraint_eye' }, relation: 'constraint_target' });
assert.equal(controlFromConstraint.status, 'resolved');
assert.equal(controlFromConstraint.target.id, 'control_eye');
const semanticRelation = resolveSemantic(document, { kinds: ['node'], relatedTo: { kind: 'control', id: 'control_eye' }, relation: 'controlled_by' });
assert.equal(semanticRelation.status, 'resolved');
assert.equal(semanticRelation.target.id, 'eye_right');
assert.ok(semanticRelation.evidence.some((item) => item.kind === 'semantic-relation'));

const repeated = Array.from({ length: 5 }, () => resolveSemantic(document, { role: 'character.eye', tags: ['right'] }));
for (const result of repeated.slice(1)) assert.deepEqual(result, repeated[0], 'resolver output is deterministic');

const roundTrip = parseVeyra(serializeVeyra(document));
roundTrip.nodes.reverse();
roundTrip.nodes = roundTrip.nodes.map((node) => ({ ...node, name: `renamed_${node.id}` }));
const afterRoundTrip = resolveSemantic(normalizeDocument(roundTrip), 'right_eye');
assert.equal(afterRoundTrip.status, 'resolved');
assert.deepEqual(afterRoundTrip.target, alias.target, 'save/load + reorder + rename preserves semantic resolution');

const plannedRef = cloneRef(alias.target);
const renamedBeforeExecution = normalizeDocument({ ...document, nodes: document.nodes.map((node) => ({ ...node, name: `later_${node.id}` })) });
assert.deepEqual(resolveSemantic(renamedBeforeExecution, { ref: plannedRef }).target, plannedRef, 'stored stable ref survives human rename before execution');

const store = new VeyraStore(document);
const beforeDocument = serializeVeyra(store.document);
const beforeRevision = store.revision;
const beforeHistory = JSON.stringify(store.commandHistory);
const beforeSemantics = JSON.stringify(store.document.semantics);
buildSemanticIndex(store.document);
queryEntities(store.document, { semantic: { tag: 'eye' } });
resolveSemantic(store.document, 'right_eye');
assert.equal(serializeVeyra(store.document), beforeDocument);
assert.equal(store.revision, beforeRevision);
assert.equal(JSON.stringify(store.commandHistory), beforeHistory);
assert.equal(JSON.stringify(store.document.semantics), beforeSemantics);

const manifest = createProjectManifest(document);
assert.ok(manifest.capabilities.includes('semantics.indexed-query'));
assert.ok(manifest.capabilities.includes('semantics.deterministic-resolution'));
assert.deepEqual(manifest.authoring.semanticResolver.functions, ['buildSemanticIndex', 'queryEntities', 'resolveSemantic']);
assert.equal(manifest.authoring.semanticResolver.displayNamePolicy, 'ignored-by-default');
assert.deepEqual(manifest.authoring.semanticResolver.outcomes, ['resolved', 'ambiguous', 'notFound']);

const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
assert.match(browserSource, /queryEntities:\s*\(query = \{\}, options = \{\}\) => queryEntities\(store\.document, query, options\)/);
assert.match(browserSource, /resolveSemantic:\s*\(intent, options = \{\}\) => resolveSemantic\(store\.document, intent, options\)/);
assert.match(browserSource, /getSemanticIndex:\s*\(options = \{\}\) => buildSemanticIndex\(store\.document, options\)/);

function cloneRef(ref) { return { kind: ref.kind, id: ref.id }; }

console.log('veyra M2 semantic index/resolver tests passed');
