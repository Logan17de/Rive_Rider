import {
  createArtboardRef,
  createComponentRef,
  createComponentInstanceRef,
  createComponentOverrideRef,
  createReference,
  normalizeReference,
  referenceId,
} from './references.js';

function cloneValue(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export const VEYRA_PROJECT_VERSION = 5;
export const VEYRA_COMPONENT_FIT_MODES = Object.freeze(['none', 'contain', 'cover', 'stretch']);
export const VEYRA_COMPONENT_ALIGN_X = Object.freeze(['start', 'center', 'end']);
export const VEYRA_COMPONENT_ALIGN_Y = Object.freeze(['start', 'center', 'end']);
export const VEYRA_COMPONENT_MAX_DEPTH = 16;

function finite(value, path, fallback = null) {
  const source = value == null && fallback != null ? fallback : value;
  const number = Number(source);
  if (!Number.isFinite(number)) throw new TypeError(`${path} must be finite.`);
  return number;
}

function bounded(value, path, min, max, fallback = null) {
  const number = finite(value, path, fallback);
  if (number < min || number > max) throw new RangeError(`${path} must be between ${min} and ${max}.`);
  return number;
}

function color(value, path, fallback = '#fff7fc') {
  const normalized = String(value ?? fallback).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) throw new TypeError(`${path} must be a six-digit hex color.`);
  return normalized;
}

function deterministicHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deterministicProjectId(prefix, seed, source = '') {
  return `${prefix}_m6_${deterministicHash(`${seed}:${source}`)}`;
}

export function deterministicLegacyArtboardId(documentId) {
  return `artboard_legacy_${deterministicHash(String(documentId || 'document'))}`;
}

function transform(value = {}, path = 'transform') {
  return {
    x: finite(value.x ?? 0, `${path}.x`),
    y: finite(value.y ?? 0, `${path}.y`),
    rotation: finite(value.rotation ?? 0, `${path}.rotation`),
    skewX: bounded(value.skewX ?? 0, `${path}.skewX`, -1.5533430342749532, 1.5533430342749532),
    skewY: bounded(value.skewY ?? 0, `${path}.skewY`, -1.5533430342749532, 1.5533430342749532),
    scaleX: bounded(value.scaleX ?? 1, `${path}.scaleX`, -100, 100),
    scaleY: bounded(value.scaleY ?? 1, `${path}.scaleY`, -100, 100),
    pivotX: finite(value.pivotX ?? 0, `${path}.pivotX`),
    pivotY: finite(value.pivotY ?? 0, `${path}.pivotY`),
  };
}

export function createArtboard(overrides = {}) {
  return {
    id: String(overrides.id || ''),
    name: String(overrides.name ?? 'Artboard'),
    x: Number(overrides.x ?? 0),
    y: Number(overrides.y ?? 0),
    width: Number(overrides.width ?? 960),
    height: Number(overrides.height ?? 640),
    background: String(overrides.background ?? '#fff7fc').toLowerCase(),
    componentSource: overrides.componentSource ? createComponentRef(referenceId(overrides.componentSource, 'component') || overrides.componentSource) : null,
  };
}

export function createComponent(overrides = {}) {
  const source = normalizeReference(overrides.source ?? overrides.sourceArtboard ?? overrides.artboard, 'artboard', 'component.source');
  if (!source) throw new TypeError('component.source is required.');
  return {
    id: String(overrides.id || ''),
    name: String(overrides.name ?? 'Component'),
    source,
    displayNameAdvisory: true,
  };
}

function normalizeOverride(value, index, instanceId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`componentInstance.overrides[${index}] must be an object.`);
  const target = value.target && typeof value.target === 'object'
    ? createReference(value.target.kind, value.target.id)
    : null;
  if (!target) throw new TypeError(`componentInstance.overrides[${index}].target is required.`);
  const address = String(value.address || '');
  if (!address) throw new TypeError(`componentInstance.overrides[${index}].address is required.`);
  const prefix = `${target.kind}:${target.id}/`;
  if (!address.startsWith(prefix)) {
    throw new TypeError(`componentInstance.overrides[${index}].address must target ${target.kind}:${target.id}.`);
  }
  const path = address.slice(prefix.length);
  const allowed = {
    node: /^(transform\/(x|y|rotation|skewX|skewY|scaleX|scaleY|pivotX|pivotY)|opacity|visible|pointerEvents|paint\/(fill|stroke|strokeWidth)|geometry\/.+)$/,
    bone: /^(pose\/(x|y|rotation|scaleX|scaleY)|visible|locked|length)$/,
    mesh: /^(opacity|visible|locked|paint\/(fill|stroke|strokeWidth))$/,
    control: /^(position\/(x|y)|visible|locked)$/,
    constraint: /^(enabled|strength)$/,
  }[target.kind];
  if (!allowed?.test(path)) {
    throw new TypeError(`componentInstance.overrides[${index}] target ${target.kind}:${target.id}/${path} is not overridable in M6.`);
  }
  return {
    id: String(value.id || `componentOverride_${instanceId}_${index}`),
    target,
    address,
    value: cloneValue(value.value),
  };
}

export function createComponentInstance(overrides = {}) {
  const id = String(overrides.id || '');
  const component = normalizeReference(overrides.component ?? overrides.componentId, 'component', 'componentInstance.component');
  if (!component) throw new TypeError('componentInstance.component is required.');
  const artboard = normalizeReference(overrides.artboard ?? overrides.artboardId, 'artboard', 'componentInstance.artboard');
  if (!artboard) throw new TypeError('componentInstance.artboard is required.');
  const fit = String(overrides.fit ?? 'contain');
  const alignX = String(overrides.alignX ?? 'center');
  const alignY = String(overrides.alignY ?? 'center');
  if (!VEYRA_COMPONENT_FIT_MODES.includes(fit)) throw new TypeError(`componentInstance.fit must be one of ${VEYRA_COMPONENT_FIT_MODES.join(', ')}.`);
  if (!VEYRA_COMPONENT_ALIGN_X.includes(alignX)) throw new TypeError(`componentInstance.alignX must be one of ${VEYRA_COMPONENT_ALIGN_X.join(', ')}.`);
  if (!VEYRA_COMPONENT_ALIGN_Y.includes(alignY)) throw new TypeError(`componentInstance.alignY must be one of ${VEYRA_COMPONENT_ALIGN_Y.join(', ')}.`);
  const frame = {
    width: bounded(overrides.frame?.width ?? overrides.width ?? 1, 'componentInstance.frame.width', 0.01, 100000),
    height: bounded(overrides.frame?.height ?? overrides.height ?? 1, 'componentInstance.frame.height', 0.01, 100000),
  };
  const runtime = overrides.runtime && typeof overrides.runtime === 'object' && !Array.isArray(overrides.runtime)
    ? {
      timeline: overrides.runtime.timeline ? normalizeReference(overrides.runtime.timeline, 'timeline', 'componentInstance.runtime.timeline') : null,
      stateMachine: overrides.runtime.stateMachine ? normalizeReference(overrides.runtime.stateMachine, 'stateMachine', 'componentInstance.runtime.stateMachine') : null,
      mix: bounded(overrides.runtime.mix ?? 1, 'componentInstance.runtime.mix', 0, 1),
      remap: {
        timeline: overrides.runtime.remap?.timeline ? normalizeReference(overrides.runtime.remap.timeline, 'timeline', 'componentInstance.runtime.remap.timeline') : null,
        stateMachine: overrides.runtime.remap?.stateMachine ? normalizeReference(overrides.runtime.remap.stateMachine, 'stateMachine', 'componentInstance.runtime.remap.stateMachine') : null,
      },
    }
    : { timeline: null, stateMachine: null, mix: 1, remap: { timeline: null, stateMachine: null } };
  return {
    id,
    name: String(overrides.name ?? 'Component Instance'),
    artboard,
    component,
    parent: overrides.parent ? normalizeReference(overrides.parent, 'node', 'componentInstance.parent') : null,
    visible: overrides.visible !== false,
    opacity: bounded(overrides.opacity ?? 1, 'componentInstance.opacity', 0, 1),
    transform: transform(overrides.transform, 'componentInstance.transform'),
    frame,
    fit,
    alignX,
    alignY,
    clip: (() => { if (overrides.clip) throw new TypeError('componentInstance.clip=true is not supported in M6; use clip=false.'); return false; })(),
    overrides: (overrides.overrides || []).map((item, index) => normalizeOverride(item, index, id)),
    runtime,
  };
}

export function artboardById(document, artboardId) {
  return (document.artboards || []).find((item) => item.id === artboardId) || null;
}

export function componentById(document, componentId) {
  return (document.components || []).find((item) => item.id === componentId) || null;
}

export function componentInstanceById(document, instanceId) {
  return (document.componentInstances || []).find((item) => item.id === instanceId) || null;
}

function normalizeArtboards(rawInput, baseDocument) {
  const documentId = String(baseDocument.id || rawInput.id || 'document');
  const source = Array.isArray(rawInput.artboards) && rawInput.artboards.length
    ? rawInput.artboards
    : [{
      id: deterministicLegacyArtboardId(documentId),
      name: 'Main',
      ...(rawInput.artboard || baseDocument.artboard || {}),
    }];
  if (!source.length) throw new TypeError('artboards must contain at least one artboard.');
  const ids = new Set();
  return source.map((item, index) => {
    const id = String(item?.id || '');
    if (!id) throw new TypeError(`artboards[${index}].id is required.`);
    if (ids.has(id)) throw new TypeError(`Duplicate artboard id ${id}.`);
    ids.add(id);
    return {
      id,
      name: String(item.name ?? `Artboard ${index + 1}`),
      x: finite(item.x ?? 0, `artboards[${index}].x`),
      y: finite(item.y ?? 0, `artboards[${index}].y`),
      width: bounded(item.width ?? 960, `artboards[${index}].width`, 1, 100000),
      height: bounded(item.height ?? 640, `artboards[${index}].height`, 1, 100000),
      background: color(item.background, `artboards[${index}].background`),
      componentSource: item.componentSource ? normalizeReference(item.componentSource, 'component', `artboards[${index}].componentSource`) : null,
    };
  });
}

function assignOwner(items, rawItems, artboards, label, infer = null) {
  const artboardIds = new Set(artboards.map((item) => item.id));
  const fallback = artboards.length === 1 ? createArtboardRef(artboards[0].id) : null;
  return (items || []).map((item, index) => {
    const raw = rawItems?.[index] || {};
    const inferred = infer ? infer(item, index) : null;
    const owner = raw.artboard
      ? normalizeReference(raw.artboard, 'artboard', `${label}[${index}].artboard`)
      : item.artboard
        ? normalizeReference(item.artboard, 'artboard', `${label}[${index}].artboard`)
        : inferred || fallback;
    if (!owner) throw new TypeError(`${label}[${index}].artboard is required when a project has multiple artboards.`);
    const resolvedOwner = !artboardIds.has(owner.id)
      && fallback
      && String(owner.id).startsWith('artboard_legacy_')
      ? fallback
      : owner;
    if (!artboardIds.has(resolvedOwner.id)) throw new TypeError(`${label}[${index}].artboard references missing artboard ${resolvedOwner.id}.`);
    return { ...item, artboard: resolvedOwner };
  });
}

function ownerMap(document) {
  const map = new Map();
  const add = (kind, items) => {
    for (const item of items || []) if (item.artboard) map.set(`${kind}:${item.id}`, item.artboard.id);
  };
  add('node', document.nodes);
  add('bone', document.bones);
  add('mesh', document.meshes);
  add('control', document.controls);
  add('constraint', document.constraints);
  add('timeline', document.timelines);
  add('stateMachine', document.stateMachines);
  add('listener', document.listeners);
  add('componentInstance', document.componentInstances);
  return map;
}

export function entityArtboardId(document, reference) {
  if (!reference) return null;
  if (reference.kind === 'viewModelInstance') return document.viewModelInstances?.find((item) => item.id === reference.id)?.artboard?.id || null;
  if (reference.kind === 'binding') return document.bindings?.find((item) => item.id === reference.id)?.artboard?.id || null;
  if (reference.kind === 'propertyGroup') return document.propertyGroups?.find((item) => item.id === reference.id)?.artboard?.id || null;
  if (reference.kind === 'propertyGroupProperty') return document.propertyGroups?.find((group) => group.properties?.some((item) => item.id === reference.id))?.artboard?.id || null;
  if (reference.kind === 'list') { const list = document.lists?.find((item) => item.id === reference.id); return list ? document.viewModelInstances?.find((item) => item.id === list.owner?.id)?.artboard?.id || null : null; }
  if (reference.kind === 'listItem') { const list = document.lists?.find((item) => item.items?.some((child) => child.id === reference.id)); return list ? document.viewModelInstances?.find((item) => item.id === list.owner?.id)?.artboard?.id || null : null; }
  if (reference.kind === 'artboard') return reference.id;
  if (reference.kind === 'component') return referenceId(componentById(document, reference.id)?.source, 'artboard');
  if (reference.kind === 'componentOverride') {
    for (const instance of document.componentInstances || []) {
      if (instance.overrides.some((item) => item.id === reference.id)) return referenceId(instance.artboard, 'artboard');
    }
    return null;
  }
  const direct = ownerMap(document).get(`${reference.kind}:${reference.id}`);
  if (direct) return direct;
  if (reference.kind === 'pathVertex') {
    return document.nodes.find((node) => node.geometry?.vertices?.some((vertex) => vertex.id === reference.id))?.artboard?.id || null;
  }
  if (reference.kind === 'meshVertex') {
    return document.meshes.find((mesh) => mesh.vertices?.some((vertex) => vertex.id === reference.id))?.artboard?.id || null;
  }
  if (reference.kind === 'track' || reference.kind === 'keyframe') {
    for (const timeline of document.timelines || []) {
      for (const track of timeline.tracks || []) {
        if (reference.kind === 'track' && track.id === reference.id) return timeline.artboard.id;
        if (reference.kind === 'keyframe' && track.keyframes.some((keyframe) => keyframe.id === reference.id)) return timeline.artboard.id;
      }
    }
  }
  if (reference.kind.startsWith('machine')) {
    for (const machine of document.stateMachines || []) {
      if (machine.inputs?.some((item) => item.id === reference.id)
        || machine.states?.some((item) => item.id === reference.id)
        || machine.transitions?.some((item) => item.id === reference.id)
        || machine.transitions?.some((item) => item.conditions?.some((condition) => condition.id === reference.id))) return machine.artboard.id;
    }
  }
  return null;
}

function validateSameOwner(document, owner, references, path) {
  for (const ref of references.filter(Boolean)) {
    const targetOwner = entityArtboardId(document, ref);
    if (targetOwner && targetOwner !== owner) {
      throw new TypeError(`${path} crosses artboards: owner ${owner}, target ${ref.kind}:${ref.id} belongs to ${targetOwner}.`);
    }
  }
}

function validateComponentCycles(document) {
  const bySourceArtboard = new Map((document.components || []).map((component) => [component.source.id, component]));
  const outgoing = new Map();
  for (const component of document.components || []) {
    const list = [];
    for (const instance of document.componentInstances || []) {
      if (instance.artboard.id !== component.source.id) continue;
      list.push(instance.component.id);
    }
    outgoing.set(component.id, [...new Set(list)].sort());
  }
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (componentId, depth) => {
    if (depth > VEYRA_COMPONENT_MAX_DEPTH) {
      throw new TypeError(`Component nesting exceeds depth ${VEYRA_COMPONENT_MAX_DEPTH}: ${[...stack, componentId].join(' -> ')}.`);
    }
    if (visiting.has(componentId)) {
      const index = stack.indexOf(componentId);
      const cycle = [...stack.slice(index), componentId];
      throw new TypeError(`Component cycle detected: ${cycle.join(' -> ')}.`);
    }
    if (visited.has(componentId)) return;
    visiting.add(componentId);
    stack.push(componentId);
    for (const next of outgoing.get(componentId) || []) visit(next, depth + 1);
    stack.pop();
    visiting.delete(componentId);
    visited.add(componentId);
  };
  for (const component of [...(document.components || [])].sort((a, b) => a.id.localeCompare(b.id))) visit(component.id, 0);
  void bySourceArtboard;
}

export function validateProjectGraph(document) {
  const artboardIds = new Set(document.artboards.map((item) => item.id));
  const componentIds = new Set();
  const sourceArtboards = new Set();
  for (const component of document.components || []) {
    if (componentIds.has(component.id)) throw new TypeError(`Duplicate component id ${component.id}.`);
    componentIds.add(component.id);
    if (!artboardIds.has(component.source.id)) throw new TypeError(`Component ${component.id} references missing source artboard ${component.source.id}.`);
    if (sourceArtboards.has(component.source.id)) throw new TypeError(`Artboard ${component.source.id} already has a Component identity.`);
    sourceArtboards.add(component.source.id);
  }
  for (const artboard of document.artboards) {
    const source = document.components.find((component) => component.source.id === artboard.id) || null;
    if ((artboard.componentSource?.id || null) !== (source?.id || null)) {
      throw new TypeError(`Artboard ${artboard.id} componentSource does not match the component registry.`);
    }
  }

  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  for (const node of document.nodes) {
    const parentId = referenceId(node.parent, 'node');
    if (parentId) validateSameOwner(document, node.artboard.id, [{ kind: 'node', id: parentId }], `Node ${node.id}`);
  }
  for (const bone of document.bones) {
    const parentId = referenceId(bone.parent, 'bone');
    if (parentId) validateSameOwner(document, bone.artboard.id, [{ kind: 'bone', id: parentId }], `Bone ${bone.id}`);
  }
  for (const mesh of document.meshes) {
    const refs = mesh.vertices.flatMap((vertex) => (vertex.weights || []).map((weight) => weight.bone));
    validateSameOwner(document, mesh.artboard.id, refs, `Mesh ${mesh.id}`);
  }
  for (const constraint of document.constraints) {
    const refs = [constraint.bone, ...(constraint.bones || []), constraint.target, constraint.path].filter(Boolean);
    validateSameOwner(document, constraint.artboard.id, refs, `Constraint ${constraint.id}`);
  }
  for (const timeline of document.timelines) {
    for (const track of timeline.tracks) {
      const match = /^([^:]+):([^/]+)\//.exec(track.address);
      if (!match) continue; // Preserve the verified pre-M6 opaque-address animation contract.
      validateSameOwner(document, timeline.artboard.id, [{ kind: match[1], id: match[2] }], `Timeline ${timeline.id}`);
    }
  }
  for (const machine of document.stateMachines) {
    validateSameOwner(document, machine.artboard.id, machine.states.map((state) => state.timeline), `State machine ${machine.id}`);
  }
  for (const listener of document.listeners) {
    validateSameOwner(document, listener.artboard.id, [listener.target, listener.timeline, listener.machine].filter(Boolean), `Listener ${listener.id}`);
  }

  const instanceIds = new Set();
  for (const instance of document.componentInstances || []) {
    if (instanceIds.has(instance.id)) throw new TypeError(`Duplicate componentInstance id ${instance.id}.`);
    instanceIds.add(instance.id);
    if (!artboardIds.has(instance.artboard.id)) throw new TypeError(`Component instance ${instance.id} references missing owning artboard ${instance.artboard.id}.`);
    const component = componentById(document, instance.component.id);
    if (!component) throw new TypeError(`Component instance ${instance.id} references missing component ${instance.component.id}.`);
    const parent = instance.parent ? nodeById.get(instance.parent.id) : null;
    if (instance.parent && (!parent || parent.artboard.id !== instance.artboard.id)) {
      throw new TypeError(`Component instance ${instance.id}.parent must be a node on owning artboard ${instance.artboard.id}.`);
    }
    const sourceOwner = component.source.id;
    const overrideIds = new Set();
    for (const override of instance.overrides) {
      if (overrideIds.has(override.id)) throw new TypeError(`Component instance ${instance.id} has duplicate override id ${override.id}.`);
      overrideIds.add(override.id);
      const owner = entityArtboardId(document, override.target);
      if (owner !== sourceOwner) {
        throw new TypeError(`Component instance ${instance.id} override ${override.id} targets ${override.target.kind}:${override.target.id} outside source artboard ${sourceOwner}.`);
      }
    }
    if (instance.runtime.remap.timeline && !instance.runtime.timeline) {
      throw new TypeError(`Component instance ${instance.id} runtime.remap.timeline requires runtime.timeline selection.`);
    }
    if (instance.runtime.remap.stateMachine && !instance.runtime.stateMachine) {
      throw new TypeError(`Component instance ${instance.id} runtime.remap.stateMachine requires runtime.stateMachine selection.`);
    }
    for (const ref of [instance.runtime.timeline, instance.runtime.stateMachine, instance.runtime.remap.timeline, instance.runtime.remap.stateMachine].filter(Boolean)) {
      if (entityArtboardId(document, ref) !== sourceOwner) {
        throw new TypeError(`Component instance ${instance.id} runtime ref ${ref.kind}:${ref.id} is outside source artboard ${sourceOwner}.`);
      }
    }
  }
  validateComponentCycles(document);
  return document;
}

export function normalizeProjectDocument(rawInput, baseDocument) {
  const artboards = normalizeArtboards(rawInput, baseDocument);
  const artboardIds = new Set(artboards.map((item) => item.id));
  const defaultRef = artboards.length === 1 ? createArtboardRef(artboards[0].id) : null;

  const nodes = assignOwner(baseDocument.nodes, rawInput.nodes, artboards, 'nodes');
  const nodeOwner = new Map(nodes.map((node) => [node.id, node.artboard]));
  const inferNodeOwner = (ref) => nodeOwner.get(referenceId(ref, 'node')) || null;
  const bones = assignOwner(baseDocument.bones, rawInput.bones, artboards, 'bones');
  const meshes = assignOwner(baseDocument.meshes, rawInput.meshes, artboards, 'meshes');
  const controls = assignOwner(baseDocument.controls, rawInput.controls, artboards, 'controls');
  const constraints = assignOwner(baseDocument.constraints, rawInput.constraints, artboards, 'constraints');
  const timelines = assignOwner(baseDocument.timelines, rawInput.timelines, artboards, 'timelines');
  const machines = assignOwner(baseDocument.stateMachines, rawInput.stateMachines, artboards, 'stateMachines');
  const listeners = assignOwner(baseDocument.listeners, rawInput.listeners, artboards, 'listeners', (listener) => inferNodeOwner(listener.target));

  const rawComponents = Array.isArray(rawInput.components) ? rawInput.components : [];
  const components = rawComponents.map((item, index) => {
    const id = String(item?.id || '');
    if (!id) throw new TypeError(`components[${index}].id is required.`);
    const component = createComponent({ ...item, id });
    if (!artboardIds.has(component.source.id)) throw new TypeError(`components[${index}].source references missing artboard ${component.source.id}.`);
    return component;
  });
  const componentIds = new Set(components.map((item) => item.id));

  const rawInstances = Array.isArray(rawInput.componentInstances) ? rawInput.componentInstances : [];
  const componentInstances = rawInstances.map((item, index) => {
    const id = String(item?.id || '');
    if (!id) throw new TypeError(`componentInstances[${index}].id is required.`);
    const sourceComponent = components.find((component) => component.id === referenceId(item.component ?? item.componentId, 'component'));
    if (!sourceComponent && !componentIds.has(referenceId(item.component, 'component'))) {
      throw new TypeError(`componentInstances[${index}].component references missing component.`);
    }
    const sourceArtboard = sourceComponent ? artboards.find((artboard) => artboard.id === sourceComponent.source.id) : null;
    const artboard = item.artboard || defaultRef;
    if (!artboard) throw new TypeError(`componentInstances[${index}].artboard is required in multi-artboard projects.`);
    return createComponentInstance({
      ...item,
      id,
      artboard,
      frame: item.frame || (sourceArtboard ? { width: sourceArtboard.width, height: sourceArtboard.height } : undefined),
    });
  });

  const componentBySource = new Map(components.map((component) => [component.source.id, component]));
  const normalizedArtboards = artboards.map((artboard) => ({
    ...artboard,
    componentSource: componentBySource.has(artboard.id) ? createComponentRef(componentBySource.get(artboard.id).id) : null,
  }));

  const document = {
    ...baseDocument,
    version: VEYRA_PROJECT_VERSION,
    artboards: normalizedArtboards,
    nodes,
    bones,
    meshes,
    controls,
    constraints,
    timelines,
    stateMachines: machines,
    listeners,
    components,
    componentInstances,
  };
  // Compatibility alias only. Canonical serialization removes this field.
  // It points at the same object as artboards[0], so verified M5 single-artboard
  // gesture code continues to mutate the canonical frame during migration.
  document.artboard = document.artboards[0];
  return validateProjectGraph(document);
}

function remapReference(ref, idMap) {
  if (!ref?.kind || !ref?.id) return ref;
  const nextId = idMap.get(`${ref.kind}:${ref.id}`);
  return nextId ? { kind: ref.kind, id: nextId } : cloneValue(ref);
}

function remapAddress(address, idMap) {
  const match = /^([^:]+):([^/]+)\/(.+)$/.exec(String(address || ''));
  if (!match) return address;
  const mapped = idMap.get(`${match[1]}:${match[2]}`);
  return mapped ? `${match[1]}:${mapped}/${match[3]}` : address;
}

function deepRemap(value, idMap) {
  if (Array.isArray(value)) return value.map((item) => deepRemap(item, idMap));
  if (!value || typeof value !== 'object') return value;
  if (typeof value.kind === 'string' && typeof value.id === 'string') return remapReference(value, idMap);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = key === 'address' && typeof item === 'string' ? remapAddress(item, idMap) : deepRemap(item, idMap);
  }
  return output;
}

function idsForScopedEntity(document, artboardId) {
  const entries = [];
  const push = (kind, id, prefix = kind) => entries.push({ kind, id, prefix });
  for (const node of document.nodes.filter((item) => item.artboard.id === artboardId)) {
    push('node', node.id, node.type || 'node');
    if (node.type === 'path') for (const vertex of node.geometry.vertices) push('pathVertex', vertex.id, 'pathVertex');
    for (const stop of node.paint?.fill?.stops || []) push('gradientStop', stop.id, 'gradientStop');
  }
  for (const bone of document.bones.filter((item) => item.artboard.id === artboardId)) push('bone', bone.id);
  for (const mesh of document.meshes.filter((item) => item.artboard.id === artboardId)) {
    push('mesh', mesh.id);
    for (const vertex of mesh.vertices) push('meshVertex', vertex.id);
    for (const stop of mesh.paint?.fill?.stops || []) push('gradientStop', stop.id, 'gradientStop');
  }
  for (const control of document.controls.filter((item) => item.artboard.id === artboardId)) push('control', control.id);
  for (const constraint of document.constraints.filter((item) => item.artboard.id === artboardId)) push('constraint', constraint.id);
  for (const timeline of document.timelines.filter((item) => item.artboard.id === artboardId)) {
    push('timeline', timeline.id);
    for (const track of timeline.tracks) {
      push('track', track.id);
      for (const keyframe of track.keyframes) push('keyframe', keyframe.id);
    }
  }
  for (const machine of document.stateMachines.filter((item) => item.artboard.id === artboardId)) {
    push('stateMachine', machine.id, 'machine');
    for (const input of machine.inputs) push('machineInput', input.id);
    for (const state of machine.states) push('machineState', state.id);
    for (const transition of machine.transitions) {
      push('machineTransition', transition.id);
      for (const condition of transition.conditions) push('machineCondition', condition.id);
    }
  }
  for (const listener of document.listeners.filter((item) => item.artboard.id === artboardId)) push('listener', listener.id);
  for (const instance of document.componentInstances.filter((item) => item.artboard.id === artboardId)) {
    push('componentInstance', instance.id);
    for (const override of instance.overrides) push('componentOverride', override.id);
  }
  for (const semantic of document.semantics) {
    if (entityArtboardId(document, semantic.target) === artboardId) push('semanticRecord', semantic.id, 'semantic');
  }
  return entries;
}

export function duplicateArtboardIntoDocument(document, sourceArtboardId, options = {}) {
  const source = artboardById(document, sourceArtboardId);
  if (!source) throw new TypeError(`Unknown artboard ${sourceArtboardId}.`);
  const seed = String(options.seed || options.id || `${sourceArtboardId}:duplicate`);
  const targetId = String(options.id || deterministicProjectId('artboard', seed, sourceArtboardId));
  if (artboardById(document, targetId)) throw new TypeError(`Artboard id ${targetId} already exists.`);
  const offsetX = Number(options.offsetX ?? 40);
  const offsetY = Number(options.offsetY ?? 40);
  const duplicate = {
    ...cloneValue(source),
    id: targetId,
    name: String(options.name ?? `${source.name} Copy`),
    x: source.x + offsetX,
    y: source.y + offsetY,
    componentSource: null,
  };
  const idMap = new Map();
  idMap.set(`artboard:${source.id}`, targetId);
  for (const entry of idsForScopedEntity(document, sourceArtboardId)) {
    idMap.set(`${entry.kind}:${entry.id}`, deterministicProjectId(entry.prefix, seed, `${entry.kind}:${entry.id}`));
  }

  const rewriteNestedIds = (kind, source, copy) => {
    const mapped = (childKind, id) => idMap.get(`${childKind}:${id}`) || id;
    const rewriteStops = (sourcePaint, copyPaint) => {
      for (let index = 0; index < (sourcePaint?.fill?.stops || []).length; index += 1) {
        copyPaint.fill.stops[index].id = mapped('gradientStop', sourcePaint.fill.stops[index].id);
      }
    };
    if (kind === 'node') {
      if (source.type === 'path') source.geometry.vertices.forEach((vertex, index) => { copy.geometry.vertices[index].id = mapped('pathVertex', vertex.id); });
      rewriteStops(source.paint, copy.paint);
    } else if (kind === 'mesh') {
      source.vertices.forEach((vertex, index) => { copy.vertices[index].id = mapped('meshVertex', vertex.id); });
      rewriteStops(source.paint, copy.paint);
    } else if (kind === 'timeline') {
      source.tracks.forEach((track, trackIndex) => {
        copy.tracks[trackIndex].id = mapped('track', track.id);
        track.keyframes.forEach((keyframe, keyframeIndex) => { copy.tracks[trackIndex].keyframes[keyframeIndex].id = mapped('keyframe', keyframe.id); });
      });
    } else if (kind === 'stateMachine') {
      source.inputs.forEach((item, index) => { copy.inputs[index].id = mapped('machineInput', item.id); });
      source.states.forEach((item, index) => { copy.states[index].id = mapped('machineState', item.id); });
      source.transitions.forEach((item, index) => {
        copy.transitions[index].id = mapped('machineTransition', item.id);
        item.conditions.forEach((condition, conditionIndex) => { copy.transitions[index].conditions[conditionIndex].id = mapped('machineCondition', condition.id); });
      });
    } else if (kind === 'componentInstance') {
      source.overrides.forEach((item, index) => { copy.overrides[index].id = mapped('componentOverride', item.id); });
    }
  };

  const duplicateCollection = (kind, key) => {
    const copies = [];
    for (const item of document[key].filter((entry) => entry.artboard?.id === sourceArtboardId)) {
      const copy = deepRemap(cloneValue(item), idMap);
      copy.id = idMap.get(`${kind}:${item.id}`);
      copy.artboard = createArtboardRef(targetId);
      rewriteNestedIds(kind, item, copy);
      copies.push(copy);
    }
    document[key].push(...copies);
  };
  duplicateCollection('node', 'nodes');
  duplicateCollection('bone', 'bones');
  duplicateCollection('mesh', 'meshes');
  duplicateCollection('control', 'controls');
  duplicateCollection('constraint', 'constraints');
  duplicateCollection('timeline', 'timelines');
  duplicateCollection('stateMachine', 'stateMachines');
  duplicateCollection('listener', 'listeners');
  duplicateCollection('componentInstance', 'componentInstances');

  const semanticCopies = [];
  for (const semantic of document.semantics) {
    if (entityArtboardId(document, semantic.target) !== sourceArtboardId) continue;
    const copy = deepRemap(cloneValue(semantic), idMap);
    copy.id = idMap.get(`semanticRecord:${semantic.id}`);
    if (copy.provenance?.source === 'ai') copy.status = 'stale';
    semanticCopies.push(copy);
  }
  document.semantics.push(...semanticCopies);
  document.artboards.push(duplicate);
  document.artboard = document.artboards[0];
  return { artboardId: targetId, idMap: Object.fromEntries([...idMap.entries()].sort()) };
}

export function projectGraphCapabilities() {
  return {
    version: VEYRA_PROJECT_VERSION,
    fit: [...VEYRA_COMPONENT_FIT_MODES],
    alignX: [...VEYRA_COMPONENT_ALIGN_X],
    alignY: [...VEYRA_COMPONENT_ALIGN_Y],
    nestedComponents: true,
    maxComponentDepth: VEYRA_COMPONENT_MAX_DEPTH,
    clipping: 'none-only',
    overrideTargets: ['node', 'bone', 'mesh', 'control', 'constraint'],
    runtimeIsolation: {
      authoredTopLevel: 'per-component-instance',
      evaluatedNested: 'per-component-runtime-scope',
      scope: { kind: 'componentRuntimeScope', pathItemKind: 'componentInstance', persistent: false },
    },
    runtimeMapping: {
      timelineSelection: 'authored selected source timeline; default runtime time is 0 seconds',
      stateMachineSelection: 'authored selected source machine; default runtime state is its initial state',
      remap: 'selected controller id remains the runtime slot; remap selects the source timeline/stateMachine actually evaluated',
      mix: {
        range: [0, 1],
        numeric: 'linear authored-to-runtime interpolation',
        discrete: 'authored below 0.5; runtime at or above 0.5',
      },
    },
    componentEvaluatedContent: ['nodes', 'bones', 'weightedMeshes', 'controls', 'constraints'],
  };
}
