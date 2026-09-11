import { supportsNodeProperty, supportsRigProperty } from './propertyCapabilities.js';
import { parsePropertyAddress } from './propertyAddress.js';
import {
  VEYRA_PROPERTY_VALUE_RANGES,
  VEYRA_PROPERTY_VERTEX_HANDLE_MODES,
  boundedPropertyNumber,
  finitePropertyNumber,
  integerPropertyNumber,
  normalizePropertyColor,
  normalizePropertyFill,
} from './propertyValueContracts.js';

function clone(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizePaintValue(document, referenceKind, path, value, label) {
  if (path === 'paint.fill') return normalizePropertyFill(value, label, {
    inputVersion: document.version,
    fallback: referenceKind === 'mesh' ? '#f472b6' : '#ec4899',
    defaultStopId: (index) => `runtimeGradientStop_${index}`,
  });
  if (path === 'paint.stroke' || path === 'paint.fill.color') return normalizePropertyColor(value, label);
  if (/^paint\.fill\.stops\.[^.]+\.color$/.test(path)) return normalizePropertyColor(value, label, { allowNone: false });
  if (/^paint\.fill\.stops\.[^.]+\.(offset|opacity)$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.unit);
  if (path === 'paint.fill.r') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.gradientRadius);
  if (/^paint\.fill\.(x1|y1|x2|y2|cx|cy|fx|fy)$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.gradientCoordinate);
  if (path === 'paint.strokeWidth') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.strokeWidth);
  return undefined;
}

/**
 * Normalize one value through the same constraints as the canonical authored
 * property writer. This is deliberately address-local: data evaluation can
 * validate each output without cloning or normalizing the whole project.
 */
export function normalizeCanonicalPropertyValue(document, parsedInput, value, label = 'property value', options = {}) {
  if (value == null && options.preserveNullableOutput) {
    // Validate the writer's real coercion without erasing the binding engine's
    // documented nullable converter output. Full scene application will run
    // this function again and apply that coercion at the property boundary.
    normalizeCanonicalPropertyValue(document, parsedInput, value, label);
    return null;
  }
  const parsed = typeof parsedInput === 'string'
    ? parsePropertyAddress(parsedInput)
    : parsedInput;
  const capabilities = canonicalPropertyBindingCapabilities(document, parsed);
  if (!capabilities.exists || !capabilities.writable) throw new TypeError(`${label} targets an unavailable property.`);
  const { reference } = parsedParts(parsed);
  const path = capabilities.path;
  const object = {
    node: document.nodes,
    bone: document.bones,
    mesh: document.meshes,
    control: document.controls,
    constraint: document.constraints,
  }[reference.kind]?.find((item) => item.id === reference.id);

  if (['node', 'mesh'].includes(reference.kind)) {
    if (path === 'visible') return value !== false;
    if (path === 'opacity') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.unit);
    const paintValue = normalizePaintValue(document, reference.kind, path, value, label);
    if (paintValue !== undefined) return paintValue;
  }

  if (reference.kind === 'node') {
    if (/^transform\.(x|y|rotation|pivotX|pivotY)$/.test(path)) return finitePropertyNumber(value, label);
    if (/^transform\.skew[XY]$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.skew);
    if (/^transform\.scale[XY]$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.scale);
    if (path === 'geometry.closed') return Boolean(value);
    if (/^geometry\.(width|height|radius|outerRadius)$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.geometryDimension);
    if (path === 'geometry.innerRadius' || path === 'geometry.cornerRadius' || /^geometry\.vertices\.[^.]+\.cornerRadius$/.test(path)) {
      return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.geometryRadius);
    }
    if (path === 'geometry.sides') return integerPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.geometrySides);
    if (path === 'geometry.points') return integerPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.geometryPoints);
    if (/^geometry\.vertices\.[^.]+\.(x|y|inX|inY|outX|outY)$/.test(path)) return finitePropertyNumber(value, label);
    if (/^geometry\.vertices\.[^.]+\.handleMode$/.test(path)) {
      const result = String(value || '');
      if (!VEYRA_PROPERTY_VERTEX_HANDLE_MODES.includes(result)) throw new TypeError(`${label} must be one of ${VEYRA_PROPERTY_VERTEX_HANDLE_MODES.join(', ')}.`);
      return result;
    }
  }

  if (reference.kind === 'bone') {
    if (path === 'visible') return value !== false;
    if (path === 'length') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.boneLength);
    if (/^(rest|pose)\.(x|y|rotation)$/.test(path)) return finitePropertyNumber(value, label);
    if (/^(rest|pose)\.scale[XY]$/.test(path)) return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.scale);
  }

  if (reference.kind === 'control') {
    if (path === 'visible') return value !== false;
    if (/^position\.(x|y)$/.test(path)) return finitePropertyNumber(value, label);
    if (path === 'value') return boundedPropertyNumber(value, label, Number(object.min), Number(object.max));
  }

  if (reference.kind === 'constraint') {
    if (path === 'enabled') return value !== false;
    if (path === 'strength' || path === 'position') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.unit);
    if (path === 'distance') return boundedPropertyNumber(value, label, ...VEYRA_PROPERTY_VALUE_RANGES.constraintDistance);
    if (path === 'offset') return finitePropertyNumber(value, label);
  }

  // Canonical binding capabilities keep data outputs on the animatable subset;
  // this fallback is for future structured properties whose model validator is
  // intentionally authoritative after application.
  return clone(value);
}

function propertyGroupPropertyById(document, value) {
  for (const group of document.propertyGroups || []) {
    const item = (group.properties || []).find((candidate) => candidate.id === value);
    if (item) return item;
  }
  return null;
}

function parsedParts(parsed) {
  const reference = parsed?.reference || (parsed?.kind && parsed?.id ? { kind: parsed.kind, id: parsed.id } : null);
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : String(parsed?.path || '').split('.').filter(Boolean);
  const path = parsed?.path || segments.join('.');
  return { reference, segments, path };
}

function nodePropertyPath(segments) {
  if (segments[0] === 'geometry' && segments[1] === 'vertices' && segments.length === 4) {
    return `geometry.vertices.${segments[2]}.${segments[3]}`;
  }
  return segments.join('.');
}

function missing(reference, path) {
  return {
    exists: false,
    readable: false,
    writable: false,
    bindable: false,
    drivable: false,
    status: 'missing-target',
    reference,
    path,
  };
}

/**
 * Canonical binding capability classifier for ordinary Veyra property addresses.
 *
 * This module intentionally depends only on low-level capability tables, not on
 * model/data-graph normalization. Both properties.js and dataGraph.js consume it
 * so authoring validation and runtime application share one answer for whether a
 * property can be read, written, bound and driven by the evaluator.
 */
export function canonicalPropertyBindingCapabilities(document, parsed) {
  const { reference, segments, path } = parsedParts(parsed);
  if (!reference?.kind || !reference?.id || !path) return missing(reference, path);

  if (reference.kind === 'propertyGroupProperty') {
    const property = propertyGroupPropertyById(document, reference.id);
    if (!property) return missing(reference, path);
    const supportedPath = path === 'value';
    const readable = supportedPath && property.readable !== false;
    const writable = supportedPath && property.writable !== false;
    const bindable = supportedPath && property.bindable !== false;
    const drivable = supportedPath && writable && property.keyable !== false;
    return {
      exists: true,
      readable,
      writable,
      bindable,
      drivable,
      status: drivable ? 'animatable' : 'non-animatable',
      reference,
      path,
      property,
    };
  }

  if (reference.kind === 'node') {
    const node = (document.nodes || []).find((item) => item.id === reference.id) || null;
    if (!node) return missing(reference, path);
    const canonicalPath = nodePropertyPath(segments);
    const writable = supportsNodeProperty(node, canonicalPath, 'writable');
    const drivable = supportsNodeProperty(node, canonicalPath, 'animatable');
    return {
      exists: true,
      readable: writable,
      writable,
      bindable: writable,
      drivable,
      status: drivable ? 'animatable' : 'non-animatable',
      reference,
      path: canonicalPath,
    };
  }

  const collection = {
    bone: document.bones,
    mesh: document.meshes,
    control: document.controls,
    constraint: document.constraints,
  };
  const object = (collection[reference.kind] || []).find((item) => item.id === reference.id) || null;
  if (!object) return missing(reference, path);
  const writable = supportsRigProperty(reference.kind, object, path, 'writable');
  const drivable = supportsRigProperty(reference.kind, object, path, 'animatable');
  return {
    exists: true,
    readable: writable,
    writable,
    bindable: writable,
    drivable,
    status: drivable ? 'animatable' : 'non-animatable',
    reference,
    path,
  };
}
