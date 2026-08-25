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

export function canonicalVeyraValue(document) {
  return canonicalize(normalizeDocument(document));
}

export function serializeVeyra(document) {
  return JSON.stringify(canonicalVeyraValue(document), null, 2);
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

export function downloadVeyra(document) {
  downloadBlob(serializeVeyra(document), safeFilename(document.name), VEYRA_MIME);
}

export function downloadSvg(document) {
  const normalized = normalizeDocument(document);
  downloadBlob(renderSvgString(evaluateDocument(normalized)), safeFilename(normalized.name, '.svg'), 'image/svg+xml');
}
