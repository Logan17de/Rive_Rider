import { regularPolygonPoints, starPoints } from './geometry.js';
import { referenceId } from './references.js';
import { transformMatrix } from './contracts.js';
import { createSvgViewBoxScreenTransform } from './viewport.js';

export const VEYRA_HIT_TEST_TOLERANCE_PX = 0.35;
export const VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX = VEYRA_HIT_TEST_TOLERANCE_PX / 4;
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

function invert(matrix) {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-14) return null;
  const inv = 1 / determinant;
  const a = matrix[3] * inv;
  const b = -matrix[1] * inv;
  const c = -matrix[2] * inv;
  const d = matrix[0] * inv;
  return [a, b, c, d, -(a * matrix[4] + c * matrix[5]), -(b * matrix[4] + d * matrix[5])];
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

function localEllipseContains(node, localPoint) {
  const rx = Number(node.geometry?.width) / 2;
  const ry = Number(node.geometry?.height) / 2;
  if (!(rx > 0) || !(ry > 0)) return false;
  const normalized = (localPoint.x * localPoint.x) / (rx * rx) + (localPoint.y * localPoint.y) / (ry * ry);
  return normalized <= 1 + 1e-12;
}

function localRoundedRectangleContains(node, localPoint) {
  const width = Number(node.geometry?.width);
  const height = Number(node.geometry?.height);
  if (!(width > 0) || !(height > 0)) return false;
  const halfW = width / 2;
  const halfH = height / 2;
  const radius = Math.max(0, Math.min(Number(node.geometry?.cornerRadius) || 0, halfW, halfH));
  const x = Math.abs(localPoint.x);
  const y = Math.abs(localPoint.y);
  if (x > halfW + 1e-12 || y > halfH + 1e-12) return false;
  if (radius <= 1e-12) return true;
  if (x <= halfW - radius || y <= halfH - radius) return true;
  const dx = x - (halfW - radius);
  const dy = y - (halfH - radius);
  return dx * dx + dy * dy <= radius * radius + 1e-12;
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
  if (flatness <= tolerance || depth >= 16) {
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

function pathScreenPoints(node, localToScreen) {
  const vertices = node.geometry?.vertices || [];
  if (vertices.length < 2) return { points: [], strokeClosed: false, curvedApproximation: true };
  const point = (vertex) => ({ x: Number(vertex.x), y: Number(vertex.y) });
  const handle = (vertex, prefix) => ({
    x: Number(vertex.x) + Number(vertex[`${prefix}X`] || 0),
    y: Number(vertex.y) + Number(vertex[`${prefix}Y`] || 0),
  });
  const result = [apply(localToScreen, point(vertices[0]))];
  const appendSegment = (from, to) => {
    const p0 = apply(localToScreen, point(from));
    const p1 = apply(localToScreen, handle(from, 'out'));
    const p2 = apply(localToScreen, handle(to, 'in'));
    const p3 = apply(localToScreen, point(to));
    const hasHandle = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-7
      || Math.hypot(p2.x - p3.x, p2.y - p3.y) > 1e-7;
    if (hasHandle) flattenCubic(p0, p1, p2, p3, result);
    else result.push(p3);
  };
  for (let index = 1; index < vertices.length; index += 1) appendSegment(vertices[index - 1], vertices[index]);
  if (node.geometry.closed) appendSegment(vertices.at(-1), vertices[0]);
  return { points: result, strokeClosed: Boolean(node.geometry.closed), curvedApproximation: true };
}

function conicSecondDerivativeBound(localToScreen, rx, ry) {
  const xBound = Math.abs(localToScreen[0]) * Math.abs(rx) + Math.abs(localToScreen[2]) * Math.abs(ry);
  const yBound = Math.abs(localToScreen[1]) * Math.abs(rx) + Math.abs(localToScreen[3]) * Math.abs(ry);
  return Math.hypot(xBound, yBound);
}

/**
 * For a twice-differentiable parametric curve, linear interpolation error over
 * an interval h is bounded by max|r''| * h^2 / 8. Ellipse/circular-arc second
 * derivatives stay within the conservative affine bound below, so the chord
 * approximation remains bounded in final screen pixels regardless of zoom,
 * object size, rotation, or non-uniform scale.
 */
function conicSegmentCount(localToScreen, rx, ry, sweep, tolerance = VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX) {
  const bound = conicSecondDerivativeBound(localToScreen, rx, ry);
  if (!(bound > 1e-12) || !(tolerance > 0)) return 1;
  const maxStep = Math.sqrt((8 * tolerance) / bound);
  if (!(maxStep > 0)) return 1;
  return Math.max(1, Math.ceil(Math.abs(sweep) / maxStep));
}

function ellipseScreenPoints(node, localToScreen) {
  const rx = Number(node.geometry.width) / 2;
  const ry = Number(node.geometry.height) / 2;
  const quarterSweep = Math.PI / 2;
  const perQuarter = conicSegmentCount(localToScreen, rx, ry, quarterSweep);
  const points = [];
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const start = quarter * quarterSweep;
    for (let index = 0; index < perQuarter; index += 1) {
      const angle = start + (index / perQuarter) * quarterSweep;
      points.push(apply(localToScreen, { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry }));
    }
  }
  return points;
}

function roundedRectangleScreenPoints(node, localToScreen) {
  const width = Number(node.geometry.width);
  const height = Number(node.geometry.height);
  const halfW = width / 2;
  const halfH = height / 2;
  const radius = Math.max(0, Math.min(Number(node.geometry.cornerRadius) || 0, halfW, halfH));
  if (radius <= 1e-12) return [
    apply(localToScreen, { x: -halfW, y: -halfH }),
    apply(localToScreen, { x: halfW, y: -halfH }),
    apply(localToScreen, { x: halfW, y: halfH }),
    apply(localToScreen, { x: -halfW, y: halfH }),
  ];
  const quarterSweep = Math.PI / 2;
  const perQuarter = conicSegmentCount(localToScreen, radius, radius, quarterSweep);
  const corners = [
    { cx: halfW - radius, cy: -halfH + radius, start: -Math.PI / 2 },
    { cx: halfW - radius, cy: halfH - radius, start: 0 },
    { cx: -halfW + radius, cy: halfH - radius, start: Math.PI / 2 },
    { cx: -halfW + radius, cy: -halfH + radius, start: Math.PI },
  ];
  const result = [];
  for (const corner of corners) {
    for (let index = 0; index < perQuarter; index += 1) {
      const angle = corner.start + (index / perQuarter) * quarterSweep;
      result.push(apply(localToScreen, {
        x: corner.cx + Math.cos(angle) * radius,
        y: corner.cy + Math.sin(angle) * radius,
      }));
    }
  }
  return result;
}

function drawableGeometry(node) {
  if (node.type === 'rectangle' || node.type === 'ellipse') {
    return Number(node.geometry?.width) > 0 && Number(node.geometry?.height) > 0;
  }
  if (node.type === 'polygon') return Number(node.geometry?.radius) > 0 && Number(node.geometry?.sides) >= 3;
  if (node.type === 'star') {
    return Number(node.geometry?.outerRadius) > 0
      && Number(node.geometry?.innerRadius) >= 0
      && Number(node.geometry?.points) >= 2;
  }
  if (node.type === 'path') return Array.isArray(node.geometry?.vertices) && node.geometry.vertices.length >= 2;
  return false;
}

function geometryScreenPath(node, localToScreen) {
  if (!drawableGeometry(node)) return { points: [], strokeClosed: false, curvedApproximation: false };
  if (node.type === 'path') return pathScreenPoints(node, localToScreen);
  if (node.type === 'ellipse') return { points: ellipseScreenPoints(node, localToScreen), strokeClosed: true, curvedApproximation: true };
  if (node.type === 'rectangle') {
    const curved = Number(node.geometry?.cornerRadius) > 0;
    return { points: roundedRectangleScreenPoints(node, localToScreen), strokeClosed: true, curvedApproximation: curved };
  }
  let local;
  if (node.type === 'polygon') local = regularPolygonPoints(node.geometry.radius, node.geometry.sides);
  else if (node.type === 'star') local = starPoints(node.geometry.outerRadius, node.geometry.innerRadius, node.geometry.points);
  else return { points: [], strokeClosed: false, curvedApproximation: false };
  return { points: local.map((point) => apply(localToScreen, point)), strokeClosed: true, curvedApproximation: false };
}

function exactCurvedFillContains(node, screen, localToScreen) {
  if (!['rectangle', 'ellipse'].includes(node.type)) return null;
  const inverse = invert(localToScreen);
  if (!inverse) return false;
  const localPoint = apply(inverse, screen);
  return node.type === 'ellipse'
    ? localEllipseContains(node, localPoint)
    : localRoundedRectangleContains(node, localPoint);
}

function hitGeometry(node, screen, worldMatrix, viewportTransform) {
  const localToScreen = multiply(viewportTransform.matrix, worldMatrix);
  if (fillEnabled(node)) {
    const exactCurvedFill = exactCurvedFillContains(node, screen, localToScreen);
    if (exactCurvedFill === true) return true;
    if (exactCurvedFill === null) {
      const fillPath = geometryScreenPath(node, localToScreen);
      // SVG fill semantics implicitly close an open path subpath. The winding
      // test closes via modulo even when the authored path stroke is open.
      if (fillPath.points.length >= 3 && nonzeroContains(screen, fillPath.points)) return true;
    }
  }
  if (!strokeEnabled(node)) return false;

  const { points, strokeClosed, curvedApproximation } = geometryScreenPath(node, localToScreen);
  if (points.length < 2) return false;
  const halfStroke = Math.abs(Number(node.paint.strokeWidth)) / 2;
  // Ellipse/rounded-rect chord error consumes part of the public tolerance
  // budget, so the maximum true-boundary expansion remains <= 0.35 CSS px.
  const allowance = curvedApproximation && ['ellipse', 'rectangle'].includes(node.type)
    ? VEYRA_HIT_TEST_TOLERANCE_PX - VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX
    : VEYRA_HIT_TEST_TOLERANCE_PX;
  const threshold = (halfStroke + allowance) ** 2;
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
 * point. Screen mapping mirrors SVG `viewBox` + `xMidYMid meet`, so runtime hits
 * stay aligned with rendering across aspect ratios, pan, and zoom. `opacity`
 * deliberately does not participate.
 */
export function hitTestPoint(point, document, viewport = {}) {
  if (!point || !document || !Array.isArray(document.nodes)) return null;
  const zoom = finite(viewport.zoom, 1);
  if (!(zoom > 0)) return null;
  const artboard = document.artboard || {};
  const width = finite(viewport.width, finite(artboard.width, 0));
  const height = finite(viewport.height, finite(artboard.height, 0));
  if (!(width > 0) || !(height > 0)) return null;
  const centerX = finite(viewport.centerX, finite(viewport.panX, finite(artboard.width, 0) / 2));
  const centerY = finite(viewport.centerY, finite(viewport.panY, finite(artboard.height, 0) / 2));
  const viewportTransform = createSvgViewBoxScreenTransform(artboard, { width, height, zoom, centerX, centerY });
  if (!viewportTransform) return null;
  const screen = { x: finite(point.x), y: finite(point.y) };
  const { byId, resolve } = worldMatrices(document);
  const paintOrder = evaluatedPaintOrder(document, byId);
  for (let index = paintOrder.length - 1; index >= 0; index -= 1) {
    const node = paintOrder[index];
    if (hitGeometry(node, screen, resolve(node), viewportTransform)) return { kind: 'node', id: node.id };
  }
  return null;
}
