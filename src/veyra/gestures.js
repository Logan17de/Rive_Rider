// Pure gesture orchestration: browser events are converted to data before this layer.
export function createArtboardResizeGesture({ store, start, startArtboard, mode, scaleX = 1, scaleY = 1, threshold = 2, onMove } = {}) {
  if (!store || !start || !startArtboard) throw new TypeError('Artboard resize gesture requires store, start, and startArtboard.');
  let active = false;
  let last = { width: startArtboard.width, height: startArtboard.height };

  function move(point) {
    const distance = Math.hypot(point.clientX - start.x, point.clientY - start.y);
    if (!active && distance < threshold) return { started: false, moved: false };
    if (!active) {
      store.begin('Resize artboard');
      active = true;
    }
    const dx = (point.clientX - start.x) * scaleX;
    const dy = (point.clientY - start.y) * scaleY;
    last = {
      width: Math.max(1, Math.round(startArtboard.width + (mode === 'resize' || mode === 'resize-x' ? dx : 0))),
      height: Math.max(1, Math.round(startArtboard.height + (mode === 'resize' || mode === 'resize-y' ? dy : 0))),
    };
    store.mutate((documentModel) => {
      documentModel.artboard.width = last.width;
      documentModel.artboard.height = last.height;
    }, 'drag');
    onMove?.(last);
    return { started: true, moved: true, ...last };
  }

  function end() {
    if (!active) return { committed: false, moved: false, error: null };
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

  return { move, end, get active() { return active; } };
}
