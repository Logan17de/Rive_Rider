from pathlib import Path

ROOT = Path('.')

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected block not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Canonical editor camera: zoom is CSS pixels per world unit.
# ---------------------------------------------------------------------------
(ROOT / 'src/veyra/viewport.js').write_text(r'''export const VEYRA_SVG_PRESERVE_ASPECT_RATIO = 'xMidYMid meet';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 0) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

/**
 * Canonical editor-camera viewBox.
 *
 * Zoom has one stable meaning: CSS pixels per world unit. At 100% (`zoom=1`),
 * one Veyra world pixel renders as one CSS pixel. The visible world extent is
 * therefore the actual CSS viewport size divided by zoom. Resizing panels or
 * the browser changes only how much world is visible; it never changes scale.
 *
 * Width/height fall back to the artboard dimensions for DOM-free callers that
 * do not provide a host viewport, preserving a deterministic standalone model.
 */
export function createSvgViewBox(artboard = {}, viewport = {}) {
  const artboardWidth = positive(artboard.width);
  const artboardHeight = positive(artboard.height);
  const viewportWidth = positive(viewport.width, artboardWidth);
  const viewportHeight = positive(viewport.height, artboardHeight);
  const zoom = positive(viewport.zoom, 1);
  if (!artboardWidth || !artboardHeight || !viewportWidth || !viewportHeight || !zoom) return null;
  const centerX = finite(viewport.centerX, artboardWidth / 2);
  const centerY = finite(viewport.centerY, artboardHeight / 2);
  const visibleWidth = viewportWidth / zoom;
  const visibleHeight = viewportHeight / zoom;
  return {
    x: centerX - visibleWidth / 2,
    y: centerY - visibleHeight / 2,
    width: visibleWidth,
    height: visibleHeight,
    centerX,
    centerY,
    zoom,
    viewportWidth,
    viewportHeight,
  };
}

/**
 * DOM-free equivalent of the renderer's SVG viewBox mapping. Because the
 * viewBox aspect ratio is derived from the host viewport, xMidYMid meet has no
 * hidden letterbox scale term: the resulting scale is exactly editor zoom.
 */
export function createSvgViewBoxScreenTransform(artboard = {}, viewport = {}) {
  const viewportWidth = positive(viewport.width, positive(artboard.width));
  const viewportHeight = positive(viewport.height, positive(artboard.height));
  const viewBox = createSvgViewBox(artboard, { ...viewport, width: viewportWidth, height: viewportHeight });
  if (!viewBox || !viewportWidth || !viewportHeight) return null;

  const scale = Math.min(viewportWidth / viewBox.width, viewportHeight / viewBox.height);
  const renderedWidth = viewBox.width * scale;
  const renderedHeight = viewBox.height * scale;
  const offsetX = (viewportWidth - renderedWidth) / 2;
  const offsetY = (viewportHeight - renderedHeight) / 2;
  const matrix = [
    scale, 0,
    0, scale,
    offsetX - viewBox.x * scale,
    offsetY - viewBox.y * scale,
  ];

  return {
    matrix,
    viewBox,
    scale,
    offsetX,
    offsetY,
    renderedWidth,
    renderedHeight,
    viewportWidth,
    viewportHeight,
    preserveAspectRatio: VEYRA_SVG_PRESERVE_ASPECT_RATIO,
  };
}
''')

# ---------------------------------------------------------------------------
# Directional, cancelable artboard resize gesture. Persistent model remains
# width/height-only; left/top opposite-edge anchoring is surfaced as camera
# anchorShift values and never moves child artwork.
# ---------------------------------------------------------------------------
(ROOT / 'src/veyra/gestures.js').write_text(r'''// Pure gesture orchestration: browser events are converted to data before this layer.

export const VEYRA_ARTBOARD_RESIZE_DIRECTIONS = Object.freeze([
  'left', 'right', 'top', 'bottom',
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);

function normalizedDirection(direction, mode) {
  if (VEYRA_ARTBOARD_RESIZE_DIRECTIONS.includes(direction)) return direction;
  if (mode === 'resize-x') return 'right';
  if (mode === 'resize-y') return 'bottom';
  if (mode === 'resize') return 'bottom-right';
  return null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createArtboardResizeGesture({
  store,
  start,
  startArtboard,
  direction,
  mode,
  scaleX = 1,
  scaleY = 1,
  threshold = 2,
  minSize = 1,
  onMove,
} = {}) {
  if (!store || !start || !startArtboard) throw new TypeError('Artboard resize gesture requires store, start, and startArtboard.');
  const resolvedDirection = normalizedDirection(direction, mode);
  if (!resolvedDirection) throw new TypeError(`Unsupported artboard resize direction ${direction ?? mode}.`);
  const startWidth = Math.max(minSize, finite(startArtboard.width, minSize));
  const startHeight = Math.max(minSize, finite(startArtboard.height, minSize));
  let active = false;
  let last = {
    width: startWidth,
    height: startHeight,
    anchorShiftX: 0,
    anchorShiftY: 0,
    direction: resolvedDirection,
  };

  function move(point) {
    const clientX = finite(point?.clientX, start.x);
    const clientY = finite(point?.clientY, start.y);
    const distance = Math.hypot(clientX - start.x, clientY - start.y);
    if (!active && distance < threshold) return { started: false, moved: false, ...last };
    if (!active) {
      store.begin('Resize artboard');
      active = true;
    }
    const dx = (clientX - start.x) * finite(scaleX, 1);
    const dy = (clientY - start.y) * finite(scaleY, 1);
    const left = resolvedDirection.includes('left');
    const right = resolvedDirection.includes('right');
    const top = resolvedDirection.includes('top');
    const bottom = resolvedDirection.includes('bottom');
    const width = Math.max(minSize, Math.round(startWidth + (right ? dx : left ? -dx : 0)));
    const height = Math.max(minSize, Math.round(startHeight + (bottom ? dy : top ? -dy : 0)));
    last = {
      width,
      height,
      // Camera-only shift required to keep the opposite rendered edge fixed.
      // Authored child coordinates are intentionally untouched.
      anchorShiftX: left ? width - startWidth : 0,
      anchorShiftY: top ? height - startHeight : 0,
      direction: resolvedDirection,
    };
    store.mutate((documentModel) => {
      documentModel.artboard.width = last.width;
      documentModel.artboard.height = last.height;
    }, 'drag');
    onMove?.(last);
    return { started: true, moved: true, ...last };
  }

  function end() {
    if (!active) return { committed: false, moved: false, error: null, ...last };
    try {
      store.commit();
      active = false;
      return { committed: true, moved: true, error: null, ...last };
    } catch (error) {
      store.cancel();
      active = false;
      return { committed: false, moved: true, error, ...last };
    }
  }

  function cancel() {
    if (!active) return { cancelled: false, moved: false, ...last };
    store.cancel();
    active = false;
    return { cancelled: true, moved: true, ...last };
  }

  return {
    move,
    end,
    cancel,
    direction: resolvedDirection,
    get active() { return active; },
  };
}
''')

# ---------------------------------------------------------------------------
# Workspace math: stable camera fit/zoom + screen-space artboard border zones.
# ---------------------------------------------------------------------------
workspace_path = ROOT / 'src/veyra/workspace.js'
workspace = workspace_path.read_text()
workspace = workspace.replace(
"export const VEYRA_PAN_DRAG_THRESHOLD_PX = 3;\nexport const VEYRA_MIN_NODE_SCALE = 0.01;",
"export const VEYRA_PAN_DRAG_THRESHOLD_PX = 3;\nexport const VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX = 7;\nexport const VEYRA_MIN_NODE_SCALE = 0.01;",
1)
old = r'''export function shouldSuppressCanvasContextMenu(gesture) {
  return gesture?.kind === 'right' && Boolean(gesture.moved);
}
'''
new = r'''export function shouldSuppressCanvasContextMenu(gesture) {
  return gesture?.kind === 'right' && Boolean(gesture.moved);
}

export function classifyArtboardResizeZone(point, rect, tolerance = VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX) {
  if (!point || !rect) return null;
  const left = finite(rect.left);
  const top = finite(rect.top);
  const width = Math.max(0, finite(rect.width, finite(rect.right) - left));
  const height = Math.max(0, finite(rect.height, finite(rect.bottom) - top));
  const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
  const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
  const x = finite(point.x, NaN);
  const y = finite(point.y, NaN);
  const t = clamp(tolerance, 1, 24);
  if (![x, y, left, top, right, bottom].every(Number.isFinite)) return null;
  if (x < left - t || x > right + t || y < top - t || y > bottom + t) return null;

  const nearLeft = Math.abs(x - left) <= t;
  const nearRight = Math.abs(x - right) <= t;
  const nearTop = Math.abs(y - top) <= t;
  const nearBottom = Math.abs(y - bottom) <= t;
  if (nearTop && nearLeft) return 'top-left';
  if (nearTop && nearRight) return 'top-right';
  if (nearBottom && nearLeft) return 'bottom-left';
  if (nearBottom && nearRight) return 'bottom-right';
  if (nearLeft && y >= top && y <= bottom) return 'left';
  if (nearRight && y >= top && y <= bottom) return 'right';
  if (nearTop && x >= left && x <= right) return 'top';
  if (nearBottom && x >= left && x <= right) return 'bottom';
  return null;
}

export function artboardResizeCursor(direction) {
  if (direction === 'left' || direction === 'right') return 'ew-resize';
  if (direction === 'top' || direction === 'bottom') return 'ns-resize';
  if (direction === 'top-left' || direction === 'bottom-right') return 'nwse-resize';
  if (direction === 'top-right' || direction === 'bottom-left') return 'nesw-resize';
  return '';
}
'''
if old not in workspace: raise SystemExit('workspace context-menu block missing')
workspace = workspace.replace(old, new, 1)
old = r'''export function zoomViewportAtScreen(viewport, nextZoom, screenPoint, artboard, screenSize) {
  const current = screenMapping(artboard, viewport, screenSize);
  if (!current) return { ...viewport, zoom: clampZoom(nextZoom) };
  const worldPoint = transformPoint(invertMatrix(current.matrix), {
    x: finite(screenPoint?.x),
    y: finite(screenPoint?.y),
  });
  const zoom = clampZoom(nextZoom);
  const nextBase = screenMapping(artboard, {
    ...viewport,
    zoom,
    centerX: artboard.width / 2,
    centerY: artboard.height / 2,
  }, screenSize);
  if (!nextBase) return { ...viewport, zoom };
  const viewBoxWidth = artboard.width / zoom;
  const viewBoxHeight = artboard.height / zoom;
  const centerX = worldPoint.x - (finite(screenPoint?.x) - nextBase.offsetX) / nextBase.scale + viewBoxWidth / 2;
  const centerY = worldPoint.y - (finite(screenPoint?.y) - nextBase.offsetY) / nextBase.scale + viewBoxHeight / 2;
  return { ...viewport, zoom, centerX, centerY };
}

export function fitArtboardViewport(artboard) {
  return {
    zoom: 1,
    centerX: finite(artboard?.width) / 2,
    centerY: finite(artboard?.height) / 2,
  };
}

export function fitBoundsViewport(bounds, artboard, screenSize, options = {}) {
  if (!bounds) return fitArtboardViewport(artboard);
  const screenWidth = Math.max(1, finite(screenSize?.width, artboard.width));
  const screenHeight = Math.max(1, finite(screenSize?.height, artboard.height));
  const padding = clamp(options.padding ?? 48, 0, Math.min(screenWidth, screenHeight) * 0.4);
  const boundsWidth = Math.max(1, Math.abs(finite(bounds.maxX) - finite(bounds.minX)));
  const boundsHeight = Math.max(1, Math.abs(finite(bounds.maxY) - finite(bounds.minY)));
  const baseScale = Math.min(screenWidth / Math.max(1, artboard.width), screenHeight / Math.max(1, artboard.height));
  const availableWidth = Math.max(1, screenWidth - padding * 2);
  const availableHeight = Math.max(1, screenHeight - padding * 2);
  const zoom = clampZoom(Math.min(
    availableWidth / (boundsWidth * baseScale),
    availableHeight / (boundsHeight * baseScale),
  ));
  return {
    zoom,
    centerX: (finite(bounds.minX) + finite(bounds.maxX)) / 2,
    centerY: (finite(bounds.minY) + finite(bounds.maxY)) / 2,
  };
}
'''
new = r'''export function zoomViewportAtScreen(viewport, nextZoom, screenPoint, artboard, screenSize) {
  const current = screenMapping(artboard, viewport, screenSize);
  if (!current) return { ...viewport, zoom: clampZoom(nextZoom) };
  const worldPoint = transformPoint(invertMatrix(current.matrix), {
    x: finite(screenPoint?.x),
    y: finite(screenPoint?.y),
  });
  const zoom = clampZoom(nextZoom);
  const screenWidth = Math.max(1, finite(screenSize?.width, artboard.width));
  const screenHeight = Math.max(1, finite(screenSize?.height, artboard.height));
  return {
    ...viewport,
    zoom,
    centerX: worldPoint.x - (finite(screenPoint?.x) - screenWidth / 2) / zoom,
    centerY: worldPoint.y - (finite(screenPoint?.y) - screenHeight / 2) / zoom,
  };
}

export function fitArtboardViewport(artboard, screenSize = {}, options = {}) {
  const width = Math.max(1, finite(artboard?.width, 1));
  const height = Math.max(1, finite(artboard?.height, 1));
  const screenWidth = Math.max(1, finite(screenSize?.width, width));
  const screenHeight = Math.max(1, finite(screenSize?.height, height));
  const padding = clamp(options.padding ?? 0, 0, Math.min(screenWidth, screenHeight) * 0.4);
  return {
    zoom: clampZoom(Math.min(
      Math.max(1, screenWidth - padding * 2) / width,
      Math.max(1, screenHeight - padding * 2) / height,
    )),
    centerX: width / 2,
    centerY: height / 2,
  };
}

export function fitBoundsViewport(bounds, artboard, screenSize, options = {}) {
  if (!bounds) return fitArtboardViewport(artboard, screenSize, options);
  const screenWidth = Math.max(1, finite(screenSize?.width, artboard.width));
  const screenHeight = Math.max(1, finite(screenSize?.height, artboard.height));
  const padding = clamp(options.padding ?? 48, 0, Math.min(screenWidth, screenHeight) * 0.4);
  const boundsWidth = Math.max(1, Math.abs(finite(bounds.maxX) - finite(bounds.minX)));
  const boundsHeight = Math.max(1, Math.abs(finite(bounds.maxY) - finite(bounds.minY)));
  const availableWidth = Math.max(1, screenWidth - padding * 2);
  const availableHeight = Math.max(1, screenHeight - padding * 2);
  const zoom = clampZoom(Math.min(
    availableWidth / boundsWidth,
    availableHeight / boundsHeight,
  ));
  return {
    zoom,
    centerX: (finite(bounds.minX) + finite(bounds.maxX)) / 2,
    centerY: (finite(bounds.minY) + finite(bounds.maxY)) / 2,
  };
}
'''
if old not in workspace: raise SystemExit('workspace zoom/fit block missing')
workspace = workspace.replace(old, new, 1)
workspace_path.write_text(workspace)

# ---------------------------------------------------------------------------
# Renderer consumes the actual CSS viewport size for both zoom and viewBox.
# ---------------------------------------------------------------------------
renderer_path = ROOT / 'src/veyra/renderer.js'
renderer = renderer_path.read_text()
old = r'''  setZoom(value, anchor = null) {
    const nextZoom = Math.min(8, Math.max(0.1, Number(value) || 1));
    if (this.scene && anchor && this.viewCenter) {
      const oldWidth = this.scene.artboard.width / this.zoom;
      const oldHeight = this.scene.artboard.height / this.zoom;
      const relativeX = (anchor.x - (this.viewCenter.x - oldWidth / 2)) / oldWidth;
      const relativeY = (anchor.y - (this.viewCenter.y - oldHeight / 2)) / oldHeight;
      const nextWidth = this.scene.artboard.width / nextZoom;
      const nextHeight = this.scene.artboard.height / nextZoom;
      this.viewCenter = {
        x: anchor.x - (relativeX - 0.5) * nextWidth,
        y: anchor.y - (relativeY - 0.5) * nextHeight,
      };
    }
    this.zoom = nextZoom;
    this.#applyViewBox();
    return this.zoom;
  }
'''
new = r'''  setZoom(value, anchor = null) {
    const nextZoom = Math.min(8, Math.max(0.1, Number(value) || 1));
    if (this.scene && anchor && this.viewCenter) {
      const screen = this.getScreenSize();
      const oldWidth = screen.width / this.zoom;
      const oldHeight = screen.height / this.zoom;
      const relativeX = (anchor.x - (this.viewCenter.x - oldWidth / 2)) / oldWidth;
      const relativeY = (anchor.y - (this.viewCenter.y - oldHeight / 2)) / oldHeight;
      const nextWidth = screen.width / nextZoom;
      const nextHeight = screen.height / nextZoom;
      this.viewCenter = {
        x: anchor.x - (relativeX - 0.5) * nextWidth,
        y: anchor.y - (relativeY - 0.5) * nextHeight,
      };
    }
    this.zoom = nextZoom;
    this.#applyViewBox();
    return this.zoom;
  }
'''
if old not in renderer: raise SystemExit('renderer setZoom block missing')
renderer = renderer.replace(old, new, 1)
old = r'''  getViewport() {
    return {
      zoom: this.zoom,
      centerX: this.viewCenter?.x ?? this.scene?.artboard.width / 2 ?? 0,
      centerY: this.viewCenter?.y ?? this.scene?.artboard.height / 2 ?? 0,
    };
  }

  setViewport(viewport = {}) {
'''
new = r'''  getViewport() {
    return {
      zoom: this.zoom,
      centerX: this.viewCenter?.x ?? this.scene?.artboard.width / 2 ?? 0,
      centerY: this.viewCenter?.y ?? this.scene?.artboard.height / 2 ?? 0,
    };
  }

  getScreenSize() {
    const rect = this.svg.getBoundingClientRect?.();
    return {
      width: Math.max(1, Number(this.svg.clientWidth || rect?.width || this.scene?.artboard.width || 1)),
      height: Math.max(1, Number(this.svg.clientHeight || rect?.height || this.scene?.artboard.height || 1)),
    };
  }

  syncViewport() {
    this.#applyViewBox();
    return { ...this.getViewport(), ...this.getScreenSize() };
  }

  setViewport(viewport = {}) {
'''
if old not in renderer: raise SystemExit('renderer getViewport block missing')
renderer = renderer.replace(old, new, 1)
old = r'''    const viewBox = createSvgViewBox(this.scene.artboard, {
      zoom: this.zoom,
      centerX: this.viewCenter.x,
      centerY: this.viewCenter.y,
    });
'''
new = r'''    const screen = this.getScreenSize();
    const viewBox = createSvgViewBox(this.scene.artboard, {
      width: screen.width,
      height: screen.height,
      zoom: this.zoom,
      centerX: this.viewCenter.x,
      centerY: this.viewCenter.y,
    });
'''
if old not in renderer: raise SystemExit('renderer viewBox call missing')
renderer = renderer.replace(old, new, 1)
renderer_path.write_text(renderer)

# ---------------------------------------------------------------------------
# Browser shell: fit uses actual viewport; panel ResizeObserver re-applies only
# viewBox dimensions; artboard border classification owns all 8 directions.
# ---------------------------------------------------------------------------
veyra_path = ROOT / 'veyra.js'
veyra = veyra_path.read_text()
old = r'''  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
'''
new = r'''  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  artboardResizeCursor,
  classifyArtboardResizeZone,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
'''
if old not in veyra: raise SystemExit('veyra workspace import block missing')
veyra = veyra.replace(old, new, 1)
old = r'''  if (persist) localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(workspaceLayout));
  requestAnimationFrame(() => syncArtboardFrame());
  return { ...workspaceLayout };
}
'''
new = r'''  if (persist) localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(workspaceLayout));
  requestAnimationFrame(() => {
    renderer.syncViewport();
    syncArtboardFrame();
  });
  return { ...workspaceLayout };
}
'''
if old not in veyra: raise SystemExit('applyWorkspaceLayout tail missing')
veyra = veyra.replace(old, new, 1)
old = r'''function fitCanvas() {
  return applyViewportState(fitArtboardViewport(store.document.artboard), 'Artboard fitted');
}

function focusEditorReference(ref, { select = true, padding = 54 } = {}) {
'''
new = r'''function editorScreenSize() {
  const rect = stageViewport.getBoundingClientRect();
  return {
    width: Math.max(1, stageViewport.clientWidth || rect.width || 1),
    height: Math.max(1, stageViewport.clientHeight || rect.height || 1),
  };
}

function fitCanvas() {
  return applyViewportState(fitArtboardViewport(store.document.artboard, editorScreenSize(), { padding: 32 }), 'Artboard fitted');
}

function focusEditorReference(ref, { select = true, padding = 54 } = {}) {
'''
if old not in veyra: raise SystemExit('fitCanvas block missing')
veyra = veyra.replace(old, new, 1)
old = r'''  const rect = stageViewport.getBoundingClientRect();
  const next = fitBoundsViewport(bounds, store.document.artboard, {
    width: stageViewport.clientWidth || rect.width,
    height: stageViewport.clientHeight || rect.height,
  }, { padding });
'''
new = r'''  const next = fitBoundsViewport(bounds, store.document.artboard, editorScreenSize(), { padding });
'''
if old not in veyra: raise SystemExit('focus screen-size block missing')
veyra = veyra.replace(old, new, 1)
old = "$('zoom100').onclick = () => applyViewportState({ ...renderer.getViewport(), zoom: 1 }, 'Canvas 100%');"
new = "$('zoom100').onclick = () => applyViewportState({ ...renderer.getViewport(), zoom: 1 }, 'Canvas 100% · 1 CSS px per world unit');"
if old not in veyra: raise SystemExit('zoom100 line missing')
veyra = veyra.replace(old, new, 1)
old = r'''let panGesture = null;
let spacePanHeld = false;
let spacePanUsed = false;
let suppressNextCanvasContextMenu = false;
stageViewport.addEventListener('pointerdown', (event) => {
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
'''
new = r'''let panGesture = null;
let activeArtboardResize = null;
let spacePanHeld = false;
let spacePanUsed = false;
let suppressNextCanvasContextMenu = false;

function artboardResizeDirectionAt(clientX, clientY) {
  const rect = artboardFrame.getBoundingClientRect();
  return classifyArtboardResizeZone({ x: clientX, y: clientY }, rect);
}

function beginArtboardResize(event, direction) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const startViewport = renderer.getViewport();
  const startArtboard = { width: store.document.artboard.width, height: store.document.artboard.height };
  const matrix = canvas.getScreenCTM();
  const screenScaleX = matrix ? Math.hypot(matrix.a, matrix.b) : renderer.zoom;
  const screenScaleY = matrix ? Math.hypot(matrix.c, matrix.d) : renderer.zoom;
  const gesture = createArtboardResizeGesture({
    store,
    direction,
    start: { x: event.clientX, y: event.clientY },
    startArtboard,
    scaleX: 1 / Math.max(1e-9, screenScaleX),
    scaleY: 1 / Math.max(1e-9, screenScaleY),
    onMove: (state) => {
      renderer.setViewport({
        ...startViewport,
        centerX: startViewport.centerX + state.anchorShiftX,
        centerY: startViewport.centerY + state.anchorShiftY,
      });
      syncArtboardFrame();
      setStatus(`Artboard ${state.width} × ${state.height}`);
    },
  });
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isArtboardResizing');
  stageViewport.style.cursor = artboardResizeCursor(direction);

  const cleanup = () => {
    stageViewport.removeEventListener('pointermove', onMove);
    stageViewport.removeEventListener('pointerup', onCommit);
    stageViewport.removeEventListener('pointercancel', onCancel);
    stageViewport.removeEventListener('lostpointercapture', onCancel);
    stageViewport.classList.remove('isArtboardResizing');
    stageViewport.style.cursor = '';
    activeArtboardResize = null;
  };
  const finish = (commitGesture, nextEvent) => {
    cleanup();
    try { stageViewport.releasePointerCapture?.(event.pointerId); } catch {}
    const result = commitGesture ? gesture.end() : gesture.cancel();
    if (!commitGesture) {
      renderer.setViewport(startViewport);
      evaluateCurrentFrame();
      syncArtboardFrame();
      setStatus('Artboard resize cancelled');
    } else if (result.error) {
      renderer.setViewport(startViewport);
      renderAll('validation-error');
    } else if (result.committed) {
      syncArtboardFrame();
      setStatus(`Artboard ${result.width} × ${result.height}`);
    }
    return result;
  };
  const onMove = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    gesture.move(nextEvent);
  };
  const onCommit = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    finish(true, nextEvent);
  };
  const onCancel = (nextEvent) => {
    if (nextEvent.pointerId != null && nextEvent.pointerId !== event.pointerId) return;
    finish(false, nextEvent);
  };
  activeArtboardResize = { pointerId: event.pointerId, direction, cancel: () => finish(false, event), gesture };
  stageViewport.addEventListener('pointermove', onMove);
  stageViewport.addEventListener('pointerup', onCommit);
  stageViewport.addEventListener('pointercancel', onCancel);
  stageViewport.addEventListener('lostpointercapture', onCancel);
}

stageViewport.addEventListener('pointerdown', (event) => {
  const resizeDirection = event.button === 0 ? artboardResizeDirectionAt(event.clientX, event.clientY) : null;
  if (resizeDirection) {
    beginArtboardResize(event, resizeDirection);
    return;
  }
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
'''
if old not in veyra: raise SystemExit('pan intro block missing')
veyra = veyra.replace(old, new, 1)
old = r'''stageViewport.addEventListener('pointermove', (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
'''
new = r'''stageViewport.addEventListener('pointermove', (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) {
    if (!activeArtboardResize) stageViewport.style.cursor = artboardResizeCursor(artboardResizeDirectionAt(event.clientX, event.clientY));
    return;
  }
'''
if old not in veyra: raise SystemExit('pan pointermove intro missing')
veyra = veyra.replace(old, new, 1)
old = "new ResizeObserver(() => syncArtboardFrame()).observe(stageViewport);"
new = "new ResizeObserver(() => { renderer.syncViewport(); syncArtboardFrame(); }).observe(stageViewport);"
if old not in veyra: raise SystemExit('ResizeObserver line missing')
veyra = veyra.replace(old, new, 1)
old = r'''// Artboard handles: the top/left border strips pan the canvas (drag the
// artboard), while the right/bottom strips and corner resize the artboard.
artboardFrame.addEventListener('pointerdown', (event) => {
  const handle = event.target instanceof Element ? event.target.closest('.artboardHandle') : null;
  if (!handle || event.button !== 0) return;
  const mode = handle.dataset.mode;
  event.preventDefault();
  event.stopPropagation();
  const start = { x: event.clientX, y: event.clientY };
  const startArtboard = { width: store.document.artboard.width, height: store.document.artboard.height };
  const matrix = canvas.getScreenCTM();
  const scaleX = matrix ? 1 / matrix.a : 1;
  const scaleY = matrix ? 1 / matrix.d : 1;
  let moved = false;
  const resizeGesture = mode === 'pan' ? null : createArtboardResizeGesture({
    store,
    start,
    startArtboard,
    mode,
    scaleX,
    scaleY,
    onMove: ({ width, height }) => setStatus(`Artboard ${width} × ${height}`),
  });
  handle.setPointerCapture?.(event.pointerId);
  const onMove = (nextEvent) => {
    const result = resizeGesture?.move(nextEvent);
    if (result?.moved) moved = true;
    if (mode === 'pan') {
      if (!moved && Math.hypot(nextEvent.clientX - start.x, nextEvent.clientY - start.y) < 2) return;
      moved = true;
      const dx = (nextEvent.clientX - start.x) * scaleX;
      const dy = (nextEvent.clientY - start.y) * scaleY;
      renderer.panBy(-dx, -dy);
      syncArtboardFrame();
    }
  };
  const onEnd = (nextEvent) => {
    artboardFrame.removeEventListener('pointermove', onMove);
    artboardFrame.removeEventListener('pointerup', onEnd);
    artboardFrame.removeEventListener('pointercancel', onEnd);
    handle.releasePointerCapture?.(nextEvent.pointerId);
    if (resizeGesture?.active) {
      const result = resizeGesture.end();
      if (result.error) renderAll('validation-error');
    } else if (mode === 'pan' && moved) {
      setStatus('Canvas panned');
    }
  };
  artboardFrame.addEventListener('pointermove', onMove);
  artboardFrame.addEventListener('pointerup', onEnd);
  artboardFrame.addEventListener('pointercancel', onEnd);
});

'''
new = r'''// Artboard resizing is classified in final CSS pixels by the stage capture
// path above. There are no permanent DOM edge/corner handles: every edge and
// corner gets the same screen-space tolerance at every zoom.

'''
if old not in veyra: raise SystemExit('old artboard handle block missing')
veyra = veyra.replace(old, new, 1)
old = r'''  } else if (!editing && event.key === 'Escape') {
    if (renderer.cancelActiveGesture()) {
'''
new = r'''  } else if (!editing && event.key === 'Escape') {
    if (activeArtboardResize) {
      activeArtboardResize.cancel();
      return;
    }
    if (renderer.cancelActiveGesture()) {
'''
if old not in veyra: raise SystemExit('Escape block missing')
veyra = veyra.replace(old, new, 1)
veyra_path.write_text(veyra)

# Remove permanent handle DOM.
html_path = ROOT / 'veyra.html'
html = html_path.read_text()
for line in [
'            <div class="artboardHandle" data-mode="pan" data-side="top" title="Drag the border to pan the canvas"></div>\n',
'            <div class="artboardHandle" data-mode="pan" data-side="left" title="Drag the border to pan the canvas"></div>\n',
'            <div class="artboardHandle" data-mode="resize-x" title="Drag to resize artboard width"></div>\n',
'            <div class="artboardHandle" data-mode="resize-y" title="Drag to resize artboard height"></div>\n',
'            <div class="artboardHandle" data-mode="resize" title="Drag to resize the artboard"></div>\n',
]:
    if line not in html: raise SystemExit(f'HTML handle line missing: {line!r}')
    html = html.replace(line, '', 1)
html = html.replace('title="100%">1:1</button>', 'title="100% · 1 CSS pixel per world unit">1:1</button>', 1)
html_path.write_text(html)

# Remove old artboardHandle CSS block and keep frame view-only.
css_path = ROOT / 'veyra.css'
css = css_path.read_text()
start = css.index('.artboardHandle { position: absolute; pointer-events: auto; background: transparent; }')
end_marker = ".artboardHandle[data-mode='resize']:hover { background: var(--control-deep); }\n"
end = css.index(end_marker, start) + len(end_marker)
css = css[:start] + "/* Artboard resize zones are classified in screen space by JS; no permanent edge/corner handle DOM. */\n.stageViewport.isArtboardResizing { user-select: none; }\n" + css[end:]
css_path.write_text(css)

# Export correction helpers for tests/future editor adapters.
index_path = ROOT / 'src/index.js'
index = index_path.read_text()
index = index.replace(
"  VEYRA_MIN_NODE_SCALE,\n  VEYRA_PAN_DRAG_THRESHOLD_PX,",
"  VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX,\n  VEYRA_MIN_NODE_SCALE,\n  VEYRA_PAN_DRAG_THRESHOLD_PX,",
1)
index = index.replace(
"  clampZoom,\n  evaluatedRefBounds,",
"  artboardResizeCursor,\n  clampZoom,\n  classifyArtboardResizeZone,\n  evaluatedRefBounds,",
1)
index_path.write_text(index)

# Migrate one M4 assertion whose old fixture encoded artboard-relative zoom.
m4_path = ROOT / 'tests/veyra-m4-corrections.test.mjs'
m4 = m4_path.read_text()
m4 = m4.replace("assert.ok(radius >= 799.9, 'fixture creates an ~800px rendered ellipse radius');", "assert.ok(radius >= 199.9, 'zoom=8 means an exact ~200 CSS-pixel rendered ellipse radius');", 1)
m4_path.write_text(m4)

# Dedicated correction/adversarial suite.
(ROOT / 'tests/veyra-m5-camera-artboard-corrections.test.mjs').write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { createArtboardResizeGesture, VEYRA_ARTBOARD_RESIZE_DIRECTIONS } from '../src/veyra/gestures.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSvgViewBox, createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import {
  VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX,
  artboardResizeCursor,
  classifyArtboardResizeZone,
  fitArtboardViewport,
  fitBoundsViewport,
  normalizeWorkspaceLayout,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
} from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-8, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}

const artboard = { width: 800, height: 600 };
const camera = { zoom: 1.75, centerX: 430, centerY: 280 };
const sizes = [
  { width: 900, height: 700 },
  { width: 620, height: 700 },
  { width: 900, height: 410 },
  { width: 517, height: 913 },
];

// Correction 1: editor zoom is stable CSS pixels/world unit, independent of
// viewport geometry. ViewBox changes extent, not scale or camera state.
for (const size of sizes) {
  const mapping = createSvgViewBoxScreenTransform(artboard, { ...size, ...camera });
  assert.ok(mapping);
  close(mapping.scale, camera.zoom, 1e-10, 'mapping scale is editor zoom');
  assert.equal(mapping.viewBox.centerX, camera.centerX);
  assert.equal(mapping.viewBox.centerY, camera.centerY);
  close(mapping.viewBox.width, size.width / camera.zoom);
  close(mapping.viewBox.height, size.height / camera.zoom);
}
const worldA = { x: 100, y: 120 };
const worldB = { x: 360, y: 340 };
const pixelDistances = sizes.map((size) => {
  const map = createSvgViewBoxScreenTransform(artboard, { ...size, ...camera });
  const a = transformPoint(map.matrix, worldA);
  const b = transformPoint(map.matrix, worldB);
  return Math.hypot(b.x - a.x, b.y - a.y);
});
pixelDistances.forEach((distance) => close(distance, pixelDistances[0], 1e-8, 'world pair CSS distance invariant'));

const at100a = createSvgViewBoxScreenTransform(artboard, { width: 900, height: 700, zoom: 1, centerX: 400, centerY: 300 });
const at100b = createSvgViewBoxScreenTransform(artboard, { width: 500, height: 1200, zoom: 1, centerX: 400, centerY: 300 });
close(at100a.scale, 1);
close(at100b.scale, 1);
assert.equal(createSvgViewBox(artboard, { width: 500, height: 1200, zoom: 1, centerX: 400, centerY: 300 }).width, 500);

// Panel layout changes do not touch camera state or authored Store state.
const document = normalizeDocument(createDocument({
  artboard,
  nodes: [createNode('rectangle', { id: 'target', transform: { x: 400, y: 300 }, geometry: { width: 100, height: 80 } })],
}));
const store = new VeyraStore(document);
const serializedBeforePanels = serializeVeyra(store.document);
const revisionBeforePanels = store.revision;
const historyBeforePanels = JSON.stringify(store.commandHistory);
let layout = normalizeWorkspaceLayout({}, { width: 1440, height: 900 });
layout = setWorkspacePanelSize(layout, 'left', 450, { width: 1440, height: 900 });
layout = setWorkspacePanelSize(layout, 'right', 220, { width: 1440, height: 900 });
layout = setWorkspacePanelCollapsed(layout, 'left', true, { width: 1440, height: 900 });
layout = setWorkspacePanelCollapsed(layout, 'left', false, { width: 1440, height: 900 });
assert.equal(serializeVeyra(store.document), serializedBeforePanels);
assert.equal(store.revision, revisionBeforePanels);
assert.equal(JSON.stringify(store.commandHistory), historyBeforePanels);
for (let i = 0; i < 100; i += 1) {
  const width = i % 2 ? 420 : 260;
  layout = setWorkspacePanelSize(layout, 'left', width, { width: 1440 + i, height: 900 - (i % 70) });
  const mapping = createSvgViewBoxScreenTransform(artboard, { width: 700 + (i % 211), height: 400 + (i % 173), ...camera });
  assert.ok(mapping && mapping.matrix.every(Number.isFinite));
  close(mapping.scale, camera.zoom, 1e-10);
}

// M4 hit testing consumes the same stable camera mapping after every resize.
for (const size of sizes) {
  const viewport = { ...size, ...camera };
  const mapping = createSvgViewBoxScreenTransform(artboard, viewport);
  const renderedCenter = transformPoint(mapping.matrix, { x: 400, y: 300 });
  assert.deepEqual(hitTestPoint(renderedCenter, store.document, viewport), { kind: 'node', id: 'target' });
}

// Fit/focus are explicit camera-changing operations; mere viewport resize is not.
const fitWide = fitArtboardViewport(artboard, { width: 1200, height: 700 }, { padding: 32 });
const fitNarrow = fitArtboardViewport(artboard, { width: 600, height: 700 }, { padding: 32 });
assert.notEqual(fitWide.zoom, fitNarrow.zoom, 'Fit Artboard intentionally recomputes zoom for available viewport');
const focus = fitBoundsViewport({ minX: 350, minY: 260, maxX: 450, maxY: 340 }, artboard, { width: 600, height: 700 }, { padding: 50 });
assert.deepEqual({ centerX: focus.centerX, centerY: focus.centerY }, { centerX: 400, centerY: 300 });
assert.notEqual(focus.zoom, camera.zoom, 'Focus Selection intentionally recomputes zoom');

// Correction 2: all eight border zones classify in final CSS pixels; zoom is
// deliberately absent from the API so 10%, 100%, and 800% behave identically.
assert.deepEqual(VEYRA_ARTBOARD_RESIZE_DIRECTIONS, [
  'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);
assert.equal(VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX, 7);
const rect = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };
const zoneCases = [
  ['left', { x: 103, y: 350 }, 'ew-resize'],
  ['right', { x: 897, y: 350 }, 'ew-resize'],
  ['top', { x: 500, y: 54 }, 'ns-resize'],
  ['bottom', { x: 500, y: 646 }, 'ns-resize'],
  ['top-left', { x: 103, y: 54 }, 'nwse-resize'],
  ['top-right', { x: 897, y: 54 }, 'nesw-resize'],
  ['bottom-left', { x: 103, y: 646 }, 'nesw-resize'],
  ['bottom-right', { x: 897, y: 646 }, 'nwse-resize'],
];
for (const [direction, point, cursor] of zoneCases) {
  for (const zoom of [0.1, 1, 8]) {
    void zoom;
    assert.equal(classifyArtboardResizeZone(point, rect), direction);
  }
  assert.equal(artboardResizeCursor(direction), cursor);
}
assert.equal(classifyArtboardResizeZone({ x: 500, y: 300 }, rect), null, 'interior stays available for artwork interactions');
assert.equal(classifyArtboardResizeZone({ x: 80, y: 300 }, rect), null, 'outside tolerance remains canvas navigation');

function gesture(direction, dxPx, dyPx, { zoom = 2, minSize = 1 } = {}) {
  const child = createNode('rectangle', { id: 'child', transform: { x: 200, y: 150 }, geometry: { width: 40, height: 30 } });
  const model = normalizeDocument(createDocument({ artboard: { width: 800, height: 600 }, nodes: [child] }));
  const s = new VeyraStore(model);
  const childBefore = JSON.stringify(s.document.nodes[0]);
  const historyBefore = s.commandHistory.length;
  const g = createArtboardResizeGesture({
    store: s,
    start: { x: 100, y: 100 },
    startArtboard: { width: 800, height: 600 },
    direction,
    scaleX: 1 / zoom,
    scaleY: 1 / zoom,
    minSize,
  });
  const moved = g.move({ clientX: 100 + dxPx, clientY: 100 + dyPx });
  return { s, g, moved, childBefore, historyBefore };
}

// Direction semantics: right/bottom add delta; left/top subtract it and expose
// camera anchor shifts without modifying child artwork.
{
  const { s, g, moved, childBefore, historyBefore } = gesture('right', 40, 30);
  assert.equal(moved.width, 820); assert.equal(moved.height, 600);
  assert.equal(moved.anchorShiftX, 0); assert.equal(JSON.stringify(s.document.nodes[0]), childBefore);
  assert.equal(g.end().committed, true); assert.equal(s.commandHistory.length, historyBefore + 1);
  assert.equal(s.undo(), true); assert.equal(s.document.artboard.width, 800);
}
{
  const { s, g, moved } = gesture('bottom', 40, 30);
  assert.equal(moved.width, 800); assert.equal(moved.height, 615); g.end();
}
{
  const { s, g, moved, childBefore } = gesture('left', 40, 0);
  assert.equal(moved.width, 780); assert.equal(moved.anchorShiftX, -20);
  assert.equal(JSON.stringify(s.document.nodes[0]), childBefore); g.end();
}
{
  const { g, moved } = gesture('top', 0, 30);
  assert.equal(moved.height, 585); assert.equal(moved.anchorShiftY, -15); g.end();
}
for (const direction of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
  const { g, moved } = gesture(direction, direction.includes('left') ? 40 : 40, direction.includes('top') ? 30 : 30);
  assert.notEqual(moved.width, 800);
  assert.notEqual(moved.height, 600);
  assert.equal(g.end().committed, true);
}

// Left/top camera shifts keep the opposite rendered edge/corner exactly fixed.
{
  const size = { width: 1000, height: 700 };
  const startCamera = { zoom: 2, centerX: 400, centerY: 300 };
  const before = createSvgViewBoxScreenTransform(artboard, { ...size, ...startCamera });
  const oldRight = transformPoint(before.matrix, { x: 800, y: 300 });
  const { g, moved } = gesture('left', 80, 0, { zoom: 2 });
  const nextArtboard = { width: moved.width, height: 600 };
  const nextCamera = { ...startCamera, centerX: startCamera.centerX + moved.anchorShiftX };
  const after = createSvgViewBoxScreenTransform(nextArtboard, { ...size, ...nextCamera });
  const newRight = transformPoint(after.matrix, { x: moved.width, y: 300 });
  close(newRight.x, oldRight.x, 1e-8, 'left resize preserves opposite rendered edge');
  g.cancel();
}

// Minimum clamp + cancel restore exact authored serialization and no completed
// history entry. A sub-threshold click never starts a transaction.
{
  const { s, g } = gesture('left', 100000, 0, { zoom: 1, minSize: 24 });
  assert.equal(s.document.artboard.width, 24);
  assert.ok(Number.isFinite(s.document.artboard.width));
  g.cancel();
  assert.equal(s.document.artboard.width, 800);
}
{
  const model = normalizeDocument(createDocument({ artboard }));
  const s = new VeyraStore(model);
  const before = serializeVeyra(s.document);
  const history = s.commandHistory.length;
  const g = createArtboardResizeGesture({ store: s, start: { x: 10, y: 10 }, startArtboard: artboard, direction: 'bottom-right' });
  assert.equal(g.move({ clientX: 11, clientY: 11 }).started, false);
  assert.equal(g.end().committed, false);
  assert.equal(serializeVeyra(s.document), before);
  assert.equal(s.commandHistory.length, history);
}
{
  const model = normalizeDocument(createDocument({ artboard }));
  const s = new VeyraStore(model);
  const before = serializeVeyra(s.document);
  const g = createArtboardResizeGesture({ store: s, start: { x: 0, y: 0 }, startArtboard: artboard, direction: 'top-left' });
  g.move({ clientX: 40, clientY: 30 });
  assert.notEqual(serializeVeyra(s.document), before);
  assert.equal(g.cancel().cancelled, true);
  assert.equal(serializeVeyra(s.document), before, 'cancel restores exact authored state');
}

// Combined regression: panel -> camera -> artboard -> hit testing use production
// functions in sequence without panel state or camera scale drift.
{
  let combinedLayout = normalizeWorkspaceLayout({}, { width: 1440, height: 900 });
  const combinedCamera = { zoom: 1.4, centerX: 450, centerY: 320 };
  const initialMap = createSvgViewBoxScreenTransform(artboard, { width: 880, height: 610, ...combinedCamera });
  combinedLayout = setWorkspacePanelSize(combinedLayout, 'right', 480, { width: 1440, height: 900 });
  const panelMap = createSvgViewBoxScreenTransform(artboard, { width: 710, height: 610, ...combinedCamera });
  close(initialMap.scale, panelMap.scale);
  assert.deepEqual(combinedCamera, { zoom: 1.4, centerX: 450, centerY: 320 });

  const resizeStore = new VeyraStore(document);
  const g = createArtboardResizeGesture({ store: resizeStore, start: { x: 0, y: 0 }, startArtboard: artboard, direction: 'right', scaleX: 1 / combinedCamera.zoom, scaleY: 1 / combinedCamera.zoom });
  g.move({ clientX: 70, clientY: 0 });
  g.end();
  assert.equal(combinedLayout.rightWidth, 480, 'artboard resize cannot mutate panel state');
  const resizedArtboard = resizeStore.document.artboard;
  const postPanelMap = createSvgViewBoxScreenTransform(resizedArtboard, { width: 760, height: 560, ...combinedCamera });
  close(postPanelMap.scale, combinedCamera.zoom);
  const renderedCenter = transformPoint(postPanelMap.matrix, { x: 400, y: 300 });
  assert.deepEqual(hitTestPoint(renderedCenter, resizeStore.document, { width: 760, height: 560, ...combinedCamera }), { kind: 'node', id: 'target' });
}

// Static shell gates: no permanent artboard handle DOM; border classification
// occurs before pan routing and Escape can cancel the authored resize gesture.
const browser = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../veyra.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../veyra.css', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/veyra/renderer.js', import.meta.url), 'utf8');
assert.match(browser, /classifyArtboardResizeZone/);
assert.match(browser, /beginArtboardResize/);
assert.match(browser, /resizeDirection = event\.button === 0/);
assert.match(browser, /activeArtboardResize\.cancel\(\)/);
assert.match(browser, /renderer\.syncViewport\(\)/);
assert.doesNotMatch(html, /artboardHandle/);
assert.doesNotMatch(css, /\.artboardHandle\[data-mode='resize'\]/);
assert.match(renderer, /width: screen\.width/);
assert.match(renderer, /height: screen\.height/);

console.log('veyra M5 camera/artboard correction tests passed');
''')

print('M5 camera/artboard corrections applied')
