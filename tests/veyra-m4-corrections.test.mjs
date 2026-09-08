import assert from 'node:assert/strict';
import {
  createDocument,
  createNode,
  createPointerListener,
  createTimeline,
  normalizeDocument,
} from '../src/veyra/model.js';
import {
  hitTestPoint,
  VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX,
  VEYRA_HIT_TEST_TOLERANCE_PX,
} from '../src/veyra/hitTest.js';
import { createListenerResolver } from '../src/veyra/listenersRuntime.js';
import { createSvgViewBoxScreenTransform, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from '../src/veyra/viewport.js';
import { transformMatrix } from '../src/veyra/contracts.js';

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

function screenMatrix(artboard, viewport) {
  const mapping = createSvgViewBoxScreenTransform(artboard, viewport);
  assert.ok(mapping, 'screen mapping is constructible');
  assert.equal(mapping.preserveAspectRatio, 'xMidYMid meet');
  return mapping.matrix;
}

function localToScreen(node, artboard, viewport, localPoint) {
  return apply(multiply(screenMatrix(artboard, viewport), transformMatrix(node.transform)), localPoint);
}

function makeArtboardDocument(node, artboard = { width: 400, height: 200 }) {
  return normalizeDocument(createDocument({ artboard, nodes: [node] }));
}

// ---------------------------------------------------------------------------
// Correction 1: SVG viewBox + xMidYMid meet mapping parity.
// ---------------------------------------------------------------------------
{
  const artboard = { width: 400, height: 200 };
  const full = createNode('rectangle', {
    id: 'full-artboard',
    transform: { x: 200, y: 100 },
    geometry: { width: 400, height: 200, cornerRadius: 0 },
  });
  const document = makeArtboardDocument(full, artboard);
  const cases = [
    {
      name: 'same aspect ratio',
      viewport: { width: 800, height: 400, zoom: 1, centerX: 200, centerY: 100 },
      center: { x: 400, y: 200 },
      bar: null,
    },
    {
      name: 'viewport wider than artboard',
      viewport: { width: 800, height: 200, zoom: 1, centerX: 200, centerY: 100 },
      center: { x: 400, y: 100 },
      bar: { x: 100, y: 100 },
    },
    {
      name: 'viewport taller than artboard',
      viewport: { width: 400, height: 800, zoom: 1, centerX: 200, centerY: 100 },
      center: { x: 200, y: 400 },
      bar: { x: 200, y: 100 },
    },
  ];
  for (const item of cases) {
    assert.deepEqual(hitTestPoint(item.center, document, item.viewport), { kind: 'node', id: 'full-artboard' }, `${item.name}: visually rendered center hits`);
    if (item.bar) assert.equal(hitTestPoint(item.bar, document, item.viewport), null, `${item.name}: letterbox/pillarbox space is not a false artboard hit`);
  }
  assert.equal(VEYRA_SVG_PRESERVE_ASPECT_RATIO, 'xMidYMid meet');
}

{
  const artboard = { width: 400, height: 200 };
  const focused = createNode('rectangle', {
    id: 'focused', transform: { x: 250, y: 80 }, geometry: { width: 30, height: 30, cornerRadius: 0 },
  });
  const document = makeArtboardDocument(focused, artboard);
  const viewport = { width: 800, height: 200, zoom: 2, centerX: 250, centerY: 80 };
  assert.deepEqual(hitTestPoint({ x: 400, y: 100 }, document, viewport), { kind: 'node', id: 'focused' }, 'non-1 zoom and non-default view center map visual center exactly');
}

{
  const artboard = { width: 400, height: 200 };
  const path = createNode('path', {
    id: 'mapped-stroke-path',
    transform: { x: 220, y: 90, rotation: Math.PI / 5, scaleX: 1.7, scaleY: 0.6 },
    geometry: {
      closed: false,
      vertices: [
        { id: 'a', x: -50, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { id: 'b', x: 50, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
      ],
    },
    paint: { fill: { type: 'solid', color: 'none' }, stroke: '#000000', strokeWidth: 10 },
  });
  const document = makeArtboardDocument(path, artboard);
  const viewport = { width: 900, height: 260, zoom: 1.75, centerX: 230, centerY: 95 };
  const start = localToScreen(path, artboard, viewport, { x: -50, y: 0 });
  const end = localToScreen(path, artboard, viewport, { x: 50, y: 0 });
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
  assert.deepEqual(
    hitTestPoint({ x: midpoint.x + normal.x * 5.2, y: midpoint.y + normal.y * 5.2 }, document, viewport),
    { kind: 'node', id: 'mapped-stroke-path' },
    'transformed path stroke stays aligned after aspect-ratio mapping',
  );
  assert.equal(
    hitTestPoint({ x: midpoint.x + normal.x * 5.6, y: midpoint.y + normal.y * 5.6 }, document, viewport),
    null,
    'transformed path non-scaling stroke rejects outside final-pixel boundary',
  );
}

// ---------------------------------------------------------------------------
// Correction 2: analytical curved fills + tolerance-bounded curved strokes.
// ---------------------------------------------------------------------------
assert.equal(VEYRA_HIT_TEST_TOLERANCE_PX, 0.35);
assert.equal(VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX, 0.0875);
assert.ok(VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX < VEYRA_HIT_TEST_TOLERANCE_PX, 'curved-stroke tessellation consumes only a bounded fraction of the public tolerance');

{
  const artboard = { width: 1000, height: 1000 };
  const ellipse = createNode('ellipse', {
    id: 'huge-ellipse', transform: { x: 500, y: 500 }, geometry: { width: 50, height: 50 },
  });
  const document = makeArtboardDocument(ellipse, artboard);
  const viewport = { width: 4000, height: 4000, zoom: 8, centerX: 500, centerY: 500 };
  const center = localToScreen(ellipse, artboard, viewport, { x: 0, y: 0 });
  const boundary = localToScreen(ellipse, artboard, viewport, { x: 25, y: 0 });
  const radius = boundary.x - center.x;
  assert.ok(radius >= 799.9, 'fixture creates an ~800px rendered ellipse radius');
  assert.deepEqual(hitTestPoint({ x: center.x + radius - 0.1, y: center.y }, document, viewport), { kind: 'node', id: 'huge-ellipse' }, 'large/high-zoom ellipse accepts a point 0.1px inside its true SVG boundary');
  assert.equal(hitTestPoint({ x: center.x + radius + 0.1, y: center.y }, document, viewport), null, 'large/high-zoom ellipse rejects a point 0.1px outside its true SVG boundary');
}

{
  const artboard = { width: 600, height: 400 };
  const ellipse = createNode('ellipse', {
    id: 'nonuniform-ellipse',
    transform: { x: 300, y: 200, rotation: Math.PI / 7, scaleX: 4, scaleY: 0.2 },
    geometry: { width: 120, height: 80 },
  });
  const document = makeArtboardDocument(ellipse, artboard);
  const viewport = { width: 900, height: 500, zoom: 2.5, centerX: 300, centerY: 200 };
  const inside = localToScreen(ellipse, artboard, viewport, { x: 59.99, y: 0 });
  const outside = localToScreen(ellipse, artboard, viewport, { x: 60.01, y: 0 });
  assert.deepEqual(hitTestPoint(inside, document, viewport), { kind: 'node', id: 'nonuniform-ellipse' }, 'highly non-uniform affine ellipse keeps exact analytical fill containment');
  assert.equal(hitTestPoint(outside, document, viewport), null, 'non-uniform affine ellipse rejects just outside local analytical boundary');
}

{
  const artboard = { width: 800, height: 800 };
  const rounded = createNode('rectangle', {
    id: 'large-rounded', transform: { x: 400, y: 400 },
    geometry: { width: 120, height: 120, cornerRadius: 50 },
  });
  const document = makeArtboardDocument(rounded, artboard);
  const viewport = { width: 3200, height: 3200, zoom: 8, centerX: 400, centerY: 400 };
  const cornerCenter = { x: 10, y: -10 };
  const unit = Math.SQRT1_2;
  const inside = localToScreen(rounded, artboard, viewport, { x: cornerCenter.x + unit * 49.995, y: cornerCenter.y - unit * 49.995 });
  const outside = localToScreen(rounded, artboard, viewport, { x: cornerCenter.x + unit * 50.005, y: cornerCenter.y - unit * 50.005 });
  assert.deepEqual(hitTestPoint(inside, document, viewport), { kind: 'node', id: 'large-rounded' }, 'large rounded rectangle accepts true curved-boundary interior at high zoom');
  assert.equal(hitTestPoint(outside, document, viewport), null, 'large rounded rectangle rejects true curved-boundary exterior at high zoom');
}

{
  const artboard = { width: 600, height: 400 };
  const rounded = createNode('rectangle', {
    id: 'rotated-rounded',
    transform: { x: 300, y: 200, rotation: Math.PI / 4, scaleX: 2.2, scaleY: 0.55 },
    geometry: { width: 180, height: 100, cornerRadius: 40 },
  });
  const document = makeArtboardDocument(rounded, artboard);
  const viewport = { width: 1000, height: 500, zoom: 2, centerX: 310, centerY: 190 };
  const inside = localToScreen(rounded, artboard, viewport, { x: 49, y: -49 });
  const outside = localToScreen(rounded, artboard, viewport, { x: 89, y: -49 });
  assert.deepEqual(hitTestPoint(inside, document, viewport), { kind: 'node', id: 'rotated-rounded' }, 'rotated/non-uniform rounded rectangle fill uses renderer-equivalent local geometry');
  assert.equal(hitTestPoint(outside, document, viewport), null, 'rotated/non-uniform rounded rectangle rejects outside geometry');
}

for (const [type, geometry] of [
  ['ellipse', { width: 200, height: 120 }],
  ['rectangle', { width: 200, height: 120, cornerRadius: 50 }],
]) {
  const artboard = { width: 400, height: 300 };
  const node = createNode(type, {
    id: `stroke-${type}`,
    transform: { x: 200, y: 150 }, geometry,
    paint: { fill: { type: 'solid', color: 'none' }, stroke: '#111111', strokeWidth: 10 },
  });
  const document = makeArtboardDocument(node, artboard);
  const viewport = { width: 1200, height: 900, zoom: 3, centerX: 200, centerY: 150 };
  const edgeLocal = { x: geometry.width / 2, y: 0 };
  const edge = localToScreen(node, artboard, viewport, edgeLocal);
  assert.deepEqual(hitTestPoint({ x: edge.x + 5.2, y: edge.y }, document, viewport), { kind: 'node', id: `stroke-${type}` }, `${type} non-scaling stroke hits within half-width + tolerance`);
  assert.equal(hitTestPoint({ x: edge.x + 5.5, y: edge.y }, document, viewport), null, `${type} non-scaling stroke rejects beyond the documented tolerance budget`);
}

// ---------------------------------------------------------------------------
// Correction 3: structured pointer lifecycle identity for arbitrary IDs.
// ---------------------------------------------------------------------------
{
  const firstId = 'button:primary';
  const secondId = 'panel/%3A?slot=two#x:y';
  const timeline = createTimeline({ id: 'tl:pointer', duration: 10 });
  const first = createNode('rectangle', { id: firstId, name: 'not important', transform: { x: 100, y: 100 }, geometry: { width: 80, height: 80 } });
  const second = createNode('rectangle', { id: secondId, name: 'also irrelevant', transform: { x: 300, y: 100 }, geometry: { width: 80, height: 80 } });
  const listeners = [
    createPointerListener({ id: 'first-enter', target: firstId, event: 'pointerenter', action: 'play', timeline: timeline.id }),
    createPointerListener({ id: 'first-leave', target: firstId, event: 'pointerleave', action: 'stop', timeline: timeline.id }),
    createPointerListener({ id: 'first-click', target: firstId, event: 'click', action: 'play', timeline: timeline.id }),
    createPointerListener({ id: 'second-enter', target: secondId, event: 'pointerenter', action: 'play', timeline: timeline.id }),
    createPointerListener({ id: 'second-leave', target: secondId, event: 'pointerleave', action: 'stop', timeline: timeline.id }),
    createPointerListener({ id: 'second-click', target: secondId, event: 'click', action: 'play', timeline: timeline.id }),
  ];
  const document = normalizeDocument(createDocument({
    artboard: { width: 400, height: 200 }, nodes: [first, second], timelines: [timeline], listeners,
  }));
  const viewport = { width: 400, height: 200, zoom: 1, centerX: 200, centerY: 100 };
  const resolver = createListenerResolver({ document, viewport });

  const enter = resolver.resolve({ type: 'pointermove', x: 100, y: 100, pointerId: 7 });
  assert.deepEqual(enter.hit, { kind: 'node', id: firstId });
  assert.equal(enter.transitions.length, 1);
  assert.equal(enter.transitions[0].listenerId, 'first-enter');
  assert.equal(enter.hoverKey.id, firstId, 'hover state preserves the complete colon-containing stable ID');
  assert.equal(typeof enter.hoverKey, 'object', 'hover identity is structured, not a delimiter-encoded string');

  const repeat = resolver.resolve({ type: 'pointermove', x: 101, y: 101, pointerId: 7 });
  assert.equal(repeat.transitions.length, 0, 'repeated movement inside punctuated ID does not repeat pointerenter');

  const switchTarget = resolver.resolve({ type: 'pointermove', x: 300, y: 100, pointerId: 7 });
  assert.deepEqual(switchTarget.transitions.map((entry) => entry.listenerId), ['first-leave', 'second-enter'], 'moving between punctuated IDs emits one leave then one enter for full IDs');
  assert.equal(switchTarget.hoverKey.id, secondId);

  const away = resolver.resolve({ type: 'pointermove', x: 10, y: 10, pointerId: 7 });
  assert.deepEqual(away.transitions.map((entry) => entry.listenerId), ['second-leave'], 'moving away emits exactly one leave for the complete URL-like ID');

  resolver.resolve({ type: 'pointerdown', x: 100, y: 100, pointerId: 8 });
  const sameUp = resolver.resolve({ type: 'pointerup', x: 100, y: 100, pointerId: 8 });
  assert.equal(sameUp.clickQualified, true, 'down/up on same punctuated stable ID qualifies click');
  assert.equal(sameUp.intents.length, 1, 'qualified click emits exactly one click intent');

  resolver.resolve({ type: 'pointerdown', x: 100, y: 100, pointerId: 9 });
  const otherUp = resolver.resolve({ type: 'pointerup', x: 300, y: 100, pointerId: 9 });
  assert.equal(otherUp.clickQualified, false, 'down on one punctuated ID and up on another does not qualify click');

  const renamed = normalizeDocument({
    ...document,
    nodes: document.nodes.map((node) => ({ ...node, name: node.id === firstId ? 'completely misleading display name' : 'another display name' })),
  });
  resolver.setDocument(renamed);
  const renamedEnter = resolver.resolve({ type: 'pointermove', x: 100, y: 100, pointerId: 10 });
  assert.equal(renamedEnter.hit.id, firstId, 'display-name changes remain irrelevant to lifecycle identity');
}

console.log('veyra M4 interaction correctness correction tests passed');
