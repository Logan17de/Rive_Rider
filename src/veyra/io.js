import { VEYRA_MIME, normalizeDocument } from './model.js';
import { renderSvgString } from './geometry.js';
import { evaluateDocument } from './evaluation.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalVeyraValue(documentModel) {
  const normalized = normalizeDocument(documentModel);
  const canonical = canonicalize(normalized);
  // `artboard` is a runtime compatibility alias for M0-M5 code. v5 persistence
  // has exactly one source of truth: the stable `artboards[]` registry.
  delete canonical.artboard;
  return canonical;
}

export function serializeVeyra(documentModel) {
  return JSON.stringify(canonicalVeyraValue(documentModel), null, 2);
}

export function parseVeyra(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(`Invalid Veyra JSON: ${error.message}`);
  }
  return normalizeDocument(value);
}

export function safeFilename(name, extension = '.veyra') {
  const base = String(name || 'untitled')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100) || 'untitled';
  return base.toLowerCase().endsWith(extension.toLowerCase()) ? base : `${base}${extension}`;
}

export function downloadBlob(contents, filename, mime) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadVeyra(documentModel) {
  downloadBlob(serializeVeyra(documentModel), safeFilename(documentModel.name), VEYRA_MIME);
}

export function downloadSvg(documentModel) {
  const normalized = normalizeDocument(documentModel);
  downloadBlob(renderSvgString(evaluateDocument(normalized)), safeFilename(normalized.name, '.svg'), 'image/svg+xml');
}
