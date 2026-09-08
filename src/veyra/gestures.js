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
  artboardId = null,
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
  const startX = finite(startArtboard.x, 0);
  const startY = finite(startArtboard.y, 0);
  const startWidth = Math.max(minSize, finite(startArtboard.width, minSize));
  const startHeight = Math.max(minSize, finite(startArtboard.height, minSize));
  const fixedRight = startX + startWidth;
  const fixedBottom = startY + startHeight;
  let active = false;
  let last = { x: startX, y: startY, width: startWidth, height: startHeight, direction: resolvedDirection };

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
    const x = left ? fixedRight - width : startX;
    const y = top ? fixedBottom - height : startY;
    last = { x, y, width, height, direction: resolvedDirection };

    store.mutate((documentModel) => {
      const target = artboardId
        ? documentModel.artboards?.find((item) => item.id === artboardId)
        : documentModel.artboard;
      if (!target) throw new TypeError(`Resize artboard ${artboardId || '(legacy)'} does not exist.`);
      target.x = last.x;
      target.y = last.y;
      target.width = last.width;
      target.height = last.height;
      documentModel.artboard = documentModel.artboards?.[0] || target;
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
