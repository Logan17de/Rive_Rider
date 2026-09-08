// Pure gesture orchestration: browser events are converted to data before this layer.

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
