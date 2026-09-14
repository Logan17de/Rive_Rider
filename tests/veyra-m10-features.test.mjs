import assert from 'node:assert/strict';
import {
  createDocument, createMachineLayer, createMachineState, createNode, createStateMachine,
  createTimeline, createTrack, normalizeDocument,
} from '../src/veyra/model.js';
import {
  createAccessibility, createEvent, createLayout, createText, featureById, featureRecords,
} from '../src/veyra/featureGraph.js';
import { createTextRef } from '../src/veyra/references.js';
import { VeyraStore } from '../src/veyra/store.js';
import { dispatchVeyraCommand } from '../src/veyra/commands.js';
import { createGraphEditorController, renderMachineGraphSvg } from '../src/veyra/graphEditor.js';
import { createVeyraPlayer } from '../src/veyra/player.js';
import { importDotLottie, importLottie, exportDotLottie, exportLottie } from '../src/veyra/lottie.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';

const node = createNode('rectangle', { id: 'm10_node', name: 'Hero' });
const address = 'node:m10_node/transform/x';
const timeline = createTimeline({ id: 'm10_timeline', duration: 30, fps: 30, tracks: [createTrack(address, { id: 'm10_track', keyframes: [{ id: 'm10_k0', frame: 0, value: 0 }, { id: 'm10_k1', frame: 30, value: 120 }] })] });
const machine = createStateMachine({
  id: 'm10_machine', name: 'Preview Machine', layers: [createMachineLayer({
    id: 'm10_layer', name: 'Base', initial: { kind: 'machineState', id: 'm10_state' },
    states: [createMachineState({ id: 'm10_state', name: 'Animate', timeline: 'm10_timeline', graph: { x: 32, y: 32 } })],
  })],
});
const document = normalizeDocument({
  ...createDocument({ id: 'm10_document', name: 'M10 Features', nodes: [node], timelines: [timeline], stateMachines: [machine] }),
  texts: [createText({ id: 'm10_text', node: 'm10_node', content: 'Hello Veyra', runs: [{ id: 'm10_run', text: 'Hello Veyra', fontFamily: 'Inter', fontSize: 20, fill: '#22d3ee' }] })],
  layouts: [createLayout({ id: 'm10_layout', target: 'm10_node', mode: 'flex', items: [{ id: 'm10_item', target: 'm10_node' }] })],
  events: [createEvent({ id: 'm10_event', target: 'm10_node', type: 'marker', marker: 'intro' })],
  accessibility: [createAccessibility({ id: 'm10_a11y', target: 'm10_node', role: 'image', label: 'Hero' })],
});

const records = featureRecords(document);
assert.ok(records.some((record) => record.ref.id === 'm10_text' && record.kind === 'text'));
assert.ok(records.some((record) => record.ref.id === 'm10_run' && record.kind === 'textRun'));
assert.equal(featureById(document, 'textRun', 'm10_run').text, 'Hello Veyra');

const store = new VeyraStore(document);
const addScript = dispatchVeyraCommand(store, { action: 'addFeature', args: { kind: 'script', overrides: { id: 'm10_script', language: 'javascript', source: 'return 1;' } }, command: { source: 'ai', label: 'Add script' } });
assert.equal(addScript.ok, true);
assert.equal(store.document.scripts[0].id, 'm10_script');
assert.equal(dispatchVeyraCommand(store, { action: 'updateFeature', args: { kind: 'script', featureId: 'm10_script', changes: { enabled: false } }, command: { source: 'ai', label: 'Disable script' } }).ok, true);
assert.equal(store.document.scripts[0].enabled, false);
assert.equal(dispatchVeyraCommand(store, { action: 'addFeature', args: { kind: 'textRun', overrides: { ownerId: 'm10_text', id: 'm10_run2', text: '!' } }, command: { source: 'ai', label: 'Add text run' } }).ok, true);
assert.equal(featureById(store.document, 'textRun', 'm10_run2').text, '!');
store.undo();
assert.equal(featureById(store.document, 'textRun', 'm10_run2'), null);

const controller = createGraphEditorController(store, { machineId: 'm10_machine', layerId: 'm10_layer' });
const beforeGraph = JSON.stringify(store.document.stateMachines[0].layers[0].states[0].graph);
controller.state.panBy({ x: 10, y: 10 });
assert.equal(JSON.stringify(store.document.stateMachines[0].layers[0].states[0].graph), beforeGraph, 'graph camera state must not mutate authored graph');
controller.moveState('m10_state', { x: 79, y: 81 }, { label: 'Move state', source: 'ai' });
assert.deepEqual(store.document.stateMachines[0].layers[0].states[0].graph, { x: 79, y: 81 });
assert.match(renderMachineGraphSvg(controller.state), /m10_state/);

const secondState = dispatchVeyraCommand(store, {
  action: 'addMachineState',
  args: { machineId: 'm10_machine', layerId: 'm10_layer', overrides: { id: 'm10_state_b', name: 'Outro', type: 'animation', timeline: 'm10_timeline' } },
  command: { source: 'ai', label: 'Add outro state' },
});
assert.equal(secondState.ok, true);
const addedTransition = dispatchVeyraCommand(store, {
  action: 'addMachineTransition',
  args: { machineId: 'm10_machine', layerId: 'm10_layer', overrides: { id: 'm10_transition', from: 'm10_state', to: 'm10_state_b', duration: 0.25 } },
  command: { source: 'ai', label: 'Add outro transition' },
});
assert.equal(addedTransition.ok, true);
assert.equal(dispatchVeyraCommand(store, {
  action: 'reconnectMachineTransition',
  args: { machineId: 'm10_machine', transitionId: 'm10_transition', from: 'm10_state_b', to: 'm10_state' },
  command: { source: 'ai', label: 'Reconnect outro transition' },
}).ok, true);
assert.deepEqual(store.document.stateMachines[0].layers[0].transitions[0].from, { kind: 'machineState', id: 'm10_state_b' });
assert.deepEqual(store.document.stateMachines[0].layers[0].transitions[0].to, { kind: 'machineState', id: 'm10_state' });

const player = createVeyraPlayer(document, { timelineId: 'm10_timeline', loop: 'none' });
player.seek(0.5);
assert.equal(Math.round(player.evaluate().nodes.find((candidate) => candidate.id === 'm10_node').transform.x), 60);
const frames = [];
player.on('frame', (event) => frames.push(event.frame));
player.advance(0.25);
assert.equal(frames.length, 1);
assert.ok(player.snapshot().duration > 0);

const lottie = {
  v: '5.7.0', fr: 30, ip: 0, op: 30, w: 320, h: 180, nm: 'M10 Lottie',
  layers: [
    { ind: 1, ty: 4, nm: 'Card', ks: { p: { a: 0, k: [20, 20, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [120, 80] }, r: { a: 0, k: 8 } }, { ty: 'fl', c: { a: 0, k: [0.1, 0.8, 0.9, 1] } }] },
    { ind: 2, ty: 5, nm: 'Title', t: { d: { k: [{ s: { t: 'Hello', f: 'Inter', s: 18, fc: [1, 1, 1, 1] } }] } }, ks: { p: { a: 0, k: [20, 120, 0] } } },
  ], markers: [{ tm: 0, dr: 1, cm: 'intro' }],
};
const imported = importLottie(lottie);
assert.equal(imported.document.version, 5);
assert.equal(imported.document.featureVersion, 8);
assert.equal(imported.document.events.length, 1);
assert.ok(imported.document.texts.length >= 1);
const markerPlayer = createVeyraPlayer(imported.document, { timelineId: 'timeline_lottie_main', loop: 'none' });
const markerEvents = [];
markerPlayer.on('marker', (event) => markerEvents.push(event.marker));
markerPlayer.advance(0.1);
assert.deepEqual(markerEvents, ['intro'], 'timeline markers are emitted by the deterministic player');
const exported = exportLottie(imported.document);
assert.ok(exported.layers.some((layer) => layer.ty === 5));
assert.ok(exported.layers.some((layer) => layer.shapes?.some((shape) => shape.ty === 'st')), 'solid strokes round-trip as Lottie stroke shapes');
const packaged = exportDotLottie(imported.document);
assert.ok(packaged.manifest.activeAnimationId);
assert.ok(importDotLottie(packaged).document.nodes.length > 0);
assert.ok(importDotLottie(exportDotLottie(imported.document, { as: 'string' })).document.nodes.length > 0, 'string dotLottie packages retain object animation members');
const bezierLottie = importLottie({ v: '5.7.0', fr: 30, ip: 0, op: 10, w: 100, h: 100, layers: [{ ind: 1, ty: 4, nm: 'Path', shapes: [{ ty: 'sh', ks: { a: 0, k: { c: false, v: [[0, 0], [20, 0]], i: [[0, 0], [-4, 2]], o: [[4, -2], [0, 0]] } } }] }] });
assert.deepEqual(bezierLottie.document.nodes.find((item) => item.type === 'path').geometry.vertices[1].inX, -4, 'Lottie tangent offsets stay relative to their vertex');
const rendered = renderSvgString(evaluateDocument(imported.document));
assert.match(rendered, /<text /);

console.log('Veyra M10 feature graph/player/Lottie tests passed');
