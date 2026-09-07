import assert from 'node:assert/strict';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';

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

console.log('All hit-test tests passed!');
