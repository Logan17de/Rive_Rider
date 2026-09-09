import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDocument,
  createNode,
  normalizeDocument,
} from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { pathData } from '../src/veyra/geometry.js';
import { serializeVeyra, parseVeyra } from '../src/veyra/io.js';
import {
  createArtboardRef,
  createNodeRef,
} from '../src/veyra/references.js';
import {
  invertMatrix,
  multiplyMatrices,
  transformMatrix,
  transformPoint,
} from '../src/veyra/contracts.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import {
  EditorSelectionState,
  createPenDraft,
  penVertexFromGesture,
  appendPenDraftVertex,
  penDraftCanFinish,
  finalizePenDraftGeometry,
  pathVertexDependencyEvidence,
  setVertexHandleModeInDocument,
  moveBezierHandleInDocument,
  groupNodesInDocument,
  ungroupNodeInDocument,
  nodeWorldMatrix,
  marqueeNodeRefs,
  worldRectFromPoints,
  normalizeOverlayVisibility,
  editorCommandForKeyEvent,
  coordinateReadout,
} from '../src/veyra/editorAuthoring.js';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function close(actual, expected, epsilon = 1e-8, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}
function matrixClose(actual, expected, epsilon = 1e-8) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => close(value, expected[index], epsilon, `matrix[${index}]`));
}
function clone(value) { return structuredClone(value); }
function pathVertex(id, x, y, extra = {}) {
  return { id, x, y, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0, ...extra };
}
function pathNode(id = 'path_a', overrides = {}) {
  return createNode('path', {
    id,
    name: overrides.name ?? 'same-name',
    transform: overrides.transform ?? { x: 0, y: 0 },
    parent: overrides.parent ?? null,
    artboard: overrides.artboard,
    geometry: overrides.geometry ?? {
      closed: false,
      vertices: [pathVertex(`${id}_v1`, 0, 0), pathVertex(`${id}_v2`, 100, 0), pathVertex(`${id}_v3`, 100, 100)],
    },
    paint: { fill: 'none', stroke: '#112233', strokeWidth: 2 },
  });
}
function rectNode(id, transform = {}, extra = {}) {
  return createNode('rectangle', {
    id,
    name: extra.name ?? 'duplicate-name',
    transform: { x: 0, y: 0, ...transform },
    parent: extra.parent ?? null,
    artboard: extra.artboard,
    geometry: { width: extra.width ?? 40, height: extra.height ?? 30, cornerRadius: 0 },
    paint: { fill: '#abcdef', stroke: 'none', strokeWidth: 0 },
    locked: Boolean(extra.locked),
    visible: extra.visible !== false,
  });
}
function normalizedSingle(nodes = [], extra = {}) {
  return normalizeDocument(createDocument({
    id: extra.id ?? 'doc_m7',
    name: 'M7 Test',
    artboard: { x: extra.x ?? 0, y: extra.y ?? 0, width: extra.width ?? 900, height: extra.height ?? 600, background: '#ffffff' },
    nodes,
    timelines: extra.timelines ?? [],
    semantics: extra.semantics ?? [],
  }));
}
function worldToScreen(mapping, point) { return transformPoint(mapping.matrix, point); }
function screenToWorld(mapping, point) { return transformPoint(invertMatrix(mapping.matrix), point); }

// 1. Canonical coordinates after pan/zoom/panel resize.
test('coordinate readout shares stable client-world camera mapping after viewport changes', () => {
  const artboard = { x: 120, y: -80, width: 960, height: 640 };
  const world = { x: 377.25, y: 144.75 };
  for (const viewport of [
    { width: 1200, height: 700, zoom: 0.1, centerX: 500, centerY: 220 },
    { width: 733, height: 511, zoom: 1, centerX: 612, centerY: 111 },
    { width: 1711, height: 833, zoom: 8, centerX: -20, centerY: 400 },
  ]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, viewport);
    const client = worldToScreen(mapping, world);
    const roundTrip = screenToWorld(mapping, client);
    close(roundTrip.x, world.x); close(roundTrip.y, world.y);
    assert.equal(mapping.scale, viewport.zoom);
    assert.equal(coordinateReadout(roundTrip, 2), 'X 377.25 · Y 144.75');
  }
  const shell = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(shell, /renderer\.clientPoint\(event\.clientX, event\.clientY\)/);
  assert.match(shell, /formatCoordinateReadout\(point, 2\)/);
});

// 2-4. Pen lifecycle.
test('Pen Escape semantic command finalizes a valid 2+ vertex draft', () => {
  const draft = createPenDraft();
  appendPenDraftVertex(draft, penVertexFromGesture({ x: 10, y: 20 }, { x: 10, y: 20 }, { dragged: false }));
  appendPenDraftVertex(draft, penVertexFromGesture({ x: 90, y: 45 }, { x: 90, y: 45 }, { dragged: false }));
  assert.equal(penDraftCanFinish(draft), true);
  const geometry = finalizePenDraftGeometry(draft, { closed: false });
  assert.equal(geometry.vertices.length, 2);
  assert.equal(editorCommandForKeyEvent({ key: 'Escape' }, { tool: 'pencil' }), 'editor.path.finish');
  const shell = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(shell, /currentTool === 'pencil'[^]*finishPenDraft/);
});

test('tool switching routes a valid Pen draft through one finalizer and clears it after creation', () => {
  const shell = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(shell, /currentTool === 'pencil' && tool !== 'pencil'[^]*finishPenDraft\(\{ closed: false, enterVertex: false, reason: 'tool-switch' \}\)/);
  assert.match(shell, /draftPathPoints = \[\];\s*renderer\.setDraftPath\(\[\]\)/);
  assert.doesNotMatch(shell, /currentTool === 'pencil' && tool !== 'pencil'[^]{0,220}draftPathPoints = \[\]/);
});

test('one-point Pen draft cannot serialize and cancellation is document/history clean', () => {
  const draft = createPenDraft([pathVertex('draft_only', 1, 2)]);
  assert.equal(penDraftCanFinish(draft), false);
  assert.throws(() => finalizePenDraftGeometry(draft), /at least two/);
  const store = new VeyraStore(normalizedSingle([]));
  const before = serializeVeyra(store.document);
  const history = store.commandHistory.length;
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.commandHistory.length, history);
});

// 5-7. Bezier UX and persistence.
test('click-drag Pen gesture creates immediately usable mirrored Bezier handles', () => {
  const vertex = penVertexFromGesture({ x: 20, y: 30 }, { x: 44, y: 42 }, { dragged: true, threshold: 3 });
  assert.equal(vertex.handleMode, 'mirrored');
  assert.deepEqual([vertex.inX, vertex.inY, vertex.outX, vertex.outY], [-24, -12, 24, 12]);
});

test('zero-handle straight vertex can become curved deterministically from canvas semantics', () => {
  const document = normalizedSingle([pathNode('curve')]);
  const vertex = document.nodes[0].geometry.vertices[1];
  assert.equal(vertex.handleMode, 'straight');
  setVertexHandleModeInDocument(document, 'curve', vertex.id, 'mirrored');
  assert.equal(vertex.handleMode, 'mirrored');
  assert.ok(Math.hypot(vertex.outX, vertex.outY) > 0);
  close(vertex.inX, -vertex.outX); close(vertex.inY, -vertex.outY);
});

test('handle mode and corner radius survive save-load and undo-redo', () => {
  const store = new VeyraStore(normalizedSingle([pathNode('persist')]));
  const vertexId = store.document.nodes[0].geometry.vertices[1].id;
  store.setVertexHandleMode('persist', vertexId, 'mirrored', 'smooth');
  store.setVertexCornerRadius('persist', vertexId, 18, 'radius');
  const serialized = serializeVeyra(store.document);
  const loaded = parseVeyra(serialized);
  let vertex = loaded.nodes[0].geometry.vertices.find((item) => item.id === vertexId);
  assert.equal(vertex.handleMode, 'mirrored'); assert.equal(vertex.cornerRadius, 18);
  assert.equal(store.undo(), true);
  vertex = store.document.nodes[0].geometry.vertices.find((item) => item.id === vertexId);
  assert.equal(vertex.cornerRadius, 0);
  assert.equal(store.redo(), true);
  vertex = store.document.nodes[0].geometry.vertices.find((item) => item.id === vertexId);
  assert.equal(vertex.cornerRadius, 18);
});

// 8-9. Stable topology commands.
test('add/remove vertex keeps surviving stable ids and uses deterministic command ids', () => {
  const store = new VeyraStore(normalizedSingle([pathNode('topology')]));
  const plane = createVeyraControlPlane(store);
  const beforeIds = store.document.nodes[0].geometry.vertices.map((v) => v.id);
  const added = plane.dispatchCommand({ action: 'addVertex', args: { nodeId: 'topology', vertex: { x: 50, y: 50 } }, command: { label: 'add', source: 'ai' } });
  assert.equal(added.ok, true);
  assert.equal(added.result.kind, 'pathVertex');
  const addedId = added.result.id;
  assert.ok(addedId.startsWith('pathVertex_m3_'));
  const afterAdd = store.document.nodes[0].geometry.vertices.map((v) => v.id);
  assert.deepEqual(afterAdd.slice(0, beforeIds.length), beforeIds);
  const removed = plane.dispatchCommand({ action: 'removeVertex', args: { nodeId: 'topology', vertexId: addedId }, command: { label: 'remove', source: 'ai' } });
  assert.equal(removed.ok, true);
  assert.deepEqual(store.document.nodes[0].geometry.vertices.map((v) => v.id), beforeIds);
});

test('open close reverse are deterministic undoable and reverse remaps directional track addresses', () => {
  const node = pathNode('reverse', { geometry: {
    closed: false,
    vertices: [pathVertex('rv1', 0, 0, { outX: 20, outY: 4, handleMode: 'detached' }), pathVertex('rv2', 100, 0, { inX: -12, inY: 8, handleMode: 'detached' }), pathVertex('rv3', 120, 90)],
  } });
  const address = 'node:reverse/geometry/vertices/rv1/outX';
  const timeline = { id: 'tl', name: 'TL', duration: 60, fps: 30, loop: 'none', workStart: 0, workEnd: 60, tracks: [{ id: 'tr', address, keyframes: [{ id: 'kf', frame: 0, value: 20, easing: 'linear' }] }] };
  const store = new VeyraStore(normalizedSingle([node], { timelines: [timeline] }));
  store.closePath('reverse', 'close'); assert.equal(store.document.nodes[0].geometry.closed, true);
  store.openPath('reverse', 'open'); assert.equal(store.document.nodes[0].geometry.closed, false);
  const ids = store.document.nodes[0].geometry.vertices.map((v) => v.id);
  store.reversePath('reverse', 'reverse');
  assert.deepEqual(store.document.nodes[0].geometry.vertices.map((v) => v.id), [...ids].reverse());
  assert.equal(store.document.timelines[0].tracks[0].address, 'node:reverse/geometry/vertices/rv1/inX');
  assert.equal(store.undo(), true);
  assert.deepEqual(store.document.nodes[0].geometry.vertices.map((v) => v.id), ids);
  assert.equal(store.document.timelines[0].tracks[0].address, address);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.document.nodes[0].geometry.vertices.map((v) => v.id), [...ids].reverse());
});

// 10. Multi-selection identity/name independence.
test('Shift-style selection toggles ordered stable refs despite duplicate/misleading names', () => {
  const selection = new EditorSelectionState();
  selection.add(createNodeRef('node_b'));
  selection.toggle(createNodeRef('node_a'));
  selection.toggle(createNodeRef('node_b'));
  selection.toggle(createNodeRef('node_b'));
  assert.deepEqual(selection.refs, [createNodeRef('node_a'), createNodeRef('node_b')]);
  assert.deepEqual(selection.primary, createNodeRef('node_b'));
});

// 11. Marquee evaluated geometry, nested transforms, non-zero artboard origin.
test('marquee selection uses evaluated world bounds under nested transforms and non-zero origin', () => {
  const parent = createNode('group', { id: 'g', transform: { x: 430, y: 260, rotation: Math.PI / 6, scaleX: 1.4, scaleY: 0.7 } });
  const child = rectNode('inside', { x: 50, y: 10, rotation: -0.2 }, { parent: createNodeRef('g') });
  const outside = rectNode('outside', { x: 820, y: 550 });
  const document = normalizedSingle([parent, child, outside], { x: 300, y: 200, width: 700, height: 500 });
  const scene = evaluateDocument(document);
  const childEval = scene.nodes.find((n) => n.id === 'inside');
  const center = transformPoint(childEval.worldMatrix, { x: 0, y: 0 });
  const rect = worldRectFromPoints({ x: center.x - 80, y: center.y - 80 }, { x: center.x + 80, y: center.y + 80 });
  const deep = marqueeNodeRefs(scene, rect, { deep: true, mode: 'intersect' });
  assert.ok(deep.some((ref) => ref.id === 'inside'));
  assert.ok(!deep.some((ref) => ref.id === 'outside'));
});

// 12-14. Group/ungroup transform and draw order.
test('group preserves child world matrices, stable ids, and contiguous draw order', () => {
  const a = rectNode('a', { x: 10, y: 20 });
  const b = rectNode('b', { x: 70, y: 30 });
  const c = rectNode('c', { x: 200, y: 30 });
  const document = normalizedSingle([a, b, c]);
  const beforeA = nodeWorldMatrix(document, 'a');
  const beforeB = nodeWorldMatrix(document, 'b');
  const result = groupNodesInDocument(document, [createNodeRef('a'), createNodeRef('b')], { id: 'group_stable', name: 'Display name irrelevant' });
  assert.equal(result.groupId, 'group_stable');
  matrixClose(nodeWorldMatrix(document, 'a'), beforeA);
  matrixClose(nodeWorldMatrix(document, 'b'), beforeB);
  assert.deepEqual(document.nodes.map((n) => n.id), ['group_stable', 'a', 'b', 'c']);
  assert.deepEqual(result.childIds, ['a', 'b']);
});

test('ungroup restores children at removal position without visual movement', () => {
  const group = createNode('group', { id: 'grp', transform: { x: 120, y: 90, rotation: 0.35, scaleX: 1.5, scaleY: 0.6 } });
  const a = rectNode('ua', { x: -20, y: 12, rotation: 0.2 }, { parent: createNodeRef('grp') });
  const b = rectNode('ub', { x: 55, y: -15, scaleX: 0.8, scaleY: 1.2 }, { parent: createNodeRef('grp') });
  const tail = rectNode('tail', { x: 500, y: 500 });
  const document = normalizedSingle([group, a, b, tail]);
  const before = new Map(['ua', 'ub'].map((id) => [id, nodeWorldMatrix(document, id)]));
  const result = ungroupNodeInDocument(document, 'grp');
  assert.deepEqual(result.childIds, ['ua', 'ub']);
  for (const id of result.childIds) matrixClose(nodeWorldMatrix(document, id), before.get(id), 1e-7);
  assert.deepEqual(document.nodes.map((n) => n.id), ['ua', 'ub', 'tail']);
});

test('group/ungroup under rotated non-uniform parent preserves geometry within tolerance', () => {
  const root = createNode('group', { id: 'root', transform: { x: 220, y: 170, rotation: 0.61, scaleX: 1.7, scaleY: 0.55 } });
  const a = rectNode('na', { x: 15, y: -40, rotation: -0.32, scaleX: 0.7, scaleY: 1.4 }, { parent: createNodeRef('root') });
  const b = rectNode('nb', { x: 88, y: 35, rotation: 0.24, scaleX: 1.1, scaleY: 0.9 }, { parent: createNodeRef('root') });
  const document = normalizedSingle([root, a, b]);
  const before = new Map(['na', 'nb'].map((id) => [id, nodeWorldMatrix(document, id)]));
  groupNodesInDocument(document, ['na', 'nb'], { id: 'nested_group' });
  const nested = document.nodes.find((n) => n.id === 'nested_group');
  nested.transform = { x: 18, y: -12, rotation: 0.27, skewX: 0.11, skewY: 0, scaleX: 1.3, scaleY: 0.8, pivotX: 0, pivotY: 0 };
  const beforeUngroup = new Map(['na', 'nb'].map((id) => [id, nodeWorldMatrix(document, id)]));
  ungroupNodeInDocument(document, 'nested_group');
  for (const id of ['na', 'nb']) matrixClose(nodeWorldMatrix(document, id), beforeUngroup.get(id), 1e-7);
  assert.notDeepEqual(beforeUngroup.get('na'), before.get('na'));
});

// 15. Cross-artboard / interleaved failure atomicity.
test('cross-artboard grouping fails without document revision or history mutation', () => {
  const a = rectNode('aa', {}, { artboard: createArtboardRef('art_a') });
  const b = rectNode('bb', {}, { artboard: createArtboardRef('art_b') });
  const raw = createDocument({
    id: 'multi_doc',
    artboards: [
      { id: 'art_a', name: 'A', x: 0, y: 0, width: 400, height: 300, background: '#ffffff' },
      { id: 'art_b', name: 'B', x: 500, y: 0, width: 400, height: 300, background: '#ffffff' },
    ],
    nodes: [a, b],
  });
  const store = new VeyraStore(raw);
  const plane = createVeyraControlPlane(store);
  const before = serializeVeyra(store.document); const revision = store.revision; const history = store.commandHistory.length;
  const result = plane.dispatchCommand({ action: 'groupNodes', args: { refs: [createNodeRef('aa'), createNodeRef('bb')], options: {} }, command: { label: 'bad group', source: 'ai' } });
  assert.equal(result.ok, false); assert.match(result.error, /across artboards/i);
  assert.equal(serializeVeyra(store.document), before); assert.equal(store.revision, revision); assert.equal(store.commandHistory.length, history);
});

test('interleaved sibling grouping fails closed instead of changing stacking appearance', () => {
  const document = normalizedSingle([rectNode('i1'), rectNode('middle'), rectNode('i2')]);
  assert.throws(() => groupNodesInDocument(document, ['i1', 'i2'], { id: 'unsafe_group' }), /non-contiguous siblings/i);
  assert.deepEqual(document.nodes.map((n) => n.id), ['i1', 'middle', 'i2']);
});

// 16. Dependency boundary.
test('dependency-bound path topology removal fails closed with evidence', () => {
  const node = pathNode('dep');
  const address = 'node:dep/geometry/vertices/dep_v2/x';
  const timeline = { id: 'dep_tl', name: 'TL', duration: 60, fps: 30, loop: 'none', workStart: 0, workEnd: 60, tracks: [{ id: 'dep_tr', address, keyframes: [{ id: 'dep_kf', frame: 0, value: 100, easing: 'linear' }] }] };
  const store = new VeyraStore(normalizedSingle([node], { timelines: [timeline] }));
  const evidence = pathVertexDependencyEvidence(store.document, 'dep', 'dep_v2');
  assert.equal(evidence.length, 1); assert.equal(evidence[0].id, 'dep_tr');
  const before = serializeVeyra(store.document); const revision = store.revision;
  assert.throws(() => store.removeVertex('dep', 'dep_v2', 'remove bound'), /dependencies still target it/i);
  assert.equal(serializeVeyra(store.document), before); assert.equal(store.revision, revision);
});

// 17. Clean preview editor-only.
test('clean-preview overlay state never changes authored serialization or history', () => {
  const store = new VeyraStore(normalizedSingle([rectNode('overlay')]));
  const before = serializeVeyra(store.document); const history = store.commandHistory.length;
  const clean = normalizeOverlayVisibility({ selection: false, vertices: false, rig: false, guides: false });
  assert.deepEqual(clean, { selection: false, vertices: false, rig: false, guides: false });
  assert.equal(serializeVeyra(store.document), before); assert.equal(store.commandHistory.length, history);
  const shell = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(shell, /renderer\.setOverlayVisibility/);
  assert.match(shell, /getEditorState/);
});

// 18. Browser/UI canonical command parity.
test('browser persistent M7 mutations route through the canonical command catalog', async () => {
  const { VEYRA_COMMAND_TABLE } = await import('../src/veyra/commands.js');
  const { VEYRA_BROWSER_MUTATION_COMPATIBILITY } = await import('../src/veyra/serviceRegistry.js');
  const actions = ['addVertex','removeVertex','moveVertex','moveBezierHandle','setVertexHandleMode','setVertexCornerRadius','openPath','closePath','reversePath','groupNodes','ungroupNode'];
  for (const action of actions) {
    assert.ok(VEYRA_COMMAND_TABLE[action], `missing command ${action}`);
    assert.deepEqual(VEYRA_BROWSER_MUTATION_COMPATIBILITY[action], { transport: 'command', action });
  }
  const shell = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  for (const action of actions) assert.match(shell, new RegExp(`dispatchCompatibilityCommand\\('${action}'`));
});

// 19. Name independence.
test('name randomization and duplicates do not alter stable command targets', () => {
  const first = rectNode('stable_a', { x: 10 }, { name: 'Liar' });
  const second = rectNode('stable_b', { x: 20 }, { name: 'Liar' });
  const store = new VeyraStore(normalizedSingle([first, second]));
  const plane = createVeyraControlPlane(store);
  const result = plane.dispatchCommand({ action: 'setProperty', args: { address: 'node:stable_b/transform/x', value: 77 }, command: { label: 'names irrelevant', source: 'ai' } });
  assert.equal(result.ok, true);
  assert.equal(store.document.nodes.find((n) => n.id === 'stable_a').transform.x, 10);
  assert.equal(store.document.nodes.find((n) => n.id === 'stable_b').transform.x, 77);
  store.document.nodes.forEach((node) => { node.name = Math.random().toString(36); });
  assert.equal(store.document.nodes.find((n) => n.id === 'stable_b').transform.x, 77);
});

// 20. Zoom is editor-only; authored path semantics stay byte-for-byte stable.
test('10%-800% zoom changes no authored geometry or path rendering semantics', () => {
  const document = normalizedSingle([pathNode('zoom_path', { geometry: {
    closed: true,
    vertices: [pathVertex('z1', 0, 0, { cornerRadius: 12 }), pathVertex('z2', 80, 0), pathVertex('z3', 80, 80, { inX: -10, inY: 0, handleMode: 'detached' })],
  } })]);
  const node = document.nodes[0];
  const authored = serializeVeyra(document);
  const d = pathData(node.geometry);
  const artboard = document.artboards[0];
  for (const zoom of [0.1, 0.25, 1, 2, 8]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, { width: 1000, height: 700, zoom, centerX: 400, centerY: 300 });
    assert.equal(mapping.scale, zoom);
    assert.equal(pathData(node.geometry), d);
    assert.equal(serializeVeyra(document), authored);
  }
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`${passed} M7 adversarial checks green`);
