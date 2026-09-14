import { parsePropertyAddress } from './propertyAddress.js';
import { normalizeReference } from './references.js';

// Shared scalar primitives for authored normalization and runtime property-binding
// validation. model.js imports these helpers, so runtime bindings and persisted
// documents use one numeric/color contract instead of parallel ad-hoc checks.
export function finite(value, path) {
  if (!Number.isFinite(Number(value))) throw new TypeError(`${path} must be finite.`);
  return Number(value);
}

export function bounded(value, path, min, max) {
  const number = finite(value, path);
  if (number < min || number > max) throw new RangeError(`${path} must be between ${min} and ${max}.`);
  return number;
}

export function integer(value, path, min, max) {
  const number = bounded(value, path, min, max);
  if (!Number.isInteger(number)) throw new TypeError(`${path} must be an integer.`);
  return number;
}

export function color(value, path) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'none' || /^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  throw new TypeError(`${path} must be "none" or a six-digit hex color.`);
}

export function gradientColor(value, path) {
  const normalized = color(value, path);
  if (normalized === 'none') throw new TypeError(`${path} must be a six-digit hex color.`);
  return normalized;
}

function clone(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function objectByReference(document, reference) {
  const collections = {
    node: document.nodes,
    bone: document.bones,
    mesh: document.meshes,
    control: document.controls,
    constraint: document.constraints,
  };
  return (collections[reference.kind] || []).find((item) => item.id === reference.id) || null;
}

function validateFill(fill, path, fallback) {
  if (typeof fill === 'string') throw new TypeError(`${path} must be a tagged fill object.`);
  const source = fill ?? { type: 'solid', color: fallback };
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(`${path} must be a tagged fill object.`);
  const type = String(source.type || '');
  if (!['solid', 'linearGradient', 'radialGradient'].includes(type)) throw new TypeError(`${path}.type is unsupported.`);
  if (type === 'solid') {
    color(source.color ?? fallback, `${path}.color`);
    return clone(source);
  }
  if (!Array.isArray(source.stops) || source.stops.length < 2) throw new TypeError(`${path}.stops must contain at least two gradient stops.`);
  if (source.stops.length > 256) throw new RangeError(`${path}.stops contains too many gradient stops.`);
  const ids = new Set();
  for (const [index, stop] of source.stops.entries()) {
    const id = stop?.id == null || stop.id === '' ? null : String(stop.id);
    if (id && ids.has(id)) throw new TypeError(`${path}.stops contains duplicate stop id ${id}.`);
    if (id) ids.add(id);
    bounded(stop?.offset ?? 0, `${path}.stops[${index}].offset`, 0, 1);
    gradientColor(stop?.color ?? '#000000', `${path}.stops[${index}].color`);
    bounded(stop?.opacity ?? 1, `${path}.stops[${index}].opacity`, 0, 1);
  }
  if (type === 'linearGradient') {
    for (const key of ['x1', 'y1', 'x2', 'y2']) bounded(source[key] ?? (key === 'x2' ? 1 : key === 'y2' ? 1 : 0), `${path}.${key}`, -10, 10);
  } else {
    bounded(source.cx ?? 0.5, `${path}.cx`, -10, 10);
    bounded(source.cy ?? 0.5, `${path}.cy`, -10, 10);
    bounded(source.r ?? 0.5, `${path}.r`, 0.000001, 10);
    bounded(source.fx ?? source.cx ?? 0.5, `${path}.fx`, -10, 10);
    bounded(source.fy ?? source.cy ?? 0.5, `${path}.fy`, -10, 10);
  }
  return clone(source);
}

function validatePaint(object, segments, value, path, fallback, strokeWidthDefault) {
  const tail = segments.slice(1);
  if (tail.length === 1 && tail[0] === 'stroke') return color(value, path);
  if (tail.length === 1 && tail[0] === 'strokeWidth') return bounded(value ?? strokeWidthDefault, path, 0, 10000);
  if (tail.length === 1 && tail[0] === 'fill') return validateFill(value, path, fallback);
  if (tail[0] !== 'fill') throw new TypeError(`${path} has no canonical paint value contract.`);
  if (tail.length === 2 && tail[1] === 'color') return color(value ?? fallback, path);
  if (tail.length === 2 && ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'fx', 'fy'].includes(tail[1])) {
    const defaults = { x1: 0, y1: 0, x2: 1, y2: 1, cx: 0.5, cy: 0.5, fx: 0.5, fy: 0.5 };
    return bounded(value ?? defaults[tail[1]], path, -10, 10);
  }
  if (tail.length === 2 && tail[1] === 'r') return bounded(value ?? 0.5, path, 0.000001, 10);
  if (tail[1] === 'stops' && tail.length === 4) {
    const field = tail[3];
    if (field === 'offset') return bounded(value ?? 0, path, 0, 1);
    if (field === 'color') return gradientColor(value ?? '#000000', path);
    if (field === 'opacity') return bounded(value ?? 1, path, 0, 1);
  }
  throw new TypeError(`${path} has no canonical paint value contract.`);
}

function validateNode(node, segments, value, path) {
  const [root, key] = segments;
  if (root === 'asset' && segments.length === 1 && node.type === 'image') {
    return value == null || value === '' ? null : normalizeReference(value, 'asset', path);
  }
  if (root === 'visible' && segments.length === 1) return value !== false;
  if (root === 'opacity' && segments.length === 1) return bounded(value ?? 1, path, 0, 1);
  if (root === 'transform' && segments.length === 2) {
    if (['x', 'y', 'rotation', 'pivotX', 'pivotY'].includes(key)) return finite(value ?? 0, path);
    if (['skewX', 'skewY'].includes(key)) return bounded(value ?? 0, path, -1.5533430342749532, 1.5533430342749532);
    if (['scaleX', 'scaleY'].includes(key)) return bounded(value ?? 1, path, -100, 100);
  }
  if (root === 'paint') return validatePaint(node, segments, value, path, '#ec4899', 0);
  if (root === 'geometry') {
    if (node.type === 'image') {
      if (['width', 'height'].includes(key)) return bounded(value, path, 0.01, 100000);
      if (key === 'fit' && ['contain', 'cover', 'fill', 'none'].includes(String(value))) return String(value);
    }
    if (node.type === 'rectangle') {
      if (['width', 'height'].includes(key)) return bounded(value, path, 0.01, 100000);
      if (key === 'cornerRadius') return bounded(value ?? 0, path, 0, 100000);
    }
    if (node.type === 'ellipse' && ['width', 'height'].includes(key)) return bounded(value, path, 0.01, 100000);
    if (node.type === 'polygon') {
      if (key === 'radius') return bounded(value, path, 0.01, 100000);
      if (key === 'sides') return integer(value, path, 3, 256);
    }
    if (node.type === 'star') {
      if (key === 'outerRadius') return bounded(value, path, 0.01, 100000);
      if (key === 'innerRadius') return bounded(value ?? 0, path, 0, 100000);
      if (key === 'points') return integer(value, path, 2, 256);
    }
    if (node.type === 'path') {
      if (key === 'closed' && segments.length === 2) return Boolean(value);
      if (key === 'vertices' && segments.length === 4) {
        const field = segments[3];
        if (['x', 'y'].includes(field)) return finite(value, path);
        if (['inX', 'inY', 'outX', 'outY'].includes(field)) return finite(value ?? 0, path);
        if (field === 'cornerRadius') return bounded(value ?? 0, path, 0, 100000);
      }
    }
  }
  throw new TypeError(`${path} has no canonical node value contract.`);
}

function validateBone(_bone, segments, value, path) {
  const [root, key] = segments;
  if (root === 'visible' && segments.length === 1) return value !== false;
  if (root === 'length' && segments.length === 1) return bounded(value ?? 100, path, 0.01, 100000);
  if (root === 'pose' && segments.length === 2) {
    if (['x', 'y', 'rotation'].includes(key)) return finite(value ?? 0, path);
    if (['scaleX', 'scaleY'].includes(key)) return bounded(value ?? 1, path, -100, 100);
  }
  throw new TypeError(`${path} has no canonical bone value contract.`);
}

function validateMesh(mesh, segments, value, path) {
  if (segments[0] === 'visible' && segments.length === 1) return value !== false;
  if (segments[0] === 'opacity' && segments.length === 1) return bounded(value ?? 1, path, 0, 1);
  if (segments[0] === 'paint') return validatePaint(mesh, segments, value, path, '#f472b6', 2);
  throw new TypeError(`${path} has no canonical mesh value contract.`);
}

function validateControl(control, segments, value, path) {
  const [root, key] = segments;
  if (root === 'visible' && segments.length === 1) return value !== false;
  if (root === 'position' && segments.length === 2 && ['x', 'y'].includes(key)) return finite(value ?? 0, path);
  if (root === 'value' && segments.length === 1) return bounded(value ?? control.min, path, Number(control.min), Number(control.max));
  throw new TypeError(`${path} has no canonical control value contract.`);
}

function validateConstraint(constraint, segments, value, path) {
  const root = segments[0];
  if (root === 'enabled' && segments.length === 1) return value !== false;
  if (root === 'strength' && segments.length === 1) return bounded(value ?? 1, path, 0, 1);
  if (root === 'distance' && segments.length === 1) return bounded(value ?? 100, path, 0, 100000);
  if (root === 'position' && segments.length === 1) return bounded(value ?? 0, path, 0, 1);
  if (root === 'offset' && segments.length === 1) return finite(value ?? 0, path);
  throw new TypeError(`${path} has no canonical constraint value contract.`);
}

/**
 * Validate and normalize one ordinary property binding output before it is
 * published into the virtual graph/scene override map. The address has already
 * passed the canonical capability gate; this function supplies the value-level
 * contract that persisted document normalization applies later.
 */
export function validateBindingPropertyValue(document, address, value, label = `property ${address}`) {
  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;
  const object = objectByReference(document, parsed.reference);
  if (!object) throw new TypeError(`${label} target ${parsed.reference.kind}:${parsed.reference.id} does not exist.`);
  const path = `${label} (${parsed.path})`;
  if (parsed.reference.kind === 'node') validateNode(object, parsed.segments, value, path);
  else if (parsed.reference.kind === 'bone') validateBone(object, parsed.segments, value, path);
  else if (parsed.reference.kind === 'mesh') validateMesh(object, parsed.segments, value, path);
  else if (parsed.reference.kind === 'control') validateControl(object, parsed.segments, value, path);
  else if (parsed.reference.kind === 'constraint') validateConstraint(object, parsed.segments, value, path);
  else throw new TypeError(`${label} has no ordinary property value contract.`);
  // Validation must not rewrite the binding graph's published value. In
  // particular, null is an intentional sentinel for empty list converters;
  // canonical document normalization may interpret it as a property default.
  return clone(value);
}
