import { localBounds, regularPolygonPoints, starPoints } from './geometry.js';
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

function screenPoint(worldPoint, viewport) {
  return {
    x: (worldPoint.x - viewport.centerX) * viewport.zoom + viewport.width / 2,
    y: (worldPoint.y - viewport.centerY) * viewport.zoom + viewport.height / 2,
  };
}

function polygonPoints(node) {
  if (node.type === 'polygon') {
    return regularPolygonPoints(node.geometry.radius, node.geometry.sides);
  }
  if (node.type === 'star') {
    return starPoints(node.geometry.outerRadius, node.geometry.innerRadius, node.geometry.points);
  }
  return null;
}

function fillEnabled(node) {
  const fill = node.paint?.fill;
  return !(fill === 'none' || (fill && typeof fill === 'object' && fill.type === 'solid' && fill.color === 'none'));
}

function strokeEnabled(node) {
  const stroke = node.paint?.stroke;
  return stroke !== 'none' && Number.isFinite(Number(node.paint?.strokeWidth)) && Number(node.paint.strokeWidth) > 0;
}

function pointOnSegment(point, start, end, epsilon = 1e-9) {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > epsilon) return false;
  return point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

// SVG's default fill-rule is nonzero, rather than evenodd. Winding-number
// containment preserves that rule for polygon and star geometry.
function nonzeroContains(point, points) {
  let winding = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (pointOnSegment(point, start, end)) return true;
    if (start.y <= point.y) {
      if (end.y > point.y && (end.x - start.x) * (point.y - start.y) - (point.x - start.x) * (end.y - start.y) > 0) winding += 1;
    } else if (end.y <= point.y && (end.x - start.x) * (point.y - start.y) - (point.x - start.x) * (end.y - start.y) < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}

function distanceSquaredToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-18) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return px * px + py * py;
  }
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const nearestX = start.x + projection * dx;
  const nearestY = start.y + projection * dy;
  const px = point.x - nearestX;
  const py = point.y - nearestY;
  return px * px + py * py;
}

function hitPolygon(node, localPoint, matrix, screen, viewport) {
  const points = polygonPoints(node);
  if (!points || points.length < 3) return false;
  if (fillEnabled(node) && nonzeroContains(localPoint, points)) return true;
  if (!strokeEnabled(node)) return false;
  const screenPoints = points.map((point) => screenPoint(apply(matrix, point), viewport));
  const strokeRadius = Math.abs(Number(node.paint.strokeWidth)) / 2;
  const threshold = strokeRadius * strokeRadius + 1e-7;
  for (let index = 0; index < screenPoints.length; index += 1) {
    if (distanceSquaredToSegment(screen, screenPoints[index], screenPoints[(index + 1) % screenPoints.length]) <= threshold) return true;
  }
  return false;
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

function visibleThroughAncestors(node, byId) {
  const seen = new Set();
  let current = node;
  while (current) {
    if (!current.visible) return false;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    const parentId = referenceId(current.parent, 'node');
    current = parentId ? byId.get(parentId) : null;
  }
  return true;
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
  const screen = { x: finite(point.x), y: finite(point.y) };
  const worldPoint = {
    x: (screen.x - width / 2) / zoom + centerX,
    y: (screen.y - height / 2) / zoom + centerY,
  };
  const viewportTransform = { width, height, zoom, centerX, centerY };
  const { byId, resolve } = worldMatrices(document);
  for (let index = document.nodes.length - 1; index >= 0; index -= 1) {
    const node = document.nodes[index];
    if (!visibleThroughAncestors(node, byId) || node.type === 'group') continue;
    const worldMatrix = resolve(node);
    const matrix = inverse(worldMatrix);
    if (!matrix) continue;
    const localPoint = apply(matrix, worldPoint);
    const hit = node.type === 'polygon' || node.type === 'star'
      ? hitPolygon(node, localPoint, worldMatrix, screen, viewportTransform)
      : inside(node, localPoint);
    if (hit) return { kind: 'node', id: node.id };
  }
  return null;
}
