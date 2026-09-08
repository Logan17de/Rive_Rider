import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDocument,
  createNode,
  normalizeDocument,
} from '../src/veyra/model.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  VEYRA_COMMAND_PROVENANCE_AUDIT,
  VEYRA_COMMAND_TABLE,
} from '../src/veyra/commands.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { queryEntities, resolveSemantic } from '../src/veyra/resolver.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import {
  VEYRA_BROWSER_MUTATION_COMPATIBILITY,
  VEYRA_UI_MUTATION_PARITY_AUDIT,
} from '../src/veyra/serviceRegistry.js';

function fixture() {
  return normalizeDocument(createDocument({
    id: 'm3_correction_doc',
    name: 'Correction fixture',
    nodes: [createNode('ellipse', {
      id: 'base_node',
      name: 'Display only',
      transform: { x: 10, y: 20 },
      geometry: { width: 80, height: 50 },
    })],
  }));
}

function implicitNodeId(preview) {
  return preview.preparedCommand?.args?.options?.id;
}

function implicitTimelineId(preview) {
  return preview.preparedCommand?.args?.overrides?.id;
}

const createCommand = {
  action: 'add',
  args: { type: 'ellipse', options: { name: 'Repeated create' } },
  command: { label: 'AI repeated create', source: 'ai' },
};

// Correction 1. Preview/dispatch align for one snapshot, then the changed
// snapshot deterministically advances the implicit id instead of colliding.
const repeatStore = new VeyraStore(fixture());
const repeatPlane = createVeyraControlPlane(repeatStore);
const firstPreview = repeatPlane.previewCommand(createCommand);
assert.equal(firstPreview.ok, true);
const firstId = implicitNodeId(firstPreview);
assert.ok(firstId);
const firstDispatch = repeatPlane.dispatchCommand(createCommand);
assert.equal(firstDispatch.ok, true);
assert.equal(firstDispatch.result.id, firstId);

const secondPreview = repeatPlane.previewCommand(createCommand);
assert.equal(secondPreview.ok, true);
const secondId = implicitNodeId(secondPreview);
assert.ok(secondId);
assert.notEqual(secondId, firstId, 'same create after a successful mutation must get a new implicit id');
const secondDispatch = repeatPlane.dispatchCommand(createCommand);
assert.equal(secondDispatch.ok, true);
assert.equal(secondDispatch.result.id, secondId, 'second preview must predict second dispatch id');

// Non-node registry repeats obey the same snapshot-generation contract.
const timelineCommand = {
  action: 'addTimeline',
  args: { overrides: { name: 'Repeated timeline', duration: 30, fps: 30 } },
  command: { label: 'AI timeline', source: 'ai' },
};
const timelinePreview1 = repeatPlane.previewCommand(timelineCommand);
const timelineId1 = implicitTimelineId(timelinePreview1);
assert.ok(timelineId1);
assert.equal(repeatPlane.dispatchCommand(timelineCommand).result, timelineId1);
const timelinePreview2 = repeatPlane.previewCommand(timelineCommand);
const timelineId2 = implicitTimelineId(timelinePreview2);
assert.notEqual(timelineId2, timelineId1);
assert.equal(repeatPlane.dispatchCommand(timelineCommand).result, timelineId2);

// Failed preview/dispatch does not consume or perturb the next implicit id.
const nextBeforeFailure = implicitNodeId(repeatPlane.previewCommand(createCommand));
const failedPreview = repeatPlane.previewCommand({
  action: 'add',
  args: { type: 'definitely-not-a-node', options: {} },
  command: { label: 'Invalid preview', source: 'ai' },
});
assert.equal(failedPreview.ok, false);
assert.equal(implicitNodeId(repeatPlane.previewCommand(createCommand)), nextBeforeFailure);
const beforeDuplicateDocument = serializeVeyra(repeatStore.document);
const beforeDuplicateRevision = repeatStore.revision;
const beforeDuplicateHistory = JSON.stringify(repeatStore.commandHistory);
const duplicate = repeatPlane.dispatchCommand({
  action: 'add',
  args: { type: 'ellipse', options: { id: 'base_node', name: 'Duplicate explicit id' } },
  command: { label: 'Explicit duplicate', source: 'ai' },
});
assert.equal(duplicate.ok, false, 'explicit duplicate ids must still fail precisely');
assert.equal(serializeVeyra(repeatStore.document), beforeDuplicateDocument);
assert.equal(repeatStore.revision, beforeDuplicateRevision);
assert.equal(JSON.stringify(repeatStore.commandHistory), beforeDuplicateHistory);
assert.equal(implicitNodeId(repeatPlane.previewCommand(createCommand)), nextBeforeFailure);

// Undo restores the prior stable-id snapshot, so the undone id is reused only
// while absent. Redo restores that id, so the next create advances again.
const undoStore = new VeyraStore(fixture());
const undoPlane = createVeyraControlPlane(undoStore);
const undoCreated = undoPlane.dispatchCommand(createCommand);
const undoneId = undoCreated.result.id;
assert.equal(undoStore.undo(), true);
assert.equal(implicitNodeId(undoPlane.previewCommand(createCommand)), undoneId);
assert.equal(undoPlane.dispatchCommand(createCommand).result.id, undoneId);

const redoStore = new VeyraStore(fixture());
const redoPlane = createVeyraControlPlane(redoStore);
const redoCreated = redoPlane.dispatchCommand(createCommand);
const redoneId = redoCreated.result.id;
assert.equal(redoStore.undo(), true);
assert.equal(redoStore.redo(), true);
const afterRedoId = implicitNodeId(redoPlane.previewCommand(createCommand));
assert.notEqual(afterRedoId, redoneId);
assert.equal(redoPlane.dispatchCommand(createCommand).result.id, afterRedoId);

// Correction 2. Canonical command provenance survives all the way to history.
const provenanceStore = new VeyraStore(fixture());
const provenancePlane = createVeyraControlPlane(provenanceStore);
const aiAdd = provenancePlane.dispatchCommand({
  action: 'add',
  args: { type: 'rectangle', options: { name: 'AI object' } },
  command: {
    label: 'AI create object',
    source: 'ai',
    propertyAddresses: ['node:base_node/opacity'],
    metadata: { requestId: 'req-1' },
  },
});
assert.equal(aiAdd.ok, true);
let history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'ai');
assert.equal(history.label, 'AI create object');
assert.deepEqual(history.propertyAddresses, ['node:base_node/opacity']);
assert.deepEqual(history.metadata, { requestId: 'req-1' });

const scriptedDelete = provenancePlane.dispatchCommand({
  action: 'remove',
  args: { nodeId: aiAdd.result.id },
  command: { label: 'Script delete object', source: 'script' },
});
assert.equal(scriptedDelete.ok, true);
history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'script');
assert.equal(history.label, 'Script delete object');

const aiTimeline = provenancePlane.dispatchCommand({
  action: 'addTimeline',
  args: { overrides: { name: 'AI authored timeline' } },
  command: { label: 'AI create timeline', source: 'ai' },
});
assert.equal(aiTimeline.ok, true);
history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'ai');
assert.equal(history.label, 'AI create timeline');

const historyBeforeInvalid = JSON.stringify(provenanceStore.commandHistory);
assert.equal(provenancePlane.dispatchCommand({
  action: 'setProperty',
  args: { address: 'node:missing/opacity', value: 0.5 },
  command: { label: 'Invalid AI command', source: 'ai' },
}).ok, false);
assert.equal(JSON.stringify(provenanceStore.commandHistory), historyBeforeInvalid);

for (const [action, entry] of Object.entries(VEYRA_COMMAND_TABLE)) {
  const audit = VEYRA_COMMAND_PROVENANCE_AUDIT[action];
  assert.deepEqual(entry.provenance, audit);
  if (entry.capabilities.includes('undoable')) {
    assert.equal(audit.status, 'preserved', `undoable ${action} must mechanically prove provenance forwarding`);
  }
}

// Correction 3. Browser compatibility mutation map is explicit and every
// command-backed helper is statically tied to the canonical dispatcher.
const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
function helperSource(name) {
  const matcher = new RegExp(`^  ${name}:([\\s\\S]*?)(?=^  [A-Za-z][A-Za-z0-9]*:|^\\}\\);)`, 'm');
  const match = browserSource.match(matcher);
  assert.ok(match, `globalThis.veyra helper ${name} must exist`);
  return match[0];
}

const mutatingStoreCall = /\bstore\.(?:execute|add|remove|update|set)[A-Za-z0-9_]*/;
for (const [helper, metadata] of Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY)) {
  const source = helperSource(helper);
  if (metadata.transport === 'command') {
    assert.ok(VEYRA_COMMAND_TABLE[metadata.action], `${helper} must map to a real command action`);
    assert.match(source, new RegExp(`dispatchCompatibilityCommand\\('${metadata.action}'`));
    assert.doesNotMatch(source, mutatingStoreCall, `${helper} must not bypass canonical dispatcher`);
  } else if (metadata.transport === 'direct-store') {
    assert.ok(metadata.reason && metadata.followUp, `${helper} direct Store seam must be reasoned and categorized`);
    assert.match(source, mutatingStoreCall, `${helper} audit says direct Store, so source must expose that seam`);
  } else if (metadata.transport === 'runtime') {
    assert.ok(metadata.reason, `${helper} runtime seam must explain why it is outside Store commands`);
    assert.doesNotMatch(source, mutatingStoreCall, `${helper} runtime helper must not secretly mutate authored Store state`);
  } else {
    assert.fail(`Unsupported browser mutation transport for ${helper}: ${metadata.transport}`);
  }
}

assert.match(browserSource, /queryEntities:\s*\(query = \{\}, options = \{\}\) => controlPlane\.queryEntities\(query, options\)/);
assert.match(browserSource, /resolveSemantic:\s*\(intent, options = \{\}\) => controlPlane\.resolveSemantic\(intent, options\)/);
const parityDocument = fixture();
const parityPlane = createVeyraControlPlane(new VeyraStore(parityDocument));
assert.deepEqual(
  parityPlane.queryEntities({ kinds: ['node'] }),
  queryEntities(parityDocument, { kinds: ['node'] }),
  'browser/control-plane query path must preserve canonical resolver behavior',
);
assert.deepEqual(
  parityPlane.resolveSemantic({ ref: { kind: 'node', id: 'base_node' } }),
  resolveSemantic(parityDocument, { ref: { kind: 'node', id: 'base_node' } }),
  'browser/control-plane resolve path must preserve canonical resolver behavior',
);

const manifest = createProjectManifest(fixture());
assert.deepEqual(manifest.authoring.controlPlane.commandProvenanceAudit, VEYRA_COMMAND_PROVENANCE_AUDIT);
assert.deepEqual(manifest.authoring.controlPlane.browserMutationCompatibility, VEYRA_BROWSER_MUTATION_COMPATIBILITY);
assert.deepEqual(manifest.authoring.controlPlane.uiMutationParityAudit, VEYRA_UI_MUTATION_PARITY_AUDIT);
assert.ok(VEYRA_UI_MUTATION_PARITY_AUDIT.some((item) => item.surface === 'globalThis.veyra direct Store compatibility mutations'));

console.log('veyra M3 correction-pass tests passed');
