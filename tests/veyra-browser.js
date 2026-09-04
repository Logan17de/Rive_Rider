import { createStarterDocument } from '../src/veyra/model.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { VeyraRenderer } from '../src/veyra/renderer.js';

const result = document.getElementById('result');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const documentModel = createStarterDocument();
  const smile = documentModel.nodes.find((node) => node.name === 'Smile');
  const renderer = new VeyraRenderer(document.getElementById('surface'));
  renderer.render(evaluateDocument(documentModel), smile.id);
  assert(document.querySelectorAll('[data-node-id]').length === 9, 'Scene node count mismatch.');
  assert(document.querySelectorAll('.sceneShape').length === 8, 'Rendered shape count mismatch.');
  assert(document.querySelectorAll('.vertexPoint').length === 3, 'Path vertex handles missing.');
  // KD-1 RATIFIED AND FIXED (2026-09-04, contract doc section KD-1).
  //
  // The starter Smile path has 3 vertices with exactly 4 non-zero in/out
  // offsets (measured from createStarterDocument: v0.out, v1.in, v1.out,
  // v2.in). Zero-offset handles are no longer emitted: they sat exactly at the
  // vertex position, painted under the larger vertex point, invisible AND
  // ungrabbable — controls that could never receive a click. The pin moved
  // from 6 (2 of which were phantoms under vertices v0 and v2) to 4.
  // Corner-to-smooth from the canvas is a NAMED GAP until a vertex-type
  // affordance ships; AI reaches the capability via veyra.moveHandle.
  assert(document.querySelectorAll('.bezierHandle').length === 4, 'Bezier handles missing.');
  assert(document.querySelector('.selectionBox'), 'Selection bounds missing.');
  assert(document.querySelectorAll('[data-bone-id]').length === 2, 'Rig bone overlays missing.');
  assert(document.querySelectorAll('.boneEnd').length === 2, 'Direct bone pose handles missing.');
  assert(document.querySelectorAll('[data-mesh-id]').length === 1, 'Weighted mesh rendering missing.');
  assert(document.querySelectorAll('[data-control-id]').length === 1, 'Pose control overlay missing.');
  assert(document.querySelector('.constraintGuide'), 'IK guide missing.');
  renderer.setZoom(2);
  assert(document.getElementById('surface').getAttribute('viewBox') === '240 160 480 320', 'Zoom viewBox mismatch.');
  renderer.panBy(20, 10);
  assert(document.getElementById('surface').getAttribute('viewBox') === '260 170 480 320', 'Canvas pan viewBox mismatch.');
  renderer.resetView();
  assert(document.getElementById('surface').getAttribute('viewBox') === '0 0 960 640', 'Canvas fit viewBox mismatch.');
  document.body.dataset.status = 'passed';
  result.textContent = 'PASS\nVeyra scene, selection, Bezier, rig overlay, skinning, zoom, and pan rendering passed.';
} catch (error) {
  console.error(error);
  document.body.dataset.status = 'failed';
  result.textContent = `FAIL\n${error.stack || error}`;
}
