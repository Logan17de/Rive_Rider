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
 * Canonical SVG viewBox used by the editor renderer.
 *
 * The browser SVG uses the default preserveAspectRatio contract
 * `xMidYMid meet`. Keeping the viewBox math here lets DOM-free hit testing use
 * the exact same pan/zoom geometry without depending on browser layout APIs.
 */
export function createSvgViewBox(artboard = {}, viewport = {}) {
  const width = positive(artboard.width);
  const height = positive(artboard.height);
  const zoom = positive(viewport.zoom, 1);
  if (!width || !height || !zoom) return null;
  const centerX = finite(viewport.centerX, width / 2);
  const centerY = finite(viewport.centerY, height / 2);
  const visibleWidth = width / zoom;
  const visibleHeight = height / zoom;
  return {
    x: centerX - visibleWidth / 2,
    y: centerY - visibleHeight / 2,
    width: visibleWidth,
    height: visibleHeight,
    centerX,
    centerY,
    zoom,
  };
}

/**
 * DOM-free equivalent of SVG's `viewBox` + `preserveAspectRatio="xMidYMid meet"`.
 * The returned affine matrix maps evaluated world/artboard coordinates to final
 * CSS viewport pixels, including centered letterbox/pillarbox offsets.
 */
export function createSvgViewBoxScreenTransform(artboard = {}, viewport = {}) {
  const viewBox = createSvgViewBox(artboard, viewport);
  const viewportWidth = positive(viewport.width, positive(artboard.width));
  const viewportHeight = positive(viewport.height, positive(artboard.height));
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
