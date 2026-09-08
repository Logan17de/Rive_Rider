import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDocument,
  createKeyframe,
  createMachineInput,
  createMachineState,
  createMachineTransition,
  createNode,
  createPointerListener,
  createStateMachine,
  createTimeline,
  createTrack,
  normalizeDocument,
} from '../src/veyra/model.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra, parseVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { hitTestPoint, VEYRA_HIT_TEST_TOLERANCE_PX } from '../src/veyra/hitTest.js';
import { createListenerResolver } from '../src/veyra/listenersRuntime.js';
import { createMachineInteractionBridge } from '../src/veyra/interactionHost.js';
import { createInteractionDispatcher } from '../src/veyra/interactionTransport.js';
import { getDependencyGraph } from '../src/veyra/dependencyGraph.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { isPreviewPointerEligible } from '../src/veyra/shellBridge.js';

const VIEWPORT = Object.freeze({ width: 960, height: 640, centerX: 480, centerY: 320, zoom: 1 });
const ADDRESS = 'node:animated/transform/x';

function goldenFixture({ names = false } = {}) {
  const button = createNode('rectangle', {
    id: 'button', name: names ? 'totally-not-a-button' : 'Button',
    transform: { x: 100, y: 100 }, geometry: { width: 120, height: 80, cornerRadius: 12 },
  });
  const overlap = createNode('ellipse', {
    id: 'overlap', name: names ? 'banana' : 'Overlay',
    transform: { x: 100, y: 100 }, geometry: { width: 60, height: 60 },
    pointerEvents: 'pass-through',
  });
  const animated = createNode('rectangle', {
    id: 'animated', name: names ? 'wrong-name' : 'Animated',
    transform: { x: 20, y: 250 }, geometry: { width: 50, height: 50 },
  });
  const openPath = createNode('path', {
    id: 'open_path', name: names ? 'rectangle?' : 'Open triangle',
    transform: { x: 300, y: 120 },
    geometry: {
      closed: false,
      vertices: [
        { id: 'pv1', x: -60, y: -50, inX: 0, inY: 0, outX: 20, outY: 0 },
        { id: 'pv2', x: 60, y: -50, inX: -20, inY: 0, outX: 0, outY: 25 },
        { id: 'pv3', x: 0, y: 60, inX: 0, inY: -25, outX: 0, outY: 0 },
      ],
    },
    paint: { fill: { type: 'solid', color: '#ec4899' }, stroke: '#2c1830', strokeWidth: 4 },
  });
  const idle = createTimeline({
    id: 'idle_tl', name: names ? 'run-fast' : 'Idle', duration: 60, fps: 60,
    tracks: [createTrack(ADDRESS, { id: 'idle_track', keyframes: [createKeyframe({ id: 'idle_k', frame: 0, value: 20 })] })],
  });
  const active = createTimeline({
    id: 'active_tl', name: names ? 'idle-looking' : 'Active', duration: 60, fps: 60,
    tracks: [createTrack(ADDRESS, { id: 'active_track', keyframes: [createKeyframe({ id: 'active_k', frame: 0, value: 200 })] })],
  });
  const done = createTimeline({
    id: 'done_tl', name: names ? 'other' : 'Done', duration: 60, fps: 60,
    tracks: [createTrack(ADDRESS, { id: 'done_track', keyframes: [createKeyframe({ id: 'done_k', frame: 0, value: 320 })] })],
  });
  const enabled = createMachineInput({ id: 'enabled', name: names ? 'banana_bool' : 'Enabled', type: 'bool', value: false });
  const pulse = createMachineInput({ id: 'pulse', name: names ? 'banana_trigger' : 'Pulse', type: 'trigger' });
  const idleState = createMachineState({ id: 'idle_state', name: names ? 'X' : 'Idle state', timeline: idle.id });
  const activeState = createMachineState({ id: 'active_state', name: names ? 'Y' : 'Active state', timeline: active.id });
  const doneState = createMachineState({ id: 'done_state', name: names ? 'Z' : 'Done state', timeline: done.id });
  const machine = createStateMachine({
    id: 'machine', name: names ? 'not-machine' : 'Machine', initial: { kind: 'machineState', id: idleState.id },
    inputs: [enabled, pulse], states: [idleState, activeState, doneState],
    transitions: [
      createMachineTransition({
        id: 'go_transition', from: idleState.id, to: activeState.id, duration: 0,
        conditions: [{ id: 'go_cond', input: enabled.id, op: '==', value: true }],
      }),
      createMachineTransition({
        id: 'pulse_transition', from: activeState.id, to: doneState.id, duration: 0,
        conditions: [{ id: 'pulse_cond', input: pulse.id, op: 'fired' }],
      }),
    ],
  });
  const listeners = [
    createPointerListener({
      id: 'set_enabled', target: button.id, event: 'pointerdown', action: 'setInput',
      machine: machine.id, input: enabled.id, value: true,
    }),
    createPointerListener({
      id: 'fire_pulse', target: button.id, event: 'click', action: 'fire',
      machine: machine.id, input: pulse.id,
    }),
  ];
  return normalizeDocument(createDocument({
    id: 'm4_fixture', name: names ? 'misleading doc' : 'M4 fixture',
    nodes: [animated, button, overlap, openPath],
    timelines: [idle, active, done], stateMachines: [machine], listeners,
  }));
}

function runtimeLoop(document) {
  const store = new VeyraStore(document);
  const bridge = createMachineInteractionBridge({ getDocument: () => store.document, interactionStepSeconds: 1 / 60 });
  const diagnostics = [];
  const dispatcher = createInteractionDispatcher({
    transport: {
      hasTimeline: (id) => store.document.timelines.some((timeline) => timeline.id === id),
      setActiveTimeline: () => {}, play: () => {}, stop: () => {}, seek: () => {},
    },
    runtime: bridge,
    onDiagnostic: (_message, detail) => diagnostics.push(detail),
  });
  const resolver = createListenerResolver({ document: store.document, viewport: VIEWPORT });
  const scene = () => evaluateDocument(store.document, { animation: bridge.evaluateAll().overrides });
  const dispatchEvent = (event) => {
    const resolved = resolver.resolve(event, scene(), 1);
    const outcomes = [...resolved.transitions.map((entry) => entry.intent), ...resolved.intents].map((intent) => dispatcher.dispatch(intent));
    return { resolved, outcomes, scene: scene() };
  };
  return { store, bridge, dispatcher, resolver, diagnostics, dispatchEvent, scene };
}

// 1. Canonical listener CRUD: preview/dispatch deterministic, provenance, undo/redo/remove.
{
  const document = goldenFixture();
  const store = new VeyraStore({ ...document, listeners: [] });
  const plane = createVeyraControlPlane(store);
  const command = {
    action: 'addListener',
    args: { overrides: { kind: 'pointer', event: 'pointerdown', target: { kind: 'node', id: 'button' }, action: 'play', timeline: { kind: 'timeline', id: 'idle_tl' } } },
    command: { label: 'AI add listener', source: 'ai', metadata: { test: 'm4' } },
  };
  const before = serializeVeyra(store.document);
  const preview = plane.previewCommand(command);
  assert.equal(preview.ok, true);
  assert.equal(serializeVeyra(store.document), before, 'listener preview is side-effect free');
  const predicted = preview.changes.added.find((ref) => ref.kind === 'listener');
  assert.ok(predicted, 'listener preview reports stable created ref');
  const dispatch = plane.dispatchCommand(command);
  assert.equal(dispatch.ok, true);
  assert.equal(dispatch.result, predicted.id, 'preview and dispatch share the same listener id');
  assert.equal(store.commandHistory.at(-1).source, 'ai');
  assert.equal(store.commandHistory.at(-1).label, 'AI add listener');
  assert.deepEqual(store.commandHistory.at(-1).metadata, { test: 'm4' });
  const update = plane.dispatchCommand({
    action: 'updateListener', args: { listenerId: predicted.id, changes: { event: 'click' } },
    command: { label: 'Change listener', source: 'script' },
  });
  assert.equal(update.ok, true);
  assert.equal(store.document.listeners[0].event, 'click');
  assert.equal(store.undo(), true);
  assert.equal(store.document.listeners[0].event, 'pointerdown');
  assert.equal(store.redo(), true);
  assert.equal(store.document.listeners[0].event, 'click');
  const removePreview = plane.previewCommand({ action: 'removeListener', args: { listenerId: predicted.id }, command: { label: 'Preview remove', source: 'ai' } });
  assert.equal(removePreview.ok, true);
  assert.equal(store.document.listeners.length, 1);
  assert.equal(plane.dispatchCommand({ action: 'removeListener', args: { listenerId: predicted.id }, command: { label: 'Remove listener', source: 'ai' } }).ok, true);
  assert.equal(store.document.listeners.length, 0);
}

// 2-3. Stable refs survive hostile names/save-load; invalid listener topology fails before commit.
{
  const renamed = goldenFixture({ names: true });
  const roundTrip = parseVeyra(serializeVeyra(renamed));
  assert.deepEqual(roundTrip.listeners, renamed.listeners);
  assert.deepEqual(roundTrip.listeners[0].machine, { kind: 'stateMachine', id: 'machine' });
  const store = new VeyraStore(renamed);
  const plane = createVeyraControlPlane(store);
  const before = serializeVeyra(store.document);
  const history = JSON.stringify(store.commandHistory);
  const invalid = plane.dispatchCommand({
    action: 'addListener',
    args: { overrides: { kind: 'pointer', event: 'pointerdown', target: { kind: 'node', id: 'missing' }, action: 'play', timeline: { kind: 'timeline', id: 'idle_tl' } } },
    command: { label: 'Bad listener', source: 'ai' },
  });
  assert.equal(invalid.ok, false);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(JSON.stringify(store.commandHistory), history);
  assert.throws(() => normalizeDocument({ ...renamed, listeners: [{ ...renamed.listeners[0], action: 'fire', input: { kind: 'machineInput', id: 'enabled' } }] }), /trigger input/);
}

// 4-6. Exact path geometry, implicit fill closure, and non-scaling stroke tolerance under transforms.
{
  const document = goldenFixture();
  const scene = evaluateDocument(document);
  assert.equal(hitTestPoint({ x: 345, y: 155 }, scene, VIEWPORT), null, 'point inside path bounds but outside rendered triangle does not hit');
  assert.deepEqual(hitTestPoint({ x: 300, y: 120 }, scene, VIEWPORT), { kind: 'node', id: 'open_path' }, 'filled open path uses implicit SVG fill closure');

  const strokePath = createNode('path', {
    id: 'stroke_path', transform: { x: 500, y: 150, rotation: Math.PI / 2, scaleX: 3, scaleY: 2 },
    geometry: { closed: false, vertices: [
      { id: 's1', x: -40, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
      { id: 's2', x: 40, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
    ] },
    paint: { fill: { type: 'solid', color: 'none' }, stroke: '#000000', strokeWidth: 10 },
  });
  const strokeDoc = normalizeDocument(createDocument({ nodes: [strokePath] }));
  const strokeScene = evaluateDocument(strokeDoc);
  assert.deepEqual(hitTestPoint({ x: 504.9, y: 150 }, strokeScene, VIEWPORT), { kind: 'node', id: 'stroke_path' });
  assert.equal(hitTestPoint({ x: 506, y: 150 }, strokeScene, VIEWPORT), null);
  assert.equal(VEYRA_HIT_TEST_TOLERANCE_PX, 0.35);
}

// 7-8. Opacity is independent; hidden/none/pass-through and ancestor participation are explicit.
{
  const transparent = createNode('rectangle', { id: 'transparent', opacity: 0, transform: { x: 100, y: 100 }, geometry: { width: 100, height: 100 } });
  const under = createNode('rectangle', { id: 'under', transform: { x: 100, y: 100 }, geometry: { width: 120, height: 120 } });
  let doc = normalizeDocument(createDocument({ nodes: [under, transparent] }));
  assert.deepEqual(hitTestPoint({ x: 100, y: 100 }, evaluateDocument(doc), VIEWPORT), { kind: 'node', id: 'transparent' });
  doc = normalizeDocument({ ...doc, nodes: doc.nodes.map((node) => node.id === 'transparent' ? { ...node, pointerEvents: 'pass-through' } : node) });
  assert.deepEqual(hitTestPoint({ x: 100, y: 100 }, evaluateDocument(doc), VIEWPORT), { kind: 'node', id: 'under' });
  const parent = createNode('group', { id: 'parent', visible: false });
  const child = createNode('rectangle', { id: 'child', parent: 'parent', transform: { x: 100, y: 100 }, geometry: { width: 100, height: 100 } });
  const hiddenDoc = normalizeDocument(createDocument({ nodes: [parent, child] }));
  assert.equal(hitTestPoint({ x: 100, y: 100 }, evaluateDocument(hiddenDoc), VIEWPORT), null);
  const noneParent = normalizeDocument(createDocument({ nodes: [{ ...parent, visible: true, pointerEvents: 'none' }, child] }));
  assert.equal(hitTestPoint({ x: 100, y: 100 }, evaluateDocument(noneParent), VIEWPORT), null);
}

// 9-10. Enter/leave/down/up/click ordering and top draw-order target are deterministic.
{
  const top = createNode('rectangle', { id: 'top', transform: { x: 100, y: 100 }, geometry: { width: 60, height: 60 } });
  const bottom = createNode('rectangle', { id: 'bottom', transform: { x: 100, y: 100 }, geometry: { width: 120, height: 120 } });
  const timeline = createTimeline({ id: 'tl' });
  const listeners = [
    ['enter', 'pointerenter'], ['leave', 'pointerleave'], ['down', 'pointerdown'], ['up', 'pointerup'], ['click', 'click'],
  ].map(([id, event]) => createPointerListener({ id, target: 'top', event, action: 'play', timeline: 'tl' }));
  const doc = normalizeDocument(createDocument({ nodes: [bottom, top], timelines: [timeline], listeners }));
  const resolver = createListenerResolver({ document: doc, viewport: VIEWPORT });
  const scene = evaluateDocument(doc);
  const enter = resolver.resolve({ type: 'pointermove', x: 100, y: 100, pointerId: 1 }, scene, 1);
  assert.equal(enter.hit.id, 'top');
  assert.deepEqual(enter.transitions.map((item) => item.phase), ['enter']);
  const down = resolver.resolve({ type: 'pointerdown', x: 100, y: 100, pointerId: 1 }, scene, 1);
  assert.equal(down.intents.length, 1);
  resolver.resolve({ type: 'pointermove', x: 105, y: 105, pointerId: 1 }, scene, 1);
  const up = resolver.resolve({ type: 'pointerup', x: 100, y: 100, pointerId: 1 }, scene, 1);
  assert.equal(up.clickQualified, true);
  assert.deepEqual(up.intents.map((intent) => intent.op), ['play', 'play'], 'pointerup intent precedes synthesized click intent');
  const leave = resolver.resolve({ type: 'pointermove', x: 900, y: 600, pointerId: 1 }, scene, 1);
  assert.deepEqual(leave.transitions.map((item) => item.phase), ['leave']);
  resolver.resolve({ type: 'pointerdown', x: 100, y: 100, pointerId: 2 }, scene, 1);
  const movedUp = resolver.resolve({ type: 'pointerup', x: 140, y: 100, pointerId: 2 }, scene, 1);
  assert.equal(movedUp.clickQualified, false, 'up on a different evaluated target does not click');
}

// 11-15. Machine setInput/fire execute against one persistent runtime, drive evaluated render, and never author state.
for (const names of [false, true]) {
  const document = goldenFixture({ names });
  const loop = runtimeLoop(parseVeyra(serializeVeyra(document)));
  const beforeSerialized = serializeVeyra(loop.store.document);
  const beforeHistory = JSON.stringify(loop.store.commandHistory);
  const initialRuntimeCount = loop.bridge.runtimeCount;
  const down = loop.dispatchEvent({ type: 'pointerdown', x: 100, y: 100, pointerId: 7 });
  assert.equal(down.outcomes.length, 1);
  assert.equal(down.outcomes[0].runtimeApplied, true);
  assert.equal(loop.bridge.runtimeCount, initialRuntimeCount + 1, 'first listener interaction creates one persistent runtime');
  assert.equal(down.outcomes[0].evaluation.stateId, 'active_state');
  assert.equal(down.scene.nodes.find((node) => node.id === 'animated').transform.x, 200, 'machine state timeline affects evaluated visible property');
  loop.dispatchEvent({ type: 'pointermove', x: 120, y: 100, pointerId: 7 });
  const up = loop.dispatchEvent({ type: 'pointerup', x: 100, y: 100, pointerId: 7 });
  assert.equal(up.resolved.clickQualified, true);
  assert.equal(up.outcomes.length, 1, 'click listener executes exactly once when pointerup has no direct listener');
  assert.equal(up.outcomes[0].evaluation.stateId, 'done_state');
  assert.equal(up.outcomes[0].evaluation.inputs.find((input) => input.id === 'pulse').value, false, 'trigger is consumed exactly once by runtime step');
  assert.equal(up.scene.nodes.find((node) => node.id === 'animated').transform.x, 320);
  assert.equal(loop.bridge.runtimeCount, 1, 'same machine reuses the same runtime instance');
  assert.equal(serializeVeyra(loop.store.document), beforeSerialized, 'runtime interaction never mutates authored serialization');
  assert.equal(JSON.stringify(loop.store.commandHistory), beforeHistory, 'runtime interaction never writes Store history');
  assert.equal(loop.diagnostics.length, 0);
}

// Structured runtime diagnostics and stale-machine invalidation.
{
  const document = goldenFixture();
  const store = new VeyraStore(document);
  const bridge = createMachineInteractionBridge({ getDocument: () => store.document });
  const missing = bridge.dispatch({ kind: 'runtime', op: 'setInput', machineId: 'missing', inputId: 'enabled', value: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-machine');
  bridge.runtimeFor('machine');
  assert.equal(bridge.runtimeCount, 1);
  store.removeStateMachine('machine', { label: 'Delete machine', source: 'user' });
  bridge.prune();
  assert.equal(bridge.runtimeCount, 0);
}

// 16. Runtime preview is isolated from authoring tools/pan gestures.
{
  assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'select', preview: true }), true);
  assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'pencil', preview: true }), false);
  assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'vertex', preview: true }), false);
  assert.equal(isPreviewPointerEligible({ event: { isPrimary: true, button: 0 }, tool: 'select', preview: true, panGesture: true }), false);
}

// 17. Timeline listener transport play/stop/seek remains deterministic.
{
  const calls = [];
  const dispatcher = createInteractionDispatcher({ transport: {
    hasTimeline: (id) => id === 'tl',
    setActiveTimeline: (id) => calls.push(['active', id]),
    play: (options) => calls.push(['play', options.restart]),
    stop: () => calls.push(['stop']),
    seek: (frame) => calls.push(['seek', frame]),
  } });
  assert.equal(dispatcher.dispatch({ kind: 'transport', op: 'play', timelineId: 'tl' }).transportApplied, true);
  assert.equal(dispatcher.dispatch({ kind: 'transport', op: 'seek', timelineId: 'tl', value: 12 }).transportApplied, true);
  assert.equal(dispatcher.dispatch({ kind: 'transport', op: 'stop', timelineId: 'tl' }).transportApplied, true);
  assert.deepEqual(calls, [['active', 'tl'], ['play', true], ['active', 'tl'], ['seek', 12], ['active', 'tl'], ['stop']]);
}

// 18. Manifest/dependency/read/preview and minimal human UI are all on canonical surfaces.
{
  const document = goldenFixture();
  const manifest = createProjectManifest(document);
  assert.equal(manifest.document.counts.listeners, 2);
  assert.equal(manifest.authoring.listener.variants.machine.hostAvailability, 'available');
  assert.ok(manifest.capabilities.includes('interaction.listener-crud'));
  for (const command of ['addListener', 'updateListener', 'removeListener']) {
    assert.ok(manifest.actions.some((action) => action.command === command));
  }
  const graph = getDependencyGraph(document, { kind: 'listener', id: 'set_enabled' }, { depth: 1, maxNodes: 50, maxEdges: 100 });
  assert.equal(graph.status, 'ok');
  assert.ok(graph.edges.some((edge) => edge.type === 'runtimeUses' && edge.from.ref?.id === 'set_enabled' && edge.to.ref?.id === 'button'));
  assert.ok(graph.edges.some((edge) => edge.type === 'runtimeUses' && edge.to.ref?.id === 'machine'));
  assert.ok(graph.edges.some((edge) => edge.type === 'usedBy' && edge.to.ref?.id === 'set_enabled'));
  const plane = createVeyraControlPlane(new VeyraStore(document));
  const read = plane.read({ kind: 'listener', id: 'set_enabled' }, { includeDependencies: true });
  assert.equal(read.status, 'ok');
  assert.equal(read.ref.id, 'set_enabled');
  assert.ok(read.dependencySummary.edgeCount > 0);

  const source = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(source, /function appendListenerInspector\(node\)/);
  assert.match(source, /listenerCommand\('addListener'/);
  assert.match(source, /listenerCommand\('updateListener'/);
  assert.match(source, /listenerCommand\('removeListener'/);
  assert.match(source, /field\('Pointer events'/);
  assert.match(source, /createMachineInteractionBridge/);
}

console.log('veyra M4 current interaction loop tests passed');
