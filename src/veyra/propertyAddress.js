// Shared, dependency-free property address identity. IDs and path segments are opaque.
export const VEYRA_PROPERTY_TARGET_KINDS = Object.freeze([
  'node',
  'bone',
  'paint',
  'asset',
  'constraint',
  'mesh',
  'control',
  'propertyGroupProperty',
]);

function encodePart(value) {
  return encodeURIComponent(String(value));
}

function decodePart(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new TypeError(`${label} contains invalid percent encoding.`);
  }
}

export function formatPropertyAddress(reference, path) {
  if (!reference || !VEYRA_PROPERTY_TARGET_KINDS.includes(reference.kind) || !reference.id) {
    throw new TypeError('Property address requires a typed target reference.');
  }
  const segments = Array.isArray(path) ? path : String(path || '').split(/[./]/);
  if (!segments.length || segments.some((segment) => !String(segment))) {
    throw new TypeError('Property address path is required.');
  }
  return `${reference.kind}:${encodePart(reference.id)}/${segments.map(encodePart).join('/')}`;
}

export function parsePropertyAddress(address) {
  const text = String(address || '');
  const slash = text.indexOf('/');
  const colon = text.indexOf(':');
  if (colon < 1 || slash < colon + 2) throw new TypeError(`Invalid Veyra property address: ${text}`);
  const kind = text.slice(0, colon);
  if (!VEYRA_PROPERTY_TARGET_KINDS.includes(kind)) throw new TypeError(`Unsupported property target kind: ${kind}`);
  const id = decodePart(text.slice(colon + 1, slash), 'Property target');
  const segments = text.slice(slash + 1).split('/').map((part) => decodePart(part, 'Property path'));
  if (!id || segments.some((segment) => !segment)) throw new TypeError(`Invalid Veyra property address: ${text}`);
  return { reference: { kind, id }, segments, path: segments.join('.') };
}
