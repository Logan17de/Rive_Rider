import assert from 'node:assert/strict';
import {
  createDocument,
  createNode,
  createPointerListener,
  createStateMachine,
  createMachineInput,
  createMachineState,
  createTimeline,
  normalizeDocument,
  VEYRA_VERSION,
  VEYRA_LISTENER_VERSION,
  VEYRA_SUPPORTED_VERSIONS,
} from '../src/veyra/model.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

console.log('Testing Veyra listener registry and conditional schema versioning...');

const node = createNode('rectangle', { id: 'button_node', name: 'Button' });
const timeline = createTimeline({ id: 'button_timeline', name: 'Button idle' });
const machine = createStateMachine({
  id: 'button_machine',
  name: 'Button machine',
  inputs: [createMachineInput({ id: 'tap_input', name: 'Tap', type: 'trigger' })],
  states: [createMachineState({ id: 'button_idle', name: 'Idle', timeline: timeline.id })],
});
const base = createDocument({
  id: 'listener-doc',
  nodes: [node],
  timelines: [timeline],
  stateMachines: [machine],
});

// Positive control: a valid pointer listener survives normalization, with
// stable references rather than author-facing names in persisted fields.
{
  const authored = createPointerListener({
    id: 'listener_tap', kind: 'pointer', event: 'pointerdown',
    target: node.id, machine: machine.id, input: 'Tap', action: 'fire',
  });
  const normalized = normalizeDocument({ ...base, listeners: [authored] });
  assert.equal(normalized.version, 4, 'listener feature projects to v4');
  assert.deepEqual(normalized.listeners[0].target, { kind: 'node', id: node.id });
  assert.deepEqual(normalized.listeners[0].input, { kind: 'machineInput', id: 'tap_input' });
  assert.deepEqual(normalized.listeners[0].machine, { kind: 'stateMachine', id: machine.id });
  assert.equal(parseVeyra(JSON.stringify(normalized)).listeners.length, 1);
  console.log('✓ valid listener persists stable target/input ids');
}

// Negative control: unknown values and malformed registry shapes fail loudly.
{
  assert.throws(() => normalizeDocument({ ...base, listeners: [{ id: 'bad', kind: 'click', event: 'pointerdown', target: node.id, machine: machine.id, input: 'Tap', action: 'fire' }] }), /supported listener kind/);
  assert.equal(normalizeDocument({ ...base, listeners: [createPointerListener({ id: 'click-ok', kind: 'pointer', event: 'click', target: node.id, machine: machine.id, input: 'Tap', action: 'fire' })] }).listeners[0].event, 'click');
  assert.throws(() => normalizeDocument({ ...base, listeners: { bad: true } }), /listeners must be an array/);
  assert.throws(() => normalizeDocument({ ...base, listeners: [{ id: 'bad', kind: 'pointer', event: 'pointerdown', target: 'missing', machine: machine.id, input: 'Tap', action: 'fire' }] }), /missing node/);
  console.log('✓ malformed listeners are refused, never dropped');
}

// Plain documents remain v3 and normalize with an additive empty registry.
{
  const plain = normalizeDocument(base);
  assert.equal(plain.version, 3);
  assert.deepEqual(plain.listeners, []);
  const oldAccepts = (value) => [1, 2, 3].includes(Number(value.version));
  assert.equal(oldAccepts(plain), true);
  assert.ok(VEYRA_SUPPORTED_VERSIONS.includes(VEYRA_VERSION), 'default emitted version is readable');
  assert.ok(VEYRA_SUPPORTED_VERSIONS.includes(VEYRA_LISTENER_VERSION), 'listener emitted version is readable');
  console.log('✓ listener-free documents remain v3-compatible and emitted versions are readable');
}

// Cross-version contract: this models the verified old reader gate only; it
// does not prove the behavior of arbitrary previously shipped binaries.
{
  const listener = createPointerListener({ id: 'listener_tap', target: node.id, machine: machine.id, input: 'Tap', event: 'pointerdown', action: 'fire' });
  const listenerDoc = normalizeDocument({ ...base, listeners: [listener] });
  const oldAccepts = (value) => [1, 2, 3].includes(Number(value.version));
  assert.equal(oldAccepts(listenerDoc), false, 'old reader rejects v4 before normalization');
  const current = parseVeyra(JSON.stringify(listenerDoc));
  assert.equal(current.listeners.length, 1, 'current reader preserves listener-bearing v4');

  const once = serializeVeyra(listenerDoc);
  const twice = serializeVeyra(normalizeDocument(JSON.parse(once)));
  assert.equal(once, twice, 'listener serialization is byte-stable');
  const downgraded = normalizeDocument({ ...listenerDoc, listeners: [] });
  assert.equal(downgraded.version, 3, 'intentional removal projects back to v3');
  console.log('✓ v4 rejection boundary and deterministic downgrade');
}

console.log('All listener tests passed!');
