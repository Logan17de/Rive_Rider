import { cloneValue, normalizeDocument } from './model.js';
import { evaluateDocument } from './evaluation.js';
import { localBounds } from './geometry.js';
import { transformPoint } from './contracts.js';
import { nodeCapabilities, rigCapabilities } from './capabilities.js';
import { parsePropertyAddress } from './properties.js';
import {
  createPaintRef,
  createReference,
  referenceId,
  referencesEqual,
} from './references.js';
import { dataIndexEntitySpecs, dataIndexRelationshipSpecs } from './dataGraph.js';

export const VEYRA_RESOLVER_CAPABILITIES = Object.freeze({
  functions: Object.freeze(['buildSemanticIndex', 'queryEntities', 'resolveSemantic']),
  outcomes: Object.freeze(['resolved', 'ambiguous', 'notFound']),
  displayNamePolicy: 'ignored-by-default',
  deterministic: true,
  readOnly: true,
  evidenceRequired: true,
});

// Public and testable scoring contract. Display names have no entry in the
// automatic semantic path; displayNameHint is used only when explicitly asked.
export const VEYRA_RESOLVER_SCORING = Object.freeze({
  confirmedAlias: 90,
  confirmedRole: 85,
  confirmedRelation: 75,
  inferredAlias: 60,
  inferredRole: 55,
  inferredRelation: 45,
  confirmedTag: 30,
  inferredTag: 20,
  structuralRelation: 35,
  styleSimilarity: 12,
  relatedEntity: 25,
  spatialStructure: 30,
  displayNameHint: 40,
  entityType: 10,
  capability: 8,
  exactRef: 100,
});

const DEFAULT_INDEX_LIMIT = 500;
const DEFAULT_QUERY_LIMIT = 100;
const DEFAULT_ALTERNATIVE_LIMIT = 5;
const DEFAULT_MIN_CONFIDENCE = 0.25;
const DEFAULT_AMBIGUITY_MARGIN = 0.05;
const MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY = 16;

function refKey(ref) {
  return `${ref.kind}:${ref.id}`;
}

function compareRefs(left, right) {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function boundedUnit(value, fallback, path) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${path} must be a finite number between 0 and 1.`);
  }
  return value;
}

function normalizedToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function stringArray(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(normalizedToken).filter(Boolean);
}

function typedRef(value, path = 'reference') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a { kind, id } typed reference.`);
  }
  if (typeof value.kind !== 'string' || !value.kind || typeof value.id !== 'string' || !value.id) {
    throw new TypeError(`${path} must contain non-empty kind and id strings.`);
  }
  return { kind: value.kind, id: value.id };
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return Object.is(value, -0) ? 0 : value;
}

function stableString(value) {
  return JSON.stringify(stableObject(value));
}

function paintStyleDescriptor(paint = {}) {
  const fill = paint?.fill || {};
  const fillDescriptor = Object.fromEntries(
    Object.entries(fill)
      .filter(([key]) => key !== 'stops')
      .map(([key, value]) => [key, cloneValue(value)]),
  );
  if (Array.isArray(fill.stops)) {
    fillDescriptor.stops = fill.stops.map((stop) => ({
      offset: Number(stop.offset),
      color: String(stop.color || '').toLowerCase(),
      opacity: Number(stop.opacity),
    })).sort((left, right) => left.offset - right.offset || stableString(left).localeCompare(stableString(right)));
  }
  const properties = stableObject({
    fill: fillDescriptor,
    stroke: String(paint?.stroke ?? '').toLowerCase(),
    strokeWidth: Number.isFinite(Number(paint?.strokeWidth)) ? Number(paint.strokeWidth) : 0,
  });
  return { fingerprint: stableString(properties), properties };
}

function flattenCapabilities(value, prefix = '', output = new Set()) {
  if (Array.isArray(value)) {
    if (prefix) output.add(prefix);
    for (const item of value) {
      if (typeof item === 'string') output.add(prefix ? `${prefix}:${item}` : item);
      else flattenCapabilities(item, prefix, output);
    }
    return output;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flattenCapabilities(item, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  if (value === true && prefix) output.add(prefix);
  return output;
}

function baseCapabilityTokens(kind, object) {
  const output = new Set(['read', 'stable-ref']);
  if (kind !== 'semanticRecord') output.add('semantic-target');
  if (kind === 'node') flattenCapabilities(nodeCapabilities(object), '', output);
  if (['bone', 'mesh', 'control', 'constraint'].includes(kind)) {
    flattenCapabilities(rigCapabilities(kind, object), '', output);
  }
  if (kind === 'timeline') output.add('animation-timeline');
  if (kind === 'track') output.add('animation-track');
  if (kind === 'keyframe') output.add('animation-keyframe');
  if (kind === 'stateMachine') output.add('state-machine');
  if (kind.startsWith('machine')) output.add('state-machine-member');
  if (kind === 'artboard') output.add('project-artboard');
  if (kind === 'component') output.add('component-source');
  if (kind === 'componentInstance') output.add('component-instance');
  if (kind === 'componentOverride') output.add('component-override');
  if (kind === 'listener') output.add('interaction-listener');
  if (kind === 'asset') output.add('asset');
  if (kind === 'paint' || kind === 'gradientStop') output.add('paint');
  if (kind === 'pathVertex' || kind === 'meshVertex') output.add('geometry-subentity');
  return [...output].sort();
}

function boundsFromPoints(points) {
  const valid = (points || []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!valid.length) return null;
  const minX = Math.min(...valid.map((point) => point.x));
  const minY = Math.min(...valid.map((point) => point.y));
  const maxX = Math.max(...valid.map((point) => point.x));
  const maxY = Math.max(...valid.map((point) => point.y));
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function worldBoundsForNode(node) {
  const bounds = localBounds(node);
  if (!bounds) return null;
  return boundsFromPoints([
    transformPoint(node.worldMatrix, { x: bounds.minX, y: bounds.minY }),
    transformPoint(node.worldMatrix, { x: bounds.minX, y: bounds.maxY }),
    transformPoint(node.worldMatrix, { x: bounds.maxX, y: bounds.minY }),
    transformPoint(node.worldMatrix, { x: bounds.maxX, y: bounds.maxY }),
  ]);
}

function semanticSnapshot(record) {
  return {
    id: record.id,
    namespace: record.namespace,
    canonicalRole: record.canonicalRole,
    description: record.description,
    tags: [...record.tags],
    aliases: cloneValue(record.aliases),
    relations: cloneValue(record.relations),
    provenance: cloneValue(record.provenance),
    status: record.status,
  };
}

function makeEntity(ref, object, { type = '', displayName = '', geometry = null, capabilities = null } = {}) {
  return {
    ref: cloneValue(ref),
    kind: ref.kind,
    type: String(type || ''),
    displayName: { value: String(displayName || ''), authoritative: false },
    capabilities: capabilities ? [...capabilities].sort() : baseCapabilityTokens(ref.kind, object),
    semantics: [],
    relationships: [],
    ...(geometry ? { geometry: cloneValue(geometry) } : {}),
  };
}

function relationshipKey(item) {
  return `${item.relation}\u0000${refKey(item.target)}\u0000${stableString(item.detail || null)}\u0000${item.source || ''}`;
}

function addRelationship(entity, relation, target, detail = undefined, source = 'structural') {
  if (!entity || !target) return;
  const next = { relation, target: cloneValue(target), source };
  if (detail !== undefined) next.detail = cloneValue(detail);
  const key = relationshipKey(next);
  if (!entity.__relationshipKeys) Object.defineProperty(entity, '__relationshipKeys', { value: new Set(), enumerable: false });
  if (entity.__relationshipKeys.has(key)) return;
  entity.__relationshipKeys.add(key);
  entity.relationships.push(next);
}

function link(byKey, from, relation, to, reverseRelation = null, detail = undefined, source = 'structural') {
  const left = byKey.get(refKey(from));
  const right = byKey.get(refKey(to));
  addRelationship(left, relation, to, detail, source);
  if (reverseRelation) addRelationship(right, reverseRelation, from, detail, source);
}

function ownerCenterFor(entity, byKey, document) {
  const ownerRel = entity.relationships.find((item) => ['parent', 'owner'].includes(item.relation));
  const owner = ownerRel ? byKey.get(refKey(ownerRel.target)) : null;
  if (owner?.geometry?.worldBounds?.center) return owner.geometry.worldBounds.center;
  const artboard = document.artboards?.[0] || document.artboard;
  return { x: artboard.x + artboard.width / 2, y: artboard.y + artboard.height / 2 };
}

function applySpatialDescriptors(entities, byKey, document) {
  for (const entity of entities) {
    const bounds = entity.geometry?.worldBounds;
    if (!bounds?.center) continue;
    const ownerCenter = ownerCenterFor(entity, byKey, document);
    const dx = bounds.center.x - ownerCenter.x;
    const dy = bounds.center.y - ownerCenter.y;
    const epsilonX = Math.max(1, bounds.width * 0.05);
    const epsilonY = Math.max(1, bounds.height * 0.05);
    entity.spatial = {
      horizontal: dx < -epsilonX ? 'left' : dx > epsilonX ? 'right' : 'center',
      vertical: dy < -epsilonY ? 'top' : dy > epsilonY ? 'bottom' : 'center',
      center: cloneValue(bounds.center),
    };
  }
}

function applyMirroredPairs(entities, byKey, document) {
  const nodeEntities = entities.filter((entity) => entity.kind === 'node' && entity.geometry?.worldBounds);
  const groups = new Map();
  for (const entity of nodeEntities) {
    const parent = entity.relationships.find((item) => item.relation === 'parent')?.target || null;
    const key = parent ? refKey(parent) : '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entity);
  }
  for (const [ownerKey, siblings] of groups) {
    const owner = ownerKey === '__root__' ? null : byKey.get(ownerKey);
    const artboard = document.artboards?.[0] || document.artboard;
    const axis = owner?.geometry?.worldBounds?.center?.x ?? (artboard.x + artboard.width / 2);
    for (const left of siblings) {
      const lb = left.geometry.worldBounds;
      const matches = siblings.filter((right) => {
        if (right === left || right.type !== left.type) return false;
        const rb = right.geometry.worldBounds;
        const scale = Math.max(1, lb.width, lb.height, rb.width, rb.height);
        const symmetricX = Math.abs(((lb.center.x + rb.center.x) / 2) - axis) <= scale * 0.03;
        const alignedY = Math.abs(lb.center.y - rb.center.y) <= scale * 0.05;
        const sameSize = Math.abs(lb.width - rb.width) <= scale * 0.05
          && Math.abs(lb.height - rb.height) <= scale * 0.05;
        return symmetricX && alignedY && sameSize;
      });
      if (matches.length === 1) addRelationship(left, 'mirrored_pair', matches[0].ref, { axisX: axis }, 'structural');
    }
  }
}

function applyStyleSimilarity(entities, byKey) {
  const groups = new Map();
  for (const entity of entities) {
    if (!['node', 'mesh'].includes(entity.kind) || !entity.style?.fingerprint) continue;
    if (!groups.has(entity.style.fingerprint)) groups.set(entity.style.fingerprint, []);
    groups.get(entity.style.fingerprint).push(entity);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => compareRefs(left.ref, right.ref));
    if (group.length < 2) continue;
    const detail = { fingerprint: group[0].style.fingerprint, basis: 'normalized-paint' };
    if (group.length <= MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY + 1) {
      for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
          link(byKey, group[leftIndex].ref, 'style_similar', group[rightIndex].ref, 'style_similar', detail, 'style');
        }
      }
      continue;
    }
    const half = Math.floor(MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY / 2);
    for (let index = 0; index < group.length; index += 1) {
      for (let offset = 1; offset <= half; offset += 1) {
        const target = group[(index + offset) % group.length];
        link(byKey, group[index].ref, 'style_similar', target.ref, 'style_similar', detail, 'style');
      }
    }
  }
}

function buildIndexData(input) {
  const document = normalizeDocument(input);
  const evaluatedScenes = document.artboards.map((artboard) => evaluateDocument(document, {}, null, { artboardId: artboard.id }));
  const evaluated = {
    nodes: evaluatedScenes.flatMap((scene) => scene.nodes.filter((node) => !node.componentInstanceRef)),
    bones: evaluatedScenes.flatMap((scene) => scene.bones || []),
    meshes: evaluatedScenes.flatMap((scene) => scene.meshes || []),
  };
  const entities = [];
  const byKey = new Map();
  const add = (entity) => {
    const key = refKey(entity.ref);
    if (byKey.has(key)) throw new TypeError(`Duplicate indexed reference ${key}.`);
    byKey.set(key, entity);
    entities.push(entity);
    return entity;
  };

  const projectBounds = {
    minX: Math.min(...document.artboards.map((item) => item.x)),
    minY: Math.min(...document.artboards.map((item) => item.y)),
    maxX: Math.max(...document.artboards.map((item) => item.x + item.width)),
    maxY: Math.max(...document.artboards.map((item) => item.y + item.height)),
  };
  projectBounds.width = projectBounds.maxX - projectBounds.minX;
  projectBounds.height = projectBounds.maxY - projectBounds.minY;
  projectBounds.center = { x: (projectBounds.minX + projectBounds.maxX) / 2, y: (projectBounds.minY + projectBounds.maxY) / 2 };
  add(makeEntity(createReference('document', document.id), document, {
    type: 'document', displayName: document.name, geometry: { worldBounds: projectBounds },
  }));
  for (const artboard of document.artboards) add(makeEntity(createReference('artboard', artboard.id), artboard, {
    type: 'artboard', displayName: artboard.name,
    geometry: { worldBounds: { minX: artboard.x, minY: artboard.y, maxX: artboard.x + artboard.width, maxY: artboard.y + artboard.height, width: artboard.width, height: artboard.height, center: { x: artboard.x + artboard.width / 2, y: artboard.y + artboard.height / 2 } } },
  }));
  for (const component of document.components || []) add(makeEntity(createReference('component', component.id), component, { type: 'component', displayName: component.name }));
  for (const instance of document.componentInstances || []) {
    add(makeEntity(createReference('componentInstance', instance.id), instance, { type: 'componentInstance', displayName: instance.name }));
    for (const override of instance.overrides || []) add(makeEntity(createReference('componentOverride', override.id), override, { type: 'componentOverride' }));
  }

  const evaluatedNodes = new Map(evaluated.nodes.map((node) => [node.id, node]));
  for (const node of document.nodes) {
    const evaluatedNode = evaluatedNodes.get(node.id);
    const nodeRef = createReference('node', node.id);
    const nodeEntity = add(makeEntity(nodeRef, node, {
      type: node.type,
      displayName: node.name,
      geometry: evaluatedNode ? { localBounds: localBounds(evaluatedNode), worldBounds: worldBoundsForNode(evaluatedNode) } : null,
    }));
    const paintRef = createPaintRef('node', node.id);
    const paintEntity = add(makeEntity(paintRef, node.paint, { type: node.paint.fill?.type || 'paint' }));
    if (node.type !== 'group') {
      const style = paintStyleDescriptor(node.paint);
      nodeEntity.style = cloneValue(style);
      paintEntity.style = cloneValue(style);
    }
    if (node.type === 'path') {
      for (const vertex of node.geometry.vertices || []) {
        const point = evaluatedNode ? transformPoint(evaluatedNode.worldMatrix, { x: vertex.x, y: vertex.y }) : { x: vertex.x, y: vertex.y };
        add(makeEntity(createReference('pathVertex', vertex.id), vertex, {
          type: 'pathVertex', geometry: { worldBounds: boundsFromPoints([point]) },
        }));
      }
    }
    for (const stop of node.paint?.fill?.stops || []) add(makeEntity(createReference('gradientStop', stop.id), stop, { type: 'gradientStop' }));
  }

  for (const asset of document.assets) add(makeEntity(createReference('asset', asset.id), asset, { type: asset.type, displayName: asset.name }));

  const evaluatedBones = new Map((evaluated.bones || []).map((bone) => [bone.id, bone]));
  for (const bone of document.bones) {
    const state = evaluatedBones.get(bone.id);
    add(makeEntity(createReference('bone', bone.id), bone, {
      type: 'bone', displayName: bone.name,
      geometry: state ? { worldBounds: boundsFromPoints([state.start, state.end]) } : null,
    }));
  }

  const evaluatedMeshes = new Map((evaluated.meshes || []).map((mesh) => [mesh.id, mesh]));
  for (const mesh of document.meshes) {
    const state = evaluatedMeshes.get(mesh.id);
    const meshEntity = add(makeEntity(createReference('mesh', mesh.id), mesh, {
      type: 'mesh', displayName: mesh.name,
      geometry: state ? { worldBounds: boundsFromPoints(state.deformedVertices || []) } : null,
    }));
    const meshPaintEntity = add(makeEntity(createPaintRef('mesh', mesh.id), mesh.paint, { type: mesh.paint.fill?.type || 'paint' }));
    const style = paintStyleDescriptor(mesh.paint);
    meshEntity.style = cloneValue(style);
    meshPaintEntity.style = cloneValue(style);
    const stateVertices = new Map((state?.deformedVertices || []).map((vertex) => [vertex.id, vertex]));
    for (const vertex of mesh.vertices || []) {
      const point = stateVertices.get(vertex.id) || vertex;
      add(makeEntity(createReference('meshVertex', vertex.id), vertex, {
        type: 'meshVertex', geometry: { worldBounds: boundsFromPoints([point]) },
      }));
    }
    for (const stop of mesh.paint?.fill?.stops || []) add(makeEntity(createReference('gradientStop', stop.id), stop, { type: 'gradientStop' }));
  }

  for (const control of document.controls) {
    add(makeEntity(createReference('control', control.id), control, {
      type: control.kind || 'control', displayName: control.name,
      geometry: { worldBounds: boundsFromPoints([control.position]) },
    }));
  }
  for (const constraint of document.constraints) add(makeEntity(createReference('constraint', constraint.id), constraint, { type: constraint.type, displayName: constraint.name }));

  for (const timeline of document.timelines) {
    const timelineRef = createReference('timeline', timeline.id);
    add(makeEntity(timelineRef, timeline, { type: 'timeline', displayName: timeline.name }));
    for (const track of timeline.tracks || []) {
      const trackRef = createReference('track', track.id);
      add(makeEntity(trackRef, track, { type: 'track' }));
      for (const keyframe of track.keyframes || []) add(makeEntity(createReference('keyframe', keyframe.id), keyframe, { type: 'keyframe' }));
    }
  }

  for (const machine of document.stateMachines || []) {
    const machineRef = createReference('stateMachine', machine.id);
    add(makeEntity(machineRef, machine, { type: 'stateMachine', displayName: machine.name }));
    for (const input of machine.inputs || []) add(makeEntity(createReference('machineInput', input.id), input, { type: input.type, displayName: input.name }));
    for (const state of machine.states || []) add(makeEntity(createReference('machineState', state.id), state, { type: state.type, displayName: state.name }));
    for (const transition of machine.transitions || []) {
      add(makeEntity(createReference('machineTransition', transition.id), transition, { type: 'machineTransition' }));
      for (const condition of transition.conditions || []) add(makeEntity(createReference('machineCondition', condition.id), condition, { type: condition.op }));
    }
  }

  for (const listener of document.listeners || []) add(makeEntity(createReference('listener', listener.id), listener, { type: listener.kind, displayName: listener.name || '' }));
  for (const spec of dataIndexEntitySpecs(document)) add(makeEntity(spec.ref, spec.object, { type: spec.type, displayName: spec.displayName, capabilities: spec.capabilities }));
  for (const record of document.semantics || []) add(makeEntity(createReference('semanticRecord', record.id), record, { type: 'semanticRecord' }));

  const documentRef = createReference('document', document.id);
  for (const relation of dataIndexRelationshipSpecs(document)) link(byKey, relation.from, relation.relation, relation.to, relation.reverse, relation.detail, relation.source);
  for (const artboard of document.artboards) link(byKey, createReference('artboard', artboard.id), 'owner', documentRef, 'owns');
  for (const component of document.components || []) {
    const componentRef = createReference('component', component.id);
    link(byKey, componentRef, 'owner', documentRef, 'owns');
    link(byKey, componentRef, 'source_artboard', component.source, 'component_source');
  }
  for (const instance of document.componentInstances || []) {
    const instanceRef = createReference('componentInstance', instance.id);
    link(byKey, instanceRef, 'owner', instance.artboard, 'owns');
    link(byKey, instanceRef, 'instance_of', instance.component, 'instantiated_by');
    if (instance.parent) link(byKey, instanceRef, 'parent', instance.parent, 'child_instance');
    for (const override of instance.overrides || []) {
      const overrideRef = createReference('componentOverride', override.id);
      link(byKey, overrideRef, 'owner', instanceRef, 'override');
      link(byKey, overrideRef, 'override_target', override.target, 'overridden_by_instance', { address: override.address });
    }
    for (const [relation, ref] of [
      ['runtime_timeline', instance.runtime?.timeline], ['runtime_machine', instance.runtime?.stateMachine],
      ['remap_timeline', instance.runtime?.remap?.timeline], ['remap_machine', instance.runtime?.remap?.stateMachine],
    ]) if (ref) link(byKey, instanceRef, relation, ref, 'used_by_component_instance');
  }
  for (const node of document.nodes) {
    const nodeRef = createReference('node', node.id);
    const parentId = referenceId(node.parent, 'node');
    if (parentId) link(byKey, nodeRef, 'parent', createReference('node', parentId), 'child');
    else link(byKey, nodeRef, 'owner', node.artboard, 'owns');
    const paintRef = createPaintRef('node', node.id);
    link(byKey, paintRef, 'owner', nodeRef, 'owns_paint');
    for (const vertex of node.type === 'path' ? node.geometry.vertices || [] : []) link(byKey, createReference('pathVertex', vertex.id), 'owner', nodeRef, 'owns');
    for (const stop of node.paint?.fill?.stops || []) link(byKey, createReference('gradientStop', stop.id), 'owner', paintRef, 'owns_stop');
  }

  for (const asset of document.assets) link(byKey, createReference('asset', asset.id), 'owner', documentRef, 'owns');

  for (const bone of document.bones) {
    const boneRef = createReference('bone', bone.id);
    const parentId = referenceId(bone.parent, 'bone');
    if (parentId) link(byKey, boneRef, 'parent', createReference('bone', parentId), 'child');
    else link(byKey, boneRef, 'owner', bone.artboard, 'owns');
  }

  for (const mesh of document.meshes) {
    const meshRef = createReference('mesh', mesh.id);
    link(byKey, meshRef, 'owner', mesh.artboard, 'owns');
    const paintRef = createPaintRef('mesh', mesh.id);
    link(byKey, paintRef, 'owner', meshRef, 'owns_paint');
    for (const stop of mesh.paint?.fill?.stops || []) link(byKey, createReference('gradientStop', stop.id), 'owner', paintRef, 'owns_stop');
    const influencedBones = new Map();
    for (const vertex of mesh.vertices || []) {
      const vertexRef = createReference('meshVertex', vertex.id);
      link(byKey, vertexRef, 'owner', meshRef, 'owns');
      for (const weight of vertex.weights || []) {
        const boneId = referenceId(weight.bone, 'bone');
        if (!boneId) continue;
        const boneRef = createReference('bone', boneId);
        link(byKey, vertexRef, 'weighted_by', boneRef, 'influences_vertex', { weight: weight.value });
        influencedBones.set(boneId, Math.max(influencedBones.get(boneId) || 0, Number(weight.value) || 0));
      }
    }
    for (const [boneId, weight] of influencedBones) link(byKey, meshRef, 'influenced_by', createReference('bone', boneId), 'influences_mesh', { maxWeight: weight });
  }

  for (const control of document.controls) link(byKey, createReference('control', control.id), 'owner', control.artboard, 'owns');
  for (const constraint of document.constraints) {
    const constraintRef = createReference('constraint', constraint.id);
    link(byKey, constraintRef, 'owner', constraint.artboard, 'owns');
    const refs = [];
    if (constraint.bone) refs.push(['uses_bone', constraint.bone, 'used_by_constraint']);
    for (const bone of constraint.bones || []) refs.push(['uses_bone', bone, 'used_by_constraint']);
    if (constraint.target) refs.push(['targets', constraint.target, 'constraint_target']);
    if (constraint.path) refs.push(['uses_path', constraint.path, 'used_by_constraint']);
    for (const [relation, target, reverse] of refs) {
      if (target?.kind && target?.id) link(byKey, constraintRef, relation, target, reverse);
    }
  }

  for (const timeline of document.timelines) {
    const timelineRef = createReference('timeline', timeline.id);
    link(byKey, timelineRef, 'owner', timeline.artboard, 'owns');
    for (const track of timeline.tracks || []) {
      const trackRef = createReference('track', track.id);
      link(byKey, trackRef, 'owner', timelineRef, 'track');
      try {
        const parsed = parsePropertyAddress(track.address);
        link(byKey, trackRef, 'animates', parsed.reference, 'animated_by', { path: parsed.path, address: track.address });
      } catch {
        // Normalized documents already validate track addresses. Reserved future
        // address families stay unindexed rather than being guessed.
      }
      for (const keyframe of track.keyframes || []) link(byKey, createReference('keyframe', keyframe.id), 'owner', trackRef, 'keyframe', { frame: keyframe.frame });
    }
  }

  for (const machine of document.stateMachines || []) {
    const machineRef = createReference('stateMachine', machine.id);
    link(byKey, machineRef, 'owner', machine.artboard, 'owns');
    for (const input of machine.inputs || []) link(byKey, createReference('machineInput', input.id), 'owner', machineRef, 'input');
    for (const state of machine.states || []) {
      const stateRef = createReference('machineState', state.id);
      link(byKey, stateRef, 'owner', machineRef, 'state');
      const timelineId = referenceId(state.timeline, 'timeline');
      if (timelineId) link(byKey, stateRef, 'uses_timeline', createReference('timeline', timelineId), 'used_by_state');
    }
    for (const transition of machine.transitions || []) {
      const transitionRef = createReference('machineTransition', transition.id);
      link(byKey, transitionRef, 'owner', machineRef, 'transition');
      const from = referenceId(transition.from, 'machineState');
      const to = referenceId(transition.to, 'machineState');
      if (from) link(byKey, transitionRef, 'from_state', createReference('machineState', from), 'outgoing_transition');
      if (to) link(byKey, transitionRef, 'to_state', createReference('machineState', to), 'incoming_transition');
      for (const condition of transition.conditions || []) {
        const conditionRef = createReference('machineCondition', condition.id);
        link(byKey, conditionRef, 'owner', transitionRef, 'condition');
        const inputId = referenceId(condition.input, 'machineInput');
        if (inputId) link(byKey, conditionRef, 'uses_input', createReference('machineInput', inputId), 'used_by_condition');
      }
    }
  }

  for (const listener of document.listeners || []) {
    const listenerRef = createReference('listener', listener.id);
    link(byKey, listenerRef, 'owner', listener.artboard, 'owns');
    if (listener.target?.kind && listener.target?.id) link(byKey, listenerRef, 'targets', listener.target, 'listener_target', { action: listener.action, event: listener.event });
    const timelineId = referenceId(listener.timeline, 'timeline');
    const machineId = referenceId(listener.machine, 'stateMachine');
    const inputId = referenceId(listener.input, 'machineInput');
    if (timelineId) link(byKey, listenerRef, 'uses_timeline', createReference('timeline', timelineId), 'used_by_listener', { action: listener.action });
    if (machineId) link(byKey, listenerRef, 'uses_machine', createReference('stateMachine', machineId), 'used_by_listener', { action: listener.action });
    if (inputId) link(byKey, listenerRef, 'uses_input', createReference('machineInput', inputId), 'used_by_listener', { action: listener.action });
  }

  for (const record of document.semantics || []) {
    const targetEntity = byKey.get(refKey(record.target));
    if (targetEntity) targetEntity.semantics.push(semanticSnapshot(record));
    const semanticRef = createReference('semanticRecord', record.id);
    if (targetEntity) link(byKey, semanticRef, 'describes', record.target, 'described_by_semantic');
    for (const relation of record.relations || []) {
      const semanticDetail = {
        predicate: relation.predicate,
        semanticId: record.id,
        status: record.status,
        source: record.provenance?.source ?? null,
        confidence: record.provenance?.confidence ?? null,
      };
      if (targetEntity && byKey.has(refKey(relation.target))) {
        addRelationship(targetEntity, relation.predicate, relation.target, semanticDetail, 'semantic');
      }
      if (byKey.has(refKey(relation.target))) {
        addRelationship(byKey.get(refKey(relation.target)), 'semantic_relation_from', record.target, semanticDetail, 'semantic');
      }
    }
  }

  applySpatialDescriptors(entities, byKey, document);
  applyMirroredPairs(entities, byKey, document);
  applyStyleSimilarity(entities, byKey);

  for (const entity of entities) {
    entity.semantics.sort((left, right) => left.id.localeCompare(right.id));
    entity.relationships.sort((left, right) => left.relation.localeCompare(right.relation)
      || compareRefs(left.target, right.target)
      || stableString(left.detail || null).localeCompare(stableString(right.detail || null)));
  }
  entities.sort((left, right) => compareRefs(left.ref, right.ref));
  return { document, entities, byKey: new Map(entities.map((entity) => [refKey(entity.ref), entity])) };
}

function publicEntity(entity, maxRelationships = 64, maxSemantics = 32) {
  const result = cloneValue(entity);
  result.relationships = result.relationships.slice(0, maxRelationships);
  result.semantics = result.semantics.slice(0, maxSemantics);
  return result;
}

export function buildSemanticIndex(document, options = {}) {
  const { entities } = buildIndexData(document);
  const maxEntities = clampInteger(options.maxEntities, DEFAULT_INDEX_LIMIT, 1, 5000);
  const maxRelationships = clampInteger(options.maxRelationshipsPerEntity, 64, 1, 512);
  const maxSemantics = clampInteger(options.maxSemanticsPerEntity, 32, 1, 256);
  const selected = entities.slice(0, maxEntities).map((entity) => publicEntity(entity, maxRelationships, maxSemantics));
  return {
    format: 'veyra-semantic-index',
    version: 1,
    entityCount: entities.length,
    returnedCount: selected.length,
    truncated: selected.length < entities.length,
    entities: selected,
  };
}

function semanticMatches(entity, semanticQuery, evidence) {
  if (!semanticQuery) return true;
  const aliases = stringArray(semanticQuery.alias);
  const roles = stringArray(semanticQuery.role);
  const tags = stringArray(semanticQuery.tags ?? semanticQuery.tag);
  const statuses = stringArray(semanticQuery.status);
  const sources = stringArray(semanticQuery.source);
  const eligible = entity.semantics.filter((record) => {
    if (statuses.length && !statuses.includes(normalizedToken(record.status))) return false;
    if (sources.length && !sources.includes(normalizedToken(record.provenance?.source))) return false;
    return true;
  });
  const hasSemanticConstraint = aliases.length || roles.length || tags.length || statuses.length || sources.length;
  if (hasSemanticConstraint && eligible.length === 0) return false;
  if (aliases.length && !eligible.some((record) => record.aliases.some((alias) => aliases.includes(normalizedToken(alias.value))))) return false;
  if (roles.length && !eligible.some((record) => roles.includes(normalizedToken(record.canonicalRole)))) return false;
  if (tags.length && !tags.every((tag) => eligible.some((record) => record.tags.some((value) => normalizedToken(value) === tag)))) return false;
  if (aliases.length) evidence.push({ kind: 'semantic-alias-filter', values: aliases });
  if (roles.length) evidence.push({ kind: 'semantic-role-filter', values: roles });
  if (tags.length) evidence.push({ kind: 'semantic-tag-filter', values: tags });
  if (statuses.length) evidence.push({ kind: 'semantic-status-filter', values: statuses });
  if (sources.length) evidence.push({ kind: 'semantic-source-filter', values: sources });
  return true;
}

function relationshipMatches(entity, relation, relatedTo) {
  return entity.relationships.some((item) => (!relation || item.relation === relation)
    && (!relatedTo || referencesEqual(item.target, relatedTo)));
}

function queryEntity(entity, query) {
  const evidence = [];
  const kinds = stringArray(query.kinds ?? query.kind);
  if (kinds.length && !kinds.includes(normalizedToken(entity.kind))) return null;
  if (query.type !== undefined && normalizedToken(entity.type) !== normalizedToken(query.type)) return null;
  if (query.ref !== undefined) {
    const ref = typedRef(query.ref, 'query.ref');
    if (!referencesEqual(entity.ref, ref)) return null;
    evidence.push({ kind: 'stable-ref', ref: cloneValue(ref) });
  }
  const capabilities = stringArray(query.capability ?? query.capabilities);
  if (capabilities.length && !capabilities.every((capability) => entity.capabilities.some((value) => normalizedToken(value) === capability))) return null;
  if (capabilities.length) evidence.push({ kind: 'capability-filter', values: capabilities });
  if (!semanticMatches(entity, query.semantic, evidence)) return null;
  const relatedTo = query.relatedTo ? typedRef(query.relatedTo, 'query.relatedTo') : null;
  const relation = query.relation ? String(query.relation) : null;
  if ((relatedTo || relation) && !relationshipMatches(entity, relation, relatedTo)) return null;
  if (relatedTo || relation) evidence.push({ kind: 'relationship-filter', relation, relatedTo: cloneValue(relatedTo) });
  if (query.spatial) {
    if (!entity.spatial) return null;
    if (query.spatial.horizontal && entity.spatial.horizontal !== query.spatial.horizontal) return null;
    if (query.spatial.vertical && entity.spatial.vertical !== query.spatial.vertical) return null;
    evidence.push({ kind: 'spatial-filter', spatial: cloneValue(query.spatial) });
  }
  if (query.displayName !== undefined) {
    if (normalizedToken(entity.displayName.value) !== normalizedToken(query.displayName)) return null;
    evidence.push({ kind: 'display-name-hint', value: String(query.displayName) });
  }
  return { ...publicEntity(entity), matches: evidence };
}

export function queryEntities(document, query = {}, options = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new TypeError('queryEntities query must be an object.');
  const { entities } = buildIndexData(document);
  const matches = entities.map((entity) => queryEntity(entity, query)).filter(Boolean);
  const maxResults = clampInteger(options.maxResults ?? query.maxResults, DEFAULT_QUERY_LIMIT, 1, 1000);
  return {
    format: 'veyra-entity-query',
    version: 1,
    count: matches.length,
    returnedCount: Math.min(matches.length, maxResults),
    truncated: matches.length > maxResults,
    entities: matches.slice(0, maxResults),
  };
}

function intentShape(intent) {
  if (typeof intent === 'string') {
    const value = String(intent).trim();
    return { semantic: { alias: value, role: value, tags: value }, semanticLabel: value };
  }
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new TypeError('resolveSemantic intent must be a string or object.');
  const semantic = { ...(intent.semantic || {}) };
  if (intent.alias !== undefined) semantic.alias = intent.alias;
  if (intent.role !== undefined) semantic.role = intent.role;
  if (intent.tags !== undefined) semantic.tags = intent.tags;
  if (intent.status !== undefined) semantic.status = intent.status;
  if (intent.source !== undefined) semantic.source = intent.source;
  return { ...intent, semantic, semanticLabel: intent.semanticLabel || intent.alias || intent.role || (Array.isArray(intent.tags) ? intent.tags[0] : intent.tags) || null };
}

function semanticWeight(record) {
  if (record.status === 'rejected' || record.status === 'stale') return 0;
  if (record.status === 'confirmed') return 1;
  if (record.status === 'inferred') {
    const confidence = record.provenance?.confidence;
    return typeof confidence === 'number' && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5;
  }
  return 0;
}

function semanticRelationWeight(detail = {}) {
  return semanticWeight({
    status: detail.status,
    provenance: { confidence: detail.confidence },
  });
}

function addEvidence(output, kind, score, detail = {}) {
  if (!(score > 0)) return;
  output.score += score;
  output.evidence.push({ kind, score: Number(score.toFixed(4)), ...cloneValue(detail) });
}

function scoreCandidate(entity, intent) {
  const output = { entity, score: 0, evidence: [], semantic: null };
  const aliases = stringArray(intent.semantic?.alias);
  const roles = stringArray(intent.semantic?.role);
  const tags = stringArray(intent.semantic?.tags ?? intent.semantic?.tag);
  const statuses = stringArray(intent.semantic?.status);
  const sources = stringArray(intent.semantic?.source);
  for (const record of entity.semantics) {
    const weight = semanticWeight(record);
    if (!weight) continue;
    if (statuses.length && !statuses.includes(normalizedToken(record.status))) continue;
    if (sources.length && !sources.includes(normalizedToken(record.provenance?.source))) continue;
    for (const alias of record.aliases || []) {
      if (aliases.includes(normalizedToken(alias.value))) {
        const score = (record.status === 'confirmed' ? VEYRA_RESOLVER_SCORING.confirmedAlias : VEYRA_RESOLVER_SCORING.inferredAlias) * weight;
        addEvidence(output, 'semantic-alias', score, { semanticId: record.id, value: alias.value, namespace: alias.namespace, owner: alias.owner, status: record.status, source: record.provenance?.source, confidence: record.provenance?.confidence ?? null });
        if (!output.semantic) output.semantic = alias.value;
      }
    }
    if (roles.includes(normalizedToken(record.canonicalRole))) {
      const score = (record.status === 'confirmed' ? VEYRA_RESOLVER_SCORING.confirmedRole : VEYRA_RESOLVER_SCORING.inferredRole) * weight;
      addEvidence(output, 'canonical-role', score, { semanticId: record.id, value: record.canonicalRole, status: record.status, source: record.provenance?.source, confidence: record.provenance?.confidence ?? null });
      if (!output.semantic) output.semantic = record.canonicalRole;
    }
    for (const tag of tags) {
      if (record.tags.some((value) => normalizedToken(value) === tag)) {
        const score = (record.status === 'confirmed' ? VEYRA_RESOLVER_SCORING.confirmedTag : VEYRA_RESOLVER_SCORING.inferredTag) * weight;
        addEvidence(output, 'semantic-tag', score, { semanticId: record.id, value: tag, status: record.status, source: record.provenance?.source, confidence: record.provenance?.confidence ?? null });
        if (!output.semantic) output.semantic = tag;
      }
    }
  }

  const relatedTo = intent.relatedTo ? typedRef(intent.relatedTo, 'intent.relatedTo') : null;
  const relation = intent.relation ? String(intent.relation) : null;
  if (relatedTo || relation) {
    const matching = entity.relationships.filter((item) => (!relation || item.relation === relation)
      && (!relatedTo || referencesEqual(item.target, relatedTo)));
    for (const item of matching) {
      if (item.source === 'semantic') {
        const detail = item.detail || {};
        const status = normalizedToken(detail.status);
        const provenanceSource = normalizedToken(detail.source);
        if (statuses.length && !statuses.includes(status)) continue;
        if (sources.length && !sources.includes(provenanceSource)) continue;
        const weight = semanticRelationWeight(detail);
        const baseScore = status === 'inferred'
          ? VEYRA_RESOLVER_SCORING.inferredRelation
          : VEYRA_RESOLVER_SCORING.confirmedRelation;
        addEvidence(output, 'semantic-relation', baseScore * weight, {
          relation: item.relation,
          predicate: detail.predicate || item.relation,
          target: item.target,
          semanticId: detail.semanticId || null,
          status: detail.status || null,
          source: detail.source || null,
          confidence: detail.confidence ?? null,
        });
      } else if (item.source === 'style') {
        addEvidence(output, 'style-similarity', VEYRA_RESOLVER_SCORING.styleSimilarity, {
          relation: item.relation,
          target: item.target,
          detail: item.detail || null,
        });
      } else {
        addEvidence(output, 'structural-relationship', relation ? VEYRA_RESOLVER_SCORING.structuralRelation : VEYRA_RESOLVER_SCORING.relatedEntity, { relation: item.relation, target: item.target, detail: item.detail || null });
      }
    }
  }

  if (intent.type !== undefined && normalizedToken(entity.type) === normalizedToken(intent.type)) addEvidence(output, 'entity-type', VEYRA_RESOLVER_SCORING.entityType, { type: entity.type });
  const capabilities = stringArray(intent.capability ?? intent.capabilities);
  for (const capability of capabilities) {
    if (entity.capabilities.some((value) => normalizedToken(value) === capability)) addEvidence(output, 'capability', VEYRA_RESOLVER_SCORING.capability, { capability });
  }
  if (intent.spatial && entity.spatial) {
    let matched = true;
    if (intent.spatial.horizontal && entity.spatial.horizontal !== intent.spatial.horizontal) matched = false;
    if (intent.spatial.vertical && entity.spatial.vertical !== intent.spatial.vertical) matched = false;
    if (matched) addEvidence(output, 'spatial-structure', VEYRA_RESOLVER_SCORING.spatialStructure, { spatial: intent.spatial });
  }
  if (intent.displayName !== undefined && normalizedToken(entity.displayName.value) === normalizedToken(intent.displayName)) {
    addEvidence(output, 'display-name-hint', VEYRA_RESOLVER_SCORING.displayNameHint, { value: String(intent.displayName) });
  }
  return output;
}

function relativeRawScoreGap(top, candidate) {
  if (!(top?.score > 0) || !(candidate?.score >= 0)) return Infinity;
  return Math.max(0, (top.score - candidate.score) / top.score);
}

function publicCandidate(scored) {
  return {
    target: cloneValue(scored.entity.ref),
    kind: scored.entity.kind,
    type: scored.entity.type,
    displayName: cloneValue(scored.entity.displayName),
    semantic: scored.semantic,
    score: Number(scored.score.toFixed(4)),
    confidence: Number(Math.min(1, scored.score / 100).toFixed(4)),
    evidence: cloneValue(scored.evidence).sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind) || stableString(left).localeCompare(stableString(right))),
  };
}

function exactReferenceResolution(entities, intent) {
  if (!intent.ref) return null;
  const ref = typedRef(intent.ref, 'intent.ref');
  const exact = entities.find((entity) => referencesEqual(entity.ref, ref));
  if (!exact) {
    const sameId = entities.filter((entity) => entity.ref.id === ref.id).map((entity) => entity.ref.kind).sort();
    const suffix = sameId.length ? ` The id exists as: ${sameId.join(', ')}.` : '';
    return { status: 'notFound', reason: `Typed reference ${refKey(ref)} does not exist.${suffix}` };
  }
  const kinds = stringArray(intent.kinds ?? intent.kind);
  if (kinds.length && !kinds.includes(normalizedToken(exact.kind))) {
    return { status: 'notFound', reason: `Typed reference ${refKey(ref)} exists, but kind ${exact.kind} is excluded by the requested kinds.` };
  }
  if (intent.type !== undefined && normalizedToken(exact.type) !== normalizedToken(intent.type)) {
    return { status: 'notFound', reason: `Typed reference ${refKey(ref)} exists, but has type ${exact.type || '(none)'}, not ${intent.type}.` };
  }
  return {
    status: 'resolved',
    target: cloneValue(exact.ref),
    semantic: intent.semanticLabel || null,
    confidence: 1,
    score: VEYRA_RESOLVER_SCORING.exactRef,
    evidence: [{ kind: 'stable-ref', score: VEYRA_RESOLVER_SCORING.exactRef, ref: cloneValue(exact.ref) }],
    alternatives: [],
  };
}

export function resolveSemantic(document, rawIntent, options = {}) {
  const intent = intentShape(rawIntent);
  const { entities } = buildIndexData(document);
  const exact = exactReferenceResolution(entities, intent);
  if (exact) return exact;
  const kinds = stringArray(intent.kinds ?? intent.kind);
  const pool = entities.filter((entity) => (!kinds.length || kinds.includes(normalizedToken(entity.kind)))
    && (intent.type === undefined || normalizedToken(entity.type) === normalizedToken(intent.type)));
  const scored = pool.map((entity) => scoreCandidate(entity, intent))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || compareRefs(left.entity.ref, right.entity.ref));
  if (!scored.length) return { status: 'notFound', reason: 'No candidate has qualifying semantic or structural evidence. Display names are ignored unless displayName is explicitly requested.' };

  const minConfidence = boundedUnit(options.minConfidence, DEFAULT_MIN_CONFIDENCE, 'options.minConfidence');
  const ambiguityMargin = boundedUnit(options.ambiguityMargin, DEFAULT_AMBIGUITY_MARGIN, 'options.ambiguityMargin');
  const alternativesLimit = clampInteger(options.maxAlternatives, DEFAULT_ALTERNATIVE_LIMIT, 0, 50);
  const candidates = scored.map(publicCandidate);
  const top = candidates[0];
  if (top.confidence < minConfidence) {
    return { status: 'notFound', reason: `Best candidate confidence ${top.confidence} is below minimum ${minConfidence}.`, alternatives: candidates.slice(0, alternativesLimit) };
  }
  const second = candidates[1];
  if (second && second.confidence >= minConfidence && relativeRawScoreGap(scored[0], scored[1]) <= ambiguityMargin) {
    return {
      status: 'ambiguous',
      candidates: candidates.filter((candidate, index) => candidate.confidence >= minConfidence
        && relativeRawScoreGap(scored[0], scored[index]) <= ambiguityMargin)
        .slice(0, Math.max(2, alternativesLimit || 2)),
      reason: `Top candidates are within relative raw-score ambiguity margin ${ambiguityMargin}; resolver refuses to guess.`,
    };
  }
  return {
    status: 'resolved',
    target: cloneValue(top.target),
    semantic: top.semantic || intent.semanticLabel || null,
    confidence: top.confidence,
    score: top.score,
    evidence: cloneValue(top.evidence),
    alternatives: candidates.slice(1, 1 + alternativesLimit),
  };
}
