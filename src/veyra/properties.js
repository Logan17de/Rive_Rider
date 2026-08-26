import {
  boneById,
  cloneValue,
  constraintById,
  controlById,
  meshById,
  nodeById,
  semanticFor,
} from './model.js';
import { supportsNodeProperty, supportsRigProperty } from './capabilities.js';
import { createNodeRef, createReference, normalizeReference } from './references.js';

export const VEYRA_PROPERTY_TARGET_KINDS = Object.freeze([
  'node',
  'bone',
  'paint',
  'asset',
  'constraint',
  'mesh',
  'control',
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

export function nodePropertyAddress(nodeId, path) {
  return formatPropertyAddress(createNodeRef(nodeId), path);
}

export function rigPropertyAddress(kind, id, path) {
  return formatPropertyAddress(createReference(kind, id), path);
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

function nodePropertyPath(segments) {
  if (segments[0] === 'geometry' && segments[1] === 'vertices' && segments.length === 4) {
    return `geometry.vertices.${segments[2]}.${segments[3]}`;
  }
  return segments.join('.');
}

function nestedTarget(root, segments, path) {
  if (segments.length === 1) return { container: root, key: segments[0] };
  let container = root;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    container = Array.isArray(container)
      ? container.find((candidate) => candidate?.id === segment)
      : container?.[segment];
    if (!container || typeof container !== 'object') {
      throw new TypeError(`Property container ${segments.slice(0, index + 1).join('.')} is unavailable for ${path}.`);
    }
  }
  return { container, key: segments.at(-1) };
}

function propertyTarget(document, address, createSemantic = false) {
  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;
  if (parsed.reference.kind !== 'node') {
    const collection = {
      bone: boneById,
      mesh: meshById,
      control: controlById,
      constraint: constraintById,
    };
    const finder = collection[parsed.reference.kind];
    if (!finder) throw new TypeError(`${parsed.reference.kind} property targets are reserved but not implemented.`);
    const object = finder(document, parsed.reference.id);
    if (!object) throw new TypeError(`Property target ${parsed.reference.kind} ${parsed.reference.id} does not exist.`);
    if (!supportsRigProperty(parsed.reference.kind, object, parsed.path)) {
      throw new TypeError(`${parsed.reference.kind} does not support property ${parsed.path}.`);
    }
    return { parsed, object, ...nestedTarget(object, parsed.segments, parsed.path) };
  }
  const node = nodeById(document, parsed.reference.id);
  if (!node) throw new TypeError(`Property target node ${parsed.reference.id} does not exist.`);
  const path = nodePropertyPath(parsed.segments);
  if (!supportsNodeProperty(node, path)) throw new TypeError(`${node.type} does not support property ${path}.`);

  if (parsed.segments[0] === 'semantic') {
    return { parsed, node, container: semanticFor(document, node.id, createSemantic), key: parsed.segments[1] };
  }
  return { parsed, node, ...nestedTarget(node, parsed.segments, path) };
}

export function readProperty(document, address) {
  const target = propertyTarget(document, address, false);
  if (!target.container) return target.key === 'tags' ? [] : '';
  return cloneValue(target.container[target.key]);
}

export function writeProperty(document, address, value) {
  const target = propertyTarget(document, address, true);
  if (target.key === 'parent') {
    const expectedKind = target.parsed.reference.kind === 'bone' ? 'bone' : 'node';
    target.container.parent = value == null || value === ''
      ? null
      : normalizeReference(value, expectedKind, `${expectedKind}.parent`);
  } else if (target.parsed.reference.kind === 'constraint' && ['bone', 'target', 'path', 'bones'].includes(target.key)) {
    const constraint = target.container;
    if (target.key === 'bones') {
      if (!Array.isArray(value)) throw new TypeError('constraint.bones must be an array.');
      constraint.bones = value.map((reference) => normalizeReference(reference, 'bone', 'constraint.bones'));
    } else {
      const expectedKind = target.key === 'path'
        ? 'node'
        : target.key === 'target' && ['ik', 'distance'].includes(constraint.type)
          ? 'control'
          : 'bone';
      constraint[target.key] = normalizeReference(value, expectedKind, `constraint.${target.key}`);
    }
  } else if (target.parsed.segments[0] === 'semantic' && target.key === 'tags') {
    const tags = Array.isArray(value) ? value : String(value).split(',');
    target.container.tags = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  } else {
    target.container[target.key] = cloneValue(value);
  }
  return target.parsed;
}

export function isAnimatableProperty(document, address) {
  const parsed = parsePropertyAddress(address);
  if (parsed.reference.kind !== 'node') {
    const finder = { bone: boneById, mesh: meshById, control: controlById, constraint: constraintById }[parsed.reference.kind];
    const object = finder?.(document, parsed.reference.id);
    return Boolean(object && supportsRigProperty(parsed.reference.kind, object, parsed.path, 'animatable'));
  }
  const node = nodeById(document, parsed.reference.id);
  return Boolean(node && supportsNodeProperty(node, nodePropertyPath(parsed.segments), 'animatable'));
}
