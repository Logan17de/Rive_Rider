import assert from 'node:assert/strict';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { regularPolygonPoints, starPoints } from '../src/veyra/geometry.js';
import { transformMatrix } from '../src/veyra/contracts.js';

const document = normalizeDocument(createDocument({
  nodes: [
    createNode('rectangle', { id: 'back', transform: { x: 100, y: 100 }, geometry: { width: 80, height: 80 } }),
    createNode('ellipse', { id: 'front', transform: { x: 100, y: 100 }, geometry: { width: 40, height: 40 } }),
  ],
}));
const viewport = { width: 960, height: 640, zoom: 1 };

assert.deepEqual(hitTestPoint({ x: 100, y: 100 }, document, viewport), { kind: 'node', id: 'front' }, 'hit-test returns the topmost overlapping node');
assert.equal(hitTestPoint({ x: -100, y: -100 }, document, viewport), null, 'hit-test returns null outside all geometry');
assert.deepEqual(hitTestPoint({ x: 125, y: 100 }, document, viewport), { kind: 'node', id: 'back' }, 'hit-test falls through an ellipse outside its boundary');
const hidden = normalizeDocument(createDocument({ nodes: [createNode('rectangle', { id: 'hidden', visible: false })] }));
assert.equal(hitTestPoint({ x: 480, y: 320 }, hidden, viewport), null, 'hit-test ignores invisible nodes');

const hiddenGroup = createNode('group', { id: 'hiddenGroup', visible: false });
const hiddenChild = createNode('rectangle', { id: 'hiddenChild', parentId: 'hiddenGroup', transform: { x: 100, y: 100 } });
const hiddenAncestorDocument = normalizeDocument(createDocument({ nodes: [hiddenGroup, hiddenChild] }));
assert.equal(
  hitTestPoint({ x: 100, y: 100 }, hiddenAncestorDocument, viewport),
  null,
  'hit-test ignores a visible child whose ancestor group is hidden',
);

const visibleGroup = createNode('group', { id: 'visibleGroup', visible: true });
const visibleChild = createNode('rectangle', { id: 'visibleChild', parentId: 'visibleGroup', transform: { x: 100, y: 100 } });
const visibleAncestorDocument = normalizeDocument(createDocument({ nodes: [visibleGroup, visibleChild] }));
assert.deepEqual(
  hitTestPoint({ x: 100, y: 100 }, visibleAncestorDocument, viewport),
  { kind: 'node', id: 'visibleChild' },
  'hit-test accepts a child when its ancestor group is visible',
);

const grandparent = createNode('group', { id: 'grandparent', visible: false });
const parent = createNode('group', { id: 'parent', parentId: 'grandparent', visible: true });
const deepChild = createNode('rectangle', { id: 'deepChild', parentId: 'parent', transform: { x: 100, y: 100 } });
const deepDocument = normalizeDocument(createDocument({ nodes: [grandparent, parent, deepChild] }));
assert.equal(
  hitTestPoint({ x: 100, y: 100 }, deepDocument, viewport),
  null,
  'hit-test ignores a child when a grandparent is hidden',
);

const transparentHitTarget = normalizeDocument(createDocument({
  nodes: [createNode('rectangle', {
    id: 'transparentHitTarget', opacity: 0, transform: { x: 100, y: 100 },
  })],
}));
assert.deepEqual(
  hitTestPoint({ x: 100, y: 100 }, transparentHitTarget, viewport),
  { kind: 'node', id: 'transparentHitTarget' },
  'opacity zero does not disable an explicit hit target',
);

// B1: polygon and star fills use SVG's nonzero winding region rather than the
// local bounding box. The corners below are outside the rendered geometry.
const polygonDocument = normalizeDocument(createDocument({
  nodes: [createNode('polygon', {
    id: 'diamond',
    transform: { x: 200, y: 100 },
    geometry: { radius: 50, sides: 4 },
  })],
}));
assert.deepEqual(
  hitTestPoint({ x: 200, y: 100 }, polygonDocument, viewport),
  { kind: 'node', id: 'diamond' },
  'polygon center is inside its nonzero fill region',
);
assert.equal(
  hitTestPoint({ x: 249, y: 149 }, polygonDocument, viewport),
  null,
  'polygon bbox corner is not a false hit',
);

const starDocument = normalizeDocument(createDocument({
  nodes: [createNode('star', {
    id: 'star',
    transform: { x: 350, y: 100 },
    geometry: { outerRadius: 80, innerRadius: 34, points: 5 },
  })],
}));
assert.deepEqual(
  hitTestPoint({ x: 350, y: 100 }, starDocument, viewport),
  { kind: 'node', id: 'star' },
  'star center is inside its nonzero fill region',
);
assert.equal(
  hitTestPoint({ x: 429, y: 179 }, starDocument, viewport),
  null,
  'star bbox corner is not a false hit',
);

// B1 stroke semantics are tested in screen space after a non-uniform, rotated
// transform. This keeps the 10px non-scaling stroke band isotropic on screen.
const strokedNode = createNode('polygon', {
  id: 'strokedPolygon',
  transform: { x: 600, y: 200, rotation: Math.PI / 6, scaleX: 2, scaleY: 0.5 },
  geometry: { radius: 40, sides: 4 },
  paint: { fill: 'none', stroke: '#000000', strokeWidth: 10 },
});
const strokedDocument = normalizeDocument(createDocument({ nodes: [strokedNode] }));
const strokePoints = regularPolygonPoints(40, 4);
const strokeMatrix = transformMatrix(strokedNode.transform);
const toWorld = (point) => ({
  x: strokeMatrix[0] * point.x + strokeMatrix[2] * point.y + strokeMatrix[4],
  y: strokeMatrix[1] * point.x + strokeMatrix[3] * point.y + strokeMatrix[5],
});
const strokeStart = toWorld(strokePoints[0]);
const strokeEnd = toWorld(strokePoints[1]);
const strokeMidpoint = { x: (strokeStart.x + strokeEnd.x) / 2, y: (strokeStart.y + strokeEnd.y) / 2 };
const strokeLength = Math.hypot(strokeEnd.x - strokeStart.x, strokeEnd.y - strokeStart.y);
const normal = { x: -(strokeEnd.y - strokeStart.y) / strokeLength, y: (strokeEnd.x - strokeStart.x) / strokeLength };
assert.deepEqual(
  hitTestPoint({ x: strokeMidpoint.x + normal.x * 4, y: strokeMidpoint.y + normal.y * 4 }, strokedDocument, viewport),
  { kind: 'node', id: 'strokedPolygon' },
  'transformed polygon stroke is hittable within its screen-space band',
);
assert.equal(
  hitTestPoint({ x: strokeMidpoint.x + normal.x * 8, y: strokeMidpoint.y + normal.y * 8 }, strokedDocument, viewport),
  null,
  'transformed polygon stroke rejects points outside its screen-space band',
);

// A star's alternating vertices exercise the same straight-edge winding and
// stroke path without relying on its bbox approximation.
assert.ok(starPoints(80, 34, 5).length === 10, 'star geometry remains a straight-edged ten-vertex polygon');

console.log('All hit-test tests passed!');
