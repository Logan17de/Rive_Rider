import assert from 'node:assert/strict';
import {
  VEYRA_DOCUMENT_LIMITS,
  createAsset,
  createDocument,
  createLinearGradient,
  createNode,
  createStateMachine,
  createTimeline,
  normalizeDocument,
} from '../src/veyra/model.js';
import { createText } from '../src/veyra/featureGraph.js';
import { createLayout } from '../src/veyra/featureGraph.js';
import { createEvent } from '../src/veyra/featureGraph.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { createVeyraPlayer } from '../src/veyra/player.js';
import { exportLottie, importLottie } from '../src/veyra/lottie.js';
import { createMachineRuntime } from '../src/veyra/stateMachine.js';
import * as publicApi from '../src/index.js';

function expectThrows(fn, pattern, message) {
  assert.throws(fn, pattern, message);
}

assert.equal(typeof publicApi.createDocument, 'function', 'core document creation must be public');
assert.equal(typeof publicApi.normalizeDocument, 'function', 'normalization must be public');
assert.equal(typeof publicApi.evaluateDocument, 'function', 'evaluation must be public');
assert.equal(typeof publicApi.renderSvgString, 'function', 'SVG export must be public');
assert.equal(typeof publicApi.VeyraStore, 'function', 'store must be public for embedders');
assert.equal(typeof publicApi.parseVeyra, 'function', 'Veyra IO must be public');

const baseNode = createNode('rectangle', { id: 'hardening_rect' });

// The important contract is that createDocument no longer drops explicitly
// supplied feature collections before normalization.
const authored = createDocument({
  id: 'hardening_features_2',
  nodes: [baseNode],
  texts: [createText({ id: 'hardening_text_2', node: baseNode.id, content: 'kept' })],
});
assert.equal(authored.texts.length, 1, 'createDocument must preserve feature collections.');
assert.equal(normalizeDocument(authored).texts[0].runs[0].text, 'kept');

const flexA = createNode('rectangle', { id: 'layout_a', transform: { x: 0, y: 0 }, geometry: { width: 20, height: 10, cornerRadius: 0 } });
const flexB = createNode('rectangle', { id: 'layout_b', transform: { x: 0, y: 0 }, geometry: { width: 20, height: 10, cornerRadius: 0 } });
const layoutDocument = normalizeDocument(createDocument({
  id: 'hardening_layout',
  artboard: { width: 200, height: 100 },
  nodes: [flexA, flexB],
  layouts: [createLayout({
    id: 'hardening_flex', mode: 'flex', direction: 'row', width: 100, height: 40, gap: 10,
    justify: 'center', align: 'center', items: [{ id: 'layout_item_a', target: flexA.id }, { id: 'layout_item_b', target: flexB.id }],
  })],
}));
const authoredTransforms = layoutDocument.nodes.map((node) => ({ id: node.id, x: node.transform.x, y: node.transform.y }));
const layoutScene = evaluateDocument(layoutDocument);
assert.equal(layoutScene.sources['node:layout_a/transform/x'], 'layout');
assert.equal(layoutScene.nodes.find((node) => node.id === 'layout_a').transform.x, -15);
assert.equal(layoutScene.nodes.find((node) => node.id === 'layout_b').transform.x, 15);
assert.deepEqual(layoutDocument.nodes.map((node) => ({ id: node.id, x: node.transform.x, y: node.transform.y })), authoredTransforms, 'layout evaluation must not mutate authored transforms');

const eventDocument = normalizeDocument(createDocument({
  id: 'hardening_events', nodes: [createNode('rectangle', { id: 'event_rect' })],
  events: [createEvent({ id: 'event_click', type: 'click', target: 'event_rect', actions: [
    { id: 'event_set', type: 'setProperty', target: 'node:event_rect/transform/x', value: 42, once: true },
  ] })],
}));
const eventPlayer = createVeyraPlayer(eventDocument, { machineId: null, timelineId: null });
assert.equal(eventPlayer.dispatchEvent('click', { targetId: 'event_rect' }).actions.length, 1);
assert.equal(eventPlayer.evaluate().nodes.find((node) => node.id === 'event_rect').transform.x, 42);
assert.equal(eventPlayer.dispatchEvent('click', { targetId: 'event_rect' }).actions.length, 0, 'once event actions must execute at most once per player lifecycle');

const gradientNode = createNode('rectangle', {
  id: 'gradient_rect',
  paint: { fill: createLinearGradient({ id: 'gradient_fill', stops: [
    { id: 'gradient_stop_a', offset: 0, color: '#ff0000', opacity: 1 },
    { id: 'gradient_stop_b', offset: 1, color: '#0000ff', opacity: 0.5 },
  ] }) },
});
const gradientDocument = normalizeDocument(createDocument({ id: 'hardening_gradient', nodes: [gradientNode] }));
const exportedGradient = exportLottie(gradientDocument);
assert.ok(exportedGradient.layers.some((layer) => layer.shapes?.some((shape) => shape.ty === 'gf')), 'gradient fills must export as Lottie gradient shapes');
const importedGradient = importLottie(exportedGradient).document.nodes.find((node) => node.type === 'rectangle');
assert.equal(importedGradient.paint.fill.type, 'linearGradient');
assert.equal(importedGradient.paint.fill.stops.length, 2);

const builtinIdle = createTimeline({ id: 'builtin_idle', duration: 30, fps: 30 });
const builtinActive = createTimeline({ id: 'builtin_active', duration: 30, fps: 30 });
const builtinMachine = createStateMachine({
  id: 'builtin_machine',
  states: [
    { id: 'builtin_a', timeline: builtinIdle.id },
    { id: 'builtin_b', timeline: builtinActive.id },
  ],
  transitions: [{
    id: 'builtin_width_route', from: 'builtin_a', to: 'builtin_b',
    conditions: [{ id: 'builtin_width_condition', source: { kind: 'artboard', property: 'width' }, op: '>', value: 500 }],
  }],
});
const builtinDocument = normalizeDocument(createDocument({
  id: 'hardening_builtin', artboard: { width: 960, height: 640 },
  timelines: [builtinIdle, builtinActive], stateMachines: [builtinMachine],
}));
const builtinRuntime = createMachineRuntime(builtinDocument, builtinMachine.id);
builtinRuntime.step(1 / 60);
assert.equal(builtinRuntime.stateId, 'builtin_b', 'artboard width source should drive transitions');

const runtimeRoute = createStateMachine({
  id: 'runtime_source_machine',
  states: [{ id: 'runtime_a', timeline: builtinIdle.id }, { id: 'runtime_b', timeline: builtinActive.id }],
  transitions: [{
    id: 'runtime_pointer_route', from: 'runtime_a', to: 'runtime_b',
    conditions: [{ id: 'runtime_pointer_condition', source: { kind: 'runtime', property: 'pointerX' }, op: '>', value: 10 }],
  }],
});
const runtimeDocument = normalizeDocument(createDocument({ id: 'hardening_runtime', timelines: [builtinIdle, builtinActive], stateMachines: [runtimeRoute] }));
const runtimeSource = createMachineRuntime(runtimeDocument, runtimeRoute.id);
runtimeSource.setRuntimeValue('pointerX', 12);
runtimeSource.step(1 / 60);
assert.equal(runtimeSource.stateId, 'runtime_b', 'host runtime values should drive transitions without authored mutation');

const additiveNode = createNode('rectangle', { id: 'additive_rect', transform: { x: 0, y: 0 } });
const additiveA = createTimeline({ id: 'additive_a', duration: 1, fps: 1, tracks: [{ id: 'additive_track_a', address: 'node:additive_rect/transform/x', keyframes: [{ id: 'additive_a_0', frame: 0, value: 10 }] }] });
const additiveB = createTimeline({ id: 'additive_b', duration: 1, fps: 1, tracks: [{ id: 'additive_track_b', address: 'node:additive_rect/transform/x', keyframes: [{ id: 'additive_b_0', frame: 0, value: 20 }] }] });
const additiveMachine = createStateMachine({
  id: 'additive_machine', inputs: [{ id: 'additive_weight_a', name: 'Weight A', type: 'number', value: 0.5 }, { id: 'additive_weight_b', name: 'Weight B', type: 'number', value: 0.5 }],
  states: [{ id: 'additive_state', type: 'additiveBlend', children: [
    { id: 'additive_child_a', timeline: additiveA.id, input: 'additive_weight_a' },
    { id: 'additive_child_b', timeline: additiveB.id, input: 'additive_weight_b' },
  ] }],
});
const additiveDocument = normalizeDocument(createDocument({ id: 'hardening_additive', nodes: [additiveNode], timelines: [additiveA, additiveB], stateMachines: [additiveMachine] }));
const additiveRuntime = createMachineRuntime(additiveDocument, additiveMachine.id);
const additiveOverrides = additiveRuntime.evaluate().overrides;
assert.equal(additiveOverrides['node:additive_rect/transform/x'], 15, 'additive blend should sum weighted deltas from the authored rest value');

expectThrows(
  () => normalizeDocument(createDocument({
    nodes: [baseNode],
    assets: [createAsset('image', { id: 'unsafe_asset', source: { kind: 'external', uri: 'javascript:alert(1)' } })],
  })),
  /script URL/i,
  'script URLs must be rejected by asset normalization',
);

expectThrows(
  () => normalizeDocument(createDocument({
    nodes: [baseNode],
    assets: [createAsset('image', { id: 'html_asset', source: { kind: 'external', uri: 'data:text/html,<svg onload=alert(1)>' } })],
  })),
  /HTML data URL/i,
  'HTML data URLs must be rejected by asset normalization',
);

expectThrows(
  () => normalizeDocument(createDocument({
    nodes: [baseNode],
    assets: [{ id: 'oversized_asset', type: 'image', name: 'Oversized', mimeType: 'image/png', source: { kind: 'embedded', data: 'x'.repeat(VEYRA_DOCUMENT_LIMITS.assetSourceChars + 1) } }],
  })),
  /asset limit/i,
  'embedded asset payloads must be bounded before rendering',
);

expectThrows(
  () => normalizeDocument(createDocument({ nodes: Array.from({ length: VEYRA_DOCUMENT_LIMITS.nodes + 1 }, () => null) })),
  /too many nodes/i,
  'top-level node collections must be bounded before per-node work',
);

console.log('veyra production hardening tests passed');
