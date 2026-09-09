from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

p = Path('veyra.js')
t = p.read_text()

# Imports
anchor = """import { createComponentRuntimeRegistry, createComponentRuntimeScope } from './src/veyra/components.js';"""
insert = """import { createComponentRuntimeRegistry, createComponentRuntimeScope } from './src/veyra/components.js';
import {
  EditorSelectionState,
  createEditorCommandDispatcher,
  editorCommandForKeyEvent,
  createPenDraft,
  finalizePenDraftGeometry,
  coordinateReadout as formatCoordinateReadout,
  marqueeNodeRefs,
  selectionWorldBounds,
  worldRectFromPoints,
  normalizeOverlayVisibility,
  moveVertexInDocument,
  moveBezierHandleInDocument,
  setVertexHandleModeInDocument,
  setVertexCornerRadiusInDocument,
} from './src/veyra/editorAuthoring.js';"""
t = replace_once(t, anchor, insert, 'M7 shell imports')

# DOM refs
anchor = """const inspectorCollapse = $('inspectorCollapse');"""
insert = """const inspectorCollapse = $('inspectorCollapse');
const finishPathButton = $('finishPath');
const cleanPreviewButton = $('cleanPreview');
const coordinateReadoutElement = $('coordinateReadout');
const marqueeBox = $('marqueeBox');"""
t = replace_once(t, anchor, insert, 'M7 DOM refs')

# Editor state vars
anchor = """let draftPathPoints = [];
const selectedMeshVertices = new Map();"""
insert = """let draftPathPoints = [];
let activePathVertexId = null;
let cleanPreviewActive = false;
let marqueeGesture = null;
const selectedMeshVertices = new Map();"""
t = replace_once(t, anchor, insert, 'M7 state vars')

# Selection manager after store
anchor = """const store = new VeyraStore(restored || createStarterDocument());
activeArtboardId = store.document.artboards[0].id;"""
insert = """const store = new VeyraStore(restored || createStarterDocument());
const editorSelection = new EditorSelectionState(store.selectedRef ? [store.selectedRef] : []);
activeArtboardId = store.document.artboards[0].id;"""
t = replace_once(t, anchor, insert, 'editor selection manager')

# Renderer callbacks
anchor = """const renderer = new VeyraRenderer($('veyraCanvas'), {
  select: (reference) => store.select(reference),
  drawPoint: (point) => {
    draftPathPoints.push({ x: point.x, y: point.y });
    renderer.setDraftPath(draftPathPoints);
    setStatus(`${draftPathPoints.length} path point${draftPathPoints.length === 1 ? '' : 's'} · Enter to commit`);
  },"""
insert = """const renderer = new VeyraRenderer($('veyraCanvas'), {
  select: (reference, options = {}) => selectEditorReference(reference, options),
  drawVertex: (vertex) => {
    draftPathPoints.push(cloneValue(vertex));
    renderer.setDraftPath(draftPathPoints);
    setStatus(`${draftPathPoints.length} path point${draftPathPoints.length === 1 ? '' : 's'} · click-drag curves · Esc/Done commits`);
  },
  finishPath: ({ closed = false } = {}) => finishPenDraft({ closed, enterVertex: true, reason: closed ? 'close-first-vertex' : 'renderer-finish' }),"""
t = replace_once(t, anchor, insert, 'renderer pen callbacks')
# vertex stable mutation callbacks
old = """  moveHandle: (nodeId, vertexIndex, prefix, next) => store.mutate((documentModel) => {
    const vertexId = nodeById(documentModel, nodeId).geometry.vertices[vertexIndex].id;
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, `${prefix}X`]), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, `${prefix}Y`]), next.y);
  }, 'drag'),
  moveVertex: (nodeId, vertexIndex, next) => store.mutate((documentModel) => {
    const vertexId = nodeById(documentModel, nodeId).geometry.vertices[vertexIndex].id;
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, 'x']), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, 'y']), next.y);
  }, 'drag'),"""
new = """  moveHandle: (nodeId, vertexId, prefix, next) => store.mutate((documentModel) => {
    moveBezierHandleInDocument(documentModel, nodeId, vertexId, prefix, next);
  }, 'drag'),
  moveVertex: (nodeId, vertexId, next) => store.mutate((documentModel) => {
    moveVertexInDocument(documentModel, nodeId, vertexId, next);
  }, 'drag'),
  setVertexModePreview: (nodeId, vertexId, mode) => store.mutate((documentModel) => {
    setVertexHandleModeInDocument(documentModel, nodeId, vertexId, mode);
  }, 'drag'),
  setCornerRadiusPreview: (nodeId, vertexId, radius) => store.mutate((documentModel) => {
    setVertexCornerRadiusInDocument(documentModel, nodeId, vertexId, radius);
  }, 'drag'),
  setVertexModeCommand: (nodeId, vertexId, mode) => projectCommand('setVertexHandleMode', { nodeId, vertexId, mode }, `Set vertex ${mode}`),
  toggleVertexSmooth: (nodeId, vertexId, mode) => projectCommand('setVertexHandleMode', { nodeId, vertexId, mode }, `Toggle vertex ${mode}`),
  removeHandleCommand: (nodeId, vertexId, handle) => projectCommand('moveBezierHandle', { nodeId, vertexId, handle, x: 0, y: 0, options: { removeOnly: true } }, `Remove ${handle} handle`),
  selectVertex: (_nodeId, vertexId) => { activePathVertexId = vertexId; renderInspector(); },"""
t = replace_once(t, old, new, 'stable vertex callbacks')

# Selection utilities after setStatus
anchor = """function setStatus(message) {
  statusText.textContent = message;
}
"""
insert = """function setStatus(message) {
  statusText.textContent = message;
}

function selectionRefExists(ref) {
  if (!ref?.kind || !ref?.id) return false;
  if (ref.kind === 'node') return Boolean(nodeById(store.document, ref.id));
  if (ref.kind === 'bone') return Boolean(boneById(store.document, ref.id));
  if (ref.kind === 'mesh') return Boolean(meshById(store.document, ref.id));
  if (ref.kind === 'control') return Boolean(controlById(store.document, ref.id));
  if (ref.kind === 'constraint') return Boolean(constraintById(store.document, ref.id));
  if (ref.kind === 'artboard') return store.document.artboards.some((item) => item.id === ref.id);
  if (ref.kind === 'component') return store.document.components.some((item) => item.id === ref.id);
  if (ref.kind === 'componentInstance') return store.document.componentInstances.some((item) => item.id === ref.id);
  return true;
}

function syncStorePrimarySelection() {
  const primary = editorSelection.primary;
  const current = store.selectedRef;
  if (!primary) {
    if (current) store.select(null);
    else renderAll('selection');
    return;
  }
  if (!current || current.kind !== primary.kind || current.id !== primary.id) store.select(primary);
  else renderAll('selection');
}

function selectEditorReference(reference, { toggle = false } = {}) {
  if (!reference) editorSelection.clear();
  else if (toggle) editorSelection.toggle(reference);
  else editorSelection.set([reference], reference);
  syncStorePrimarySelection();
  return editorSelection.refs;
}

function applyEditorSelection(refs, { additive = false } = {}) {
  if (!additive) editorSelection.set(refs);
  else for (const ref of refs) editorSelection.add(ref);
  syncStorePrimarySelection();
  return editorSelection.refs;
}
"""
t = replace_once(t, anchor, insert, 'selection helpers')

# Tool handling: no draft loss + Done visibility
old = """function setTool(tool, selectComponent = true) {
  if (currentTool === 'pencil' && tool !== 'pencil') {
    draftPathPoints = [];
    renderer.setDraftPath([]);
  }
  currentTool = tool;"""
new = """function setTool(tool, selectComponent = true, skipPenFinalize = false) {
  if (!skipPenFinalize && currentTool === 'pencil' && tool !== 'pencil') {
    finishPenDraft({ closed: false, enterVertex: false, reason: 'tool-switch' });
  }
  currentTool = tool;"""
t = replace_once(t, old, new, 'tool switch commits valid path')
t = replace_once(t,
"""  stagePanel.dataset.tool = tool;
  toolHint.textContent = TOOL_HINTS[tool];""",
"""  stagePanel.dataset.tool = tool;
  toolHint.textContent = TOOL_HINTS[tool];
  if (finishPathButton) {
    finishPathButton.hidden = !['pencil', 'vertex'].includes(tool);
    finishPathButton.querySelector('span').textContent = tool === 'pencil' ? 'Done Path' : 'Done Editing';
  }""",
'Done button state')
t = t.replace("pencil: 'Click to place path points. Enter commits; Escape cancels.',", "pencil: 'Click for straight points; click-drag for Bezier handles. Esc, Done, tool switch, or first-point close commits 2+ points.',")
t = t.replace("vertex: 'Select a Path, then drag its cyan vertices. Escape returns to Select.',", "vertex: 'Drag vertices/handles. Alt-drag a straight point creates mirrored handles; Ctrl/Cmd-click toggles smooth; Ctrl/Cmd-click a handle removes it.',")

# Hierarchy multi-selection class + click modifiers
old = """    row.classList.toggle('isSelected', store.selectedKind === 'node' && node.id === store.selectedId);
    row.classList.toggle('isHidden', !node.visible);"""
new = """    const nodeRef = createNodeRef(node.id);
    const selectedInEditor = editorSelection.has(nodeRef);
    row.classList.toggle('isSelected', store.selectedKind === 'node' && node.id === store.selectedId);
    row.classList.toggle('isMultiSelected', selectedInEditor);
    row.classList.toggle('isHidden', !node.visible);"""
t = replace_once(t, old, new, 'hierarchy multi class')
t = replace_once(t,
"""    select.setAttribute('aria-selected', String(store.selectedKind === 'node' && node.id === store.selectedId));""",
"""    select.setAttribute('aria-selected', String(selectedInEditor));""",
'hierarchy aria multi')
t = replace_once(t,
"""    select.onclick = () => store.select({ kind: 'node', id: node.id });""",
"""    select.onclick = (event) => selectEditorReference(nodeRef, { toggle: event.shiftKey });""",
'hierarchy toggle selection')

# Evaluated world position section after authored transform
anchor = """  appendNote(transform.fieldset, 'Angles display in degrees. Veyra stores radians and evaluates translate → rotate → skew X → skew Y → scale → pivot.');
  inspector.appendChild(transform.fieldset);

  const appearance = section('Appearance');"""
insert = """  appendNote(transform.fieldset, 'Angles display in degrees. Veyra stores radians and evaluates translate → rotate → skew X → skew Y → scale → pivot.');
  inspector.appendChild(transform.fieldset);

  const evaluatedNode = evaluatedScene?.nodes.find((candidate) => candidate.id === node.id);
  if (evaluatedNode) {
    const worldPoint = transformPoint(evaluatedNode.worldMatrix, { x: 0, y: 0 });
    const evaluatedPosition = section('Evaluated world position');
    evaluatedPosition.grid.append(
      field('World X', Number(worldPoint.x.toFixed(3)), () => {}, { type: 'number', number: true }),
      field('World Y', Number(worldPoint.y.toFixed(3)), () => {}, { type: 'number', number: true }),
    );
    evaluatedPosition.grid.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    appendNote(evaluatedPosition.fieldset, 'Read-only evaluated world coordinates. Authored local X/Y remain in Transform above.');
    inspector.appendChild(evaluatedPosition.fieldset);
  }

  const appearance = section('Appearance');"""
t = replace_once(t, anchor, insert, 'authored/evaluated position inspector')

# Path inspector replace old block with stable vertex controls
old = """    } else if (node.type === 'path') {
      geometry.grid.append(checkbox('Closed path', node.geometry.closed, (value) => nodePropertyMutation(node, 'geometry.closed', `Set ${node.name} closed`, value)));
      const summary = document.createElement('div');
      summary.className = 'vertexSummary';
      summary.innerHTML = `<span>Authored vertices</span><strong>${node.geometry.vertices.length}</strong>`;
      const actions = document.createElement('div');
      actions.className = 'pathVertexActions';
      const addVertex = document.createElement('button');
      addVertex.type = 'button';
      addVertex.className = 'textButton';
      addVertex.textContent = 'Add vertex';
      addVertex.title = 'Add a vertex, then position it with the Vertices tool';
      addVertex.onclick = () => addPathVertex(node);
      const removeVertex = document.createElement('button');
      removeVertex.type = 'button';
      removeVertex.className = 'textButton danger';
      removeVertex.textContent = 'Remove last';
      removeVertex.disabled = node.geometry.vertices.length <= 2;
      removeVertex.title = 'Remove the most recently added vertex';
      removeVertex.onclick = () => removePathVertex(node);
      actions.append(addVertex, removeVertex);
      geometry.fieldset.append(summary, actions);
      appendNote(geometry.fieldset, 'Use Vertices (E) to drag cyan points. Add/Remove is undoable; pale Bezier handles are display-only.');
    }"""
new = """    } else if (node.type === 'path') {
      if (!node.geometry.vertices.some((vertex) => vertex.id === activePathVertexId)) activePathVertexId = node.geometry.vertices[0]?.id || null;
      const activeVertex = node.geometry.vertices.find((vertex) => vertex.id === activePathVertexId) || node.geometry.vertices[0];
      geometry.grid.append(
        field('Path state', node.geometry.closed ? 'closed' : 'open', () => {}, { select: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] }),
        field('Vertex', activeVertex?.id || '', (value) => { activePathVertexId = value; renderInspector(); }, {
          select: node.geometry.vertices.map((vertex, index) => ({ value: vertex.id, label: `#${index + 1} · ${vertex.id}` })), full: true,
        }),
      );
      geometry.grid.querySelector('select')?.setAttribute('disabled', '');
      if (activeVertex) {
        geometry.grid.append(
          field('Vertex X', activeVertex.x, (value) => projectCommand('moveVertex', { nodeId: node.id, vertexId: activeVertex.id, x: value, y: activeVertex.y }, `Move ${node.name} vertex X`), { type: 'number', number: true, step: 1 }),
          field('Vertex Y', activeVertex.y, (value) => projectCommand('moveVertex', { nodeId: node.id, vertexId: activeVertex.id, x: activeVertex.x, y: value }, `Move ${node.name} vertex Y`), { type: 'number', number: true, step: 1 }),
          field('Handle mode', activeVertex.handleMode || 'straight', (value) => projectCommand('setVertexHandleMode', { nodeId: node.id, vertexId: activeVertex.id, mode: value }, `Set ${node.name} handle mode`), {
            select: ['straight','mirrored','aligned','detached'].map((value) => ({ value, label: value })),
          }),
          field('Corner radius', activeVertex.cornerRadius || 0, (value) => projectCommand('setVertexCornerRadius', { nodeId: node.id, vertexId: activeVertex.id, radius: value }, `Set ${node.name} vertex radius`), { type: 'number', number: true, min: 0, step: 1 }),
        );
      }
      const summary = document.createElement('div'); summary.className = 'vertexSummary';
      summary.innerHTML = `<span>Stable pathVertex refs</span><strong>${node.geometry.vertices.length}</strong>`;
      const actions = document.createElement('div'); actions.className = 'pathVertexActions';
      actions.append(
        inspectorAction('Add vertex', 'plus', () => addPathVertex(node)),
        inspectorAction('Remove vertex', 'minus', () => removePathVertex(node)),
        inspectorAction(node.geometry.closed ? 'Open path' : 'Close path', 'path', () => projectCommand(node.geometry.closed ? 'openPath' : 'closePath', { nodeId: node.id }, `${node.geometry.closed ? 'Open' : 'Close'} ${node.name}`)),
        inspectorAction('Reverse', 'mirror', () => projectCommand('reversePath', { nodeId: node.id }, `Reverse ${node.name}`)),
      );
      actions.children[1].disabled = node.geometry.vertices.length <= 2 || !activeVertex;
      geometry.fieldset.append(summary, actions);
      appendNote(geometry.fieldset, 'Vertices are stable pathVertex refs. Alt-drag a straight vertex to create mirrored handles; Ctrl/Cmd-click vertex toggles straight/smooth; Ctrl/Cmd-click a handle removes only that handle.');
    }"""
t = replace_once(t, old, new, 'path inspector M7')

# Multi-selection inspector before renderInspector
anchor = """function renderInspector() {
  inspector.replaceChildren();"""
insert = """function renderMultiSelectionInspector() {
  inspectorTitle.textContent = `${editorSelection.size} selected`;
  selectedType.textContent = 'MULTI';
  const selection = section('Selection bounds');
  const refs = editorSelection.refs;
  const bounds = selectionWorldBounds(evaluatedScene, refs);
  if (bounds) {
    selection.grid.append(
      field('World X', Number(bounds.left.toFixed(3)), () => {}, { type: 'number', number: true }),
      field('World Y', Number(bounds.top.toFixed(3)), () => {}, { type: 'number', number: true }),
      field('Width', Number(bounds.width.toFixed(3)), () => {}, { type: 'number', number: true }),
      field('Height', Number(bounds.height.toFixed(3)), () => {}, { type: 'number', number: true }),
    );
    selection.grid.querySelectorAll('input').forEach((input) => { input.disabled = true; });
  }
  appendNote(selection.fieldset, refs.map((ref) => `${ref.kind}:${ref.id}`).join(' · '));
  const actions = document.createElement('div'); actions.className = 'inlineActions';
  actions.append(inspectorAction('Group', 'group', () => dispatchEditorCommand('editor.selection.group')));
  selection.fieldset.appendChild(actions);
  inspector.appendChild(selection.fieldset);
}

function renderInspector() {
  inspector.replaceChildren();
  if (editorSelection.size > 1) { renderMultiSelectionInspector(); return; }"""
t = replace_once(t, anchor, insert, 'multi selection inspector')

# evaluate render selected refs
old = """  renderer.render(evaluatedScene, store.selectedRef);"""
if t.count(old) < 2:
    raise SystemExit('expected renderer.render selectedRef occurrences')
t = t.replace(old, """  renderer.render(evaluatedScene, store.selectedRef, editorSelection.refs);""")

# fit/focus multi selection
old = """function fitSelection() {
  if (!store.selectedRef) {
    showToast('Select an object to fit', true);
    return false;
  }
  return focusEditorReference(store.selectedRef, { select: false, padding: 44 });
}"""
new = """function fitSelection() {
  if (!editorSelection.size) {
    showToast('Select an object to fit', true);
    return false;
  }
  if (editorSelection.size === 1) return focusEditorReference(editorSelection.primary, { select: false, padding: 44 });
  if (!evaluatedScene) evaluateCurrentFrame();
  const bounds = selectionWorldBounds(evaluatedScene, editorSelection.refs);
  if (!bounds) return false;
  return applyViewportState(fitBoundsViewport(bounds, activeArtboard(), editorScreenSize(), { padding: 44 }), 'Focused selection');
}"""
t = replace_once(t, old, new, 'multi fit selection')
t = t.replace("if (select) store.select(ref);", "if (select) selectEditorReference(ref);")
t = t.replace("$('focusSelection').onclick = () => store.selectedRef ? focusEditorReference(store.selectedRef) : showToast('Select an object to focus', true);", "$('focusSelection').onclick = () => editorSelection.size ? fitSelection() : showToast('Select an object to focus', true);")

# Replace old path helper functions with canonical command + pen lifecycle
start = t.index("function addPathVertex(node) {")
end = t.index("function addNode(type) {", start)
new_path_functions = """function addPathVertex(node) {
  const vertices = node.geometry.vertices;
  const last = vertices.at(-1);
  const previous = vertices.at(-2) || last;
  const vertex = {
    x: (last.x + previous.x) / 2 + 24,
    y: (last.y + previous.y) / 2 + 24,
    inX: 0, inY: 0, outX: 0, outY: 0,
    handleMode: 'straight', cornerRadius: 0,
  };
  const ref = projectCommand('addVertex', { nodeId: node.id, vertex }, `Add ${node.name} vertex`);
  if (ref?.id) activePathVertexId = ref.id;
  setTool('vertex', false, true);
}

function removePathVertex(node) {
  const vertexId = activePathVertexId || node.geometry.vertices.at(-1)?.id;
  if (!vertexId || node.geometry.vertices.length <= 2) {
    showToast('A path needs at least two vertices', true);
    return;
  }
  const removed = projectCommand('removeVertex', { nodeId: node.id, vertexId }, `Remove ${node.name} vertex`);
  if (removed) activePathVertexId = nodeById(store.document, node.id)?.geometry.vertices.at(-1)?.id || null;
}

function finishPenDraft({ closed = false, enterVertex = true, reason = 'finish' } = {}) {
  if (draftPathPoints.length < 2) {
    const hadPoint = draftPathPoints.length > 0;
    draftPathPoints = [];
    renderer.setDraftPath([]);
    if (hadPoint) setStatus('Single-point path draft cancelled cleanly');
    return false;
  }
  const geometry = finalizePenDraftGeometry(createPenDraft(draftPathPoints), { closed });
  const created = projectCommand('add', {
    type: 'path',
    options: {
      artboard: activeArtboardRef(),
      name: 'Drawn Path',
      transform: { x: 0, y: 0 },
      paint: { fill: 'none', stroke: '#ec4899', strokeWidth: 4 },
      geometry,
    },
  }, `Draw path (${reason})`);
  const nodeId = created?.id || created;
  if (!nodeId || !nodeById(store.document, nodeId)) return false;
  draftPathPoints = [];
  renderer.setDraftPath([]);
  const node = nodeById(store.document, nodeId);
  activePathVertexId = node?.geometry.vertices.at(-1)?.id || null;
  selectEditorReference(createNodeRef(nodeId));
  if (enterVertex) setTool('vertex', false, true);
  showToast(closed ? 'Closed path created' : 'Path created');
  return true;
}

function cancelDraftPath() {
  if (!draftPathPoints.length) return false;
  draftPathPoints = [];
  renderer.setDraftPath([]);
  setStatus('Path draft cancelled');
  return true;
}

"""
t = t[:start] + new_path_functions + t[end:]

# renderAll status + subscribe selection sync
old = """  const selected = store.selectedObject;
  const selectedLabel = store.selectedKind === 'constraint' ? selected?.type : store.selectedKind;
  selectionStatus.textContent = selected ? `${selected.name} · ${selectedLabel}` : 'Artboard selected';"""
new = """  const selected = store.selectedObject;
  const selectedLabel = store.selectedKind === 'constraint' ? selected?.type : store.selectedKind;
  selectionStatus.textContent = editorSelection.size > 1
    ? `${editorSelection.size} objects selected`
    : selected ? `${selected.name} · ${selectedLabel}` : 'Artboard selected';"""
t = replace_once(t, old, new, 'selection status')
old = """store.subscribe((_current, reason) => {
  if (!store.document.artboards.some((item) => item.id === activeArtboardId)) activeArtboardId = store.document.artboards[0].id;
  componentRuntimeRegistry.prune();
  renderAll(reason);"""
new = """store.subscribe((_current, reason) => {
  if (!store.document.artboards.some((item) => item.id === activeArtboardId)) activeArtboardId = store.document.artboards[0].id;
  editorSelection.prune(selectionRefExists);
  if (reason === 'selection') {
    const primary = store.selectedRef;
    if (primary && !editorSelection.has(primary)) editorSelection.set([primary], primary);
    if (!primary && editorSelection.size) editorSelection.clear();
  }
  componentRuntimeRegistry.prune();
  renderAll(reason);"""
t = replace_once(t, old, new, 'selection subscribe sync')

# Coordinate HUD + marquee helpers before artboard resize vars
anchor = """let panGesture = null;
let activeArtboardResize = null;"""
insert = """function updateCoordinateHud(event) {
  const point = renderer.clientPoint(event.clientX, event.clientY);
  coordinateReadoutElement.value = formatCoordinateReadout(point, 2);
  coordinateReadoutElement.textContent = coordinateReadoutElement.value;
}
stageViewport.addEventListener('pointermove', updateCoordinateHud);

function tryBeginMarquee(event) {
  if (event.button !== 0 || currentTool !== 'select' || spacePanHeld || activeArtboardResize) return false;
  const target = event.target;
  const emptySurface = target === canvas
    || target?.classList?.contains('workspaceCatcher')
    || target?.classList?.contains('artboardBackground');
  if (!emptySurface) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  const start = { x: event.clientX, y: event.clientY };
  const viewportRect = stageViewport.getBoundingClientRect();
  const additive = event.shiftKey;
  const mode = event.ctrlKey || event.metaKey ? 'contain' : 'intersect';
  let moved = false;
  marqueeGesture = { pointerId: event.pointerId, start, additive, mode };
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isMarqueeSelecting');
  const cleanup = () => {
    stageViewport.removeEventListener('pointermove', move);
    stageViewport.removeEventListener('pointerup', end);
    stageViewport.removeEventListener('pointercancel', cancel);
    stageViewport.removeEventListener('lostpointercapture', cancel);
    marqueeBox.hidden = true;
    stageViewport.classList.remove('isMarqueeSelecting');
    marqueeGesture = null;
  };
  const move = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    moved = moved || Math.hypot(nextEvent.clientX - start.x, nextEvent.clientY - start.y) >= 3;
    if (!moved) return;
    const left = Math.min(start.x, nextEvent.clientX) - viewportRect.left;
    const top = Math.min(start.y, nextEvent.clientY) - viewportRect.top;
    marqueeBox.style.left = `${left}px`;
    marqueeBox.style.top = `${top}px`;
    marqueeBox.style.width = `${Math.abs(nextEvent.clientX - start.x)}px`;
    marqueeBox.style.height = `${Math.abs(nextEvent.clientY - start.y)}px`;
    marqueeBox.hidden = false;
  };
  const end = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    cleanup();
    try { stageViewport.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved) {
      if (!additive) selectEditorReference(null);
      return;
    }
    const startWorld = renderer.clientPoint(start.x, start.y);
    const endWorld = renderer.clientPoint(nextEvent.clientX, nextEvent.clientY);
    const refs = marqueeNodeRefs(evaluatedScene, worldRectFromPoints(startWorld, endWorld), { mode, deep: false });
    applyEditorSelection(refs, { additive });
    setStatus(`${mode === 'contain' ? 'Contained' : 'Marquee'} selection · ${refs.length} matched`);
  };
  const cancel = (nextEvent) => {
    if (nextEvent.pointerId != null && nextEvent.pointerId !== event.pointerId) return;
    cleanup();
  };
  stageViewport.addEventListener('pointermove', move);
  stageViewport.addEventListener('pointerup', end);
  stageViewport.addEventListener('pointercancel', cancel);
  stageViewport.addEventListener('lostpointercapture', cancel);
  return true;
}

let panGesture = null;
let activeArtboardResize = null;"""
t = replace_once(t, anchor, insert, 'coordinate marquee helpers')
# Marquee priority in capture handler
anchor = """  if (resizeDirection) {
    beginArtboardResize(event, resizeDirection);
    return;
  }
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });"""
insert = """  if (resizeDirection) {
    beginArtboardResize(event, resizeDirection);
    return;
  }
  if (tryBeginMarquee(event)) return;
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });"""
t = replace_once(t, anchor, insert, 'marquee before pan')

# Semantic editor commands before keyboard handler
anchor = """window.addEventListener('keydown', (event) => {"""
insert = """function groupEditorSelection() {
  const refs = editorSelection.refs.filter((ref) => ref.kind === 'node');
  if (!refs.length) { showToast('Select artwork to group', true); return false; }
  const result = projectCommand('groupNodes', { refs, options: { name: 'Group' } }, 'Group selection');
  if (!result?.groupId) return false;
  selectEditorReference(createNodeRef(result.groupId));
  return result;
}

function ungroupEditorSelection() {
  const primary = editorSelection.primary;
  const group = primary?.kind === 'node' ? nodeById(store.document, primary.id) : null;
  if (!group || group.type !== 'group') { showToast('Select a group to ungroup', true); return false; }
  const result = projectCommand('ungroupNode', { groupId: group.id }, `Ungroup ${group.name}`);
  if (!result?.childIds) return false;
  applyEditorSelection(result.childIds.map(createNodeRef));
  return result;
}

function selectAllArtwork() {
  const refs = store.document.nodes
    .filter((node) => onActiveArtboard(node) && !node.parent && node.visible && !node.locked)
    .map((node) => createNodeRef(node.id));
  applyEditorSelection(refs);
  setStatus(`Selected ${refs.length} top-level visible unlocked object${refs.length === 1 ? '' : 's'}`);
  return refs;
}

function toggleCleanPreview(force = null) {
  cleanPreviewActive = force == null ? !cleanPreviewActive : Boolean(force);
  renderer.setOverlayVisibility(normalizeOverlayVisibility(cleanPreviewActive
    ? { selection: false, vertices: false, rig: false, guides: false }
    : { selection: true, vertices: true, rig: true, guides: true }));
  cleanPreviewButton.classList.toggle('isActive', cleanPreviewActive);
  cleanPreviewButton.setAttribute('aria-pressed', String(cleanPreviewActive));
  setStatus(cleanPreviewActive ? 'Clean artwork preview' : 'Editor overlays restored');
  return cleanPreviewActive;
}

const editorCommandDispatcher = createEditorCommandDispatcher({
  'editor.path.pen': () => setTool('pencil'),
  'editor.path.finish': () => {
    if (currentTool === 'pencil') return finishPenDraft({ closed: false, enterVertex: true, reason: 'editor.path.finish' });
    if (currentTool === 'vertex') { setTool('select', false, true); return true; }
    return false;
  },
  'editor.path.editVertices': () => {
    const node = editorSelection.primary?.kind === 'node' ? nodeById(store.document, editorSelection.primary.id) : null;
    if (!node || node.type !== 'path') return false;
    activePathVertexId = node.geometry.vertices[0]?.id || null;
    setTool('vertex', false, true);
    return true;
  },
  'editor.selection.group': () => groupEditorSelection(),
  'editor.selection.ungroup': () => ungroupEditorSelection(),
  'editor.selection.selectAll': () => selectAllArtwork(),
  'editor.view.cleanPreview': () => toggleCleanPreview(),
});

function dispatchEditorCommand(commandId, payload = {}) {
  return editorCommandDispatcher.dispatch(commandId, payload);
}

finishPathButton.onclick = () => dispatchEditorCommand('editor.path.finish', { source: 'button' });
cleanPreviewButton.onclick = () => dispatchEditorCommand('editor.view.cleanPreview', { source: 'button' });

window.addEventListener('keydown', (event) => {"""
t = replace_once(t, anchor, insert, 'semantic editor command layer')
# Insert semantic shortcut interception after key vars
anchor = """  const commandKey = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (commandKey && (['+', '='].includes(event.key) || event.code === 'NumpadAdd')) {"""
insert = """  const commandKey = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const primaryPath = editorSelection.primary?.kind === 'node' ? nodeById(store.document, editorSelection.primary.id) : null;
  const editorCommand = !editing ? editorCommandForKeyEvent(event, { tool: currentTool, primaryIsPath: primaryPath?.type === 'path' }) : null;
  if (editorCommand) {
    event.preventDefault();
    dispatchEditorCommand(editorCommand, { key: event.key, source: 'keyboard' });
    return;
  }
  if (commandKey && (['+', '='].includes(event.key) || event.code === 'NumpadAdd')) {"""
t = replace_once(t, anchor, insert, 'semantic keyboard adapter')
# remove p from legacy tool map and old pencil Enter path + replace Escape pencil behavior won't be reached for pencil/vertex due interception
old = """  } else if (!editing && !commandKey && !event.altKey && ['v', 'e', 'p', 'b', 'm', 'c', 'k', 'h'].includes(key)) {
    event.preventDefault();
    setTool({ v: 'select', e: 'vertex', p: 'pencil', b: 'bone', m: 'mesh', c: 'control', k: 'constraint', h: 'pan' }[key]);
  } else if (!editing && currentTool === 'pencil' && event.key === 'Enter') {
    event.preventDefault();
    commitDraftPath();"""
new = """  } else if (!editing && !commandKey && !event.altKey && ['v', 'e', 'b', 'm', 'c', 'k', 'h'].includes(key)) {
    event.preventDefault();
    setTool({ v: 'select', e: 'vertex', b: 'bone', m: 'mesh', c: 'control', k: 'constraint', h: 'pan' }[key]);"""
t = replace_once(t, old, new, 'remove legacy pen shortcut')
# Escape branch old pencil/vertex will not run, but make selection manager clear instead store select
old = """    if (currentTool === 'pencil') {
      cancelDraftPath();
      setTool('select', false);
      return;
    }
    if (currentTool === 'vertex') setTool('select', false);
    if (selectedKeyframe) {"""
new = """    if (selectedKeyframe) {"""
t = replace_once(t, old, new, 'semantic finish owns escape')
t = t.replace("      store.select(null);", "      selectEditorReference(null);", 1)

# Global browser API M7 wrappers before getViewportState
anchor = """  getViewportState: () => ({ ...renderer.getViewport(), activeArtboardId, layout: { ...workspaceLayout }, theme: document.documentElement.dataset.theme }),"""
insert = """  addVertex: (nodeId, vertex, index = null) => dispatchCompatibilityCommand('addVertex', { nodeId, vertex, ...(index == null ? {} : { index }) }, { label: `Add vertex ${nodeId}`, source: 'script' }),
  removeVertex: (nodeId, vertexId) => dispatchCompatibilityCommand('removeVertex', { nodeId, vertexId }, { label: `Remove vertex ${vertexId}`, source: 'script' }),
  moveVertex: (nodeId, vertexId, x, y) => dispatchCompatibilityCommand('moveVertex', { nodeId, vertexId, x, y }, { label: `Move vertex ${vertexId}`, source: 'script' }),
  moveBezierHandle: (nodeId, vertexId, handle, x, y, options = {}) => dispatchCompatibilityCommand('moveBezierHandle', { nodeId, vertexId, handle, x, y, options }, { label: `Move ${handle} handle ${vertexId}`, source: 'script' }),
  setVertexHandleMode: (nodeId, vertexId, mode) => dispatchCompatibilityCommand('setVertexHandleMode', { nodeId, vertexId, mode }, { label: `Set vertex mode ${vertexId}`, source: 'script' }),
  setVertexCornerRadius: (nodeId, vertexId, radius) => dispatchCompatibilityCommand('setVertexCornerRadius', { nodeId, vertexId, radius }, { label: `Set vertex radius ${vertexId}`, source: 'script' }),
  openPath: (nodeId) => dispatchCompatibilityCommand('openPath', { nodeId }, { label: `Open path ${nodeId}`, source: 'script' }),
  closePath: (nodeId) => dispatchCompatibilityCommand('closePath', { nodeId }, { label: `Close path ${nodeId}`, source: 'script' }),
  reversePath: (nodeId) => dispatchCompatibilityCommand('reversePath', { nodeId }, { label: `Reverse path ${nodeId}`, source: 'script' }),
  groupNodes: (refs, options = {}) => dispatchCompatibilityCommand('groupNodes', { refs, options }, { label: 'Group nodes', source: 'script' }),
  ungroupNode: (groupId) => dispatchCompatibilityCommand('ungroupNode', { groupId }, { label: `Ungroup ${groupId}`, source: 'script' }),
  dispatchEditorCommand: (commandId, payload = {}) => dispatchEditorCommand(commandId, payload),
  getEditorState: () => ({
    tool: currentTool,
    selection: editorSelection.refs,
    primarySelection: editorSelection.primary,
    pointerWorld: coordinateReadoutElement.value,
    cleanPreview: cleanPreviewActive,
    draftVertexCount: draftPathPoints.length,
    overlayVisibility: renderer.getOverlayVisibility(),
  }),
  getViewportState: () => ({ ...renderer.getViewport(), activeArtboardId, layout: { ...workspaceLayout }, theme: document.documentElement.dataset.theme }),"""
t = replace_once(t, anchor, insert, 'browser M7 API')

# Active artboard / new/open selection gets editor state through store subscription; explicit setActive no change needed.
p.write_text(t)
print('M7 shell patch applied')