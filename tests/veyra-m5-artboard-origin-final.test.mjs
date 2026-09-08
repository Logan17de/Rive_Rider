import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { createArtboardResizeGesture, VEYRA_ARTBOARD_RESIZE_DIRECTIONS } from '../src/veyra/gestures.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import { classifyArtboardResizeZone, fitArtboardViewport } from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-9, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}

const baseFrame = { x: 0, y: 0, width: 800, height: 600, background: '#fff7fc' };
const camera = Object.freeze({ zoom: 2, centerX: 420, centerY: 310 });
const screen = { width: 1000, height: 700 };
const child = createNode('rectangle', {
  id: 'child:stationary', transform: { x: 200, y: 150 }, geometry: { width: 40, height: 30 },
});

function createStore() {
  return new VeyraStore(normalizeDocument(createDocument({ artboard: baseFrame, nodes: [child] })));
}

function resize(direction, dxPx, dyPx) {
  const store = createStore();
  const beforeCamera = { ...camera };
  const beforeChild = JSON.stringify(store.document.nodes[0]);
  const beforeMap = createSvgViewBoxScreenTransform(store.document.artboard, { ...screen, ...camera });
  const beforeScreen = transformPoint(beforeMap.matrix, { x: 200, y: 150 });
  const gesture = createArtboardResizeGesture({
    store,
    start: { x: 100, y: 100 },
    startArtboard: { ...store.document.artboard },
    direction,
    scaleX: 1 / camera.zoom,
    scaleY: 1 / camera.zoom,
  });
  const moved = gesture.move({ clientX: 100 + dxPx, clientY: 100 + dyPx });
  const afterMap = createSvgViewBoxScreenTransform(store.document.artboard, { ...screen, ...camera });
  const afterScreen = transformPoint(afterMap.matrix, { x: 200, y: 150 });
  assert.deepEqual(camera, beforeCamera, `${direction}: camera object is unchanged`);
  assert.equal(JSON.stringify(store.document.nodes[0]), beforeChild, `${direction}: child world data is unchanged`);
  close(afterScreen.x, beforeScreen.x, 1e-9, `${direction}: child CSS x stationary`);
  close(afterScreen.y, beforeScreen.y, 1e-9, `${direction}: child CSS y stationary`);
  return { store, gesture, moved };
}

assert.deepEqual(VEYRA_ARTBOARD_RESIZE_DIRECTIONS, [
  'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);

// 1-7: all eight directions operate on the authored frame, not camera/artwork.
{
  const { store, gesture } = resize('left', 80, 0);
  assert.deepEqual(store.document.artboard, { ...baseFrame, x: 40, width: 760 });
  assert.equal(store.document.artboard.x + store.document.artboard.width, 800);
  gesture.end();
}
{
  const { store, gesture } = resize('top', 0, 60);
  assert.deepEqual(store.document.artboard, { ...baseFrame, y: 30, height: 570 });
  assert.equal(store.document.artboard.y + store.document.artboard.height, 600);
  gesture.end();
}
const expected = {
  right: { x: 0, y: 0, width: 840, height: 600 },
  bottom: { x: 0, y: 0, width: 800, height: 630 },
  'top-left': { x: 40, y: 30, width: 760, height: 570 },
  'top-right': { x: 0, y: 30, width: 840, height: 570 },
  'bottom-left': { x: 40, y: 0, width: 760, height: 630 },
  'bottom-right': { x: 0, y: 0, width: 840, height: 630 },
};
for (const direction of Object.keys(expected)) {
  const { store, gesture } = resize(direction, 80, 60);
  const { background, ...frame } = store.document.artboard;
  assert.deepEqual(frame, expected[direction], `${direction}: composed frame semantics`);
  if (direction === 'right' || direction === 'bottom' || direction === 'bottom-right') {
    assert.equal(store.document.artboard.x, 0);
    assert.equal(store.document.artboard.y, 0);
  }
  gesture.end();
}

// 8-9: legacy migration and non-zero origin persistence.
{
  const legacy = JSON.stringify({
    format: 'veyra', version: 3, id: 'legacy', name: 'Legacy',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    artboard: { width: 320, height: 240, background: '#ffffff' }, nodes: [],
  });
  const migrated = parseVeyra(legacy);
  assert.equal(migrated.artboard.x, 0);
  assert.equal(migrated.artboard.y, 0);
}
{
  const { store, gesture } = resize('top-left', 80, 60);
  gesture.end();
  const edgesBefore = {
    left: store.document.artboard.x,
    top: store.document.artboard.y,
    right: store.document.artboard.x + store.document.artboard.width,
    bottom: store.document.artboard.y + store.document.artboard.height,
  };
  const saved = serializeVeyra(store.document);
  assert.match(saved, /"x": 40/);
  assert.match(saved, /"y": 30/);
  const reloaded = parseVeyra(saved);
  assert.deepEqual({
    left: reloaded.artboard.x,
    top: reloaded.artboard.y,
    right: reloaded.artboard.x + reloaded.artboard.width,
    bottom: reloaded.artboard.y + reloaded.artboard.height,
  }, edgesBefore);
  assert.equal(reloaded.nodes[0].transform.x, 200);
  assert.equal(reloaded.nodes[0].transform.y, 150);
}

// 10: one committed resize is one history entry; undo/redo restore exact frame.
{
  const store = createStore();
  const before = { ...store.document.artboard };
  const history = store.commandHistory.length;
  const gesture = createArtboardResizeGesture({
    store, start: { x: 0, y: 0 }, startArtboard: { ...store.document.artboard }, direction: 'top-left', scaleX: 0.5, scaleY: 0.5,
  });
  gesture.move({ clientX: 40, clientY: 30 });
  const after = { ...store.document.artboard };
  gesture.end();
  assert.equal(store.commandHistory.length, history + 1);
  assert.equal(store.undo(), true);
  assert.deepEqual(store.document.artboard, before);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.document.artboard, after);
}

// 11-12: cancel exact serialization and sub-threshold click no-op.
{
  const store = createStore();
  const before = serializeVeyra(store.document);
  const gesture = createArtboardResizeGesture({ store, start: { x: 0, y: 0 }, startArtboard: { ...store.document.artboard }, direction: 'left' });
  gesture.move({ clientX: 30, clientY: 0 });
  assert.notEqual(serializeVeyra(store.document), before);
  gesture.cancel();
  assert.equal(serializeVeyra(store.document), before);
  assert.deepEqual(camera, { zoom: 2, centerX: 420, centerY: 310 });
}
{
  const store = createStore();
  const before = serializeVeyra(store.document);
  const history = store.commandHistory.length;
  const gesture = createArtboardResizeGesture({ store, start: { x: 10, y: 10 }, startArtboard: { ...store.document.artboard }, direction: 'left' });
  assert.equal(gesture.move({ clientX: 11, clientY: 11 }).started, false);
  assert.equal(gesture.end().committed, false);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.commandHistory.length, history);
}

// 13: the 7px classification contract remains screen-space and zoom-independent.
const rect = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };
for (const zoom of [0.1, 1, 8]) {
  void zoom;
  assert.equal(classifyArtboardResizeZone({ x: 103, y: 350 }, rect), 'left');
  assert.equal(classifyArtboardResizeZone({ x: 897, y: 54 }, rect), 'top-right');
}

// 14-15: renderer-equivalent screen transform/hit-test parity survives origin + panel resize.
{
  const model = normalizeDocument(createDocument({
    artboard: { x: 40, y: 30, width: 760, height: 570 },
    nodes: [child],
  }));
  for (const viewportSize of [{ width: 1000, height: 700 }, { width: 620, height: 910 }]) {
    const viewport = { ...viewportSize, ...camera };
    const map = createSvgViewBoxScreenTransform(model.artboard, viewport);
    close(map.scale, camera.zoom);
    const point = transformPoint(map.matrix, { x: 200, y: 150 });
    assert.deepEqual(hitTestPoint(point, model, viewport), { kind: 'node', id: child.id });
    assert.deepEqual(camera, { zoom: 2, centerX: 420, centerY: 310 });
  }
}

// 16: Fit Artboard centers a non-zero-origin frame.
{
  const frame = { x: 125, y: -60, width: 500, height: 300 };
  const fit = fitArtboardViewport(frame, { width: 1000, height: 800 }, { padding: 50 });
  assert.equal(fit.centerX, 375);
  assert.equal(fit.centerY, 90);
  assert.ok(fit.zoom > 0);
}

// Export must use the persisted frame as its SVG viewBox and background bounds.
{
  const model = normalizeDocument(createDocument({ artboard: { x: 40, y: 30, width: 760, height: 570 }, nodes: [child] }));
  const svg = renderSvgString(evaluateDocument(model));
  assert.match(svg, /viewBox="40 30 760 570"/);
  assert.match(svg, /<rect x="40" y="30" width="760" height="570"/);
}

// 17 + browser contract: no permanent artboard handles and no camera anchor-shift workaround.
const browser = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../veyra.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /class="artboardHandle"/);
assert.doesNotMatch(browser, /anchorShiftX|anchorShiftY/);
assert.match(browser, /renderer\.worldToClient\(artboardX, artboardY\)/);
assert.match(browser, /const startArtboard = \{/);
assert.match(browser, /x: Number\(store\.document\.artboard\.x \|\| 0\)/);

console.log('veyra M5 final artboard-origin correction tests passed');
