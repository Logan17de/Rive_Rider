from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Patch target not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


def append_once(path, marker, content):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if marker in text:
        return
    target.write_text(text + '\n' + content, encoding='utf-8')


# ---------------------------------------------------------------------------
# Renderer: cancellable authoring gestures, explicit viewport API, resize handles.
# ---------------------------------------------------------------------------
replace_once(
    'src/veyra/renderer.js',
    "import { createSvgViewBox, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './viewport.js';\n",
    "import { createSvgViewBox, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './viewport.js';\nimport { resizeNodeTransform } from './workspace.js';\n",
)
replace_once(
    'src/veyra/renderer.js',
    """    this.viewDocumentId = null;
    this.draftPath = [];
  }
""",
    """    this.viewDocumentId = null;
    this.draftPath = [];
    this.activeDragCancel = null;
  }
""",
)
replace_once(
    'src/veyra/renderer.js',
    """  panBy(x, y) {
    if (!this.scene || !this.viewCenter) return;
    this.viewCenter.x += Number(x) || 0;
    this.viewCenter.y += Number(y) || 0;
    this.#applyViewBox();
  }

  clientPoint(clientX, clientY) {
""",
    """  panBy(x, y) {
    if (!this.scene || !this.viewCenter) return;
    this.viewCenter.x += Number(x) || 0;
    this.viewCenter.y += Number(y) || 0;
    this.#applyViewBox();
  }

  getViewport() {
    return {
      zoom: this.zoom,
      centerX: this.viewCenter?.x ?? this.scene?.artboard.width / 2 ?? 0,
      centerY: this.viewCenter?.y ?? this.scene?.artboard.height / 2 ?? 0,
    };
  }

  setViewport(viewport = {}) {
    if (!this.scene) return this.getViewport();
    const zoom = Math.min(8, Math.max(0.1, Number(viewport.zoom ?? this.zoom) || 1));
    const centerX = Number(viewport.centerX ?? this.viewCenter?.x ?? this.scene.artboard.width / 2);
    const centerY = Number(viewport.centerY ?? this.viewCenter?.y ?? this.scene.artboard.height / 2);
    if (![zoom, centerX, centerY].every(Number.isFinite)) throw new TypeError('Viewport values must be finite.');
    this.zoom = zoom;
    this.viewCenter = { x: centerX, y: centerY };
    this.#applyViewBox();
    return this.getViewport();
  }

  cancelActiveGesture() {
    if (!this.activeDragCancel) return false;
    const cancel = this.activeDragCancel;
    this.activeDragCancel = null;
    cancel();
    return true;
  }

  clientPoint(clientX, clientY) {
""",
)
replace_once(
    'src/veyra/renderer.js',
    """      if (node.type === 'group' && !node.locked && this.tool === 'select') {
        const hit = svgElement('rect', {
          class: 'groupHit',
          x: bounds.minX - pad,
          y: bounds.minY - pad,
          width: bounds.maxX - bounds.minX + pad * 2,
          height: bounds.maxY - bounds.minY + pad * 2,
        });
        hit.addEventListener('pointerdown', (event) => this.#startGroupDrag(event, node, group));
        group.appendChild(hit);
      }
      group.appendChild(svgElement('circle', {
""",
    """      if (node.type === 'group' && !node.locked && this.tool === 'select') {
        const hit = svgElement('rect', {
          class: 'groupHit',
          x: bounds.minX - pad,
          y: bounds.minY - pad,
          width: bounds.maxX - bounds.minX + pad * 2,
          height: bounds.maxY - bounds.minY + pad * 2,
        });
        hit.addEventListener('pointerdown', (event) => this.#startGroupDrag(event, node, group));
        group.appendChild(hit);
      }
      if (node.type !== 'group' && !node.locked && this.tool === 'select') {
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const positions = {
          nw: [bounds.minX, bounds.minY], n: [centerX, bounds.minY], ne: [bounds.maxX, bounds.minY],
          e: [bounds.maxX, centerY], se: [bounds.maxX, bounds.maxY], s: [centerX, bounds.maxY],
          sw: [bounds.minX, bounds.maxY], w: [bounds.minX, centerY],
        };
        for (const [handle, [cx, cy]] of Object.entries(positions)) {
          const resizeHandle = svgElement('circle', {
            class: `resizeHandle resizeHandle-${handle}`,
            'data-resize-handle': handle,
            cx, cy,
            r: 5 / this.zoom,
            'stroke-width': 1.5 / this.zoom,
          });
          resizeHandle.addEventListener('pointerdown', (event) => this.#startResizeDrag(event, node, handle, group, bounds));
          group.appendChild(resizeHandle);
        }
      }
      group.appendChild(svgElement('circle', {
""",
)
replace_once(
    'src/veyra/renderer.js',
    """  #captureDrag(event, move, end) {
    this.dragging = true;
    this.svg.setPointerCapture?.(event.pointerId);
    const pointerMove = (nextEvent) => move(nextEvent);
    const pointerEnd = (nextEvent) => {
      this.svg.removeEventListener('pointermove', pointerMove);
      this.svg.removeEventListener('pointerup', pointerEnd);
      this.svg.removeEventListener('pointercancel', pointerCancel);
      this.svg.releasePointerCapture?.(event.pointerId);
      this.dragging = false;
      this.dragKind = null;
      end(nextEvent);
    };
    const pointerCancel = () => {
      this.svg.removeEventListener('pointermove', pointerMove);
      this.svg.removeEventListener('pointerup', pointerEnd);
      this.svg.removeEventListener('pointercancel', pointerCancel);
      this.dragging = false;
      this.dragKind = null;
      this.callbacks.cancel?.();
    };
    this.svg.addEventListener('pointermove', pointerMove);
    this.svg.addEventListener('pointerup', pointerEnd);
    this.svg.addEventListener('pointercancel', pointerCancel);
  }

  #startNodeDrag(event, node, group) {
""",
    """  #captureDrag(event, move, end) {
    this.dragging = true;
    this.svg.setPointerCapture?.(event.pointerId);
    let settled = false;
    const cleanup = () => {
      this.svg.removeEventListener('pointermove', pointerMove);
      this.svg.removeEventListener('pointerup', pointerEnd);
      this.svg.removeEventListener('pointercancel', pointerCancel);
      this.svg.removeEventListener('lostpointercapture', pointerCancel);
      this.dragging = false;
      this.dragKind = null;
      this.activeDragCancel = null;
    };
    const pointerMove = (nextEvent) => move(nextEvent);
    const pointerEnd = (nextEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { this.svg.releasePointerCapture?.(event.pointerId); } catch {}
      end(nextEvent);
    };
    const pointerCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      this.callbacks.cancel?.();
    };
    this.activeDragCancel = pointerCancel;
    this.svg.addEventListener('pointermove', pointerMove);
    this.svg.addEventListener('pointerup', pointerEnd);
    this.svg.addEventListener('pointercancel', pointerCancel);
    this.svg.addEventListener('lostpointercapture', pointerCancel);
  }

  #startResizeDrag(event, node, handle, group, bounds) {
    if (event.button !== 0 || this.tool !== 'select' || node.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const screenMatrix = group.getScreenCTM?.();
    if (!screenMatrix) return;
    const inverse = screenMatrix.inverse();
    const localPoint = (pointerEvent) => {
      const point = new DOMPoint(pointerEvent.clientX, pointerEvent.clientY).matrixTransform(inverse);
      return { x: point.x, y: point.y };
    };
    const startNode = { ...node, transform: { ...node.transform } };
    this.dragging = true;
    this.dragKind = 'resize';
    this.callbacks.select?.({ kind: 'node', id: node.id });
    this.callbacks.begin?.(`Resize ${node.name}`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const nextTransform = resizeNodeTransform(startNode, bounds, handle, localPoint(nextEvent), {
          aspectLock: nextEvent.shiftKey,
          centerResize: nextEvent.altKey,
        });
        this.callbacks.resizeNode?.(node.id, nextTransform);
        const liveGroup = this.svg.querySelector(`[data-node-id=\"${CSS.escape(node.id)}\"]`);
        if (liveGroup) liveGroup.setAttribute('transform', transformAttribute(transformMatrix(nextTransform)));
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startNodeDrag(event, node, group) {
""",
)

# ---------------------------------------------------------------------------
# Browser shell: semantic themes, panel state, focus API, pan contracts.
# ---------------------------------------------------------------------------
replace_once(
    'veyra.js',
    "import { createMachineInteractionBridge } from './src/veyra/interactionHost.js';\n",
    """import { createMachineInteractionBridge } from './src/veyra/interactionHost.js';
import {
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
  normalizeTheme,
  normalizeWheelDelta,
  normalizeWorkspaceLayout,
  panGestureMoved,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
} from './src/veyra/workspace.js';
""",
)
replace_once(
    'veyra.js',
    """const UI_THEME_KEY = 'veyra.ui-theme.v1';
const UI_THEMES = new Set(['magenta', 'blue', 'green', 'orange', 'yellow']);
""",
    """const UI_THEME_KEY = 'veyra.ui-theme.v1';
const UI_LAYOUT_KEY = 'veyra.workspace-layout.v1';
""",
)
replace_once(
    'veyra.js',
    """const playhead = $('playhead');

function applyTheme(theme) {
  const nextTheme = UI_THEMES.has(theme) ? theme : 'magenta';
  document.documentElement.dataset.theme = nextTheme;
  themeSelect.value = nextTheme;
  return nextTheme;
}
""",
    """const playhead = $('playhead');
const workspace = document.querySelector('.workspace');
const leftSplitter = $('leftSplitter');
const rightSplitter = $('rightSplitter');
const timelineSplitter = $('timelineSplitter');
const hierarchyCollapse = $('hierarchyCollapse');
const inspectorCollapse = $('inspectorCollapse');

function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  themeSelect.value = nextTheme;
  return nextTheme;
}
""",
)
replace_once(
    'veyra.js',
    """themeSelect.onchange = () => {
  const nextTheme = applyTheme(themeSelect.value);
  localStorage.setItem(UI_THEME_KEY, nextTheme);
};

let toastTimer = null;
""",
    """themeSelect.onchange = () => {
  const before = serializeVeyra(store.document);
  const nextTheme = applyTheme(themeSelect.value);
  localStorage.setItem(UI_THEME_KEY, nextTheme);
  if (serializeVeyra(store.document) !== before) throw new Error('Theme change mutated authored document.');
};

function loadWorkspaceLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_LAYOUT_KEY) || 'null');
    return normalizeWorkspaceLayout(saved || {}, { width: window.innerWidth, height: window.innerHeight });
  } catch {
    return normalizeWorkspaceLayout({}, { width: window.innerWidth, height: window.innerHeight });
  }
}

let workspaceLayout = loadWorkspaceLayout();

let toastTimer = null;
""",
)
replace_once(
    'veyra.js',
    """  moveNode: (nodeId, next) => store.mutate((documentModel) => {
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.x'), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.y'), next.y);
  }, 'drag'),
""",
    """  moveNode: (nodeId, next) => store.mutate((documentModel) => {
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.x'), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.y'), next.y);
  }, 'drag'),
  resizeNode: (nodeId, next) => store.mutate((documentModel) => {
    for (const property of ['x', 'y', 'scaleX', 'scaleY']) {
      writeProperty(documentModel, nodePropertyAddress(nodeId, `transform.${property}`), next[property]);
    }
  }, 'drag'),
""",
)
replace_once(
    'veyra.js',
    """  cancel: () => store.cancel(),
});

function showToast(message, error = false) {
""",
    """  cancel: () => store.cancel(),
});

function applyWorkspaceLayout(persist = true) {
  workspaceLayout = normalizeWorkspaceLayout(workspaceLayout, { width: window.innerWidth, height: window.innerHeight });
  for (const [property, value] of Object.entries(workspaceCssVariables(workspaceLayout, { width: window.innerWidth, height: window.innerHeight }))) {
    document.documentElement.style.setProperty(property, value);
  }
  workspace.dataset.leftCollapsed = String(workspaceLayout.leftCollapsed);
  workspace.dataset.rightCollapsed = String(workspaceLayout.rightCollapsed);
  timelinePanel.dataset.collapsed = String(workspaceLayout.bottomCollapsed);
  hierarchyCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  inspectorCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  timelineToggle.setAttribute('aria-expanded', String(!workspaceLayout.bottomCollapsed));
  timelineToggle.title = workspaceLayout.bottomCollapsed ? 'Expand timeline' : 'Collapse timeline';
  if (persist) localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(workspaceLayout));
  requestAnimationFrame(() => syncArtboardFrame());
  return { ...workspaceLayout };
}

applyWorkspaceLayout(false);

function showToast(message, error = false) {
""",
)
# focus utility in hierarchy row
replace_once(
    'veyra.js',
    """    const locked = document.createElement('button');
    locked.className = 'treeUtility';
""",
    """    const focus = document.createElement('button');
    focus.className = 'treeUtility treeFocus';
    focus.title = 'Focus object';
    focus.setAttribute('aria-label', `Focus ${node.name}`);
    focus.append(icon('fit'));
    focus.onclick = () => focusEditorReference({ kind: 'node', id: node.id });

    const locked = document.createElement('button');
    locked.className = 'treeUtility';
""",
)
replace_once('veyra.js', "    row.append(select, visible, locked);\n", "    row.append(select, focus, visible, locked);\n")
# rig rows get focus and visibility where the entity supports it
replace_once(
    'veyra.js',
    """    select.onclick = () => store.select({ kind, id: object.id });
    row.appendChild(select);
    hierarchy.appendChild(row);
  };
""",
    """    select.onclick = () => store.select({ kind, id: object.id });
    row.appendChild(select);
    if (['bone', 'mesh', 'control'].includes(kind)) {
      const focus = document.createElement('button');
      focus.className = 'treeUtility treeFocus';
      focus.title = `Focus ${kind}`;
      focus.setAttribute('aria-label', `Focus ${object.name}`);
      focus.append(icon('fit'));
      focus.onclick = () => focusEditorReference({ kind, id: object.id });
      row.appendChild(focus);
    }
    if ('visible' in object && ['bone', 'mesh', 'control'].includes(kind)) {
      const visible = document.createElement('button');
      visible.className = 'treeUtility';
      visible.title = object.visible ? `Hide ${kind}` : `Show ${kind}`;
      visible.setAttribute('aria-label', visible.title);
      visible.append(icon(object.visible ? 'eye' : 'eye-off'));
      visible.onclick = () => rigPropertyMutation(kind, object, 'visible', `${object.visible ? 'Hide' : 'Show'} ${object.name}`, !object.visible);
      row.appendChild(visible);
    }
    hierarchy.appendChild(row);
  };
""",
)
# timeline collapse uses persistent layout
replace_once(
    'veyra.js',
    """timelineToggle.onclick = () => {
  const collapsed = timelinePanel.dataset.collapsed === 'true';
  timelinePanel.dataset.collapsed = collapsed ? 'false' : 'true';
  timelineToggle.setAttribute('aria-expanded', String(!collapsed));
  timelineToggle.title = collapsed ? 'Collapse timeline' : 'Expand timeline';
};
""",
    """timelineToggle.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'bottom', !workspaceLayout.bottomCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
""",
)
# replace zoom/navigation block through ResizeObserver with M5 behavior
old_nav = """function fitCanvas() {
  zoom = renderer.resetView();
  evaluateCurrentFrame();
  syncArtboardFrame();
  updateZoomLabel();
  setStatus('Canvas fitted');
}

$('zoomOut').onclick = () => setZoom(zoom / 1.2);
$('zoomIn').onclick = () => setZoom(zoom * 1.2);
$('zoomFit').onclick = fitCanvas;

stageViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey || event.altKey) {
    const anchor = renderer.clientPoint(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.002);
    setZoom(zoom * factor, anchor);
    setStatus(`Canvas zoom ${Math.round(zoom * 100)}%`);
    return;
  }
  const horizontal = event.shiftKey ? event.deltaY + event.deltaX : event.deltaX;
  const vertical = event.shiftKey ? 0 : event.deltaY;
  const matrix = canvas.getScreenCTM();
  const worldPerPixel = matrix ? 1 / matrix.a : store.document.artboard.width / Math.max(1, zoom * canvas.clientWidth);
  renderer.panBy(horizontal * worldPerPixel, vertical * worldPerPixel);
  syncArtboardFrame();
  setStatus(event.shiftKey ? 'Canvas panned horizontally' : 'Canvas panned');
}, { passive: false });

let panGesture = null;
stageViewport.addEventListener('pointerdown', (event) => {
  const shouldPan = currentTool === 'pan' || event.altKey || event.button === 1;
  if (!shouldPan) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  panGesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isPanning');
}, true);

stageViewport.addEventListener('pointermove', (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  const before = renderer.clientPoint(panGesture.clientX, panGesture.clientY);
  const after = renderer.clientPoint(event.clientX, event.clientY);
  renderer.panBy(before.x - after.x, before.y - after.y);
  syncArtboardFrame();
  panGesture.clientX = event.clientX;
  panGesture.clientY = event.clientY;
});

const finishPan = (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  stageViewport.releasePointerCapture?.(event.pointerId);
  panGesture = null;
  stageViewport.classList.remove('isPanning');
  syncArtboardFrame();
  setStatus('Canvas panned');
};
stageViewport.addEventListener('pointerup', finishPan);
stageViewport.addEventListener('pointercancel', finishPan);

new ResizeObserver(() => syncArtboardFrame()).observe(stageViewport);
"""
new_nav = """function applyViewportState(next, status = null) {
  const applied = renderer.setViewport(next);
  zoom = applied.zoom;
  evaluateCurrentFrame();
  syncArtboardFrame();
  updateZoomLabel();
  if (status) setStatus(status);
  return applied;
}

function fitCanvas() {
  return applyViewportState(fitArtboardViewport(store.document.artboard), 'Artboard fitted');
}

function focusEditorReference(ref, { select = true, padding = 54 } = {}) {
  if (!ref?.kind || !ref?.id) return false;
  if (!evaluatedScene) evaluateCurrentFrame();
  const bounds = evaluatedRefBounds(evaluatedScene, ref);
  if (!bounds) {
    showToast(`Cannot locate ${ref.kind}:${ref.id}`, true);
    return false;
  }
  if (select) store.select(ref);
  const rect = stageViewport.getBoundingClientRect();
  const next = fitBoundsViewport(bounds, store.document.artboard, {
    width: stageViewport.clientWidth || rect.width,
    height: stageViewport.clientHeight || rect.height,
  }, { padding });
  applyViewportState(next, `Focused ${ref.kind}`);
  return true;
}

function fitSelection() {
  if (!store.selectedRef) {
    showToast('Select an object to fit', true);
    return false;
  }
  return focusEditorReference(store.selectedRef, { select: false, padding: 44 });
}

$('zoomOut').onclick = () => setZoom(zoom / 1.2);
$('zoomIn').onclick = () => setZoom(zoom * 1.2);
$('zoomFit').onclick = fitCanvas;
$('zoom100').onclick = () => applyViewportState({ ...renderer.getViewport(), zoom: 1 }, 'Canvas 100%');
$('fitSelection').onclick = fitSelection;
$('focusSelection').onclick = () => store.selectedRef ? focusEditorReference(store.selectedRef) : showToast('Select an object to focus', true);

stageViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey || event.altKey) {
    const anchor = renderer.clientPoint(event.clientX, event.clientY);
    setZoom(zoom * wheelZoomFactor(event.deltaY, event.deltaMode), anchor);
    setStatus(`Canvas zoom ${Math.round(zoom * 100)}%`);
    return;
  }
  const horizontal = normalizeWheelDelta(event.shiftKey ? event.deltaY + event.deltaX : event.deltaX, event.deltaMode) * 0.8;
  const vertical = event.shiftKey ? 0 : normalizeWheelDelta(event.deltaY, event.deltaMode) * 0.8;
  const matrix = canvas.getScreenCTM();
  const worldPerPixel = matrix ? 1 / Math.max(1e-9, Math.abs(matrix.a)) : store.document.artboard.width / Math.max(1, zoom * canvas.clientWidth);
  renderer.panBy(horizontal * worldPerPixel, vertical * worldPerPixel);
  syncArtboardFrame();
  setStatus(event.shiftKey ? 'Canvas panned horizontally' : 'Canvas panned');
}, { passive: false });

let panGesture = null;
let spacePanHeld = false;
let spacePanUsed = false;
let suppressNextCanvasContextMenu = false;
stageViewport.addEventListener('pointerdown', (event) => {
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
  if (!kind) return;
  if (kind !== 'right') event.preventDefault();
  event.stopImmediatePropagation();
  panGesture = {
    kind,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    moved: false,
  };
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isPanning');
}, true);

stageViewport.addEventListener('pointermove', (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  if (!panGesture.moved) {
    panGesture.moved = panGestureMoved(
      { x: panGesture.startX, y: panGesture.startY },
      { x: event.clientX, y: event.clientY },
    );
  }
  if (!panGesture.moved) return;
  if (panGesture.kind === 'space') spacePanUsed = true;
  if (panGesture.kind === 'right') event.preventDefault();
  const before = renderer.clientPoint(panGesture.clientX, panGesture.clientY);
  const after = renderer.clientPoint(event.clientX, event.clientY);
  renderer.panBy(before.x - after.x, before.y - after.y);
  syncArtboardFrame();
  panGesture.clientX = event.clientX;
  panGesture.clientY = event.clientY;
});

const finishPan = (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  const finished = panGesture;
  panGesture = null;
  try { stageViewport.releasePointerCapture?.(event.pointerId); } catch {}
  stageViewport.classList.remove('isPanning');
  if (shouldSuppressCanvasContextMenu(finished)) suppressNextCanvasContextMenu = true;
  syncArtboardFrame();
  if (finished.moved) setStatus('Canvas panned');
};
stageViewport.addEventListener('pointerup', finishPan);
stageViewport.addEventListener('pointercancel', finishPan);
stageViewport.addEventListener('lostpointercapture', finishPan);
stageViewport.addEventListener('contextmenu', (event) => {
  if (!suppressNextCanvasContextMenu) return;
  event.preventDefault();
  event.stopPropagation();
  suppressNextCanvasContextMenu = false;
});

new ResizeObserver(() => syncArtboardFrame()).observe(stageViewport);
"""
replace_once('veyra.js', old_nav, new_nav)

# workspace splitter/collapse wiring before preview handlers
replace_once(
    'veyra.js',
    """// The three handlers below are built by createPreviewPointerHandlers so an
""",
    """function wireWorkspaceSplitter(element, panel) {
  if (!element) return;
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    const startSize = workspaceLayout[property];
    element.setPointerCapture?.(event.pointerId);
    element.classList.add('isDragging');
    const onMove = (nextEvent) => {
      const delta = panel === 'left'
        ? nextEvent.clientX - startX
        : panel === 'right'
          ? startX - nextEvent.clientX
          : startY - nextEvent.clientY;
      workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, startSize + delta, { width: window.innerWidth, height: window.innerHeight });
      applyWorkspaceLayout(false);
    };
    const onEnd = (nextEvent) => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onEnd);
      element.removeEventListener('pointercancel', onEnd);
      element.classList.remove('isDragging');
      try { element.releasePointerCapture?.(nextEvent.pointerId); } catch {}
      applyWorkspaceLayout(true);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onEnd);
    element.addEventListener('pointercancel', onEnd);
  });
  element.addEventListener('dblclick', () => {
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, VEYRA_WORKSPACE_LAYOUT_DEFAULTS[property], { width: window.innerWidth, height: window.innerHeight });
    applyWorkspaceLayout();
  });
}
wireWorkspaceSplitter(leftSplitter, 'left');
wireWorkspaceSplitter(rightSplitter, 'right');
wireWorkspaceSplitter(timelineSplitter, 'bottom');
hierarchyCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
inspectorCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
window.addEventListener('resize', () => applyWorkspaceLayout(false));

// The three handlers below are built by createPreviewPointerHandlers so an
""",
)
# keyboard: space becomes hold-to-pan, tap-to-play; escape cancels active transform gesture
replace_once(
    'veyra.js',
    """  } else if (!editing && event.key === ' ') {
    event.preventDefault();
    playAnimation();
  } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
""",
    """  } else if (!editing && event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) {
      spacePanHeld = true;
      spacePanUsed = false;
    }
  } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
""",
)
replace_once(
    'veyra.js',
    """  } else if (!editing && event.key === 'Escape') {
    if (currentTool === 'pencil') {
""",
    """  } else if (!editing && event.key === 'Escape') {
    if (renderer.cancelActiveGesture()) {
      setStatus('Authoring gesture cancelled');
      return;
    }
    if (currentTool === 'pencil') {
""",
)
replace_once(
    'veyra.js',
    """window.addEventListener('beforeunload', () => {
""",
    """window.addEventListener('keyup', (event) => {
  if (event.key !== ' ') return;
  const wasHeld = spacePanHeld;
  spacePanHeld = false;
  if (wasHeld && !spacePanUsed && !panGesture) playAnimation();
  spacePanUsed = false;
});

window.addEventListener('beforeunload', () => {
""",
)
# browser runtime/editor viewport API
replace_once(
    'veyra.js',
    """globalThis.veyra = Object.freeze({
  getManifest: (options = {}) => controlPlane.getManifest(options),
""",
    """globalThis.veyra = Object.freeze({
  getViewportState: () => ({ ...renderer.getViewport(), layout: { ...workspaceLayout }, theme: document.documentElement.dataset.theme }),
  setViewport: (viewport) => applyViewportState(viewport, 'Viewport updated'),
  fitArtboard: () => fitCanvas(),
  fitSelection: () => fitSelection(),
  focusReference: (ref) => focusEditorReference(ref),
  getManifest: (options = {}) => controlPlane.getManifest(options),
""",
)

# service-registry audit declares the new browser editor-state mutations runtime-only.
replace_once(
    'src/veyra/serviceRegistry.js',
    """export const VEYRA_BROWSER_MUTATION_COMPATIBILITY = Object.freeze({
  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),
""",
    """export const VEYRA_BROWSER_MUTATION_COMPATIBILITY = Object.freeze({
  setViewport: Object.freeze({ transport: 'runtime', reason: 'Viewport state is ephemeral editor state and never authored document content.' }),
  fitArtboard: Object.freeze({ transport: 'runtime', reason: 'Viewport fitting is an ephemeral editor navigation action.' }),
  fitSelection: Object.freeze({ transport: 'runtime', reason: 'Selection fitting changes only ephemeral editor viewport state.' }),
  focusReference: Object.freeze({ transport: 'runtime', reason: 'Focus/locate changes selection/view state but does not author project content.' }),
  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),
""",
)

# Public pure workspace API.
replace_once(
    'src/index.js',
    "export { createSvgViewBox, createSvgViewBoxScreenTransform, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './veyra/viewport.js';\n",
    """export { createSvgViewBox, createSvgViewBoxScreenTransform, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './veyra/viewport.js';
export {
  VEYRA_MIN_NODE_SCALE,
  VEYRA_PAN_DRAG_THRESHOLD_PX,
  VEYRA_UI_THEMES,
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  VEYRA_WORKSPACE_PANEL_LIMITS,
  VEYRA_ZOOM_MAX,
  VEYRA_ZOOM_MIN,
  clampZoom,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
  normalizeTheme,
  normalizeWheelDelta,
  normalizeWorkspaceLayout,
  panGestureMoved,
  panViewportByScreen,
  resizeNodeTransform,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
  zoomViewportAtScreen,
} from './veyra/workspace.js';
""",
)

# ---------------------------------------------------------------------------
# HTML: semantic themes, splitters/collapse affordances, navigation commands.
# ---------------------------------------------------------------------------
replace_once(
    'veyra.html',
    """          <option value="magenta">Magenta</option><option value="blue">Blue</option><option value="green">Green</option><option value="orange">Orange</option><option value="yellow">Yellow</option>
""",
    """          <option value="neutral-dark">Neutral Dark</option><option value="graphite-blue">Graphite / Blue</option><option value="deep-teal">Deep Teal</option><option value="warm-dark">Warm Dark</option><option value="light-neutral">Light Neutral</option>
""",
)
replace_once(
    'veyra.html',
    """          <span id="nodeCount" class="countBadge">0</span>
        </div>
""",
    """          <div class="panelHeaderActions"><span id="nodeCount" class="countBadge">0</span><button class="panelCollapse" id="hierarchyCollapse" title="Collapse hierarchy" aria-label="Collapse hierarchy" aria-expanded="true"><svg><use href="#i-minus"/></svg></button></div>
        </div>
""",
)
replace_once(
    'veyra.html',
    """      </aside>

      <main class="stagePanel">
""",
    """      </aside>
      <div class="workspaceSplitter verticalSplitter" id="leftSplitter" role="separator" aria-orientation="vertical" aria-label="Resize hierarchy panel" tabindex="0"></div>

      <main class="stagePanel">
""",
)
replace_once(
    'veyra.html',
    """            <button id="zoomFit" aria-label="Fit canvas" title="Fit canvas (Ctrl+0)"><svg><use href="#i-fit"/></svg></button>
          </div>
""",
    """            <button id="zoomFit" aria-label="Fit artboard" title="Fit Artboard (Ctrl+0)"><svg><use href="#i-fit"/></svg></button>
            <button id="zoom100" class="zoomTextButton" aria-label="Zoom to 100%" title="100%">1:1</button>
            <button id="fitSelection" class="zoomTextButton" aria-label="Fit selection" title="Fit Selection (F)">Fit Sel</button>
            <button id="focusSelection" class="zoomTextButton" aria-label="Focus selection" title="Focus Selection (Shift+F)">Focus</button>
          </div>
""",
)
replace_once(
    'veyra.html',
    """          <span><kbd>Alt</kbd> + drag pan</span>
""",
    """          <span><kbd>Right</kbd>/<kbd>Middle</kbd> drag pan</span>
          <span><kbd>Space</kbd> + left-drag pan</span>
""",
)
replace_once(
    'veyra.html',
    """        <section class="timelinePanel" id="timelinePanel" aria-label="Animation timeline" data-collapsed="false">
""",
    """        <div class="workspaceSplitter horizontalSplitter" id="timelineSplitter" role="separator" aria-orientation="horizontal" aria-label="Resize timeline panel" tabindex="0"></div>
        <section class="timelinePanel" id="timelinePanel" aria-label="Animation timeline" data-collapsed="false">
""",
)
replace_once(
    'veyra.html',
    """      </main>

      <aside class="panel inspectorPanel" id="inspectorPanel" aria-label="Property inspector">
""",
    """      </main>
      <div class="workspaceSplitter verticalSplitter" id="rightSplitter" role="separator" aria-orientation="vertical" aria-label="Resize inspector panel" tabindex="0"></div>

      <aside class="panel inspectorPanel" id="inspectorPanel" aria-label="Property inspector">
""",
)
replace_once(
    'veyra.html',
    """          <span id="selectedType" class="typeBadge">ARTBOARD</span>
        </div>
""",
    """          <div class="panelHeaderActions"><span id="selectedType" class="typeBadge">ARTBOARD</span><button class="panelCollapse" id="inspectorCollapse" title="Collapse inspector" aria-label="Collapse inspector" aria-expanded="true"><svg><use href="#i-minus"/></svg></button></div>
        </div>
""",
)

# ---------------------------------------------------------------------------
# CSS: full semantic tokens + splitters + resize handles + responsive behavior.
# ---------------------------------------------------------------------------
css = (ROOT / 'veyra.css').read_text(encoding='utf-8')
css = re.sub(r'rgb\(236 72 153 / ([0-9.]+)%\)', r'color-mix(in srgb, var(--ui-accent) \1%, transparent)', css)
css = re.sub(r'rgb\(157 23 77 / ([0-9.]+)%\)', r'color-mix(in srgb, var(--ui-accent) \1%, transparent)', css)
css = css.replace('#ec4899', 'var(--ui-accent)').replace('#f472b6', 'var(--ui-accent-soft)')
(ROOT / 'veyra.css').write_text(css, encoding='utf-8')
append_once('veyra.css', '/* M5_WORKSPACE_UX */', r'''
/* M5_WORKSPACE_UX — semantic editor tokens and resizable workspace chrome. */
:root {
  --ui-app-bg: #0b0d10;
  --ui-topbar: #111419;
  --ui-surface: #13171c;
  --ui-surface-2: #181d23;
  --ui-surface-3: #20262e;
  --ui-border: #2b323b;
  --ui-border-strong: #3b4653;
  --ui-text: #eef2f7;
  --ui-muted: #a4afbc;
  --ui-quiet: #6f7a88;
  --ui-accent: #7dd3fc;
  --ui-accent-soft: #bae6fd;
  --ui-control: #5eead4;
  --ui-control-deep: #0f766e;
  --ui-workspace: #0d1116;
  --ui-workspace-grid: rgb(148 163 184 / 9%);
  --ui-workspace-grid-major: rgb(148 163 184 / 15%);
  --ui-artboard-edge: #64748b;
  --ui-danger: #fb7185;
  --ui-warning: #fbbf24;
  --ui-success: #4ade80;
  --left-panel-width: 250px;
  --right-panel-width: 310px;
  --timeline-height: 220px;
  --primary: var(--ui-accent);
  --primary-soft: var(--ui-accent-soft);
  --control: var(--ui-control);
  --control-deep: var(--ui-control-deep);
  --bg: var(--ui-app-bg);
  --surface: var(--ui-surface);
  --surface-2: var(--ui-surface-2);
  --surface-3: var(--ui-surface-3);
  --border: var(--ui-border);
  --border-strong: var(--ui-border-strong);
  --text: var(--ui-text);
  --muted: var(--ui-muted);
  --quiet: var(--ui-quiet);
  --danger: var(--ui-danger);
  --workspace: var(--ui-workspace);
  --workspace-grid: var(--ui-workspace-grid);
  --workspace-grid-major: var(--ui-workspace-grid-major);
  --artboard-edge: var(--ui-artboard-edge);
}
:root[data-theme='graphite-blue'] {
  --ui-app-bg: #0a0f17; --ui-topbar: #101722; --ui-surface: #121a26; --ui-surface-2: #172131; --ui-surface-3: #1d2a3d;
  --ui-border: #29384d; --ui-border-strong: #3a506d; --ui-accent: #60a5fa; --ui-accent-soft: #bfdbfe; --ui-control: #38bdf8; --ui-control-deep: #0369a1; --ui-workspace: #0b111b;
}
:root[data-theme='deep-teal'] {
  --ui-app-bg: #07110f; --ui-topbar: #0c1916; --ui-surface: #0e1d1a; --ui-surface-2: #122621; --ui-surface-3: #17312b;
  --ui-border: #24423b; --ui-border-strong: #326057; --ui-accent: #5eead4; --ui-accent-soft: #99f6e4; --ui-control: #2dd4bf; --ui-control-deep: #0f766e; --ui-workspace: #081512;
}
:root[data-theme='warm-dark'] {
  --ui-app-bg: #120e0b; --ui-topbar: #1a1410; --ui-surface: #1c1612; --ui-surface-2: #251c16; --ui-surface-3: #30241c;
  --ui-border: #46362a; --ui-border-strong: #654b38; --ui-accent: #fb923c; --ui-accent-soft: #fed7aa; --ui-control: #fbbf24; --ui-control-deep: #b45309; --ui-workspace: #15100c;
}
:root[data-theme='light-neutral'] {
  color-scheme: light;
  --ui-app-bg: #eef1f4; --ui-topbar: #ffffff; --ui-surface: #f8fafc; --ui-surface-2: #f1f5f9; --ui-surface-3: #e7edf4;
  --ui-border: #cbd5e1; --ui-border-strong: #94a3b8; --ui-text: #17202b; --ui-muted: #475569; --ui-quiet: #64748b;
  --ui-accent: #2563eb; --ui-accent-soft: #1d4ed8; --ui-control: #0891b2; --ui-control-deep: #0e7490; --ui-workspace: #dde3ea;
  --ui-workspace-grid: rgb(71 85 105 / 10%); --ui-workspace-grid-major: rgb(71 85 105 / 18%); --ui-artboard-edge: #64748b;
}
.topbar { background: color-mix(in srgb, var(--ui-topbar) 95%, transparent); }
.workspace { grid-template-columns: var(--left-panel-width) 5px minmax(0, 1fr) 5px var(--right-panel-width); gap: 0; background: var(--ui-border); }
.workspace[data-left-collapsed='true'] .hierarchyPanel,
.workspace[data-right-collapsed='true'] .inspectorPanel { display: none; }
.workspace[data-left-collapsed='true'] #leftSplitter,
.workspace[data-right-collapsed='true'] #rightSplitter { opacity: .65; }
.panelHeaderActions { display: flex; align-items: center; gap: 7px; }
.panelCollapse { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-surface-2); color: var(--ui-muted); }
.panelCollapse:hover { color: var(--ui-text); border-color: var(--ui-border-strong); }
.panelCollapse svg { width: 13px; height: 13px; }
.workspaceSplitter { position: relative; z-index: 12; background: var(--ui-border); touch-action: none; transition: background 120ms ease; }
.workspaceSplitter::after { content: ''; position: absolute; inset: 0; margin: auto; background: transparent; }
.verticalSplitter { width: 5px; cursor: ew-resize; }
.verticalSplitter::after { width: 1px; height: 100%; }
.horizontalSplitter { height: 5px; cursor: ns-resize; }
.horizontalSplitter::after { width: 100%; height: 1px; }
.workspaceSplitter:hover,
.workspaceSplitter.isDragging { background: color-mix(in srgb, var(--ui-accent) 48%, var(--ui-border)); }
.stagePanel { grid-template-rows: auto auto minmax(0, 1fr) 34px 5px var(--timeline-height); }
.stagePanel:has(.timelinePanel[data-collapsed='true']) { grid-template-rows: auto auto minmax(0, 1fr) 34px 5px 48px; }
.timelinePanel { min-height: 48px; max-height: none; background: var(--ui-surface); }
.timelineBody { max-height: none; min-height: 70px; }
.stageViewport.isPanning, .stageViewport.isPanning * { cursor: grabbing !important; }
.stageViewport[data-pan-ready='true'] { cursor: grab; }
.zoomTextButton { width: auto !important; min-width: 38px; padding: 0 7px !important; font-size: 9px; font-weight: 800; }
.treeRow { grid-template-columns: minmax(0, 1fr) 28px 28px 28px; }
.rigTreeRow { grid-template-columns: minmax(0, 1fr) repeat(2, 28px); }
.rigTreeRow.constraintRow { grid-template-columns: minmax(0, 1fr); }
.treeRow.isSelected .treeSelect { color: var(--ui-text); border-color: color-mix(in srgb, var(--ui-accent) 65%, var(--ui-border)); background: linear-gradient(90deg, color-mix(in srgb, var(--ui-accent) 22%, transparent), var(--ui-surface-3)); }
.treeIcon { color: var(--ui-accent-soft); }
.resizeHandle { fill: var(--ui-surface); stroke: var(--ui-accent); cursor: nwse-resize; vector-effect: non-scaling-stroke; }
.resizeHandle-n, .resizeHandle-s { cursor: ns-resize; }
.resizeHandle-e, .resizeHandle-w { cursor: ew-resize; }
.resizeHandle-ne, .resizeHandle-sw { cursor: nesw-resize; }
.resizeHandle:hover { fill: var(--ui-accent); }
.field input:focus, .field textarea:focus, .field select:focus { border-color: var(--ui-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 14%, transparent); }
.keyButton { border-color: var(--ui-accent); background: color-mix(in srgb, var(--ui-accent) 8%, transparent); }
.timelineGridWrap { background: color-mix(in srgb, var(--ui-workspace) 88%, black); }
.playhead, .timelineKeyframe { background: var(--ui-accent); }
.statusDot { background: var(--ui-control); box-shadow: 0 0 8px color-mix(in srgb, var(--ui-control) 68%, transparent); }
.rigAddStrip { background: var(--ui-surface-2); }
.canvasShortcutBar, .keyframeBar { background: var(--ui-surface); }
@media (max-width: 900px) {
  .workspace { display: flex; flex-direction: column; }
  .workspaceSplitter { display: none; }
  .workspace[data-left-collapsed='true'] .hierarchyPanel,
  .workspace[data-right-collapsed='true'] .inspectorPanel { display: none; }
  .stagePanel { min-height: 520px; }
}
''')
