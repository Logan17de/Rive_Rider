from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# --- model: persistent vertex mode/radius ---------------------------------
p = Path('src/veyra/model.js')
t = p.read_text()
t = replace_once(t,
"""export const VEYRA_NODE_TYPES = Object.freeze([
  'group',
  'path',
  'rectangle',
  'ellipse',
  'polygon',
  'star',
]);""",
"""export const VEYRA_NODE_TYPES = Object.freeze([
  'group',
  'path',
  'rectangle',
  'ellipse',
  'polygon',
  'star',
]);
export const VEYRA_VERTEX_HANDLE_MODES = Object.freeze(['straight', 'mirrored', 'aligned', 'detached']);""",
'handle mode enum')
for old, new in [
("{ id: createId('vertex'), x: -80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0 }", "{ id: createId('vertex'), x: -80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 }"),
("{ id: createId('vertex'), x: 0, y: -70, inX: 0, inY: 0, outX: 0, outY: 0 }", "{ id: createId('vertex'), x: 0, y: -70, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 }"),
("{ id: createId('vertex'), x: 80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0 }", "{ id: createId('vertex'), x: 80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 }"),
]:
    t = replace_once(t, old, new, 'default path vertex')
t = replace_once(t,
"""          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
        };""",
"""          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
          handleMode: (() => {
            const explicit = vertex.handleMode == null ? null : String(vertex.handleMode);
            if (explicit != null && !VEYRA_VERTEX_HANDLE_MODES.includes(explicit)) {
              throw new TypeError(`${path}.vertices[${index}].handleMode must be one of ${VEYRA_VERTEX_HANDLE_MODES.join(', ')}.`);
            }
            if (explicit) return explicit;
            return [vertex.inX, vertex.inY, vertex.outX, vertex.outY].some((value) => Math.abs(Number(value) || 0) > 0.0001)
              ? 'detached'
              : 'straight';
          })(),
          cornerRadius: bounded(vertex.cornerRadius ?? 0, `${path}.vertices[${index}].cornerRadius`, 0, 100000),
        };""",
'normalize path vertex metadata')
p.write_text(t)

# --- capabilities -----------------------------------------------------------
p = Path('src/veyra/capabilities.js')
t = p.read_text()
t = replace_once(t,
"""    'geometry.vertices.*.outX',
    'geometry.vertices.*.outY',
  ],""",
"""    'geometry.vertices.*.outX',
    'geometry.vertices.*.outY',
    'geometry.vertices.*.handleMode',
    'geometry.vertices.*.cornerRadius',
  ],""",
'path capability fields')
t = replace_once(t,
"""  const fill = node.type === 'group' ? [] : fillProperties(node.paint?.fill);
  return {
    transform: true,""",
"""  const fill = node.type === 'group' ? [] : fillProperties(node.paint?.fill);
  const animatableGeometry = geometry.filter((path) => path !== 'geometry.vertices.*.handleMode');
  return {
    transform: true,""",
'animatable path split')
t = replace_once(t,
"""    writable: [...commonWritable, ...fill, ...geometry],
    animatable: [...commonAnimatable, ...fill, ...geometry],""",
"""    writable: [...commonWritable, ...fill, ...geometry],
    animatable: [...commonAnimatable, ...fill, ...animatableGeometry],""",
'handle mode nonanimatable')
p.write_text(t)

# --- geometry: deterministic straight-corner rounding ----------------------
p = Path('src/veyra/geometry.js')
t = p.read_text()
old = """export function pathData(geometry) {
  const vertices = geometry?.vertices || [];
  if (!vertices.length) return '';
  const commands = [`M ${vertices[0].x} ${vertices[0].y}`];
  for (let index = 1; index < vertices.length; index += 1) {
    commands.push(segmentCommand(vertices[index - 1], vertices[index]));
  }
  if (geometry.closed && vertices.length > 1) {
    commands.push(segmentCommand(vertices[vertices.length - 1], vertices[0]), 'Z');
  }
  return commands.join(' ');
}
"""
new = """function roundedCorner(vertices, index, closed) {
  const vertex = vertices[index];
  const radius = Math.max(0, number(vertex.cornerRadius));
  if (!radius || hasHandle(vertex, 'in') || hasHandle(vertex, 'out')) return null;
  if (!closed && (index === 0 || index === vertices.length - 1)) return null;
  const previous = index > 0 ? vertices[index - 1] : vertices.at(-1);
  const next = index < vertices.length - 1 ? vertices[index + 1] : vertices[0];
  if (!previous || !next || hasHandle(previous, 'out') || hasHandle(next, 'in')) return null;
  const prevDx = previous.x - vertex.x;
  const prevDy = previous.y - vertex.y;
  const nextDx = next.x - vertex.x;
  const nextDy = next.y - vertex.y;
  const prevLength = Math.hypot(prevDx, prevDy);
  const nextLength = Math.hypot(nextDx, nextDy);
  if (prevLength < 1e-9 || nextLength < 1e-9) return null;
  const distance = Math.min(radius, prevLength / 2, nextLength / 2);
  return {
    entry: { x: vertex.x + prevDx / prevLength * distance, y: vertex.y + prevDy / prevLength * distance },
    exit: { x: vertex.x + nextDx / nextLength * distance, y: vertex.y + nextDy / nextLength * distance },
  };
}

function lineTo(point) { return `L ${point.x} ${point.y}`; }

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
t = replace_once(t, old, new, 'pathData corner compile')
p.write_text(t)

# --- Store canonical M7 methods --------------------------------------------
p = Path('src/veyra/store.js')
t = p.read_text()
t = replace_once(t,
"""import {
  createSemanticRecord,""",
"""import {
  addVertexToDocument,
  groupNodesInDocument,
  moveBezierHandleInDocument,
  moveVertexInDocument,
  removeVertexFromDocument,
  reversePathInDocument,
  setPathClosedInDocument,
  setVertexCornerRadiusInDocument,
  setVertexHandleModeInDocument,
  ungroupNodeInDocument,
} from './editorAuthoring.js';
import {
  createSemanticRecord,""",
'editor authoring store import')
anchor = """  // --- Rig and asset CRUD (UI/AI parity) --------------------------------------"""
methods = """  // --- M7 vector authoring / grouping canonical commands ----------------------
  addVertex(nodeId, vertex, index = null, commandDescriptor = {}) {
    let result = null;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add path vertex`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => { result = addVertexToDocument(document, nodeId, vertex, index); });
    return result;
  }

  removeVertex(nodeId, vertexId, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Remove path vertex`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => removeVertexFromDocument(document, nodeId, vertexId));
    return true;
  }

  moveVertex(nodeId, vertexId, x, y, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Move path vertex`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => moveVertexInDocument(document, nodeId, vertexId, { x, y }));
    return true;
  }

  moveBezierHandle(nodeId, vertexId, handle, x, y, options = {}, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Move Bezier handle`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => moveBezierHandleInDocument(document, nodeId, vertexId, handle, { x, y }, options));
    return true;
  }

  setVertexHandleMode(nodeId, vertexId, mode, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Set vertex handle mode`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => setVertexHandleModeInDocument(document, nodeId, vertexId, mode));
    return true;
  }

  setVertexCornerRadius(nodeId, vertexId, radius, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Set vertex corner radius`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => setVertexCornerRadiusInDocument(document, nodeId, vertexId, radius));
    return true;
  }

  openPath(nodeId, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Open path`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => setPathClosedInDocument(document, nodeId, false));
    return true;
  }

  closePath(nodeId, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Close path`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => setPathClosedInDocument(document, nodeId, true));
    return true;
  }

  reversePath(nodeId, commandDescriptor = {}) {
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Reverse path`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => reversePathInDocument(document, nodeId));
    return true;
  }

  groupNodes(refs, options = {}, commandDescriptor = {}) {
    let result = null;
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Group selection`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => { result = groupNodesInDocument(document, refs, options); });
    this.select({ kind: 'node', id: result.groupId });
    return result;
  }

  ungroupNode(groupId, commandDescriptor = {}) {
    let result = null;
    const descriptor = typeof commandDescriptor === 'string' ? { label: commandDescriptor } : { label: `Ungroup selection`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => { result = ungroupNodeInDocument(document, groupId); });
    const primary = result.childIds.at(-1);
    if (primary) this.select({ kind: 'node', id: primary });
    else this.#clearSelection();
    return result;
  }

""" + anchor
t = replace_once(t, anchor, methods, 'store M7 methods')
p.write_text(t)

# --- Commands + manifest metadata ------------------------------------------
p = Path('src/veyra/commands.js')
t = p.read_text()
anchor = """  setComponentOverride: {
    summary: 'Set one bounded source-property override on a Component instance.',"""
# Insert M7 commands immediately before Component override commands so object syntax stays simple.
m7_commands = """  addVertex: {
    summary: 'Add a stable pathVertex to an authored path.',
    params: [param('nodeId','string',true), param('vertex','object',true), param('index','number',false)],
    run: (store,args,command) => store.addVertex(args.nodeId,args.vertex,args.index ?? null,command ?? {}),
  },
  removeVertex: {
    summary: 'Remove a stable pathVertex; dependency-bound removals fail closed.',
    params: [param('nodeId','string',true), param('vertexId','string',true)],
    run: (store,args,command) => store.removeVertex(args.nodeId,args.vertexId,command ?? {}),
  },
  moveVertex: {
    summary: 'Move a pathVertex by stable id.',
    params: [param('nodeId','string',true), param('vertexId','string',true), param('x','number',true), param('y','number',true)],
    run: (store,args,command) => store.moveVertex(args.nodeId,args.vertexId,args.x,args.y,command ?? {}),
  },
  moveBezierHandle: {
    summary: 'Move or remove one Bezier handle by stable pathVertex id.',
    params: [param('nodeId','string',true), param('vertexId','string',true), param('handle','string',true), param('x','number',true), param('y','number',true), param('options','object',false)],
    run: (store,args,command) => store.moveBezierHandle(args.nodeId,args.vertexId,args.handle,args.x,args.y,args.options ?? {},command ?? {}),
  },
  setVertexHandleMode: {
    summary: 'Set straight/mirrored/aligned/detached handle semantics for a stable pathVertex.',
    params: [param('nodeId','string',true), param('vertexId','string',true), param('mode','string',true)],
    run: (store,args,command) => store.setVertexHandleMode(args.nodeId,args.vertexId,args.mode,command ?? {}),
  },
  setVertexCornerRadius: {
    summary: 'Set deterministic straight-corner radius for a stable pathVertex.',
    params: [param('nodeId','string',true), param('vertexId','string',true), param('radius','number',true)],
    run: (store,args,command) => store.setVertexCornerRadius(args.nodeId,args.vertexId,args.radius,command ?? {}),
  },
  openPath: {
    summary: 'Open an authored path without changing vertex identity.', params: [param('nodeId','string',true)],
    run: (store,args,command) => store.openPath(args.nodeId,command ?? {}),
  },
  closePath: {
    summary: 'Close an authored path without changing vertex identity.', params: [param('nodeId','string',true)],
    run: (store,args,command) => store.closePath(args.nodeId,command ?? {}),
  },
  reversePath: {
    summary: 'Reverse path direction while preserving stable vertex ids.', params: [param('nodeId','string',true)],
    run: (store,args,command) => store.reversePath(args.nodeId,command ?? {}),
  },
  groupNodes: {
    summary: 'Create a real group around stable sibling node refs while preserving world transforms/order.',
    params: [param('refs','array',true), param('options','object',false)],
    run: (store,args,command) => store.groupNodes(args.refs,args.options ?? {},command ?? {}),
  },
  ungroupNode: {
    summary: 'Remove a group while preserving direct-child world transforms and ordering.',
    params: [param('groupId','string',true)],
    run: (store,args,command) => store.ungroupNode(args.groupId,command ?? {}),
  },
""" + anchor
t = replace_once(t, anchor, m7_commands, 'M7 command table')
manifest_anchor = """const COMMAND_MANIFEST_OVERRIDES = {
  addArtboard:"""
manifest_insert = """const COMMAND_MANIFEST_OVERRIDES = {
  addVertex: { targetKind: 'pathVertex', capabilities: ['stable-id','path-topology','transactional','undoable','returns-ref'] },
  removeVertex: { targetKind: 'pathVertex', capabilities: ['stable-id','dependency-checked','path-topology','transactional','undoable'] },
  moveVertex: { targetKind: 'pathVertex', capabilities: ['stable-id','geometry-write','transactional','undoable'] },
  moveBezierHandle: { targetKind: 'pathVertex', capabilities: ['stable-id','bezier-handle','transactional','undoable'] },
  setVertexHandleMode: { targetKind: 'pathVertex', capabilities: ['straight','mirrored','aligned','detached','transactional','undoable'] },
  setVertexCornerRadius: { targetKind: 'pathVertex', capabilities: ['corner-radius','deterministic-compile','transactional','undoable'] },
  openPath: { targetKind: 'node', capabilities: ['path-topology','identity-preserving','transactional','undoable'] },
  closePath: { targetKind: 'node', capabilities: ['path-topology','identity-preserving','transactional','undoable'] },
  reversePath: { targetKind: 'node', capabilities: ['path-topology','stable-vertex-ids','transactional','undoable'] },
  groupNodes: { targetKind: 'node', capabilities: ['grouping','stable-child-ids','world-transform-preserving','draw-order-preserving','transactional','undoable','returns-id'] },
  ungroupNode: { targetKind: 'node', capabilities: ['grouping','dependency-checked','world-transform-preserving','draw-order-preserving','transactional','undoable'] },
  addArtboard:"""
t = replace_once(t, manifest_anchor, manifest_insert, 'M7 manifest overrides')
p.write_text(t)

# --- Control-plane deterministic IDs ---------------------------------------
p = Path('src/veyra/controlPlane.js')
t = p.read_text()
t = replace_once(t,
"""  if (next.action === 'add') next.args.options = withId(next.args.options, next.args.type || 'node', seed, 'node');""",
"""  if (next.action === 'add') {
    next.args.options = withId(next.args.options, next.args.type || 'node', seed, 'node');
    if (next.args.type === 'path' && Array.isArray(next.args.options.geometry?.vertices)) {
      next.args.options.geometry.vertices = next.args.options.geometry.vertices.map((vertex, index) => withId(vertex, 'pathVertex', seed, `pathVertex:${index}`));
    }
  }
  if (next.action === 'addVertex') next.args.vertex = withId(next.args.vertex, 'pathVertex', seed, 'pathVertex');
  if (next.action === 'groupNodes') next.args.options = withId(next.args.options, 'group', seed, 'group');""",
'M7 deterministic ids')
p.write_text(t)

# --- Browser compatibility audit -------------------------------------------
p = Path('src/veyra/serviceRegistry.js')
t = p.read_text()
anchor = """  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),"""
insert = """  addVertex: Object.freeze({ transport: 'command', action: 'addVertex' }),
  removeVertex: Object.freeze({ transport: 'command', action: 'removeVertex' }),
  moveVertex: Object.freeze({ transport: 'command', action: 'moveVertex' }),
  moveBezierHandle: Object.freeze({ transport: 'command', action: 'moveBezierHandle' }),
  setVertexHandleMode: Object.freeze({ transport: 'command', action: 'setVertexHandleMode' }),
  setVertexCornerRadius: Object.freeze({ transport: 'command', action: 'setVertexCornerRadius' }),
  openPath: Object.freeze({ transport: 'command', action: 'openPath' }),
  closePath: Object.freeze({ transport: 'command', action: 'closePath' }),
  reversePath: Object.freeze({ transport: 'command', action: 'reversePath' }),
  groupNodes: Object.freeze({ transport: 'command', action: 'groupNodes' }),
  ungroupNode: Object.freeze({ transport: 'command', action: 'ungroupNode' }),
  dispatchEditorCommand: Object.freeze({ transport: 'runtime', reason: 'M7 semantic editor commands mutate only tool/selection/overlay editor state unless they dispatch a canonical authored command.' }),
  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),"""
t = replace_once(t, anchor, insert, 'browser M7 compatibility')
p.write_text(t)

# --- Public exports ---------------------------------------------------------
p = Path('src/index.js')
t = p.read_text()
t += """

// M7 editor-authoring primitives are DOM-free. Draft/selection/marquee state is
// editor-only; persistent topology/grouping mutations are shared by Store commands.
export {
  VEYRA_EDITOR_COMMAND_IDS,
  VEYRA_MARQUEE_MODES,
  VEYRA_DEFAULT_OVERLAY_VISIBILITY,
  EditorSelectionState,
  createPenDraft,
  penVertexFromGesture,
  appendPenDraftVertex,
  penDraftCanFinish,
  finalizePenDraftGeometry,
  pathVertexById,
  pathVertexDependencyEvidence,
  addVertexToDocument,
  removeVertexFromDocument,
  moveVertexInDocument,
  moveBezierHandleInDocument,
  setVertexHandleModeInDocument,
  setVertexCornerRadiusInDocument,
  setPathClosedInDocument,
  reversePathInDocument,
  nodeWorldMatrix,
  affineMatrixToTransform,
  groupNodesInDocument,
  ungroupNodeInDocument,
  marqueeNodeRefs,
  selectionWorldBounds,
  worldRectFromPoints,
  normalizeOverlayVisibility,
  createEditorCommandDispatcher,
  editorCommandForKeyEvent,
  coordinateReadout,
} from './veyra/editorAuthoring.js';
"""
p.write_text(t)

print('M7 core patches applied')
