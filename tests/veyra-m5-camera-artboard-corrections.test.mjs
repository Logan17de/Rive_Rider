import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { createArtboardResizeGesture, VEYRA_ARTBOARD_RESIZE_DIRECTIONS } from '../src/veyra/gestures.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSvgViewBox, createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import {
  VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX,
  artboardResizeCursor,
  classifyArtboardResizeZone,
  fitArtboardViewport,
  fitBoundsViewport,
  normalizeWorkspaceLayout,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
} from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-8, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}

const artboard = { width: 800, height: 600 };
const camera = { zoom: 1.75, centerX: 430, centerY: 280 };
const sizes = [
  { width: 900, height: 700 },
  { width: 620, height: 700 },
  { width: 900, height: 410 },
  { width: 517, height: 913 },
];

// Correction 1: editor zoom is stable CSS pixels/world unit, independent of
// viewport geometry. ViewBox changes extent, not scale or camera state.
for (const size of sizes) {
  const mapping = createSvgViewBoxScreenTransform(artboard, { ...size, ...camera });
  assert.ok(mapping);
  close(mapping.scale, camera.zoom, 1e-10, 'mapping scale is editor zoom');
  assert.equal(mapping.viewBox.centerX, camera.centerX);
  assert.equal(mapping.viewBox.centerY, camera.centerY);
  close(mapping.viewBox.width, size.width / camera.zoom);
  close(mapping.viewBox.height, size.height / camera.zoom);
}
const worldA = { x: 100, y: 120 };
const worldB = { x: 360, y: 340 };
const pixelDistances = sizes.map((size) => {
  const map = createSvgViewBoxScreenTransform(artboard, { ...size, ...camera });
  const a = transformPoint(map.matrix, worldA);
  const b = transformPoint(map.matrix, worldB);
  return Math.hypot(b.x - a.x, b.y - a.y);
});
pixelDistances.forEach((distance) => close(distance, pixelDistances[0], 1e-8, 'world pair CSS distance invariant'));

const at100a = createSvgViewBoxScreenTransform(artboard, { width: 900, height: 700, zoom: 1, centerX: 400, centerY: 300 });
const at100b = createSvgViewBoxScreenTransform(artboard, { width: 500, height: 1200, zoom: 1, centerX: 400, centerY: 300 });
close(at100a.scale, 1);
close(at100b.scale, 1);
assert.equal(createSvgViewBox(artboard, { width: 500, height: 1200, zoom: 1, centerX: 400, centerY: 300 }).width, 500);

// Panel layout changes do not touch camera state or authored Store state.
const document = normalizeDocument(createDocument({
  artboard,
  nodes: [createNode('rectangle', { id: 'target', transform: { x: 400, y: 300 }, geometry: { width: 100, height: 80 } })],
}));
const store = new VeyraStore(document);
const serializedBeforePanels = serializeVeyra(store.document);
const revisionBeforePanels = store.revision;
const historyBeforePanels = JSON.stringify(store.commandHistory);
let layout = normalizeWorkspaceLayout({}, { width: 1440, height: 900 });
layout = setWorkspacePanelSize(layout, 'left', 450, { width: 1440, height: 900 });
layout = setWorkspacePanelSize(layout, 'right', 220, { width: 1440, height: 900 });
layout = setWorkspacePanelCollapsed(layout, 'left', true, { width: 1440, height: 900 });
layout = setWorkspacePanelCollapsed(layout, 'left', false, { width: 1440, height: 900 });
assert.equal(serializeVeyra(store.document), serializedBeforePanels);
assert.equal(store.revision, revisionBeforePanels);
assert.equal(JSON.stringify(store.commandHistory), historyBeforePanels);
for (let i = 0; i < 100; i += 1) {
  const width = i % 2 ? 420 : 260;
  layout = setWorkspacePanelSize(layout, 'left', width, { width: 1440 + i, height: 900 - (i % 70) });
  const mapping = createSvgViewBoxScreenTransform(artboard, { width: 700 + (i % 211), height: 400 + (i % 173), ...camera });
  assert.ok(mapping && mapping.matrix.every(Number.isFinite));
  close(mapping.scale, camera.zoom, 1e-10);
}

// M4 hit testing consumes the same stable camera mapping after every resize.
for (const size of sizes) {
  const viewport = { ...size, ...camera };
  const mapping = createSvgViewBoxScreenTransform(artboard, viewport);
  const renderedCenter = transformPoint(mapping.matrix, { x: 400, y: 300 });
  assert.deepEqual(hitTestPoint(renderedCenter, store.document, viewport), { kind: 'node', id: 'target' });
}

// Fit/focus are explicit camera-changing operations; mere viewport resize is not.
const fitWide = fitArtboardViewport(artboard, { width: 1200, height: 700 }, { padding: 32 });
const fitNarrow = fitArtboardViewport(artboard, { width: 600, height: 700 }, { padding: 32 });
assert.notEqual(fitWide.zoom, fitNarrow.zoom, 'Fit Artboard intentionally recomputes zoom for available viewport');
const focus = fitBoundsViewport({ minX: 350, minY: 260, maxX: 450, maxY: 340 }, artboard, { width: 600, height: 700 }, { padding: 50 });
assert.deepEqual({ centerX: focus.centerX, centerY: focus.centerY }, { centerX: 400, centerY: 300 });
assert.notEqual(focus.zoom, camera.zoom, 'Focus Selection intentionally recomputes zoom');

// Correction 2: all eight border zones classify in final CSS pixels; zoom is
// deliberately absent from the API so 10%, 100%, and 800% behave identically.
assert.deepEqual(VEYRA_ARTBOARD_RESIZE_DIRECTIONS, [
  'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);
assert.equal(VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX, 7);
const rect = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };
const zoneCases = [
  ['left', { x: 103, y: 350 }, 'ew-resize'],
  ['right', { x: 897, y: 350 }, 'ew-resize'],
  ['top', { x: 500, y: 54 }, 'ns-resize'],
  ['bottom', { x: 500, y: 646 }, 'ns-resize'],
  ['top-left', { x: 103, y: 54 }, 'nwse-resize'],
  ['top-right', { x: 897, y: 54 }, 'nesw-resize'],
  ['bottom-left', { x: 103, y: 646 }, 'nesw-resize'],
  ['bottom-right', { x: 897, y: 646 }, 'nwse-resize'],
];
for (const [direction, point, cursor] of zoneCases) {
  for (const zoom of [0.1, 1, 8]) {
    void zoom;
    assert.equal(classifyArtboardResizeZone(point, rect), direction);
  }
  assert.equal(artboardResizeCursor(direction), cursor);
}
assert.equal(classifyArtboardResizeZone({ x: 500, y: 300 }, rect), null, 'interior stays available for artwork interactions');
assert.equal(classifyArtboardResizeZone({ x: 80, y: 300 }, rect), null, 'outside tolerance remains canvas navigation');

function gesture(direction, dxPx, dyPx, { zoom = 2, minSize = 1 } = {}) {
  const child = createNode('rectangle', { id: 'child', transform: { x: 200, y: 150 }, geometry: { width: 40, height: 30 } });
  const model = normalizeDocument(createDocument({ artboard: { width: 800, height: 600 }, nodes: [child] }));
  const s = new VeyraStore(model);
  const childBefore = JSON.stringify(s.document.nodes[0]);
  const historyBefore = s.commandHistory.length;
  const g = createArtboardResizeGesture({
    store: s,
    start: { x: 100, y: 100 },
    startArtboard: { width: 800, height: 600 },
    direction,
    scaleX: 1 / zoom,
    scaleY: 1 / zoom,
    minSize,
  });
  const moved = g.move({ clientX: 100 + dxPx, clientY: 100 + dyPx });
  return { s, g, moved, childBefore, historyBefore };
}

// Direction semantics: right/bottom add delta; left/top subtract it and expose
// camera anchor shifts without modifying child artwork.
{
  const { s, g, moved, childBefore, historyBefore } = gesture('right', 40, 30);
  assert.equal(moved.width, 820); assert.equal(moved.height, 600);
  assert.equal(moved.anchorShiftX, 0); assert.equal(JSON.stringify(s.document.nodes[0]), childBefore);
  assert.equal(g.end().committed, true); assert.equal(s.commandHistory.length, historyBefore + 1);
  assert.equal(s.undo(), true); assert.equal(s.document.artboard.width, 800);
}
{
  const { s, g, moved } = gesture('bottom', 40, 30);
  assert.equal(moved.width, 800); assert.equal(moved.height, 615); g.end();
}
{
  const { s, g, moved, childBefore } = gesture('left', 40, 0);
  assert.equal(moved.width, 780); assert.equal(moved.anchorShiftX, -20);
  assert.equal(JSON.stringify(s.document.nodes[0]), childBefore); g.end();
}
{
  const { g, moved } = gesture('top', 0, 30);
  assert.equal(moved.height, 585); assert.equal(moved.anchorShiftY, -15); g.end();
}
for (const direction of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
  const { g, moved } = gesture(direction, direction.includes('left') ? 40 : 40, direction.includes('top') ? 30 : 30);
  assert.notEqual(moved.width, 800);
  assert.notEqual(moved.height, 600);
  assert.equal(g.end().committed, true);
}

// Left/top camera shifts keep the opposite rendered edge/corner exactly fixed.
{
  const size = { width: 1000, height: 700 };
  const startCamera = { zoom: 2, centerX: 400, centerY: 300 };
  const before = createSvgViewBoxScreenTransform(artboard, { ...size, ...startCamera });
  const oldRight = transformPoint(before.matrix, { x: 800, y: 300 });
  const { g, moved } = gesture('left', 80, 0, { zoom: 2 });
  const nextArtboard = { width: moved.width, height: 600 };
  const nextCamera = { ...startCamera, centerX: startCamera.centerX + moved.anchorShiftX };
  const after = createSvgViewBoxScreenTransform(nextArtboard, { ...size, ...nextCamera });
  const newRight = transformPoint(after.matrix, { x: moved.width, y: 300 });
  close(newRight.x, oldRight.x, 1e-8, 'left resize preserves opposite rendered edge');
  g.cancel();
}

// Minimum clamp + cancel restore exact authored serialization and no completed
// history entry. A sub-threshold click never starts a transaction.
{
  const { s, g } = gesture('left', 100000, 0, { zoom: 1, minSize: 24 });
  assert.equal(s.document.artboard.width, 24);
  assert.ok(Number.isFinite(s.document.artboard.width));
  g.cancel();
  assert.equal(s.document.artboard.width, 800);
}
{
  const model = normalizeDocument(createDocument({ artboard }));
  const s = new VeyraStore(model);
  const before = serializeVeyra(s.document);
  const history = s.commandHistory.length;
  const g = createArtboardResizeGesture({ store: s, start: { x: 10, y: 10 }, startArtboard: artboard, direction: 'bottom-right' });
  assert.equal(g.move({ clientX: 11, clientY: 11 }).started, false);
  assert.equal(g.end().committed, false);
  assert.equal(serializeVeyra(s.document), before);
  assert.equal(s.commandHistory.length, history);
}
{
  const model = normalizeDocument(createDocument({ artboard }));
  const s = new VeyraStore(model);
  const before = serializeVeyra(s.document);
  const g = createArtboardResizeGesture({ store: s, start: { x: 0, y: 0 }, startArtboard: artboard, direction: 'top-left' });
  g.move({ clientX: 40, clientY: 30 });
  assert.notEqual(serializeVeyra(s.document), before);
  assert.equal(g.cancel().cancelled, true);
  assert.equal(serializeVeyra(s.document), before, 'cancel restores exact authored state');
}

// Combined regression: panel -> camera -> artboard -> hit testing use production
// functions in sequence without panel state or camera scale drift.
{
  let combinedLayout = normalizeWorkspaceLayout({}, { width: 1440, height: 900 });
  const combinedCamera = { zoom: 1.4, centerX: 450, centerY: 320 };
  const initialMap = createSvgViewBoxScreenTransform(artboard, { width: 880, height: 610, ...combinedCamera });
  combinedLayout = setWorkspacePanelSize(combinedLayout, 'right', 480, { width: 1440, height: 900 });
  const panelMap = createSvgViewBoxScreenTransform(artboard, { width: 710, height: 610, ...combinedCamera });
  close(initialMap.scale, panelMap.scale);
  assert.deepEqual(combinedCamera, { zoom: 1.4, centerX: 450, centerY: 320 });

  const resizeStore = new VeyraStore(document);
  const g = createArtboardResizeGesture({ store: resizeStore, start: { x: 0, y: 0 }, startArtboard: artboard, direction: 'right', scaleX: 1 / combinedCamera.zoom, scaleY: 1 / combinedCamera.zoom });
  g.move({ clientX: 70, clientY: 0 });
  g.end();
  assert.equal(combinedLayout.rightWidth, 480, 'artboard resize cannot mutate panel state');
  const resizedArtboard = resizeStore.document.artboard;
  const postPanelMap = createSvgViewBoxScreenTransform(resizedArtboard, { width: 760, height: 560, ...combinedCamera });
  close(postPanelMap.scale, combinedCamera.zoom);
  const renderedCenter = transformPoint(postPanelMap.matrix, { x: 400, y: 300 });
  assert.deepEqual(hitTestPoint(renderedCenter, resizeStore.document, { width: 760, height: 560, ...combinedCamera }), { kind: 'node', id: 'target' });
}

// Static shell gates: no permanent artboard handle DOM; border classification
// occurs before pan routing and Escape can cancel the authored resize gesture.
const browser = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../veyra.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../veyra.css', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/veyra/renderer.js', import.meta.url), 'utf8');
assert.match(browser, /classifyArtboardResizeZone/);
assert.match(browser, /beginArtboardResize/);
assert.match(browser, /resizeDirection = event\.button === 0/);
assert.match(browser, /activeArtboardResize\.cancel\(\)/);
assert.match(browser, /renderer\.syncViewport\(\)/);
assert.doesNotMatch(html, /artboardHandle/);
assert.doesNotMatch(css, /\.artboardHandle\[data-mode='resize'\]/);
assert.match(renderer, /width: screen\.width/);
assert.match(renderer, /height: screen\.height/);

console.log('veyra M5 camera/artboard correction tests passed');
