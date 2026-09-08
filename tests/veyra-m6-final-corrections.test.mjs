import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, createStateMachine, createTimeline, normalizeDocument } from '../src/veyra/model.js';
import { createArtboardRef, createComponentRef, createTimelineRef } from '../src/veyra/references.js';
import { projectGraphCapabilities } from '../src/veyra/projectGraph.js';
import { createComponentRuntimeRegistry, createComponentRuntimeScope, componentRuntimeScopeKey } from '../src/veyra/components.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  compensateViewportForClientRect,
  fitBoundsViewport,
  shouldShowDetailedRigOverlay,
} from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-7, label = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: expected ${expected}, got ${actual}`);
}

function absoluteClient(world, artboard, viewport, rect) {
  const mapping = createSvgViewBoxScreenTransform(artboard, {
    width: rect.width, height: rect.height,
    zoom: viewport.zoom, centerX: viewport.centerX, centerY: viewport.centerY,
  });
  const local = transformPoint(mapping.matrix, world);
  return { x: rect.left + local.x, y: rect.top + local.y };
}

// Blocker 4A: panel chrome changes viewport client rectangles without moving a
// chosen world point on the monitor. Zoom is invariant and compensation is
// algebraic from one baseline, so splitter motion cannot accumulate drift.
{
  const artboard = { x: 0, y: 0, width: 1000, height: 700 };
  const viewport = { zoom: 1.75, centerX: 480, centerY: 330 };
  const world = { x: 410, y: 270 };
  const initial = { left: 250, top: 72, width: 900, height: 620 };
  const cases = [
    { left: 390, top: 72, width: 760, height: 620 },   // left panel wider
    { left: 250, top: 72, width: 760, height: 620 },   // right panel wider
    { left: 250, top: 72, width: 900, height: 470 },   // bottom panel taller
  ];
  const expected = absoluteClient(world, artboard, viewport, initial);
  for (const rect of cases) {
    const next = compensateViewportForClientRect(viewport, initial, rect);
    assert.equal(next.zoom, viewport.zoom);
    const actual = absoluteClient(world, artboard, next, rect);
    close(actual.x, expected.x, 1e-7, 'absolute client x');
    close(actual.y, expected.y, 1e-7, 'absolute client y');
  }

  const collapsed = { left: 0, top: 72, width: 1150, height: 620 };
  const collapsedView = compensateViewportForClientRect(viewport, initial, collapsed);
  const restored = compensateViewportForClientRect(collapsedView, collapsed, initial);
  close(restored.centerX, viewport.centerX, 1e-9, 'collapse roundtrip centerX');
  close(restored.centerY, viewport.centerY, 1e-9, 'collapse roundtrip centerY');
  assert.equal(restored.zoom, viewport.zoom);

  const sequence = [
    { left: 300, top: 72, width: 850, height: 620 },
    { left: 300, top: 72, width: 720, height: 620 },
    { left: 300, top: 72, width: 720, height: 440 },
    { left: 250, top: 72, width: 900, height: 620 },
  ];
  let currentView = viewport;
  let currentRect = initial;
  for (const rect of sequence) {
    currentView = compensateViewportForClientRect(currentView, currentRect, rect);
    currentRect = rect;
    assert.equal(currentView.zoom, viewport.zoom);
  }
  close(currentView.centerX, viewport.centerX, 1e-9, 'arbitrary sequence centerX');
  close(currentView.centerY, viewport.centerY, 1e-9, 'arbitrary sequence centerY');

  const node = createNode('rectangle', { id: 'anchored-hit', transform: { x: world.x, y: world.y }, geometry: { width: 80, height: 60 } });
  const doc = normalizeDocument(createDocument({ artboard, nodes: [node] }));
  const scene = evaluateDocument(doc);
  const finalRect = cases[0];
  const finalView = compensateViewportForClientRect(viewport, initial, finalRect);
  const mapping = createSvgViewBoxScreenTransform(artboard, { ...finalView, width: finalRect.width, height: finalRect.height });
  const local = transformPoint(mapping.matrix, world);
  assert.deepEqual(hitTestPoint(local, scene, { ...finalView, width: finalRect.width, height: finalRect.height }), { kind: 'node', id: 'anchored-hit' });
  const focused = fitBoundsViewport({ minX: 370, minY: 240, maxX: 450, maxY: 300 }, artboard, { width: finalRect.width, height: finalRect.height }, { padding: 44 });
  assert.ok(Number.isFinite(focused.centerX) && Number.isFinite(focused.centerY) && focused.zoom > 0);

  const store = new VeyraStore(doc);
  const beforeText = serializeVeyra(store.document);
  const beforeRevision = store.revision;
  const beforeHistory = store.commandHistory.length;
  compensateViewportForClientRect(viewport, initial, cases[1]);
  assert.equal(serializeVeyra(store.document), beforeText);
  assert.equal(store.revision, beforeRevision);
  assert.equal(store.commandHistory.length, beforeHistory);
}

// Blocker 4B: authored stroke width naturally follows the canonical camera
// scale; renderer/export do not opt authored content into non-scaling strokes.
{
  const artboard = { x: 0, y: 0, width: 800, height: 600 };
  const screen = { width: 800, height: 600 };
  for (const [zoom, expected] of [[0.1, 0.4], [0.5, 2], [1, 4], [2, 8]]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, { ...screen, zoom, centerX: 400, centerY: 300 });
    close(4 * mapping.scale, expected, 1e-9, `4-world stroke at zoom ${zoom}`);
  }
  for (const zoom of [0.1, 0.25, 0.5, 1, 2, 4, 8]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, { ...screen, zoom, centerX: 400, centerY: 300 });
    close((4 * mapping.scale) / (100 * mapping.scale), 0.04, 1e-12, `stroke/fill proportion ${zoom}`);
  }
  assert.equal(shouldShowDetailedRigOverlay(0.1), false);
  assert.equal(shouldShowDetailedRigOverlay(0.19), false);
  assert.equal(shouldShowDetailedRigOverlay(0.2), true);
  assert.equal(shouldShowDetailedRigOverlay(8), true);

  const node = createNode('rectangle', { id: 'stroke-node', geometry: { width: 100, height: 50 }, paint: { fill: '#ffffff', stroke: '#000000', strokeWidth: 4 } });
  const scene = evaluateDocument(normalizeDocument(createDocument({ artboard, nodes: [node] })));
  const svg = renderSvgString(scene);
  assert.doesNotMatch(svg, /non-scaling-stroke/, 'SVG export uses authored world-unit stroke semantics');
  const rendererSource = readFileSync(new URL('../src/veyra/renderer.js', import.meta.url), 'utf8');
  const geometrySource = readFileSync(new URL('../src/veyra/geometry.js', import.meta.url), 'utf8');
  assert.doesNotMatch(geometrySource, /non-scaling-stroke/);
  assert.match(rendererSource, /class: 'sceneShape'[\s\S]*?tabindex: '-1'/);
  assert.match(rendererSource, /class: 'meshTriangle'[\s\S]*?'stroke-width': mesh\.paint\.strokeWidth/);
  assert.equal((rendererSource.match(/non-scaling-stroke/g) || []).length, 1, 'only non-authored draft overlay retains non-scaling stroke');
  assert.match(rendererSource, /r: 5 \/ this\.zoom/, 'selection resize handles remain screen-sized/editor-only');
  assert.match(rendererSource, /data-overlay-policy', 'hidden-low-zoom'/);
}

function timeline(id, artboardId, address, from, to) {
  const item = createTimeline({
    id, name: id, duration: 30, fps: 30,
    tracks: [{ id: `${id}-track`, address, keyframes: [
      { id: `${id}-0`, frame: 0, value: from, easing: 'linear' },
      { id: `${id}-30`, frame: 30, value: to, easing: 'linear' },
    ] }],
  });
  item.artboard = createArtboardRef(artboardId);
  return item;
}

function oneStateMachine(id, artboardId, timelineId) {
  const machine = createStateMachine({
    id, name: id, initial: { kind: 'machineState', id: `${id}-state` },
    states: [{ id: `${id}-state`, name: 'State', type: 'animation', timeline: createTimelineRef(timelineId) }],
  });
  machine.artboard = createArtboardRef(artboardId);
  return machine;
}

function nestedRuntimeProject() {
  const node = createNode('rectangle', {
    id: 'inner-node', artboard: createArtboardRef('inner-source'),
    transform: { x: 10, y: 20 }, geometry: { width: 20, height: 20 },
    paint: { fill: '#33aa66', stroke: 'none', strokeWidth: 0 },
  });
  const txA = timeline('tx-a', 'inner-source', 'node:inner-node/transform/x', 10, 20);
  const txB = timeline('tx-b', 'inner-source', 'node:inner-node/transform/x', 100, 200);
  const tyA = timeline('ty-a', 'inner-source', 'node:inner-node/transform/y', 20, 30);
  const tyB = timeline('ty-b', 'inner-source', 'node:inner-node/transform/y', 80, 180);
  const machineA = oneStateMachine('machine-a', 'inner-source', 'ty-a');
  const machineB = oneStateMachine('machine-b', 'inner-source', 'ty-b');
  return normalizeDocument(createDocument({
    id: 'nested-runtime-scope',
    artboards: [
      { id: 'inner-source', name: 'Inner Source', x: 0, y: 0, width: 100, height: 100, background: '#ffffff' },
      { id: 'outer-source', name: 'Outer Source', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 700, height: 300, background: '#eeeeee' },
    ],
    nodes: [node], timelines: [txA, txB, tyA, tyB], stateMachines: [machineA, machineB],
    components: [
      { id: 'inner-component', name: 'Inner', source: createArtboardRef('inner-source') },
      { id: 'outer-component', name: 'Outer', source: createArtboardRef('outer-source') },
    ],
    componentInstances: [
      {
        id: 'inner-instance', name: 'Nested Runtime', artboard: createArtboardRef('outer-source'), component: createComponentRef('inner-component'),
        transform: { x: 20, y: 0 }, frame: { width: 100, height: 100 }, fit: 'none',
        runtime: {
          timeline: createTimelineRef('tx-a'), stateMachine: { kind: 'stateMachine', id: 'machine-a' }, mix: 0.5,
          remap: { timeline: createTimelineRef('tx-b'), stateMachine: { kind: 'stateMachine', id: 'machine-b' } },
        },
      },
      { id: 'outer-A', name: 'Outer A', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 100, y: 40 }, frame: { width: 200, height: 120 }, fit: 'none' },
      { id: 'outer-B', name: 'Outer B', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 350, y: 40 }, frame: { width: 200, height: 120 }, fit: 'none' },
    ],
  }));
}

// Blocker 5: the same authored inner instance has independent runtime buckets
// under two outer evaluated paths. Scope identity is typed, ephemeral and name/
// order invariant.
{
  let doc = nestedRuntimeProject();
  const registry = createComponentRuntimeRegistry(() => doc);
  const scopeA = createComponentRuntimeScope([
    { kind: 'componentInstance', id: 'outer-A' },
    { kind: 'componentInstance', id: 'inner-instance' },
  ]);
  const scopeB = createComponentRuntimeScope([
    { kind: 'componentInstance', id: 'outer-B' },
    { kind: 'componentInstance', id: 'inner-instance' },
  ]);
  assert.notEqual(componentRuntimeScopeKey(scopeA), componentRuntimeScopeKey(scopeB));
  assert.deepEqual(scopeA.path.map((ref) => ref.kind), ['componentInstance', 'componentInstance']);

  registry.setTimelineTime(scopeA, 'tx-a', 1);
  registry.setTimelineTime(scopeB, 'tx-a', 0);
  registry.stepMachine(scopeA, 'machine-a', 1);
  registry.stepMachine(scopeB, 'machine-a', 0);
  const scene = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry });
  const nested = scene.nodes.filter((item) => item.sourceRef?.id === 'inner-node');
  const a = nested.find((item) => componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeA));
  const b = nested.find((item) => componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeB));
  assert.ok(a && b, 'both evaluated nested runtime scopes are visible in the scene');
  close(a.worldMatrix[4] - 100, 125, 1e-7, 'outer A remapped/mixed timeline'); // 20 wrapper + mix(10,200,.5)=105
  close(b.worldMatrix[4] - 350, 75, 1e-7, 'outer B remapped/mixed timeline');   // 20 wrapper + mix(10,100,.5)=55
  close(a.worldMatrix[5] - 40, 100, 1e-7, 'outer A remapped/mixed machine');   // mix(20,180,.5)=100
  close(b.worldMatrix[5] - 40, 50, 1e-7, 'outer B remapped/mixed machine');    // mix(20,80,.5)=50

  assert.equal(doc.nodes.find((item) => item.id === 'inner-node').transform.x, 10);
  assert.equal(doc.nodes.find((item) => item.id === 'inner-node').transform.y, 20);
  assert.equal(registry.evaluate(scopeA).mappings.timeline[0].sourceTimelineId, 'tx-b');
  assert.equal(registry.evaluate(scopeB).mappings.stateMachine[0].sourceMachineId, 'machine-b');

  assert.equal(registry.resetInstance(scopeA), true);
  const resetScene = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry });
  const resetA = resetScene.nodes.find((item) => item.sourceRef?.id === 'inner-node' && componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeA));
  const liveB = resetScene.nodes.find((item) => item.sourceRef?.id === 'inner-node' && componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeB));
  close(resetA.worldMatrix[4] - 100, 75, 1e-7, 'reset A returns only A timeline to default');
  close(liveB.worldMatrix[4] - 350, 75, 1e-7, 'B timeline remains independent');
  close(resetA.worldMatrix[5] - 40, 50, 1e-7, 'reset A machine returns to default');
  close(liveB.worldMatrix[5] - 40, 50, 1e-7, 'B machine remains unchanged');

  // Re-advance A, then rename/reorder authored instances. Stable IDs keep the
  // scoped runtime mapping deterministic.
  registry.setTimelineTime(scopeA, 'tx-a', 1);
  registry.stepMachine(scopeA, 'machine-a', 1);
  const beforeReorder = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry }).nodes
    .filter((item) => item.sourceRef?.id === 'inner-node')
    .map((item) => [componentRuntimeScopeKey(item.componentRuntimeScope), item.worldMatrix[4], item.worldMatrix[5]])
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  doc = normalizeDocument({
    ...JSON.parse(serializeVeyra(doc)),
    componentInstances: JSON.parse(serializeVeyra(doc)).componentInstances
      .map((item) => item.id === 'outer-A' ? { ...item, name: 'banana' } : item.id === 'outer-B' ? { ...item, name: 'Layer' } : item)
      .reverse(),
  });
  const afterReorder = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry }).nodes
    .filter((item) => item.sourceRef?.id === 'inner-node')
    .map((item) => [componentRuntimeScopeKey(item.componentRuntimeScope), item.worldMatrix[4], item.worldMatrix[5]])
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  assert.deepEqual(afterReorder, beforeReorder);

  const serialized = serializeVeyra(doc);
  assert.doesNotMatch(serialized, /componentRuntimeScope|componentEval:/, 'runtime scopes/buckets remain ephemeral');
  assert.deepEqual(parseVeyra(serialized), doc);

  assert.ok(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeA)));
  assert.ok(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeB)));
  assert.equal(registry.deleteInstance('outer-A'), true);
  assert.equal(registry.listRuntimeScopes().some((scope) => scope.path.some((ref) => ref.id === 'outer-A')), false);
  assert.equal(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeB)), true, 'deleting A runtime state preserves B');

  const caps = projectGraphCapabilities();
  assert.equal(caps.runtimeIsolation.evaluatedNested, 'per-component-runtime-scope');
  assert.deepEqual(caps.runtimeIsolation.scope, { kind: 'componentRuntimeScope', pathItemKind: 'componentInstance', persistent: false });
}

// Production source gates: browser panel mutations capture one camera anchor;
// nested browser runtime methods accept the canonical scope object rather than
// introducing a second address scheme.
{
  const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(browserSource, /function captureWorkspaceClientAnchor\(\)/);
  assert.match(browserSource, /compensateViewportForClientRect\(/);
  assert.match(browserSource, /const cameraAnchor = captureWorkspaceClientAnchor\(\);[\s\S]*?applyWorkspaceLayout\(false, cameraAnchor\)/);
  assert.match(browserSource, /createComponentRuntimeScope: \(path\)/);
  assert.match(browserSource, /getComponentRuntime: \(scope\)/);
  assert.match(browserSource, /setComponentTimelineTime: \(scope, timelineId, seconds\)/);
}

console.log('veyra M6 final workspace/stroke/runtime-scope correction tests passed');
