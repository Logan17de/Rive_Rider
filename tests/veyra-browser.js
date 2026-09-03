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
  // Corrected from a stale `4` when this suite was first run headless (3B-2
  // gate (i)). `renderer.js:438-466` emits BOTH `in` and `out` handle circles
  // for EVERY vertex unconditionally — the offset test at :444 gates only the
  // `handleLine`, not the handle itself. Three vertices therefore always yield
  // six handles, and `4` could not have matched this renderer. The stale value
  // survived because this file was never in `npm test`.
  assert(document.querySelectorAll('.bezierHandle').length === 6, 'Bezier handles missing.');
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
