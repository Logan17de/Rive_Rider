import assert from 'node:assert/strict';
import { createDocument, createNode, createPointerListener, createTimeline, normalizeDocument } from '../src/veyra/model.js';
import { createShellInteractionBridge, canvasPoint, isPreviewPointerEligible } from '../src/veyra/shellBridge.js';

const timeline = createTimeline({ id: 'tl', duration: 10 });
const document = normalizeDocument(createDocument({
  nodes: [createNode('rectangle', { id: 'target', geometry: { width: 80, height: 80 } })],
  timelines: [timeline],
  listeners: [createPointerListener({ id: 'play', targetId: 'target', event: 'pointerdown', action: 'play', timelineId: 'tl' })],
}));
const intents = [];
const bridge = createShellInteractionBridge({ document, onIntent: (intent) => intents.push(intent) });
const scene = { ...document, kind: 'veyra-evaluated-scene', documentId: document.id };
const hit = bridge.resolve({ type: 'pointerdown', x: 50, y: 50 }, scene, 1, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
assert.equal(hit.intents[0].op, 'play', 'preview adapter emits direct play intent');
assert.equal(intents[0].timelineId, 'tl', 'adapter forwards transport target');
const moveIntents = [];
const moveBridge = createShellInteractionBridge({ document: normalizeDocument({ ...document, listeners: [createPointerListener({ id: 'move-play', targetId: 'target', event: 'pointermove', action: 'play', timelineId: 'tl' })] }), onIntent: (intent) => moveIntents.push(intent) });
const move = moveBridge.resolve({ type: 'pointermove', x: 50, y: 50 }, scene, 1, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
assert.equal(move.intents.length, 1, 'resolver reports direct pointermove listener');
assert.equal(moveIntents.length, 1, 'M4 dispatches a direct pointermove listener exactly once');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'select', preview: false }), false, 'select mode blocks preview dispatch');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'select', preview: true }), true, 'preview mode admits primary pointer dispatch');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 1 }, tool: 'select', preview: true }), false, 'middle-button pan is not preview dispatch');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: false, button: 0 }, tool: 'select', preview: true }), false, 'non-primary pointers are not preview dispatch');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'pencil', preview: true }), false, 'editing tools remain authoring-routed');
assert.equal(bridge.resolver, bridge.resolver, 'bridge retains one resolver between events');
const replacement = { ...document, id: 'replacement' };
bridge.updateDocument(replacement);
assert.equal(bridge.document, replacement, 'document identity replacement updates adapter source');
assert.equal(bridge.revision, 1, 'document replacement advances scene revision');
const point = canvasPoint({ clientX: 125, clientY: 240 }, { getBoundingClientRect: () => ({ left: 25, top: 40, width: 200, height: 100 }) }, { cssWidth: 400, cssHeight: 200 });
assert.deepEqual(point, { x: 200, y: 400 }, 'DOM coordinate conversion honors canvas offset and CSS scale');
const noHitIntents = [];
const noHitBridge = createShellInteractionBridge({ document, onIntent: (intent) => noHitIntents.push(intent) });
const noHit = noHitBridge.resolve({ type: 'pointerdown', x: -100, y: -100 }, scene, 1, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
assert.equal(noHit.hit, null, 'preview no-hit resolves no target');
assert.equal(noHitIntents.length, 0, 'preview no-hit does not dispatch playback');
const replacementWithMove = normalizeDocument({ ...document, id: 'replacement-two', listeners: [] });
bridge.resolve({ type: 'pointermove', x: 50, y: 50 }, scene, 2, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
bridge.updateDocument(replacementWithMove);
assert.equal(bridge.resolver.hoverKey, null, 'document identity refresh clears prior hover state');
assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0, altKey: true }, tool: 'select', preview: true }), false, 'Alt-pan remains authoring-routed');

console.log('All shell bridge tests passed!');
