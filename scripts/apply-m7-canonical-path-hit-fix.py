from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('src/veyra/geometry.js')
t = p.read_text()
old = """function lineTo(point) { return `L ${point.x} ${point.y}`; }

export function pathData(geometry) {
  const vertices = geometry?.vertices || [];
  if (!vertices.length) return '';
  const closed = Boolean(geometry.closed);
  const corners = vertices.map((_, index) => roundedCorner(vertices, index, closed));
  if (!corners.some(Boolean)) {
    const commands = [`M ${vertices[0].x} ${vertices[0].y}`];
    for (let index = 1; index < vertices.length; index += 1) commands.push(segmentCommand(vertices[index - 1], vertices[index]));
    if (closed && vertices.length > 1) commands.push(segmentCommand(vertices.at(-1), vertices[0]), 'Z');
    return commands.join(' ');
  }

  const start = closed && corners[0] ? corners[0].exit : vertices[0];
  const commands = [`M ${start.x} ${start.y}`];
  for (let index = 1; index < vertices.length; index += 1) {
    const previousCorner = corners[index - 1];
    const currentCorner = corners[index];
    if (previousCorner || currentCorner) commands.push(lineTo(currentCorner?.entry || vertices[index]));
    else commands.push(segmentCommand(vertices[index - 1], vertices[index]));
    if (currentCorner) commands.push(`Q ${vertices[index].x} ${vertices[index].y} ${currentCorner.exit.x} ${currentCorner.exit.y}`);
  }
  if (closed && vertices.length > 1) {
    const lastCorner = corners.at(-1);
    if (lastCorner || corners[0]) commands.push(lineTo(corners[0]?.entry || vertices[0]));
    else commands.push(segmentCommand(vertices.at(-1), vertices[0]));
    if (corners[0]) commands.push(`Q ${vertices[0].x} ${vertices[0].y} ${corners[0].exit.x} ${corners[0].exit.y}`);
    commands.push('Z');
  }
  return commands.join(' ');
}
"""
new = """function pointValue(vertex) { return { x: number(vertex.x), y: number(vertex.y) }; }

function pathSegment(from, to) {
  if (hasHandle(from, 'out') || hasHandle(to, 'in')) {
    return {
      type: 'cubic',
      c1: { x: number(from.x) + number(from.outX), y: number(from.y) + number(from.outY) },
      c2: { x: number(to.x) + number(to.inX), y: number(to.y) + number(to.inY) },
      to: pointValue(to),
    };
  }
  return { type: 'line', to: pointValue(to) };
}

/**
 * Canonical compiled path geometry consumed by rendering/export and hit testing.
 * Authored vertices/handles/radii stay editable; this derived representation is
 * never persisted. Straight corner radii compile to explicit quadratic segments.
 */
export function pathSegments(geometry) {
  const vertices = geometry?.vertices || [];
  if (!vertices.length) return { start: null, segments: [], closed: false };
  const closed = Boolean(geometry.closed);
  const corners = vertices.map((_, index) => roundedCorner(vertices, index, closed));
  const start = closed && corners[0] ? corners[0].exit : pointValue(vertices[0]);
  const segments = [];

  for (let index = 1; index < vertices.length; index += 1) {
    const previousCorner = corners[index - 1];
    const currentCorner = corners[index];
    if (previousCorner || currentCorner) {
      segments.push({ type: 'line', to: { ...(currentCorner?.entry || pointValue(vertices[index])) } });
    } else {
      segments.push(pathSegment(vertices[index - 1], vertices[index]));
    }
    if (currentCorner) {
      segments.push({ type: 'quadratic', c: pointValue(vertices[index]), to: { ...currentCorner.exit } });
    }
  }

  if (closed && vertices.length > 1) {
    const lastCorner = corners.at(-1);
    if (lastCorner || corners[0]) {
      segments.push({ type: 'line', to: { ...(corners[0]?.entry || pointValue(vertices[0])) } });
    } else {
      segments.push(pathSegment(vertices.at(-1), vertices[0]));
    }
    if (corners[0]) segments.push({ type: 'quadratic', c: pointValue(vertices[0]), to: { ...corners[0].exit } });
  }
  return { start: { ...start }, segments, closed };
}

function pathSegmentCommand(segment) {
  if (segment.type === 'cubic') return `C ${segment.c1.x} ${segment.c1.y} ${segment.c2.x} ${segment.c2.y} ${segment.to.x} ${segment.to.y}`;
  if (segment.type === 'quadratic') return `Q ${segment.c.x} ${segment.c.y} ${segment.to.x} ${segment.to.y}`;
  return `L ${segment.to.x} ${segment.to.y}`;
}

export function pathData(geometry) {
  const compiled = pathSegments(geometry);
  if (!compiled.start) return '';
  const commands = [`M ${compiled.start.x} ${compiled.start.y}`, ...compiled.segments.map(pathSegmentCommand)];
  if (compiled.closed) commands.push('Z');
  return commands.join(' ');
}
"""
t = replace_once(t, old, new, 'canonical path compiler')
p.write_text(t)

p = Path('src/veyra/hitTest.js')
t = p.read_text()
t = replace_once(
    t,
    """import { regularPolygonPoints, starPoints } from './geometry.js';""",
    """import { pathSegments, regularPolygonPoints, starPoints } from './geometry.js';""",
    'hit-test canonical path import',
)
start = t.index('function pathScreenPoints(node, localToScreen) {')
end = t.index('\nfunction conicSecondDerivativeBound', start)
new_fn = """function pathScreenPoints(node, localToScreen) {
  const compiled = pathSegments(node.geometry);
  if (!compiled.start) return { points: [], strokeClosed: false, curvedApproximation: true };
  let current = apply(localToScreen, compiled.start);
  const result = [current];
  for (const segment of compiled.segments) {
    const next = apply(localToScreen, segment.to);
    if (segment.type === 'cubic') {
      flattenCubic(
        current,
        apply(localToScreen, segment.c1),
        apply(localToScreen, segment.c2),
        next,
        result,
        VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX,
      );
    } else if (segment.type === 'quadratic') {
      const control = apply(localToScreen, segment.c);
      const c1 = {
        x: current.x + (control.x - current.x) * (2 / 3),
        y: current.y + (control.y - current.y) * (2 / 3),
      };
      const c2 = {
        x: next.x + (control.x - next.x) * (2 / 3),
        y: next.y + (control.y - next.y) * (2 / 3),
      };
      flattenCubic(current, c1, c2, next, result, VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX);
    } else {
      result.push(next);
    }
    current = next;
  }
  return { points: result, strokeClosed: compiled.closed, curvedApproximation: true };
}
"""
t = t[:start] + new_fn + t[end:]
p.write_text(t)

p = Path('tests/veyra-m7-authoring.test.mjs')
t = p.read_text()
t = replace_once(
    t,
    """import { pathData } from '../src/veyra/geometry.js';""",
    """import { pathData, pathSegments } from '../src/veyra/geometry.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';""",
    'M7 canonical path test imports',
)
anchor = """// 20. Zoom is editor-only; authored path semantics stay byte-for-byte stable.
test('10%-800% zoom changes no authored geometry or path rendering semantics', () => {"""
insert = """test('rounded path corners share one compiled representation between renderer/export and hit testing', () => {
  const rounded = pathNode('rounded_hit', { geometry: {
    closed: true,
    vertices: [
      pathVertex('rh1', 0, 0),
      pathVertex('rh2', 100, 0, { cornerRadius: 20 }),
      pathVertex('rh3', 100, 100),
      pathVertex('rh4', 0, 100),
    ],
  } });
  const document = normalizedSingle([rounded], { width: 200, height: 200 });
  const compiled = pathSegments(document.nodes[0].geometry);
  assert.ok(compiled.segments.some((segment) => segment.type === 'quadratic'));
  assert.match(pathData(document.nodes[0].geometry), /Q 100 0 100 20/);
  const viewport = { width: 200, height: 200, zoom: 1, centerX: 100, centerY: 100 };
  assert.equal(hitTestPoint({ x: 99, y: 1 }, document, viewport), null, 'point clipped by rounded corner must not hit raw polygon corner');
  assert.deepEqual(hitTestPoint({ x: 90, y: 5 }, document, viewport), { kind: 'node', id: 'rounded_hit' }, 'point inside compiled rounded path remains hittable');
});

// 20. Zoom is editor-only; authored path semantics stay byte-for-byte stable.
test('10%-800% zoom changes no authored geometry or path rendering semantics', () => {"""
t = replace_once(t, anchor, insert, 'rounded path hit-test regression')
p.write_text(t)
print('M7 canonical path/hit-test parity fix applied')
