import assert from 'node:assert/strict';
import {
  createDocument, createNode, createTimeline, createPointerListener, normalizeDocument,
} from '../src/veyra/model.js';
import {
  resolveListenerIntents,
  resolvePointerEvent,
  resolveListenerEvent,
  createListenerResolver,
} from '../src/veyra/listenersRuntime.js';

const node = createNode('rectangle', { id: 'button', transform: { x: 40, y: 40 } });
const timeline = createTimeline({ id: 'door', name: 'DoorOpen' });
const document = normalizeDocument(createDocument({
  nodes: [node],
  timelines: [timeline],
  listeners: [createPointerListener({ id: 'play-door', targetId: 'button', event: 'pointerdown', action: 'play', timelineId: 'door' })],
}));

const play = resolveListenerIntents({ event: { type: 'pointerdown', x: 40, y: 40 }, document, viewport: { width: 960, height: 640 } });
assert.equal(play.intents[0].kind, 'transport', 'resolver emits a transport intent for machine-free play');
assert.deepEqual(play.intents[0], { kind: 'transport', op: 'play', timelineId: 'door' });
assert.equal(play.hit.id, 'button', 'resolver hit-tests the target node');

const miss = resolveListenerIntents({ event: { type: 'pointerdown', x: -100, y: -100 }, document, viewport: { width: 960, height: 640 } });
assert.equal(miss.intents.length, 0, 'resolver emits no intent outside the target');

const resolver = createListenerResolver({ document, viewport: { width: 960, height: 640 } });
const first = resolver.resolve({ type: 'pointermove', x: 40, y: 40 });
const second = resolver.resolve({ type: 'pointermove', x: 40, y: 40 });
assert.notEqual(first.hoverKey, null, 'resolver records a stable hover key');
assert.equal(second.transitions.length, 0, 'resolver deduplicates unchanged hover transitions');

const refreshedTimeline = createTimeline({ id: 'new-door', name: 'NewDoor' });
const refreshedDocument = normalizeDocument(createDocument({
  nodes: [createNode('rectangle', { id: 'button', transform: { x: 40, y: 40 } })],
  timelines: [refreshedTimeline],
  listeners: [createPointerListener({ id: 'play-new-door', targetId: 'button', event: 'pointerdown', action: 'play', timelineId: 'new-door' })],
}));
resolver.setDocument(refreshedDocument);
assert.equal(resolver.hoverKey, null, 'setDocument resets hover state after document replacement');
const refreshed = resolver.resolve({ type: 'pointerdown', x: 40, y: 40 });
assert.deepEqual(refreshed.intents[0], { kind: 'transport', op: 'play', timelineId: 'new-door' }, 'held resolver reads listeners from the new document');
const refreshedHover = resolver.resolve({ type: 'pointermove', x: 40, y: 40 });
resolver.setDocument(refreshedDocument);
assert.equal(resolver.hoverKey, refreshedHover.hoverKey, 'setDocument of the same document is a safe no-op');

assert.throws(
  () => resolveListenerIntents({ event: { type: 'pointerdown', x: 40, y: 40 }, document, bogus: true }),
  (error) => error instanceof TypeError && /bogus/.test(error.message) && /event, scene, document, viewport, hoverKey, sceneRevision/.test(error.message),
  'resolveListenerIntents rejects and names unknown option keys',
);
assert.throws(
  () => createListenerResolver({ scene: document }),
  (error) => error instanceof TypeError && /scene/.test(error.message) && /document, viewport/.test(error.message),
  'createListenerResolver rejects a wrong scene option key',
);
for (const [name, alias] of [['resolvePointerEvent', resolvePointerEvent], ['resolveListenerEvent', resolveListenerEvent]]) {
  assert.throws(
    () => alias({ event: { type: 'pointerdown', x: 40, y: 40 }, document, wrong: true }),
    (error) => error instanceof TypeError && /wrong/.test(error.message),
    `${name} rejects unknown option keys like resolveListenerIntents`,
  );
}

assert.throws(() => normalizeDocument(createDocument({
  nodes: [node],
  listeners: [createPointerListener({ targetId: 'button', event: 'pointerdown', action: 'play' })],
})), /listener\.timeline is required/, 'schema rejects play listeners without a timeline');
assert.throws(() => createPointerListener({ targetId: 'button', event: 'pointerdown', action: 'play', timelineId: 'door', machineId: 'm', inputId: 'i' }), /machine\/input are not allowed/, 'constructor rejects mixed transport and machine references');
assert.throws(() => normalizeDocument({ ...document, listeners: [{ id: 'bad', kind: 'pointer', event: 'pointerdown', action: 'play', target: { kind: 'node', id: 'button' }, timeline: { kind: 'timeline', id: 'door' }, machine: 'm', input: { kind: 'machineInput', id: 'i' } }] }), /machine\/input are not allowed/, 'loader rejects mixed transport and machine references');

console.log('All listener runtime tests passed!');
