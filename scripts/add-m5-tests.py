from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST = ROOT / 'tests/veyra-workspace-ux.test.mjs'
TEST.write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invertMatrix, multiplyMatrices, transformMatrix, transformPoint } from '../src/veyra/contracts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { nodePropertyAddress, writeProperty } from '../src/veyra/properties.js';
import { createNodeRef } from '../src/veyra/references.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import {
  VEYRA_MIN_NODE_SCALE,
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
  normalizeTheme,
  normalizeWheelDelta,
  normalizeWorkspaceLayout,
  panGestureMoved,
  panViewportByScreen,
  resizeNodeTransform,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
  zoomViewportAtScreen,
} from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-7, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}

// 1-5. Navigation gesture classification is deterministic and right-drag is the
// only canvas navigation gesture that earns context-menu suppression.
assert.equal(navigationPanKind({ button: 2 }, { tool: 'select', spaceHeld: false }), 'right');
assert.equal(navigationPanKind({ button: 1 }, { tool: 'select', spaceHeld: false }), 'middle');
assert.equal(navigationPanKind({ button: 0 }, { tool: 'select', spaceHeld: true }), 'space');
assert.equal(navigationPanKind({ button: 0 }, { tool: 'pan', spaceHeld: false }), 'tool');
assert.equal(navigationPanKind({ button: 0, altKey: true }, { tool: 'select', spaceHeld: false }), 'alt');
assert.equal(navigationPanKind({ button: 0 }, { tool: 'select', spaceHeld: false }), null);
assert.equal(panGestureMoved({ x: 10, y: 10 }, { x: 11, y: 11 }), false);
assert.equal(panGestureMoved({ x: 10, y: 10 }, { x: 20, y: 10 }), true);
assert.equal(shouldSuppressCanvasContextMenu({ kind: 'right', moved: true }), true);
assert.equal(shouldSuppressCanvasContextMenu({ kind: 'right', moved: false }), false);
assert.equal(shouldSuppressCanvasContextMenu({ kind: 'middle', moved: true }), false);

// 6-8. Wheel input is bounded for high-resolution devices and cursor-anchored
// zoom preserves the exact intended world point through SVG meet mapping.
assert.equal(normalizeWheelDelta(5000), 120);
assert.equal(normalizeWheelDelta(-5000), -120);
assert.ok(wheelZoomFactor(120) > 0.7 && wheelZoomFactor(120) < 1);
assert.ok(wheelZoomFactor(-120) > 1 && wheelZoomFactor(-120) < 1.4);
const artboard = { width: 1000, height: 500 };
const screen = { width: 700, height: 900 };
const viewport = { zoom: 0.75, centerX: 430, centerY: 260 };
const anchor = { x: 190, y: 470 };
const beforeMap = createSvgViewBoxScreenTransform(artboard, { ...viewport, ...screen });
const anchoredWorld = transformPoint(invertMatrix(beforeMap.matrix), anchor);
const zoomed = zoomViewportAtScreen(viewport, 3.2, anchor, artboard, screen);
const afterMap = createSvgViewBoxScreenTransform(artboard, { ...zoomed, ...screen });
const afterAnchor = transformPoint(afterMap.matrix, anchoredWorld);
close(afterAnchor.x, anchor.x, 1e-7, 'anchored zoom x');
close(afterAnchor.y, anchor.y, 1e-7, 'anchored zoom y');
const panned = panViewportByScreen(viewport, { x: 70, y: -35 }, artboard, screen);
close(panned.centerX, viewport.centerX - 70 / beforeMap.scale, 1e-7, 'screen pan x');
close(panned.centerY, viewport.centerY + 35 / beforeMap.scale, 1e-7, 'screen pan y');
assert.deepEqual(fitArtboardViewport(artboard), { zoom: 1, centerX: 500, centerY: 250 });

// 9-11. Focus is stable-ref based, survives hostile names/reorder, includes
// hidden descendants, and group focus uses descendant evaluated bounds.
const group = createNode('group', { id: 'group:root', name: 'banana' });
const hiddenChild = createNode('rectangle', {
  id: 'node://hidden/child', name: 'misleading name', parent: createNodeRef(group.id), visible: false,
  transform: { x: 140, y: 120, rotation: Math.PI / 6 }, geometry: { width: 80, height: 40 },
});
const other = createNode('ellipse', { id: 'other', name: 'group:root', transform: { x: 600, y: 300 }, geometry: { width: 90, height: 90 } });
const focusDocument = normalizeDocument(createDocument({ artboard, nodes: [other, hiddenChild, group] }));
const focusScene = evaluateDocument(focusDocument);
const childBounds = evaluatedRefBounds(focusScene, createNodeRef(hiddenChild.id));
const groupBounds = evaluatedRefBounds(focusScene, createNodeRef(group.id));
assert.ok(childBounds && groupBounds);
assert.deepEqual(groupBounds, childBounds, 'group focus must derive from evaluated descendants');
const fitted = fitBoundsViewport(groupBounds, artboard, screen, { padding: 60 });
assert.ok(fitted.zoom >= 0.1 && fitted.zoom <= 8);
close(fitted.centerX, (groupBounds.minX + groupBounds.maxX) / 2);
close(fitted.centerY, (groupBounds.minY + groupBounds.maxY) / 2);

// 12. Visibility authoring uses the normal property/store history path and is undoable.
const visibilityStore = new VeyraStore(focusDocument);
const visibilityAddress = nodePropertyAddress(hiddenChild.id, 'visible');
visibilityStore.execute({ label: 'Show hidden node', source: 'user', propertyAddresses: [visibilityAddress] }, (documentModel) => {
  writeProperty(documentModel, visibilityAddress, true);
});
assert.equal(visibilityStore.document.nodes.find((node) => node.id === hiddenChild.id).visible, true);
assert.equal(visibilityStore.undo(), true);
assert.equal(visibilityStore.document.nodes.find((node) => node.id === hiddenChild.id).visible, false);

// 13-15,19. Panel state is bounded, collapse preserves the expanded dimension,
// and the CSS-variable representation is deterministic/persistable JSON data.
let layout = normalizeWorkspaceLayout({}, { width: 1440, height: 900 });
assert.deepEqual(layout, VEYRA_WORKSPACE_LAYOUT_DEFAULTS);
layout = setWorkspacePanelSize(layout, 'left', 9999, { width: 1440, height: 900 });
assert.ok(layout.leftWidth <= 480);
layout = setWorkspacePanelSize(layout, 'right', 1, { width: 1440, height: 900 });
assert.ok(layout.rightWidth >= 220);
layout = setWorkspacePanelSize(layout, 'bottom', 9999, { width: 1440, height: 900 });
assert.ok(layout.bottomHeight <= 420);
const expandedLeft = layout.leftWidth;
layout = setWorkspacePanelCollapsed(layout, 'left', true, { width: 1440, height: 900 });
assert.equal(workspaceCssVariables(layout)['--left-panel-width'], '0px');
layout = setWorkspacePanelCollapsed(layout, 'left', false, { width: 1440, height: 900 });
assert.equal(layout.leftWidth, expandedLeft, 'expand restores pre-collapse width');
assert.deepEqual(JSON.parse(JSON.stringify(layout)), layout);

// 16-17. Resize starts with no pointer jump, preserves the opposite authored
// anchor under rotation/non-uniform scale, cannot invert through zero, and the
// helper remains parent-transform agnostic because parent space composes after it.
const resizeNode = createNode('rectangle', {
  id: 'resize:node',
  transform: { x: 90, y: 70, rotation: Math.PI / 5, scaleX: 1.4, scaleY: 0.7, pivotX: 5, pivotY: -3 },
  geometry: { width: 100, height: 60 },
});
const local = { minX: -50, minY: -30, maxX: 50, maxY: 30 };
const noJump = resizeNodeTransform(resizeNode, local, 'se', { x: 50, y: 30 });
for (const key of ['x', 'y', 'scaleX', 'scaleY']) close(noJump[key], resizeNode.transform[key], 1e-8, `resize no-jump ${key}`);
const resized = resizeNodeTransform(resizeNode, local, 'se', { x: 95, y: 62 });
assert.ok(Math.abs(resized.scaleX) >= VEYRA_MIN_NODE_SCALE && Math.abs(resized.scaleY) >= VEYRA_MIN_NODE_SCALE);
assert.ok([resized.x, resized.y, resized.scaleX, resized.scaleY].every(Number.isFinite));
const opposite = { x: -50, y: -30 };
const parentMatrix = transformMatrix({ x: 40, y: -25, rotation: -0.3, scaleX: 0.8, scaleY: 1.7 });
const beforeAnchor = transformPoint(multiplyMatrices(parentMatrix, transformMatrix(resizeNode.transform)), opposite);
const afterResizeAnchor = transformPoint(multiplyMatrices(parentMatrix, transformMatrix(resized)), opposite);
close(afterResizeAnchor.x, beforeAnchor.x, 1e-6, 'resize opposite anchor x');
close(afterResizeAnchor.y, beforeAnchor.y, 1e-6, 'resize opposite anchor y');
const centerResize = resizeNodeTransform(resizeNode, local, 'e', { x: 100, y: 0 }, { centerResize: true });
close(centerResize.x, resizeNode.transform.x);
close(centerResize.y, resizeNode.transform.y);
const aspect = resizeNodeTransform(resizeNode, local, 'e', { x: 80, y: 0 }, { aspectLock: true, centerResize: true });
close(Math.abs(aspect.scaleX / resizeNode.transform.scaleX), Math.abs(aspect.scaleY / resizeNode.transform.scaleY), 1e-7, 'aspect lock');

// M4 viewport/hit-test mapping remains aligned after arbitrary panel-driven
// viewport dimensions: the rendered transformed center is the clickable center.
const hitNode = createNode('rectangle', { id: 'hit', transform: { x: 400, y: 200, rotation: 0.4 }, geometry: { width: 120, height: 80 } });
const hitDocument = normalizeDocument(createDocument({ artboard, nodes: [hitNode] }));
const hitScene = evaluateDocument(hitDocument);
const hitViewport = { width: 513, height: 777, zoom: 1.8, centerX: 470, centerY: 230 };
const hitMap = createSvgViewBoxScreenTransform(artboard, hitViewport);
const renderedCenter = transformPoint(hitMap.matrix, { x: 400, y: 200 });
assert.deepEqual(hitTestPoint(renderedCenter, hitScene, hitViewport), { kind: 'node', id: 'hit' });

// 18-19. Theme selection is semantic-token state only and leaves serialization untouched.
const serializedBeforeTheme = serializeVeyra(focusDocument);
for (const theme of ['neutral-dark', 'graphite-blue', 'deep-teal', 'warm-dark', 'light-neutral']) assert.equal(normalizeTheme(theme), theme);
assert.equal(normalizeTheme('magenta'), 'neutral-dark', 'legacy theme migrates without reintroducing pink chrome');
assert.equal(serializeVeyra(focusDocument), serializedBeforeTheme);

// Browser/editor source gates prove the real shell uses these pure contracts,
// not a parallel test-only implementation.
const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/veyra/renderer.js', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/veyra/shellBridge.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../veyra.css', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../veyra.html', import.meta.url), 'utf8');
assert.match(browserSource, /navigationPanKind\(event, \{ tool: currentTool, spaceHeld: spacePanHeld \}\)/);
assert.match(browserSource, /lostpointercapture/);
assert.match(browserSource, /contextmenu/);
assert.match(browserSource, /shouldSuppressCanvasContextMenu/);
assert.match(browserSource, /spacePanHeld/);
assert.match(browserSource, /fitBoundsViewport/);
assert.match(browserSource, /focusEditorReference/);
assert.match(browserSource, /setWorkspacePanelSize/);
assert.match(browserSource, /setWorkspacePanelCollapsed/);
assert.match(browserSource, /localStorage\.setItem\(UI_LAYOUT_KEY/);
assert.match(browserSource, /resizeNode: \(nodeId, next\) => store\.mutate/);
assert.match(browserSource, /renderer\.cancelActiveGesture\(\)/);
assert.match(rendererSource, /class: `resizeHandle resizeHandle-\$\{handle\}`/);
assert.match(rendererSource, /#startResizeDrag/);
assert.match(shellSource, /isAuthoringEvent\?\.\(event\)/);
assert.match(cssSource, /M5_WORKSPACE_UX/);
assert.match(cssSource, /--ui-app-bg:/);
assert.match(cssSource, /--left-panel-width:/);
assert.match(cssSource, /data-theme='light-neutral'/);
assert.match(htmlSource, /value="neutral-dark">Neutral Dark/);
assert.match(htmlSource, /id="leftSplitter"/);
assert.match(htmlSource, /id="rightSplitter"/);
assert.match(htmlSource, /id="timelineSplitter"/);
assert.match(htmlSource, /id="fitSelection"/);
assert.match(htmlSource, /id="focusSelection"/);

console.log('veyra M5 workspace UX stabilization tests passed');
''', encoding='utf-8')
