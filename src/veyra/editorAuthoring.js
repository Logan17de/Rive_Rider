import {
  VEYRA_VERTEX_HANDLE_MODES,
  cloneValue,
  createNode,
  nodeById,
} from './model.js';
import {
  IDENTITY_MATRIX,
  invertMatrix,
  multiplyMatrices,
  transformMatrix,
  transformPoint,
} from './contracts.js';
import { localBounds } from './geometry.js';
import { createNodeRef, createPathVertexRef, referenceId } from './references.js';

export const VEYRA_EDITOR_COMMAND_IDS = Object.freeze([
  'editor.path.pen',
  'editor.path.finish',
  'editor.path.editVertices',
  'editor.selection.group',
  'editor.selection.ungroup',
  'editor.selection.selectAll',
  'editor.view.cleanPreview',
]);

export const VEYRA_MARQUEE_MODES = Object.freeze(['intersect', 'contain']);
export const VEYRA_DEFAULT_OVERLAY_VISIBILITY = Object.freeze({
  selection: true,
  vertices: true,
  rig: true,
  guides: true,
});

const EPSILON = 1e-9;

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${path} must be finite.`);
  return number;
}

function refKey(ref) {
  return `${ref.kind}:${ref.id}`;
}

function typedRef(ref) {
  if (!ref || typeof ref !== 'object' || !ref.kind || !ref.id) {
    throw new TypeError('Selection entries must be stable typed references.');
  }
  return { kind: String(ref.kind), id: String(ref.id) };
}

export class EditorSelectionState {
  #refs = [];
  #primary = null;

  constructor(refs = []) {
    this.set(refs);
  }

  set(refs = [], primary = null) {
    const seen = new Set();
    this.#refs = [];
    for (const value of refs || []) {
      const ref = typedRef(value);
      const key = refKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      this.#refs.push(ref);
    }
    const wanted = primary ? typedRef(primary) : this.#refs.at(-1) || null;
    this.#primary = wanted && seen.has(refKey(wanted)) ? wanted : this.#refs.at(-1) || null;
    return this.refs;
  }

  toggle(value) {
    const ref = typedRef(value);
    const key = refKey(ref);
    const index = this.#refs.findIndex((item) => refKey(item) === key);
    if (index >= 0) {
      this.#refs.splice(index, 1);
      if (this.#primary && refKey(this.#primary) === key) this.#primary = this.#refs.at(-1) || null;
    } else {
      this.#refs.push(ref);
      this.#primary = ref;
    }
    return this.refs;
  }

  add(value) {
    const ref = typedRef(value);
    if (!this.has(ref)) this.#refs.push(ref);
    this.#primary = ref;
    return this.refs;
  }

  has(value) {
    const key = refKey(typedRef(value));
    return this.#refs.some((item) => refKey(item) === key);
  }

  clear() {
    this.#refs = [];
    this.#primary = null;
    return [];
  }

  prune(predicate) {
    this.#refs = this.#refs.filter((ref) => predicate(ref));
    if (this.#primary && !this.#refs.some((ref) => refKey(ref) === refKey(this.#primary))) {
      this.#primary = this.#refs.at(-1) || null;
    }
    return this.refs;
  }

  get refs() { return this.#refs.map((ref) => ({ ...ref })); }
  get primary() { return this.#primary ? { ...this.#primary } : null; }
  get size() { return this.#refs.length; }
}

export function createPenDraft(vertices = []) {
  return {
    kind: 'veyra-pen-draft',
    vertices: (vertices || []).map((vertex) => normalizeDraftVertex(vertex)),
  };
}

function normalizeDraftVertex(vertex) {
  const handleMode = VEYRA_VERTEX_HANDLE_MODES.includes(vertex?.handleMode)
    ? vertex.handleMode
    : (Math.abs(Number(vertex?.inX || 0)) > EPSILON || Math.abs(Number(vertex?.inY || 0)) > EPSILON
      || Math.abs(Number(vertex?.outX || 0)) > EPSILON || Math.abs(Number(vertex?.outY || 0)) > EPSILON)
      ? 'detached'
      : 'straight';
  return {
    ...(vertex?.id ? { id: String(vertex.id) } : {}),
    x: finite(vertex?.x ?? 0, 'pen vertex x'),
    y: finite(vertex?.y ?? 0, 'pen vertex y'),
    inX: finite(vertex?.inX ?? 0, 'pen vertex inX'),
    inY: finite(vertex?.inY ?? 0, 'pen vertex inY'),
    outX: finite(vertex?.outX ?? 0, 'pen vertex outX'),
    outY: finite(vertex?.outY ?? 0, 'pen vertex outY'),
    handleMode,
    cornerRadius: Math.max(0, finite(vertex?.cornerRadius ?? 0, 'pen vertex cornerRadius')),
  };
}

export function penVertexFromGesture(start, end = start, { dragged = true, threshold = 0 } = {}) {
  const x = finite(start?.x, 'pen start x');
  const y = finite(start?.y, 'pen start y');
  const dx = finite(end?.x ?? x, 'pen end x') - x;
  const dy = finite(end?.y ?? y, 'pen end y') - y;
  const curved = Boolean(dragged) && Math.hypot(dx, dy) > Math.max(0, Number(threshold) || 0);
  return normalizeDraftVertex(curved
    ? { x, y, inX: -dx, inY: -dy, outX: dx, outY: dy, handleMode: 'mirrored', cornerRadius: 0 }
    : { x, y, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 });
}

export function appendPenDraftVertex(draft, vertex) {
  if (draft?.kind !== 'veyra-pen-draft') throw new TypeError('A Veyra pen draft is required.');
  draft.vertices.push(normalizeDraftVertex(vertex));
  return draft.vertices.length;
}

export function penDraftCanFinish(draft) {
  return draft?.kind === 'veyra-pen-draft' && draft.vertices.length >= 2;
}

export function finalizePenDraftGeometry(draft, { closed = false } = {}) {
  if (!penDraftCanFinish(draft)) throw new TypeError('A persistent path requires at least two draft vertices.');
  return { closed: Boolean(closed), vertices: draft.vertices.map((vertex) => cloneValue(vertex)) };
}

function pathNode(document, nodeId) {
  const node = nodeById(document, String(nodeId));
  if (!node) throw new TypeError(`Path node ${nodeId} does not exist.`);
  if (node.type !== 'path') throw new TypeError(`Node ${nodeId} is ${node.type}, not a path.`);
  return node;
}

export function pathVertexById(document, nodeId, vertexId) {
  return pathNode(document, nodeId).geometry.vertices.find((vertex) => vertex.id === String(vertexId)) || null;
}

function vertexIndex(node, vertexId) {
  const index = node.geometry.vertices.findIndex((vertex) => vertex.id === String(vertexId));
  if (index < 0) throw new TypeError(`Path vertex ${vertexId} does not exist on ${node.id}.`);
  return index;
}

function pathAddressPrefix(nodeId, vertexId) {
  return `node:${encodeURIComponent(String(nodeId))}/geometry/vertices/${encodeURIComponent(String(vertexId))}/`;
}

export function pathVertexDependencyEvidence(document, nodeId, vertexId) {
  const prefix = pathAddressPrefix(nodeId, vertexId);
  const blockers = [];
  for (const timeline of document.timelines || []) {
    for (const track of timeline.tracks || []) {
      if (String(track.address || '').startsWith(prefix)) {
        blockers.push({ kind: 'track', id: track.id, timelineId: timeline.id, address: track.address });
      }
    }
  }
  for (const instance of document.componentInstances || []) {
    for (const override of instance.overrides || []) {
      if (String(override.address || '').startsWith(prefix)) {
        blockers.push({ kind: 'componentOverride', id: override.id, instanceId: instance.id, address: override.address });
      }
    }
  }
  return blockers.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

export function addVertexToDocument(document, nodeId, vertex, index = null) {
  const node = pathNode(document, nodeId);
  const next = normalizeDraftVertex(vertex);
  if (!next.id) throw new TypeError('Persistent path vertex id is required.');
  if (node.geometry.vertices.some((candidate) => candidate.id === next.id)) {
    throw new TypeError(`Path vertex id ${next.id} already exists on ${node.id}.`);
  }
  const insertion = index == null
    ? node.geometry.vertices.length
    : Math.max(0, Math.min(node.geometry.vertices.length, Math.trunc(finite(index, 'vertex index'))));
  node.geometry.vertices.splice(insertion, 0, next);
  return createPathVertexRef(next.id);
}

export function removeVertexFromDocument(document, nodeId, vertexId) {
  const node = pathNode(document, nodeId);
  if (node.geometry.vertices.length <= 2) throw new TypeError('A path must retain at least two vertices.');
  const index = vertexIndex(node, vertexId);
  const blockers = pathVertexDependencyEvidence(document, node.id, vertexId);
  if (blockers.length) {
    const evidence = blockers.map((item) => `${item.kind}:${item.id}${item.address ? ` (${item.address})` : ''}`).join(', ');
    throw new TypeError(`Cannot remove pathVertex:${vertexId}; authored dependencies still target it: ${evidence}.`);
  }
  node.geometry.vertices.splice(index, 1);
  return true;
}

export function moveVertexInDocument(document, nodeId, vertexId, point) {
  const vertex = pathVertexById(document, nodeId, vertexId);
  if (!vertex) throw new TypeError(`Path vertex ${vertexId} does not exist on ${nodeId}.`);
  vertex.x = finite(point?.x, 'vertex x');
  vertex.y = finite(point?.y, 'vertex y');
  return createPathVertexRef(vertex.id);
}

function handleVector(vertex, prefix) {
  return { x: Number(vertex[`${prefix}X`]) || 0, y: Number(vertex[`${prefix}Y`]) || 0 };
}

function vectorLength(value) { return Math.hypot(value.x, value.y); }

function deterministicTangent(node, index) {
  const vertices = node.geometry.vertices;
  const vertex = vertices[index];
  const prev = index > 0 ? vertices[index - 1] : (node.geometry.closed ? vertices.at(-1) : null);
  const next = index < vertices.length - 1 ? vertices[index + 1] : (node.geometry.closed ? vertices[0] : null);
  let dx = 1;
  let dy = 0;
  let length = 24;
  if (prev && next) {
    dx = next.x - prev.x;
    dy = next.y - prev.y;
    length = Math.max(8, Math.min(Math.hypot(vertex.x - prev.x, vertex.y - prev.y), Math.hypot(next.x - vertex.x, next.y - vertex.y)) / 3);
  } else if (next) {
    dx = next.x - vertex.x;
    dy = next.y - vertex.y;
    length = Math.max(8, Math.hypot(dx, dy) / 3);
  } else if (prev) {
    dx = vertex.x - prev.x;
    dy = vertex.y - prev.y;
    length = Math.max(8, Math.hypot(dx, dy) / 3);
  }
  const magnitude = Math.max(EPSILON, Math.hypot(dx, dy));
  return { x: dx / magnitude * length, y: dy / magnitude * length };
}

export function setVertexHandleModeInDocument(document, nodeId, vertexId, mode) {
  const node = pathNode(document, nodeId);
  const index = vertexIndex(node, vertexId);
  const vertex = node.geometry.vertices[index];
  const nextMode = String(mode || '');
  if (!VEYRA_VERTEX_HANDLE_MODES.includes(nextMode)) {
    throw new TypeError(`Vertex handle mode must be one of ${VEYRA_VERTEX_HANDLE_MODES.join(', ')}.`);
  }
  if (nextMode === 'straight') {
    Object.assign(vertex, { inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight' });
    return createPathVertexRef(vertex.id);
  }
  const incoming = handleVector(vertex, 'in');
  const outgoing = handleVector(vertex, 'out');
  let tangent = vectorLength(outgoing) > EPSILON
    ? outgoing
    : vectorLength(incoming) > EPSILON
      ? { x: -incoming.x, y: -incoming.y }
      : deterministicTangent(node, index);
  const magnitude = Math.max(EPSILON, vectorLength(tangent));
  tangent = { x: tangent.x / magnitude, y: tangent.y / magnitude };
  const outLength = vectorLength(outgoing) > EPSILON ? vectorLength(outgoing) : Math.max(8, vectorLength(deterministicTangent(node, index)));
  const inLength = vectorLength(incoming) > EPSILON ? vectorLength(incoming) : outLength;
  if (nextMode === 'mirrored') {
    const length = vectorLength(outgoing) > EPSILON ? vectorLength(outgoing) : inLength;
    Object.assign(vertex, {
      outX: tangent.x * length, outY: tangent.y * length,
      inX: -tangent.x * length, inY: -tangent.y * length,
    });
  } else if (nextMode === 'aligned') {
    Object.assign(vertex, {
      outX: tangent.x * outLength, outY: tangent.y * outLength,
      inX: -tangent.x * inLength, inY: -tangent.y * inLength,
    });
  }
  vertex.handleMode = nextMode;
  return createPathVertexRef(vertex.id);
}

export function moveBezierHandleInDocument(document, nodeId, vertexId, handle, point, { removeOnly = false } = {}) {
  const node = pathNode(document, nodeId);
  const index = vertexIndex(node, vertexId);
  const vertex = node.geometry.vertices[index];
  const prefix = String(handle);
  if (!['in', 'out'].includes(prefix)) throw new TypeError('Bezier handle must be "in" or "out".');
  const opposite = prefix === 'in' ? 'out' : 'in';
  if (removeOnly) {
    vertex[`${prefix}X`] = 0;
    vertex[`${prefix}Y`] = 0;
    vertex.handleMode = 'detached';
    return createPathVertexRef(vertex.id);
  }
  const next = { x: finite(point?.x, 'handle x'), y: finite(point?.y, 'handle y') };
  vertex[`${prefix}X`] = next.x;
  vertex[`${prefix}Y`] = next.y;
  if (vertex.handleMode === 'straight') vertex.handleMode = 'detached';
  if (vertex.handleMode === 'mirrored') {
    vertex[`${opposite}X`] = -next.x;
    vertex[`${opposite}Y`] = -next.y;
  } else if (vertex.handleMode === 'aligned') {
    const currentOpposite = handleVector(vertex, opposite);
    const oppositeLength = vectorLength(currentOpposite) > EPSILON ? vectorLength(currentOpposite) : vectorLength(next);
    const length = Math.max(EPSILON, vectorLength(next));
    vertex[`${opposite}X`] = -next.x / length * oppositeLength;
    vertex[`${opposite}Y`] = -next.y / length * oppositeLength;
  }
  return createPathVertexRef(vertex.id);
}

export function setVertexCornerRadiusInDocument(document, nodeId, vertexId, radius) {
  const vertex = pathVertexById(document, nodeId, vertexId);
  if (!vertex) throw new TypeError(`Path vertex ${vertexId} does not exist on ${nodeId}.`);
  vertex.cornerRadius = Math.max(0, finite(radius, 'vertex corner radius'));
  return createPathVertexRef(vertex.id);
}

export function setPathClosedInDocument(document, nodeId, closed) {
  pathNode(document, nodeId).geometry.closed = Boolean(closed);
  return createNodeRef(nodeId);
}

export function reversePathInDocument(document, nodeId) {
  const node = pathNode(document, nodeId);
  node.geometry.vertices.reverse();
  for (const vertex of node.geometry.vertices) {
    const inX = vertex.inX;
    const inY = vertex.inY;
    vertex.inX = vertex.outX;
    vertex.inY = vertex.outY;
    vertex.outX = inX;
    vertex.outY = inY;
  }
  return createNodeRef(nodeId);
}

export function nodeWorldMatrix(document, nodeId, memo = new Map(), visiting = new Set()) {
  const id = String(nodeId);
  if (memo.has(id)) return memo.get(id);
  if (visiting.has(id)) throw new TypeError(`Node hierarchy cycle while resolving ${id}.`);
  const node = nodeById(document, id);
  if (!node) throw new TypeError(`Node ${id} does not exist.`);
  visiting.add(id);
  const parentId = referenceId(node.parent, 'node');
  const parentWorld = parentId ? nodeWorldMatrix(document, parentId, memo, visiting) : IDENTITY_MATRIX;
  const world = multiplyMatrices(parentWorld, transformMatrix(node.transform));
  visiting.delete(id);
  memo.set(id, world);
  return world;
}

export function affineMatrixToTransform(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every((value) => Number.isFinite(Number(value)))) {
    throw new TypeError('Affine matrix must contain six finite values.');
  }
  const [a, b, c, d, e, f] = matrix.map(Number);
  const scaleX = Math.hypot(a, b);
  if (scaleX < 1e-10) throw new RangeError('Cannot preserve world transform through a singular X scale.');
  const rotation = Math.atan2(b, a);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const shearColumn = cos * c + sin * d;
  const scaleY = -sin * c + cos * d;
  if (Math.abs(scaleY) < 1e-10) throw new RangeError('Cannot preserve world transform through a singular Y scale.');
  const skewX = Math.atan(shearColumn / scaleY);
  return {
    x: e, y: f, rotation, skewX, skewY: 0,
    scaleX, scaleY, pivotX: 0, pivotY: 0,
  };
}

function nodeRefList(refs) {
  const output = [];
  const seen = new Set();
  for (const value of refs || []) {
    const ref = typeof value === 'string' ? createNodeRef(value) : typedRef(value);
    if (ref.kind !== 'node') throw new TypeError(`Grouping supports node refs, not ${ref.kind}.`);
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    output.push(ref);
  }
  if (!output.length) throw new TypeError('Grouping requires at least one node reference.');
  return output;
}

function sameParentIdentity(nodes) {
  return referenceId(nodes[0].parent, 'node') || null;
}

export function groupNodesInDocument(document, refs, options = {}) {
  const references = nodeRefList(refs);
  const nodes = references.map((ref) => {
    const node = nodeById(document, ref.id);
    if (!node) throw new TypeError(`Node ${ref.id} does not exist.`);
    if (node.locked) throw new TypeError(`Locked node ${ref.id} cannot be grouped until it is unlocked.`);
    return node;
  });
  const artboardId = nodes[0].artboard?.id;
  if (!artboardId || nodes.some((node) => node.artboard?.id !== artboardId)) {
    throw new TypeError('Grouping across artboards is not allowed.');
  }
  const parentId = sameParentIdentity(nodes);
  if (nodes.some((node) => (referenceId(node.parent, 'node') || null) !== parentId)) {
    throw new TypeError('Grouping currently requires sibling nodes with the same parent so animation/property bindings retain their exact local coordinate space.');
  }
  const groupId = String(options.id || '');
  if (!groupId) throw new TypeError('Grouping requires an explicit stable group id.');
  if (nodeById(document, groupId)) throw new TypeError(`Group id ${groupId} already exists.`);
  const selectedIds = new Set(nodes.map((node) => node.id));
  const selectedIndexes = document.nodes.map((node, index) => selectedIds.has(node.id) ? index : -1).filter((index) => index >= 0);
  const insertionIndex = Math.min(...selectedIndexes);
  const group = createNode('group', {
    id: groupId,
    name: String(options.name || 'Group'),
    artboard: cloneValue(nodes[0].artboard),
    parent: parentId ? createNodeRef(parentId) : null,
    transform: { x: 0, y: 0, rotation: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
  });
  document.nodes.splice(insertionIndex, 0, group);
  for (const node of nodes) node.parent = createNodeRef(groupId);
  return { groupId, childIds: nodes.map((node) => node.id) };
}

export function nodeRemovalDependencyEvidence(document, nodeId) {
  const prefix = `node:${encodeURIComponent(String(nodeId))}/`;
  const blockers = [];
  for (const timeline of document.timelines || []) {
    for (const track of timeline.tracks || []) {
      if (String(track.address || '').startsWith(prefix)) blockers.push({ kind: 'track', id: track.id, timelineId: timeline.id, address: track.address });
    }
  }
  for (const listener of document.listeners || []) {
    if (referenceId(listener.target, 'node') === nodeId) blockers.push({ kind: 'listener', id: listener.id });
  }
  for (const instance of document.componentInstances || []) {
    for (const override of instance.overrides || []) {
      if (override.target?.kind === 'node' && override.target.id === nodeId) blockers.push({ kind: 'componentOverride', id: override.id, instanceId: instance.id, address: override.address });
    }
  }
  return blockers.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

export function ungroupNodeInDocument(document, groupId) {
  const group = nodeById(document, String(groupId));
  if (!group) throw new TypeError(`Group ${groupId} does not exist.`);
  if (group.type !== 'group') throw new TypeError(`Node ${groupId} is not a group.`);
  const blockers = nodeRemovalDependencyEvidence(document, group.id);
  if (blockers.length) {
    throw new TypeError(`Cannot ungroup node:${group.id}; authored dependencies still target the group: ${blockers.map((item) => `${item.kind}:${item.id}`).join(', ')}.`);
  }
  const children = document.nodes.filter((node) => referenceId(node.parent, 'node') === group.id);
  const groupIndex = document.nodes.findIndex((node) => node.id === group.id);
  const memo = new Map();
  const parentId = referenceId(group.parent, 'node');
  const parentWorld = parentId ? nodeWorldMatrix(document, parentId, memo) : IDENTITY_MATRIX;
  const parentInverse = invertMatrix(parentWorld);
  const childStates = children.map((child) => ({
    child,
    transform: affineMatrixToTransform(multiplyMatrices(parentInverse, nodeWorldMatrix(document, child.id, memo))),
  }));
  for (const state of childStates) {
    state.child.parent = group.parent ? cloneValue(group.parent) : null;
    state.child.transform = state.transform;
  }
  const childIds = new Set(children.map((child) => child.id));
  const remaining = document.nodes.filter((node) => node.id !== group.id && !childIds.has(node.id));
  const insertion = Math.max(0, Math.min(groupIndex, remaining.length));
  remaining.splice(insertion, 0, ...children);
  document.nodes = remaining;
  document.semantics = (document.semantics || []).filter((record) => !(record.target?.kind === 'node' && record.target.id === group.id));
  return { removedGroupId: group.id, childIds: children.map((child) => child.id) };
}

function normalizeRect(rect) {
  const left = Math.min(finite(rect?.left ?? rect?.x1, 'rect left'), finite(rect?.right ?? rect?.x2, 'rect right'));
  const right = Math.max(finite(rect?.left ?? rect?.x1, 'rect left'), finite(rect?.right ?? rect?.x2, 'rect right'));
  const top = Math.min(finite(rect?.top ?? rect?.y1, 'rect top'), finite(rect?.bottom ?? rect?.y2, 'rect bottom'));
  const bottom = Math.max(finite(rect?.top ?? rect?.y1, 'rect top'), finite(rect?.bottom ?? rect?.y2, 'rect bottom'));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function worldRectFromPoints(start, end) {
  return normalizeRect({ left: start.x, top: start.y, right: end.x, bottom: end.y });
}

function boundsFromPoints(points) {
  if (!points.length) return null;
  return normalizeRect({
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  });
}

function evaluatedNodeBounds(node) {
  const bounds = localBounds(node);
  if (!bounds) return null;
  return boundsFromPoints([
    transformPoint(node.worldMatrix, { x: bounds.minX, y: bounds.minY }),
    transformPoint(node.worldMatrix, { x: bounds.maxX, y: bounds.minY }),
    transformPoint(node.worldMatrix, { x: bounds.minX, y: bounds.maxY }),
    transformPoint(node.worldMatrix, { x: bounds.maxX, y: bounds.maxY }),
  ]);
}

function evaluatedBoundsMap(scene) {
  const nodes = new Map((scene.nodes || []).map((node) => [node.id, node]));
  const children = new Map();
  for (const node of scene.nodes || []) {
    const parent = referenceId(node.parent, 'node') || '__root__';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  const memo = new Map();
  const resolve = (node) => {
    if (memo.has(node.id)) return memo.get(node.id);
    let bounds = evaluatedNodeBounds(node);
    if (node.type === 'group') {
      const childBounds = (children.get(node.id) || []).map(resolve).filter(Boolean);
      if (childBounds.length) bounds = normalizeRect({
        left: Math.min(...childBounds.map((item) => item.left)),
        top: Math.min(...childBounds.map((item) => item.top)),
        right: Math.max(...childBounds.map((item) => item.right)),
        bottom: Math.max(...childBounds.map((item) => item.bottom)),
      });
    }
    memo.set(node.id, bounds);
    return bounds;
  };
  for (const node of nodes.values()) resolve(node);
  return { nodes, bounds: memo };
}

function rectMatches(candidate, marquee, mode) {
  if (!candidate) return false;
  if (mode === 'contain') {
    return candidate.left >= marquee.left && candidate.right <= marquee.right
      && candidate.top >= marquee.top && candidate.bottom <= marquee.bottom;
  }
  return candidate.right >= marquee.left && candidate.left <= marquee.right
    && candidate.bottom >= marquee.top && candidate.top <= marquee.bottom;
}

export function marqueeNodeRefs(scene, rect, { mode = 'intersect', deep = false, includeLocked = false, includeHidden = false } = {}) {
  if (!VEYRA_MARQUEE_MODES.includes(mode)) throw new TypeError(`Unsupported marquee mode ${mode}.`);
  const marquee = normalizeRect(rect);
  const data = evaluatedBoundsMap(scene);
  const output = [];
  for (const node of scene.nodes || []) {
    if (!deep && referenceId(node.parent, 'node')) continue;
    if (!includeLocked && node.locked) continue;
    if (!includeHidden && !node.visible) continue;
    if (node.componentInstanceRef) continue;
    if (rectMatches(data.bounds.get(node.id), marquee, mode)) output.push(createNodeRef(node.id));
  }
  return output;
}

export function selectionWorldBounds(scene, refs) {
  const selected = new Set((refs || []).filter((ref) => ref?.kind === 'node').map((ref) => ref.id));
  if (!selected.size) return null;
  const data = evaluatedBoundsMap(scene);
  const values = [...selected].map((id) => data.bounds.get(id)).filter(Boolean);
  if (!values.length) return null;
  return normalizeRect({
    left: Math.min(...values.map((item) => item.left)),
    top: Math.min(...values.map((item) => item.top)),
    right: Math.max(...values.map((item) => item.right)),
    bottom: Math.max(...values.map((item) => item.bottom)),
  });
}

export function normalizeOverlayVisibility(value = {}) {
  return Object.freeze(Object.fromEntries(Object.entries(VEYRA_DEFAULT_OVERLAY_VISIBILITY)
    .map(([key, fallback]) => [key, value[key] === undefined ? fallback : Boolean(value[key])])));
}

export function createEditorCommandDispatcher(handlers = {}) {
  return Object.freeze({
    dispatch(commandId, payload = {}) {
      const id = String(commandId || '');
      if (!VEYRA_EDITOR_COMMAND_IDS.includes(id)) throw new TypeError(`Unknown editor command ${id}.`);
      const handler = handlers[id];
      if (typeof handler !== 'function') throw new TypeError(`Editor command ${id} has no host handler.`);
      return handler(cloneValue(payload));
    },
    commands: [...VEYRA_EDITOR_COMMAND_IDS],
  });
}

export function editorCommandForKeyEvent(event, context = {}) {
  const key = String(event?.key || '').toLowerCase();
  const command = Boolean(event?.ctrlKey || event?.metaKey);
  if (command && key === 'g') return event?.shiftKey ? 'editor.selection.ungroup' : 'editor.selection.group';
  if (command && key === 'a') return 'editor.selection.selectAll';
  if (!command && !event?.altKey && key === 'p') return 'editor.path.pen';
  if (!command && (key === 'enter' || key === 'escape')) {
    if (context.tool === 'pencil' || context.tool === 'vertex') return 'editor.path.finish';
    if (key === 'enter' && context.primaryIsPath) return 'editor.path.editVertices';
  }
  return null;
}

export function coordinateReadout(point, precision = 2) {
  const digits = Math.max(0, Math.min(6, Math.trunc(Number(precision) || 0)));
  const format = (value) => {
    const rounded = Number(finite(value, 'coordinate').toFixed(digits));
    return Object.is(rounded, -0) ? '0' : String(rounded);
  };
  return `X ${format(point.x)} · Y ${format(point.y)}`;
}
