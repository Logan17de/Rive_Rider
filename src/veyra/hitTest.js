import { localBounds } from './geometry.js';
import { referenceId } from './references.js';
import { transformMatrix } from './contracts.js';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function inverse(matrix) {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (Math.abs(determinant) < 1e-12) return null;
  return [
    matrix[3] / determinant, -matrix[1] / determinant,
    -matrix[2] / determinant, matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant,
  ];
}

function apply(matrix, point) {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] };
}

function worldMatrices(document) {
  const byId = new Map((document.nodes || []).map((node) => [node.id, node]));
  const cache = new Map();
  const resolve = (node) => {
    if (cache.has(node.id)) return cache.get(node.id);
    const parentId = referenceId(node.parent, 'node');
    const parent = parentId ? byId.get(parentId) : null;
    const matrix = parent ? multiply(resolve(parent), transformMatrix(node.transform)) : transformMatrix(node.transform);
    cache.set(node.id, matrix);
    return matrix;
  };
  return { byId, resolve };
}

function inside(node, point) {
  const bounds = localBounds(node);
  if (!bounds || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return false;
  if (node.type === 'ellipse') {
    const rx = (bounds.maxX - bounds.minX) / 2;
    const ry = (bounds.maxY - bounds.minY) / 2;
    return ((point.x / rx) ** 2) + ((point.y / ry) ** 2) <= 1 + 1e-9;
  }
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

/** Return the topmost visible drawable node under a viewport point. */
export function hitTestPoint(point, document, viewport = {}) {
  if (!point || !document || !Array.isArray(document.nodes)) return null;
  const zoom = finite(viewport.zoom, 1);
  if (Math.abs(zoom) < 1e-12) return null;
  const width = finite(viewport.width, finite(document.artboard?.width, 0));
  const height = finite(viewport.height, finite(document.artboard?.height, 0));
  const centerX = finite(viewport.centerX, finite(viewport.panX, width / 2));
  const centerY = finite(viewport.centerY, finite(viewport.panY, height / 2));
  const worldPoint = {
    x: (finite(point.x) - width / 2) / zoom + centerX,
    y: (finite(point.y) - height / 2) / zoom + centerY,
  };
  const { resolve } = worldMatrices(document);
  for (let index = document.nodes.length - 1; index >= 0; index -= 1) {
    const node = document.nodes[index];
    if (!node.visible || node.type === 'group') continue;
    const matrix = inverse(resolve(node));
    if (matrix && inside(node, apply(matrix, worldPoint))) return { kind: 'node', id: node.id };
  }
  return null;
}
