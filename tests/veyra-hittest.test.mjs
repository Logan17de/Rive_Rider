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

console.log('All hit-test tests passed!');
