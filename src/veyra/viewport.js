export const VEYRA_SVG_PRESERVE_ASPECT_RATIO = 'xMidYMid meet';

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
  const artboardX = finite(artboard.x, 0);
  const artboardY = finite(artboard.y, 0);
  const centerX = finite(viewport.centerX, artboardX + artboardWidth / 2);
  const centerY = finite(viewport.centerY, artboardY + artboardHeight / 2);
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
