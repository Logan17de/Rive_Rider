import assert from 'node:assert/strict';
import { installFakeDom, pointerEvent, FakeElement } from './helpers/fake-dom.mjs';
import { createStarterDocument } from '../src/veyra/model.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { VeyraRenderer } from '../src/veyra/renderer.js';

/**
 * Renderer interaction coverage at the callback boundary: pointer -> callback
 * is verified against document-model state. Pointer -> intent -> undoable
 * command is intentionally a non-goal here; that belongs to the panel tests.
 * The fake DOM intentionally models tree/events, not browser geometry. Supply
 * an explicit identity screen transform so pointer math remains deterministic.
 * Consequently pointer math is verified only at identity transform (zoom/pan
 * CTM behavior and real browser layout/paint/CSS remain unproven).
 */
class TestPoint {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform(matrix) { return { x: this.x * matrix.a + matrix.e, y: this.y * matrix.d + matrix.f }; }
}
const identity = () => ({ a: 1, d: 1, e: 0, f: 0, inverse() { return this; } });
FakeElement.prototype.getScreenCTM = identity;
globalThis.DOMPoint = TestPoint;

const dom = installFakeDom();
try {
  const documentModel = createStarterDocument();
  const smile = documentModel.nodes.find((node) => node.name === 'Smile');
  const surface = dom.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dom.document.body.appendChild(surface);
  const evaluated = () => evaluateDocument(documentModel);
  const renderer = new VeyraRenderer(surface);
  renderer.render(evaluated(), smile.id);

  // A second render while a rig drag is live must replace the two overlay
  // groups in place, rather than append duplicates or silently no-op.
  const meshesBefore = surface.querySelector('.rigMeshes');
  const overlayBefore = surface.querySelector('.rigOverlay');
  assert.ok(meshesBefore, 'initial mesh group exists');
  assert.ok(overlayBefore, 'initial rig overlay exists');
  renderer.dragging = true;
  renderer.dragKind = 'bone';
  renderer.render(evaluated(), smile.id);
  renderer.dragging = false;
  renderer.dragKind = null;
  assert.equal(surface.querySelectorAll('.rigMeshes').length, 1);
  assert.equal(surface.querySelectorAll('.rigOverlay').length, 1);
  assert.notEqual(surface.querySelector('.rigMeshes'), meshesBefore, 'mesh group replaced');
  assert.notEqual(surface.querySelector('.rigOverlay'), overlayBefore, 'rig overlay replaced');

  // Vertex drag executes the live node update path, including :scope > shape
  // and :scope > vertexControls. The callback is the document command seam.
  const moved = [];
  const dragRenderer = new VeyraRenderer(surface, {
    moveVertex(nodeId, index, next) {
      const node = documentModel.nodes.find((candidate) => candidate.id === nodeId);
      Object.assign(node.geometry.vertices[index], next);
      moved.push({ nodeId, index, next });
    },
  });
  dragRenderer.setTool('vertex');
  dragRenderer.render(evaluated(), smile.id);
  const vertex = surface.querySelector('.vertexPoint');
  const beforeX = smile.geometry.vertices[0].x;
  vertex.dispatchEvent(pointerEvent('pointerdown', { clientX: beforeX, clientY: smile.geometry.vertices[0].y }));
  surface.dispatchEvent(pointerEvent('pointermove', { clientX: beforeX + 12, clientY: smile.geometry.vertices[0].y + 8 }));
  surface.dispatchEvent(pointerEvent('pointerup', { clientX: beforeX + 12, clientY: smile.geometry.vertices[0].y + 8 }));
  assert.equal(moved.length, 1, 'pointer drag reaches document callback');
  assert.equal(smile.geometry.vertices[0].x, beforeX + 12);
  assert.equal(surface.querySelectorAll(':scope > .vertexControls').length, 0, 'controls are nested under node groups');
  assert.equal(surface.querySelectorAll('.vertexControls').length, 1);
  assert.equal(surface.hasPointerCapture(1), false, 'pointer capture released on pointerup');

  // Lost-pointerup is represented by pointercancel: capture is taken and the
  // renderer leaves dragging mode when the platform cancels the pointer.
  const cancelRenderer = new VeyraRenderer(surface);
  cancelRenderer.setTool('vertex');
  cancelRenderer.render(evaluated(), smile.id);
  const cancelTarget = surface.querySelector('.vertexPoint');
  cancelTarget.dispatchEvent(pointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
  assert.equal(surface.hasPointerCapture(1), true);
  surface.dispatchEvent(pointerEvent('pointercancel', { clientX: 0, clientY: 0 }));
  assert.equal(surface.hasPointerCapture(1), true, 'pointercancel currently exposes unreleased capture defect');

  // KD-1: zero-offset handles are still live targets. A path with no authored
  // beziers gets six circles, and dragging one creates curvature in the model.
  // This is deliberately a passing demonstration of the open defect; renderer
  // behaviour is out of scope for this test task and is not silently changed.
  const straight = structuredClone(smile);
  straight.geometry.vertices = straight.geometry.vertices.map((vertex) => ({
    ...vertex, inX: 0, inY: 0, outX: 0, outY: 0,
  }));
  const straightDoc = structuredClone(documentModel);
  straightDoc.nodes = straightDoc.nodes.map((node) => node.id === smile.id ? straight : node);
  const straightRenderer = new VeyraRenderer(surface, {
    moveHandle(nodeId, index, prefix, next) {
      const node = straightDoc.nodes.find((candidate) => candidate.id === nodeId);
      node.geometry.vertices[index][`${prefix}X`] = next.x;
      node.geometry.vertices[index][`${prefix}Y`] = next.y;
    },
  });
  straightRenderer.render(evaluateDocument(straightDoc), straight.id);
  assert.equal(surface.querySelectorAll('.bezierHandle').length, 6, 'zero-bezier path still exposes six handles');
  const invisibleHandle = surface.querySelector('.bezierHandle[data-handle="out"]');
  const vertexPosition = straight.geometry.vertices[0];
  invisibleHandle.dispatchEvent(pointerEvent('pointerdown', { clientX: vertexPosition.x, clientY: vertexPosition.y }));
  surface.dispatchEvent(pointerEvent('pointermove', { clientX: vertexPosition.x + 10, clientY: vertexPosition.y + 5 }));
  surface.dispatchEvent(pointerEvent('pointerup', { clientX: vertexPosition.x + 10, clientY: vertexPosition.y + 5 }));
  const curved = straightDoc.nodes.find((node) => node.id === smile.id);
  assert.equal(curved.geometry.vertices[0].outX, 10);
  assert.equal(curved.geometry.vertices[0].outY, 5);

  console.log('renderer interaction checks passed');
} finally {
  dom.restore();
}
