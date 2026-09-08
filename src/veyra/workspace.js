import { invertMatrix, transformMatrix, transformPoint } from './contracts.js';
import { localBounds } from './geometry.js';
import { referenceId } from './references.js';
import { createSvgViewBoxScreenTransform } from './viewport.js';

export const VEYRA_ZOOM_MIN = 0.1;
export const VEYRA_ZOOM_MAX = 8;
export const VEYRA_PAN_DRAG_THRESHOLD_PX = 3;
export const VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX = 7;
export const VEYRA_MIN_NODE_SCALE = 0.01;
export const VEYRA_UI_THEMES = Object.freeze([
  'neutral-dark',
  'graphite-blue',
  'deep-teal',
  'warm-dark',
  'light-neutral',
]);

export const VEYRA_WORKSPACE_LAYOUT_DEFAULTS = Object.freeze({
  leftWidth: 250,
  rightWidth: 310,
  bottomHeight: 220,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
});

export const VEYRA_WORKSPACE_PANEL_LIMITS = Object.freeze({
  left: Object.freeze({ min: 180, max: 480, property: 'leftWidth' }),
  right: Object.freeze({ min: 220, max: 520, property: 'rightWidth' }),
  bottom: Object.freeze({ min: 120, max: 420, property: 'bottomHeight' }),
});

const LEGACY_THEME_MAP = Object.freeze({
  magenta: 'neutral-dark',
  blue: 'graphite-blue',
  green: 'deep-teal',
  orange: 'warm-dark',
  yellow: 'light-neutral',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

export function clampZoom(value) {
  return clamp(value, VEYRA_ZOOM_MIN, VEYRA_ZOOM_MAX);
}

export function normalizeTheme(value) {
  const migrated = LEGACY_THEME_MAP[value] || value;
  return VEYRA_UI_THEMES.includes(migrated) ? migrated : 'neutral-dark';
}

export function normalizeWorkspaceLayout(layout = {}, viewport = {}) {
  const width = Math.max(320, finite(viewport.width, 1440));
  const height = Math.max(320, finite(viewport.height, 900));
  const leftMax = Math.min(VEYRA_WORKSPACE_PANEL_LIMITS.left.max, Math.max(180, width * 0.42));
  const rightMax = Math.min(VEYRA_WORKSPACE_PANEL_LIMITS.right.max, Math.max(220, width * 0.46));
  const bottomMax = Math.min(VEYRA_WORKSPACE_PANEL_LIMITS.bottom.max, Math.max(120, height * 0.58));
  return {
    leftWidth: clamp(layout.leftWidth ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.leftWidth, VEYRA_WORKSPACE_PANEL_LIMITS.left.min, leftMax),
    rightWidth: clamp(layout.rightWidth ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.rightWidth, VEYRA_WORKSPACE_PANEL_LIMITS.right.min, rightMax),
    bottomHeight: clamp(layout.bottomHeight ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.bottomHeight, VEYRA_WORKSPACE_PANEL_LIMITS.bottom.min, bottomMax),
    leftCollapsed: Boolean(layout.leftCollapsed ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.leftCollapsed),
    rightCollapsed: Boolean(layout.rightCollapsed ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.rightCollapsed),
    bottomCollapsed: Boolean(layout.bottomCollapsed ?? VEYRA_WORKSPACE_LAYOUT_DEFAULTS.bottomCollapsed),
  };
}

export function setWorkspacePanelSize(layout, panel, size, viewport = {}) {
  const metadata = VEYRA_WORKSPACE_PANEL_LIMITS[panel];
  if (!metadata) throw new TypeError(`Unknown workspace panel ${panel}.`);
  return normalizeWorkspaceLayout({ ...layout, [metadata.property]: size }, viewport);
}

export function setWorkspacePanelCollapsed(layout, panel, collapsed, viewport = {}) {
  if (!VEYRA_WORKSPACE_PANEL_LIMITS[panel]) throw new TypeError(`Unknown workspace panel ${panel}.`);
  const key = `${panel}Collapsed`;
  return normalizeWorkspaceLayout({ ...layout, [key]: Boolean(collapsed) }, viewport);
}

export function workspaceCssVariables(layout, viewport = {}) {
  const normalized = normalizeWorkspaceLayout(layout, viewport);
  return {
    '--left-panel-width': normalized.leftCollapsed ? '0px' : `${normalized.leftWidth}px`,
    '--right-panel-width': normalized.rightCollapsed ? '0px' : `${normalized.rightWidth}px`,
    '--timeline-height': normalized.bottomCollapsed ? '48px' : `${normalized.bottomHeight}px`,
  };
}

export function normalizeWheelDelta(delta, deltaMode = 0) {
  const modeScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 120 : 1;
  return clamp(finite(delta) * modeScale, -120, 120);
}

export function wheelZoomFactor(delta, deltaMode = 0) {
  return Math.exp(-normalizeWheelDelta(delta, deltaMode) * 0.0018);
}

export function navigationPanKind(event = {}, options = {}) {
  const button = Number(event.button ?? 0);
  if (button === 2) return 'right';
  if (button === 1) return 'middle';
  if (button !== 0) return null;
  if (options.spaceHeld) return 'space';
  if (options.tool === 'pan') return 'tool';
  if (event.altKey) return 'alt';
  return null;
}

export function panGestureMoved(start, current, threshold = VEYRA_PAN_DRAG_THRESHOLD_PX) {
  return Math.hypot(finite(current?.x) - finite(start?.x), finite(current?.y) - finite(start?.y)) >= threshold;
}

export function shouldSuppressCanvasContextMenu(gesture) {
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

function screenMapping(artboard, viewport, screenSize) {
  return createSvgViewBoxScreenTransform(artboard, {
    width: finite(screenSize?.width, artboard?.width),
    height: finite(screenSize?.height, artboard?.height),
    zoom: clampZoom(viewport?.zoom ?? 1),
    centerX: finite(viewport?.centerX, finite(artboard?.width) / 2),
    centerY: finite(viewport?.centerY, finite(artboard?.height) / 2),
  });
}

export function panViewportByScreen(viewport, delta, artboard, screenSize) {
  const mapping = screenMapping(artboard, viewport, screenSize);
  if (!mapping?.scale) return { ...viewport };
  return {
    ...viewport,
    centerX: finite(viewport.centerX, artboard.width / 2) - finite(delta?.x) / mapping.scale,
    centerY: finite(viewport.centerY, artboard.height / 2) - finite(delta?.y) / mapping.scale,
    zoom: clampZoom(viewport.zoom ?? 1),
  };
}

export function zoomViewportAtScreen(viewport, nextZoom, screenPoint, artboard, screenSize) {
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

function absorbPoint(bounds, point) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function finishBounds(bounds) {
  return Number.isFinite(bounds.minX)
    ? { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }
    : null;
}

function nodeWorldBounds(node) {
  const local = localBounds(node);
  if (!local || !Array.isArray(node.worldMatrix)) return null;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of [
    [local.minX, local.minY], [local.maxX, local.minY],
    [local.maxX, local.maxY], [local.minX, local.maxY],
  ]) absorbPoint(bounds, transformPoint(node.worldMatrix, { x, y }));
  return finishBounds(bounds);
}

export function evaluatedRefBounds(scene, ref) {
  if (!scene || !ref?.kind || !ref?.id) return null;
  if (ref.kind === 'node') {
    const byId = new Map((scene.nodes || []).map((node) => [node.id, node]));
    const target = byId.get(ref.id);
    if (!target) return null;
    if (target.type !== 'group') return nodeWorldBounds(target);
    const descendants = [];
    const queue = [target.id];
    while (queue.length) {
      const parentId = queue.shift();
      for (const node of scene.nodes || []) {
        if (referenceId(node.parent, 'node') !== parentId) continue;
        queue.push(node.id);
        if (node.type !== 'group') descendants.push(node);
      }
    }
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const node of descendants) {
      const child = nodeWorldBounds(node);
      if (!child) continue;
      absorbPoint(bounds, { x: child.minX, y: child.minY });
      absorbPoint(bounds, { x: child.maxX, y: child.maxY });
    }
    return finishBounds(bounds) || {
      minX: target.worldMatrix?.[4] ?? 0,
      minY: target.worldMatrix?.[5] ?? 0,
      maxX: target.worldMatrix?.[4] ?? 0,
      maxY: target.worldMatrix?.[5] ?? 0,
    };
  }
  if (ref.kind === 'mesh') {
    const mesh = (scene.meshes || []).find((item) => item.id === ref.id);
    const vertices = mesh?.deformedVertices || [];
    if (!vertices.length) return null;
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    vertices.forEach((point) => absorbPoint(bounds, point));
    return finishBounds(bounds);
  }
  if (ref.kind === 'bone') {
    const bone = (scene.bones || []).find((item) => item.id === ref.id);
    if (!bone) return null;
    const pad = 8;
    return {
      minX: Math.min(bone.start.x, bone.end.x) - pad,
      minY: Math.min(bone.start.y, bone.end.y) - pad,
      maxX: Math.max(bone.start.x, bone.end.x) + pad,
      maxY: Math.max(bone.start.y, bone.end.y) + pad,
    };
  }
  if (ref.kind === 'control') {
    const control = (scene.controls || []).find((item) => item.id === ref.id);
    if (!control) return null;
    return {
      minX: control.position.x - 12,
      minY: control.position.y - 12,
      maxX: control.position.x + 12,
      maxY: control.position.y + 12,
    };
  }
  return null;
}

function handlePoint(bounds, handle) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: handle.includes('w') ? bounds.minX : handle.includes('e') ? bounds.maxX : centerX,
    y: handle.includes('n') ? bounds.minY : handle.includes('s') ? bounds.maxY : centerY,
  };
}

function oppositeHandlePoint(bounds, handle, pivot) {
  return {
    x: handle.includes('w') ? bounds.maxX : handle.includes('e') ? bounds.minX : pivot.x,
    y: handle.includes('n') ? bounds.maxY : handle.includes('s') ? bounds.minY : pivot.y,
  };
}

export function resizeNodeTransform(node, bounds, handle, pointerLocal, options = {}) {
  if (!node || !bounds || !handle) throw new TypeError('resizeNodeTransform requires a node, bounds and handle.');
  const start = { ...node.transform };
  const pivot = { x: finite(start.pivotX), y: finite(start.pivotY) };
  const startHandle = handlePoint(bounds, handle);
  let factorX = 1;
  let factorY = 1;
  if (handle.includes('w') || handle.includes('e')) {
    const denominator = startHandle.x - pivot.x;
    if (Math.abs(denominator) > 1e-9) factorX = (finite(pointerLocal?.x) - pivot.x) / denominator;
  }
  if (handle.includes('n') || handle.includes('s')) {
    const denominator = startHandle.y - pivot.y;
    if (Math.abs(denominator) > 1e-9) factorY = (finite(pointerLocal?.y) - pivot.y) / denominator;
  }
  factorX = Math.max(VEYRA_MIN_NODE_SCALE / Math.max(VEYRA_MIN_NODE_SCALE, Math.abs(start.scaleX || 1)), factorX);
  factorY = Math.max(VEYRA_MIN_NODE_SCALE / Math.max(VEYRA_MIN_NODE_SCALE, Math.abs(start.scaleY || 1)), factorY);
  if (options.aspectLock) {
    const xActive = handle.includes('w') || handle.includes('e');
    const yActive = handle.includes('n') || handle.includes('s');
    const factor = xActive && yActive
      ? (Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY)
      : xActive ? factorX : factorY;
    factorX = factor;
    factorY = factor;
  }
  const signX = Math.sign(start.scaleX || 1) || 1;
  const signY = Math.sign(start.scaleY || 1) || 1;
  const next = {
    ...start,
    scaleX: signX * Math.max(VEYRA_MIN_NODE_SCALE, Math.abs(start.scaleX || 1) * factorX),
    scaleY: signY * Math.max(VEYRA_MIN_NODE_SCALE, Math.abs(start.scaleY || 1) * factorY),
  };
  if (!options.centerResize) {
    const anchor = oppositeHandlePoint(bounds, handle, pivot);
    const before = transformPoint(transformMatrix(start), anchor);
    const after = transformPoint(transformMatrix(next), anchor);
    next.x = finite(start.x) + before.x - after.x;
    next.y = finite(start.y) + before.y - after.y;
  }
  if (![next.x, next.y, next.scaleX, next.scaleY].every(Number.isFinite)) {
    throw new RangeError('Resize produced a non-finite transform.');
  }
  return next;
}
