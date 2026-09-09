import { supportsNodeProperty, supportsRigProperty } from './capabilities.js';

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
