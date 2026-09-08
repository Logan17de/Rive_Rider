import { regularPolygonPoints, starPoints } from './geometry.js';
import { referenceId } from './references.js';
import { transformMatrix } from './contracts.js';

export const VEYRA_HIT_TEST_TOLERANCE_PX = 0.35;
export const VEYRA_POINTER_EVENT_MODES = Object.freeze(['auto', 'none', 'pass-through']);

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

function apply(matrix, point) {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function screenPoint(worldPoint, viewport) {
  return {
    x: (worldPoint.x - viewport.centerX) * viewport.zoom + viewport.width / 2,
    y: (worldPoint.y - viewport.centerY) * viewport.zoom + viewport.height / 2,
  };
}

function pointOnSegment(point, start, end, epsilon = 1e-7) {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > epsilon) return false;
  return point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

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

function fillEnabled(node) {
  const fill = node.paint?.fill;
  return !(fill === 'none' || (fill && typeof fill === 'object' && fill.type === 'solid' && fill.color === 'none'));
}

function strokeEnabled(node) {
  const stroke = node.paint?.stroke;
  return stroke !== 'none' && Number.isFinite(Number(node.paint?.strokeWidth)) && Number(node.paint.strokeWidth) > 0;
}

function roundedRectanglePoints(geometry) {
  const width = Number(geometry.width);
  const height = Number(geometry.height);
  const halfW = width / 2;
  const halfH = height / 2;
  const radius = Math.max(0, Math.min(Number(geometry.cornerRadius) || 0, halfW, halfH));
  if (radius <= 1e-9) return [
    { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
    { x: halfW, y: halfH }, { x: -halfW, y: halfH },
  ];
  const result = [];
  const corners = [
    { cx: halfW - radius, cy: -halfH + radius, start: -Math.PI / 2 },
    { cx: halfW - radius, cy: halfH - radius, start: 0 },
    { cx: -halfW + radius, cy: halfH - radius, start: Math.PI / 2 },
    { cx: -halfW + radius, cy: -halfH + radius, start: Math.PI },
  ];
  for (const corner of corners) {
    for (let index = 0; index <= 8; index += 1) {
      const angle = corner.start + (index / 8) * (Math.PI / 2);
      result.push({ x: corner.cx + Math.cos(angle) * radius, y: corner.cy + Math.sin(angle) * radius });
    }
  }
  return result;
}

function ellipsePoints(geometry) {
  const rx = Number(geometry.width) / 2;
  const ry = Number(geometry.height) / 2;
  return Array.from({ length: 72 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2;
    return { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry };
  });
}

function distanceToLine(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denom = Math.hypot(dx, dy);
  if (denom <= 1e-12) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / denom;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenCubic(p0, p1, p2, p3, output, tolerance = VEYRA_HIT_TEST_TOLERANCE_PX, depth = 0) {
  const flatness = Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3));
  if (flatness <= tolerance || depth >= 12) {
    output.push(p3);
    return;
  }
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const p23 = midpoint(p2, p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const p0123 = midpoint(p012, p123);
  flattenCubic(p0, p01, p012, p0123, output, tolerance, depth + 1);
  flattenCubic(p0123, p123, p23, p3, output, tolerance, depth + 1);
}

function toScreen(matrix, viewport, point) {
  return screenPoint(apply(matrix, point), viewport);
}

function pathScreenPoints(node, matrix, viewport) {
  const vertices = node.geometry?.vertices || [];
  if (vertices.length < 2) return { points: [], strokeClosed: false };
  const point = (vertex) => ({ x: Number(vertex.x), y: Number(vertex.y) });
  const handle = (vertex, prefix) => ({
    x: Number(vertex.x) + Number(vertex[`${prefix}X`] || 0),
    y: Number(vertex.y) + Number(vertex[`${prefix}Y`] || 0),
  });
  const result = [toScreen(matrix, viewport, point(vertices[0]))];
  const appendSegment = (from, to) => {
    const p0 = toScreen(matrix, viewport, point(from));
    const p1 = toScreen(matrix, viewport, handle(from, 'out'));
    const p2 = toScreen(matrix, viewport, handle(to, 'in'));
    const p3 = toScreen(matrix, viewport, point(to));
    const hasHandle = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-7
      || Math.hypot(p2.x - p3.x, p2.y - p3.y) > 1e-7;
    if (hasHandle) flattenCubic(p0, p1, p2, p3, result);
    else result.push(p3);
  };
  for (let index = 1; index < vertices.length; index += 1) appendSegment(vertices[index - 1], vertices[index]);
  if (node.geometry.closed) appendSegment(vertices.at(-1), vertices[0]);
  return { points: result, strokeClosed: Boolean(node.geometry.closed) };
}

function geometryScreenPath(node, matrix, viewport) {
  if (node.type === 'path') return pathScreenPoints(node, matrix, viewport);
  let local;
  if (node.type === 'rectangle') local = roundedRectanglePoints(node.geometry);
  else if (node.type === 'ellipse') local = ellipsePoints(node.geometry);
  else if (node.type === 'polygon') local = regularPolygonPoints(node.geometry.radius, node.geometry.sides);
  else if (node.type === 'star') local = starPoints(node.geometry.outerRadius, node.geometry.innerRadius, node.geometry.points);
  else return { points: [], strokeClosed: false };
  return { points: local.map((point) => toScreen(matrix, viewport, point)), strokeClosed: true };
}

function hitGeometry(node, screen, matrix, viewport) {
  const { points, strokeClosed } = geometryScreenPath(node, matrix, viewport);
  if (points.length < 2) return false;
  // SVG fill semantics implicitly close an open path subpath. The point-in-
  // polygon test closes via modulo even when the authored path stroke is open.
  if (fillEnabled(node) && points.length >= 3 && nonzeroContains(screen, points)) return true;
  if (!strokeEnabled(node)) return false;
  const threshold = (Math.abs(Number(node.paint.strokeWidth)) / 2 + VEYRA_HIT_TEST_TOLERANCE_PX) ** 2;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceSquaredToSegment(screen, points[index - 1], points[index]) <= threshold) return true;
  }
  if (strokeClosed && distanceSquaredToSegment(screen, points.at(-1), points[0]) <= threshold) return true;
  return false;
}

function worldMatrices(document) {
  const byId = new Map((document.nodes || []).map((node) => [node.id, node]));
  const cache = new Map();
  const resolve = (node) => {
    if (Array.isArray(node.worldMatrix) && node.worldMatrix.length === 6) return node.worldMatrix;
    if (cache.has(node.id)) return cache.get(node.id);
    const parentId = referenceId(node.parent, 'node');
    const parent = parentId ? byId.get(parentId) : null;
    const matrix = parent ? multiply(resolve(parent), transformMatrix(node.transform)) : transformMatrix(node.transform);
    cache.set(node.id, matrix);
    return matrix;
  };
  return { byId, resolve };
}

function participation(node, byId) {
  const seen = new Set();
  let current = node;
  while (current) {
    if (!current.visible) return { subtree: false, self: false };
    if (current.pointerEvents === 'none') return { subtree: false, self: false };
    if (seen.has(current.id)) return { subtree: false, self: false };
    seen.add(current.id);
    const parentId = referenceId(current.parent, 'node');
    current = parentId ? byId.get(parentId) : null;
  }
  return { subtree: true, self: node.pointerEvents !== 'pass-through' };
}

function evaluatedPaintOrder(document, byId) {
  const children = new Map();
  for (const node of document.nodes || []) {
    const parent = referenceId(node.parent, 'node') || '__root__';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  const order = [];
  const visit = (node) => {
    const state = participation(node, byId);
    if (!state.subtree) return;
    if (node.type !== 'group' && state.self) order.push(node);
    for (const child of children.get(node.id) || []) visit(child);
  };
  for (const root of children.get('__root__') || []) visit(root);
  return order;
}

/**
 * Return the topmost interaction-participating drawable node under a viewport
 * point. `opacity` deliberately does not participate: a fully transparent node
 * remains interactive unless visibility/pointerEvents says otherwise.
 */
export function hitTestPoint(point, document, viewport = {}) {
  if (!point || !document || !Array.isArray(document.nodes)) return null;
  const zoom = finite(viewport.zoom, 1);
  if (Math.abs(zoom) < 1e-12) return null;
  const width = finite(viewport.width, finite(document.artboard?.width, 0));
  const height = finite(viewport.height, finite(document.artboard?.height, 0));
  const centerX = finite(viewport.centerX, finite(viewport.panX, width / 2));
  const centerY = finite(viewport.centerY, finite(viewport.panY, height / 2));
  const screen = { x: finite(point.x), y: finite(point.y) };
  const viewportTransform = { width, height, zoom, centerX, centerY };
  const { byId, resolve } = worldMatrices(document);
  const paintOrder = evaluatedPaintOrder(document, byId);
  for (let index = paintOrder.length - 1; index >= 0; index -= 1) {
    const node = paintOrder[index];
    if (hitGeometry(node, screen, resolve(node), viewportTransform)) return { kind: 'node', id: node.id };
  }
  return null;
}
