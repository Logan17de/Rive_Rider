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
import { canonicalPropertyBindingCapabilities } from './propertyBinding.js';
import { createNodeRef, createReference, normalizeReference } from './references.js';

function propertyGroupPropertyById(document, value) {
  for (const group of document.propertyGroups || []) {
    const item = (group.properties || []).find((candidate) => candidate.id === value);
    if (item) return item;
  }
  return null;
}

export { VEYRA_PROPERTY_TARGET_KINDS, formatPropertyAddress, parsePropertyAddress } from './propertyAddress.js';
import { formatPropertyAddress, parsePropertyAddress } from './propertyAddress.js';

export function nodePropertyAddress(nodeId, path) {
  return formatPropertyAddress(createNodeRef(nodeId), path);
}

export function rigPropertyAddress(kind, id, path) {
  return formatPropertyAddress(createReference(kind, id), path);
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
  if (parsed.reference.kind === 'propertyGroupProperty') {
    const property = propertyGroupPropertyById(document, parsed.reference.id);
    if (!property) throw new TypeError(`Property Group property ${parsed.reference.id} does not exist.`);
    if (parsed.path !== 'value') throw new TypeError(`Property Group property supports only value, not ${parsed.path}.`);
    return { parsed, object: property, container: property, key: 'value' };
  }
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

/**
 * Classify an address before attempting to apply it. Missing targets and
 * existing-but-undrivable properties have different remedies and therefore
 * must not collapse into one boolean diagnostic.
 */
export function propertyTargetStatus(document, address) {
  const parsed = parsePropertyAddress(address);
  return canonicalPropertyBindingCapabilities(document, parsed).status;
}

export function propertyBindingCapabilities(document, address) {
  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;
  return canonicalPropertyBindingCapabilities(document, parsed);
}

export function isAnimatableProperty(document, address) {
  return propertyTargetStatus(document, address) === 'animatable';
}
