import {
  degreesToRadians,
  inputAnglesUseDegrees,
  normalizeConventions,
  VEYRA_COORDINATE_CONVENTIONS,
} from './contracts.js';
import { finite, bounded, integer, color, gradientColor } from './propertyValueContract.js';
import { dataTypeDescriptor, dataTypeAccepts } from './dataTypeContracts.js';
import {
  createBoneRef,
  createControlRef,
  createMachineInputRef,
  createMachineStateRef,
  createStateMachineRef,
  createMeshVertexRef,
  createNodeRef,
  createTimelineRef,
  createReference,
  normalizeReference,
  referenceId,
} from './references.js';
import {
  createSemanticRecord as createUniversalSemanticRecord,
  normalizeSemanticRecords,
  validateSemanticRecords,
  semanticForTarget,
  semanticsForTarget,
  semanticRecordById as findSemanticRecordById,
} from './semantics.js';

import {
  VEYRA_PROJECT_VERSION,
  normalizeProjectDocument,
  artboardById as projectArtboardById,
  componentById as projectComponentById,
  componentInstanceById as projectComponentInstanceById,
} from './projectGraph.js';
import {
  VEYRA_DATA_VERSION,
  normalizeDataGraphDocument,
  viewModelById as dataViewModelById,
  viewModelInstanceById as dataViewModelInstanceById,
  dataPropertyById as graphDataPropertyById,
  enumById as dataEnumById,
  enumValueById as dataEnumValueById,
  bindingById as dataBindingById,
  converterById as dataConverterById,
  propertyGroupById as dataPropertyGroupById,
  propertyGroupPropertyById as dataPropertyGroupPropertyById,
  listById as dataListById,
  listItemById as dataListItemById,
  normalizeBindingEndpoint,
} from './dataGraph.js';
import { normalizeFeatureGraphDocument } from './featureGraph.js';

export { VEYRA_PROJECT_VERSION, VEYRA_DATA_VERSION };

export const VEYRA_FORMAT = 'veyra';
// v4 is feature-gated: ordinary documents continue to normalize as v3, while
// listener-bearing documents are loud to readers that predate the registry.
export const VEYRA_VERSION = 3;
export const VEYRA_LISTENER_VERSION = 4;
export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
// Layered machines are an additive document generation.  Older readers can
// still reject this stamp while the current normalizer accepts every
// historical generation and emits the layered form for machine documents.
export const VEYRA_LAYERED_MACHINE_VERSION = 7;
export const VEYRA_LISTENER_KINDS = Object.freeze(['pointer']);
export const VEYRA_LISTENER_EVENTS = Object.freeze([
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave', 'click',
]);
export const VEYRA_LISTENER_ACTIONS = Object.freeze(['setInput', 'fire', 'play', 'stop', 'seek']);
export const VEYRA_POINTER_EVENT_MODES = Object.freeze(['auto', 'none', 'pass-through']);
export const VEYRA_MIME = 'application/vnd.veyra+json';
export const VEYRA_ASSET_TYPES = Object.freeze(['image', 'font', 'audio']);
export const VEYRA_CONSTRAINT_TYPES = Object.freeze([
  'ik',
  'distance',
  'transform',
  'rotation',
  'scale',
  'path',
]);
export const VEYRA_NODE_TYPES = Object.freeze([
  'group',
  'image',
  'path',
  'rectangle',
  'ellipse',
  'polygon',
  'star',
]);
export const VEYRA_VERTEX_HANDLE_MODES = Object.freeze(['straight', 'mirrored', 'aligned', 'detached']);
export const VEYRA_EASING_TYPES = Object.freeze([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'cubic-bezier',
  'step',
  'hold',
]);
export const VEYRA_LOOP_MODES = Object.freeze(['none', 'loop', 'pingpong']);
export const VEYRA_FILL_TYPES = Object.freeze(['solid', 'linearGradient', 'radialGradient']);
export const VEYRA_MACHINE_INPUT_TYPES = Object.freeze(['number', 'bool', 'trigger']);
export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['entry', 'exit', 'any', 'animation', 'blend1d', 'directBlend', 'additiveBlend']);
export const VEYRA_MACHINE_LAYER_VERSION = 1;
export const VEYRA_CONDITION_OPS = Object.freeze([
  '<',
  '<=',
  '>',
  '>=',
  '==',
  '!=',
  'fired',
  '!fired',
]);
export const VEYRA_MACHINE_ACTION_PHASES = Object.freeze([
  'state-start', 'state-end', 'transition-start', 'transition-end',
]);
export const VEYRA_MACHINE_ACTION_TYPES = Object.freeze([
  'data-set', 'data-fire', 'input-set', 'input-fire', 'emit', 'timeline',
]);

// Shared bounds for the numeric properties that `normalizeDocument` validates.
// Document validation and the AI-facing manifest action schemas both consume
// this table so agents can see the legal range of every scalar parameter.
// The manifest tests probe the validation boundaries to keep the table honest.
export const VEYRA_PROPERTY_BOUNDS = Object.freeze({
  'timeline.duration': Object.freeze({ min: 1, max: 1000000, integer: true }),
  'timeline.fps': Object.freeze({ min: 1, max: 240, integer: true }),
  'timeline.workStart': Object.freeze({ min: 0, max: 1000000, integer: true, note: 'must not exceed duration' }),
  'timeline.workEnd': Object.freeze({ min: 1, max: 1000000, integer: true, note: 'must be greater than workStart and not exceed duration' }),
  'keyframe.frame': Object.freeze({ min: 0, max: 100000, integer: true }),
  'keyframe.easingParams.*': Object.freeze({ min: 0, max: 1 }),
  'machineTransition.duration': Object.freeze({ min: 0, max: 10000 }),
  'machineTransition.after': Object.freeze({ min: 0, max: 100000 }),
});

let fallbackId = 0;

export function createId(prefix = 'node') {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackId += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackId.toString(36)}`;
}

export function cloneValue(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createGradientStop(overrides = {}) {
  return {
    id: overrides.id || createId('gradientStop'),
    offset: overrides.offset ?? 0,
    color: String(overrides.color || '#000000').toLowerCase(),
    opacity: overrides.opacity ?? 1,
  };
}

export function createSolidFill(value = '#ec4899') {
  const source = typeof value === 'string' ? { color: value } : value || {};
  return { type: 'solid', color: String(source.color || '#ec4899').toLowerCase() };
}

export function createLinearGradient(overrides = {}) {
  return {
    type: 'linearGradient',
    x1: overrides.x1 ?? 0,
    y1: overrides.y1 ?? 0,
    x2: overrides.x2 ?? 1,
    y2: overrides.y2 ?? 1,
    stops: cloneValue(overrides.stops || [
      createGradientStop({ offset: 0, color: '#ec4899' }),
      createGradientStop({ offset: 1, color: '#22d3ee' }),
    ]),
  };
}

export function createRadialGradient(overrides = {}) {
  return {
    type: 'radialGradient',
    cx: overrides.cx ?? 0.5,
    cy: overrides.cy ?? 0.5,
    r: overrides.r ?? 0.5,
    fx: overrides.fx ?? overrides.cx ?? 0.5,
    fy: overrides.fy ?? overrides.cy ?? 0.5,
    stops: cloneValue(overrides.stops || [
      createGradientStop({ offset: 0, color: '#fff7fc' }),
      createGradientStop({ offset: 1, color: '#ec4899' }),
    ]),
  };
}

function fillForCreate(value, fallback) {
  if (value == null) return createSolidFill(fallback);
  if (typeof value === 'string') return createSolidFill(value);
  return cloneValue(value);
}

function baseNode(type) {
  return {
    id: createId(type),
    type,
    name: type[0].toUpperCase() + type.slice(1),
    parent: null,
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      scaleX: 1,
      scaleY: 1,
      pivotX: 0,
      pivotY: 0,
    },
    paint: { fill: createSolidFill('#ec4899'), stroke: '#2c1830', strokeWidth: 2 },
    geometry: null,
  };
}

function defaultGeometry(type) {
  switch (type) {
    case 'image':
      return { width: 160, height: 120, fit: 'contain' };
    case 'rectangle':
      return { width: 180, height: 120, cornerRadius: 24 };
    case 'ellipse':
      return { width: 160, height: 110 };
    case 'polygon':
      return { radius: 80, sides: 6 };
    case 'star':
      return { outerRadius: 88, innerRadius: 42, points: 5 };
    case 'path':
      return {
        closed: true,
        vertices: [
          { id: createId('vertex'), x: -80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 },
          { id: createId('vertex'), x: 0, y: -70, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 },
          { id: createId('vertex'), x: 80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 },
        ],
      };
    default:
      return null;
  }
}

export function createNode(type, overrides = {}) {
  if (!VEYRA_NODE_TYPES.includes(type)) throw new TypeError(`Unsupported Veyra node type: ${type}`);
  const base = baseNode(type);
  const node = {
    ...base,
    ...cloneValue(overrides),
    id: overrides.id || base.id,
    type,
    parent: overrides.parent
      ? normalizeReference(overrides.parent, 'node', `${type}.parent`)
      : overrides.parentId
        ? createNodeRef(overrides.parentId)
        : null,
    transform: { ...base.transform, ...(overrides.transform || {}) },
    paint: {
      ...base.paint,
      ...(overrides.paint || {}),
      fill: fillForCreate(overrides.paint?.fill ?? base.paint.fill, '#ec4899'),
    },
    geometry: type === 'group'
      ? null
      : { ...defaultGeometry(type), ...(overrides.geometry || {}) },
  };
  if (type === 'image') {
    const asset = overrides.asset ?? overrides.assetId;
    node.asset = asset == null || asset === '' ? null : normalizeReference(asset, 'asset', 'image.asset');
    delete node.assetId;
  }
  if (type === 'path' && overrides.geometry?.vertices) {
    node.geometry.vertices = cloneValue(overrides.geometry.vertices);
  }
  delete node.parentId;
  return node;
}

export function createSemanticRecord(targetOrNodeId, overrides = {}) {
  return createUniversalSemanticRecord(targetOrNodeId, overrides);
}

export function createAsset(type, overrides = {}) {
  if (!VEYRA_ASSET_TYPES.includes(type)) throw new TypeError(`Unsupported Veyra asset type: ${type}`);
  const source = overrides.source || { kind: 'external', uri: '' };
  return {
    id: overrides.id || createId('asset'),
    type,
    name: String(overrides.name || `${type[0].toUpperCase()}${type.slice(1)} asset`),
    mimeType: String(overrides.mimeType || ''),
    source: cloneValue(source),
    metadata: {
      width: overrides.metadata?.width ?? null,
      height: overrides.metadata?.height ?? null,
      duration: overrides.metadata?.duration ?? null,
    },
  };
}

function rigTransform(overrides = {}) {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    ...cloneValue(overrides),
  };
}

export function createBone(overrides = {}) {
  return {
    id: overrides.id || createId('bone'),
    name: String(overrides.name || 'Bone'),
    parent: overrides.parent ? normalizeReference(overrides.parent, 'bone', 'bone.parent') : null,
    visible: overrides.visible !== false,
    locked: Boolean(overrides.locked),
    length: overrides.length ?? 100,
    color: overrides.color || '#22d3ee',
    rest: rigTransform(overrides.rest),
    pose: rigTransform(overrides.pose),
  };
}

export function createControl(overrides = {}) {
  const kind = overrides.kind || 'position';
  if (!['position', 'scalar'].includes(kind)) throw new TypeError(`Unsupported control kind: ${kind}`);
  return {
    id: overrides.id || createId('control'),
    kind,
    name: String(overrides.name || (kind === 'position' ? 'Position Control' : 'Scalar Control')),
    visible: overrides.visible !== false,
    locked: Boolean(overrides.locked),
    position: {
      x: overrides.position?.x ?? 0,
      y: overrides.position?.y ?? 0,
    },
    value: overrides.value ?? 0,
    min: overrides.min ?? 0,
    max: overrides.max ?? 1,
    color: overrides.color || '#facc15',
  };
}

export function createMesh(overrides = {}) {
  const vertices = overrides.vertices || [
    { id: createId('meshVertex'), x: -60, y: -30, weights: [] },
    { id: createId('meshVertex'), x: 60, y: -30, weights: [] },
    { id: createId('meshVertex'), x: 60, y: 30, weights: [] },
    { id: createId('meshVertex'), x: -60, y: 30, weights: [] },
  ];
  const triangles = overrides.triangles || [
    [vertices[0], vertices[1], vertices[2]].map((vertex) => createMeshVertexRef(vertex.id)),
    [vertices[0], vertices[2], vertices[3]].map((vertex) => createMeshVertexRef(vertex.id)),
  ];
  return {
    id: overrides.id || createId('mesh'),
    name: String(overrides.name || 'Mesh'),
    visible: overrides.visible !== false,
    locked: Boolean(overrides.locked),
    opacity: overrides.opacity ?? 0.72,
    paint: {
      fill: fillForCreate(overrides.paint?.fill, '#f472b6'),
      stroke: overrides.paint?.stroke || '#831843',
      strokeWidth: overrides.paint?.strokeWidth ?? 2,
    },
    vertices: cloneValue(vertices),
    triangles: cloneValue(triangles),
  };
}

export function createConstraint(type, overrides = {}) {
  if (!VEYRA_CONSTRAINT_TYPES.includes(type)) throw new TypeError(`Unsupported constraint type: ${type}`);
  const base = {
    id: overrides.id || createId('constraint'),
    type,
    name: String(overrides.name || `${type[0].toUpperCase()}${type.slice(1)} Constraint`),
    enabled: overrides.enabled !== false,
    strength: overrides.strength ?? 1,
    order: overrides.order ?? 0,
  };
  if (type === 'ik') return {
    ...base,
    bones: cloneValue(overrides.bones || []),
    target: overrides.target ? normalizeReference(overrides.target, 'control', 'constraint.target') : null,
    bendDirection: overrides.bendDirection ?? 1,
  };
  if (type === 'distance') return {
    ...base,
    bone: overrides.bone ? normalizeReference(overrides.bone, 'bone', 'constraint.bone') : null,
    target: overrides.target ? normalizeReference(overrides.target, 'control', 'constraint.target') : null,
    distance: overrides.distance ?? 100,
  };
  if (type === 'path') return {
    ...base,
    bone: overrides.bone ? normalizeReference(overrides.bone, 'bone', 'constraint.bone') : null,
    path: overrides.path ? normalizeReference(overrides.path, 'node', 'constraint.path') : null,
    position: overrides.position ?? 0,
    rotate: overrides.rotate !== false,
  };
  return {
    ...base,
    bone: overrides.bone ? normalizeReference(overrides.bone, 'bone', 'constraint.bone') : null,
    target: overrides.target ? normalizeReference(overrides.target, 'bone', 'constraint.target') : null,
    offset: overrides.offset ?? 0,
  };
}

export function createKeyframe(overrides = {}) {
  const easing = overrides.easing || 'linear';
  if (!VEYRA_EASING_TYPES.includes(easing)) throw new TypeError(`Unsupported easing type: ${easing}`);
  const base = {
    id: overrides.id || createId('keyframe'),
    frame: overrides.frame ?? 0,
    value: cloneValue(overrides.value),
    easing,
  };
  if (easing === 'cubic-bezier') {
    return {
      ...base,
      easingParams: overrides.easingParams || [0.42, 0, 0.58, 1],
    };
  }
  return base;
}

export function createTimeline(overrides = {}) {
  const loop = overrides.loop || 'none';
  if (!VEYRA_LOOP_MODES.includes(loop)) throw new TypeError(`Unsupported loop mode: ${loop}`);
  const duration = overrides.duration ?? 60;
  const workStart = integer(overrides.workStart ?? 0, 'timeline.workStart', 0, duration);
  const workEnd = integer(overrides.workEnd ?? duration, 'timeline.workEnd', workStart, duration);
  if (workEnd === workStart) {
    throw new RangeError('timeline.workEnd must be greater than timeline.workStart.');
  }
  return {
    id: overrides.id || createId('timeline'),
    name: String(overrides.name || 'Timeline'),
    duration,
    fps: overrides.fps ?? 30,
    loop,
    workStart,
    workEnd,
    tracks: (overrides.tracks || []).map((track) => createTrack(track.address, track)),
  };
}

export function createTrack(address, overrides = {}) {
  const id = overrides.id || createId('track');
  return {
    id,
    address: String(address || ''),
    keyframes: (overrides.keyframes || []).map((keyframe, index) => createKeyframe({
      ...keyframe,
      id: keyframe.id || `keyframe_${id}_${index}`,
    })),
  };
}

export function createMachineInput(overrides = {}) {
  const type = overrides.type || 'number';
  if (!VEYRA_MACHINE_INPUT_TYPES.includes(type)) throw new TypeError(`Unsupported machine input type: ${type}`);
  const value = type === 'number' ? Number(overrides.value ?? 0) : type === 'bool' ? Boolean(overrides.value) : false;
  return {
    id: overrides.id || createId('machineInput'),
    name: String(overrides.name || (type === 'trigger' ? 'Trigger' : type === 'bool' ? 'Flag' : 'Value')),
    type,
    value,
  };
}

function machineJsonSafeClone(value, path = 'machineAction.value') {
  const seen = new Set();
  const visit = (item, at) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError(`${at} must contain only finite JSON numbers.`);
      return item;
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new TypeError(`${at} must be acyclic JSON data.`);
      seen.add(item);
      const result = item.map((entry, index) => visit(entry, `${at}[${index}]`));
      seen.delete(item);
      return result;
    }
    if (item && typeof item === 'object') {
      const proto = Object.getPrototypeOf(item);
      if (proto !== Object.prototype && proto !== null) throw new TypeError(`${at} must be plain JSON data.`);
      if (seen.has(item)) throw new TypeError(`${at} must be acyclic JSON data.`);
      seen.add(item);
      const result = {};
      for (const [key, entry] of Object.entries(item)) {
        if (entry === undefined || ['function', 'symbol', 'bigint'].includes(typeof entry)) throw new TypeError(`${at}.${key} is not JSON-safe.`);
        result[key] = visit(entry, `${at}.${key}`);
      }
      seen.delete(item);
      return result;
    }
    throw new TypeError(`${at} is not JSON-safe.`);
  };
  return visit(value, path);
}

export function createMachineAction(overrides = {}) {
  const type = String(overrides.type || '');
  const phase = String(overrides.phase || '');
  if (!VEYRA_MACHINE_ACTION_TYPES.includes(type)) throw new TypeError(`Unsupported machine action type: ${type || '(empty)'}.`);
  if (!VEYRA_MACHINE_ACTION_PHASES.includes(phase)) throw new TypeError(`Unsupported machine action phase: ${phase || '(empty)'}.`);
  const action = { id: String(overrides.id || createId('machineAction')), type, phase };
  if (type === 'data-set' || type === 'data-fire') {
    action.target = normalizeMachineDataEndpoint(overrides.target ?? overrides.endpoint, 'machineAction.target');
    if (type === 'data-set') {
      if (overrides.value === undefined) throw new TypeError('machineAction.value is required for data-set.');
      action.value = machineJsonSafeClone(overrides.value);
    }
    return action;
  }
  if (type === 'input-set' || type === 'input-fire') {
    const input = normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'machineAction.input');
    if (!input) throw new TypeError('machineAction.input is required.');
    action.input = input;
    if (type === 'input-set') {
      if (overrides.value === undefined) throw new TypeError('machineAction.value is required for input-set.');
      action.value = machineJsonSafeClone(overrides.value);
    }
    return action;
  }
  if (type === 'emit') {
    action.event = String(overrides.event || '');
    if (!action.event) throw new TypeError('machineAction.event is required for emit.');
    action.payload = machineJsonSafeClone(overrides.payload ?? null, 'machineAction.payload');
    return action;
  }
  const timeline = normalizeReference(overrides.timeline ?? overrides.timelineId, 'timeline', 'machineAction.timeline');
  if (!timeline) throw new TypeError('machineAction.timeline is required.');
  const operation = String(overrides.operation || 'play');
  if (!['play', 'stop', 'seek'].includes(operation)) throw new TypeError('machineAction.operation must be play, stop, or seek.');
  action.timeline = timeline;
  action.operation = operation;
  if (operation === 'seek') {
    const time = Number(overrides.time ?? overrides.value);
    if (!Number.isFinite(time) || time < 0) throw new TypeError('machineAction.time must be a non-negative finite number for seek.');
    action.time = time;
  }
  return action;
}

function normalizeMachineDataEndpoint(value, path) {
  const endpoint = normalizeBindingEndpoint(value, path);
  if (endpoint.kind !== 'data') throw new TypeError(`${path} must be a View Model data endpoint.`);
  return endpoint;
}

export function createMachineCondition(overrides = {}) {
  const op = String(overrides.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) throw new TypeError(`Unsupported condition operator: ${op}`);
  const hasDataSource = overrides.source != null;
  const hasLegacyInput = overrides.input != null || overrides.inputId != null;
  if (hasDataSource && hasLegacyInput) throw new TypeError('condition cannot define both source and input.');
  const source = hasDataSource ? normalizeMachineDataEndpoint(overrides.source, 'condition.source') : null;
  const input = hasLegacyInput ? normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'condition.input') : null;
  if (!source && !input) throw new TypeError('condition.source or condition.input is required.');
  const condition = {
    id: overrides.id || createId('machineCondition'),
    ...(source ? { source } : { input }),
    op,
  };
  if (op === 'fired' || op === '!fired') {
    if (overrides.compare != null) throw new TypeError(`condition.compare is not allowed for operator ${op}.`);
    return condition;
  }
  if (overrides.compare != null && overrides.value !== undefined) throw new TypeError('condition cannot define both compare and value.');
  if (overrides.compare != null) condition.compare = normalizeMachineDataEndpoint(overrides.compare, 'condition.compare');
  else {
    if (overrides.value === undefined) throw new TypeError(`condition.value is required for operator ${op} when condition.compare is absent.`);
    condition.value = cloneValue(overrides.value);
  }
  return condition;
}

export function createMachineLayer(overrides = {}) {
  const states = (overrides.states || []).map((state) => createMachineState(state));
  const transitions = (overrides.transitions || []).map((transition) => createMachineTransition(transition));
  const layer = {
    id: overrides.id || createId('machineLayer'),
    name: String(overrides.name || 'Layer'),
    enabled: overrides.enabled !== false,
    weight: bounded(overrides.weight ?? 1, 'machineLayer.weight', 0, 1),
    initial: overrides.initial == null ? null : normalizeReference(overrides.initial, 'machineState', 'machineLayer.initial'),
    states,
    transitions,
  };
  // Optional editor metadata is materialized by normalization. Keeping the
  // lightweight constructor shape stable avoids surprising callers that use
  // it as an authored record builder while still preserving explicit values.
  if (Object.prototype.hasOwnProperty.call(overrides, 'displayNameAdvisory')) layer.displayNameAdvisory = Boolean(overrides.displayNameAdvisory);
  if (Object.prototype.hasOwnProperty.call(overrides, 'order')) layer.order = Number.isFinite(Number(overrides.order)) ? Math.trunc(Number(overrides.order)) : 0;
  if (Object.prototype.hasOwnProperty.call(overrides, 'graph')) {
    layer.graph = overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)
      ? { x: finite(overrides.graph.x ?? 0, 'machineLayer.graph.x'), y: finite(overrides.graph.y ?? 0, 'machineLayer.graph.y') }
      : { x: 0, y: 0 };
  }
  return layer;
}

export function createMachineBlendChild(overrides = {}) {
  const timeline = normalizeReference(overrides.timeline ?? overrides.timelineId, 'timeline', 'blendChild.timeline');
  if (!timeline) throw new TypeError('blend children require a timeline reference.');
  const speed = finite(overrides.speed ?? 1, 'blendChild.speed');
  if (speed === 0) throw new TypeError('blendChild.speed cannot be zero.');
  const child = {
    id: overrides.id || createId('machineBlendChild'),
    timeline,
    speed,
  };
  if (overrides.threshold != null) child.threshold = finite(overrides.threshold, 'blendChild.threshold');
  if (overrides.input != null || overrides.inputId != null) {
    const input = overrides.input ?? overrides.inputId;
    child.input = input && typeof input === 'object' && input.kind === 'data'
      ? normalizeMachineDataEndpoint(input, 'blendChild.input')
      : normalizeReference(input, 'machineInput', 'blendChild.input');
  }
  return child;
}

export function createMachineState(overrides = {}) {
  const type = String(overrides.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`Unsupported machine state type: ${type}`);
  const timelineValue = overrides.timeline ?? overrides.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : normalizeReference(timelineValue, 'timeline', 'state.timeline');
  if (type === 'animation' && !timeline) throw new TypeError('animation states require a timeline reference.');
  if (['entry', 'exit', 'any', 'blend1d', 'directBlend', 'additiveBlend'].includes(type) && timeline) throw new TypeError(`${type} states cannot own a direct timeline.`);
  const speed = finite(overrides.speed ?? 1, 'state.speed');
  if (speed === 0) throw new TypeError('state.speed cannot be zero.');
  const graph = overrides.graph && typeof overrides.graph === 'object' && !Array.isArray(overrides.graph)
    ? { x: finite(overrides.graph.x ?? 0, 'state.graph.x'), y: finite(overrides.graph.y ?? 0, 'state.graph.y') }
    : { x: 0, y: 0 };
  const result = {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    displayNameAdvisory: true,
    caption: String(overrides.caption ?? ''),
    type,
    ...(timeline ? { timeline } : {}),
    speed,
    graph,
    ...(overrides.randomizeExit ? { randomizeExit: true } : {}),
  };
  if (result.randomizeExit && ['entry', 'exit', 'any'].includes(type)) throw new TypeError(`${type} pseudo-states cannot enable Randomize Exit.`);
  const actions = (overrides.actions || []).map(createMachineAction);
  if (actions.some(action => !['state-start', 'state-end'].includes(action.phase))) throw new TypeError('State lifecycle action phase must be state-start or state-end.');
  if (['entry', 'exit', 'any'].includes(type) && actions.length) throw new TypeError(`${type} pseudo-states cannot own lifecycle actions.`);
  if (actions.length) result.actions = actions;
  if (type === 'blend1d') {
    const input = overrides.input ?? overrides.inputId;
    result.input = input && typeof input === 'object' && input.kind === 'data'
      ? normalizeMachineDataEndpoint(input, 'state.input')
      : normalizeReference(input, 'machineInput', 'state.input');
    if (!result.input) throw new TypeError('blend1d states require a numeric machine input reference.');
    result.children = (overrides.children || []).map(createMachineBlendChild);
    if (result.children.length < 2) throw new TypeError('blend1d states require at least two children.');
  } else if (type === 'directBlend' || type === 'additiveBlend') {
    result.children = (overrides.children || []).map(createMachineBlendChild);
    if (!result.children.length) throw new TypeError(`${type} states require at least one child.`);
    if (result.children.some(child => !child.input)) throw new TypeError(`${type} children require numeric machine input references.`);
  }
  if (result.children) {
    const ids = new Set();
    for (const child of result.children) {
      if (ids.has(child.id)) throw new TypeError(`Duplicate machine blend child id ${child.id}.`);
      ids.add(child.id);
    }
  }
  return result;
}

function normalizeTransitionExitTimeValue(value, path = 'transition.exitTime') {
  if (value == null || value === false) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object with unit and value.`);
  const unit = String(value.unit || '');
  if (!['seconds', 'percent'].includes(unit)) throw new TypeError(`${path}.unit must be seconds or percent.`);
  const normalized = unit === 'percent'
    ? bounded(value.value, `${path}.value`, 0, 1)
    : bounded(value.value, `${path}.value`, 0, 100000);
  return { unit, value: normalized };
}

export function createMachineTransition(overrides = {}) {
  const from = normalizeReference(overrides.from, 'machineState', 'transition.from');
  const to = normalizeReference(overrides.to, 'machineState', 'transition.to');
  if (!from || !to) throw new TypeError('transitions require from and to state references.');
  if (from.id === to.id) throw new TypeError('transitions cannot target the same state.');
  const duration = finite(overrides.duration ?? 0, 'transition.duration');
  if (duration < 0) throw new RangeError('transition.duration must be zero or positive.');
  const easing = String(overrides.easing || 'linear');
  if (!VEYRA_EASING_TYPES.includes(easing)) throw new TypeError(`transition.easing must be one of ${VEYRA_EASING_TYPES.join(', ')}.`);
  const transition = {
    id: overrides.id || createId('machineTransition'),
    from,
    to,
    enabled: overrides.enabled !== false,
    duration,
    after: overrides.after == null ? null : finite(overrides.after, 'transition.after'),
    exitTime: normalizeTransitionExitTimeValue(overrides.exitTime),
    pauseSource: Boolean(overrides.pauseSource),
    allowExitDuringTransition: Boolean(overrides.allowExitDuringTransition),
    easing,
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
  if (overrides.randomWeight != null) {
    const randomWeight = finite(overrides.randomWeight, 'transition.randomWeight');
    if (!(randomWeight > 0)) throw new RangeError('transition.randomWeight must be positive.');
    transition.randomWeight = randomWeight;
  }
  const actions = (overrides.actions || []).map(createMachineAction);
  if (actions.some(action => !['transition-start', 'transition-end'].includes(action.phase))) throw new TypeError('Transition lifecycle action phase must be transition-start or transition-end.');
  if (actions.length) transition.actions = actions;
  if (easing === 'cubic-bezier') {
    if (!Array.isArray(overrides.easingParams) || overrides.easingParams.length !== 4) throw new TypeError('transition.easingParams must contain four values for cubic-bezier.');
    transition.easingParams = overrides.easingParams.map((value,index)=>bounded(value,`transition.easingParams[${index}]`,0,1));
  }
  if (transition.after !== null && transition.after < 0) {
    throw new RangeError('transition.after must be zero or positive.');
  }
  return transition;
}

export function createStateMachine(overrides = {}) {
  const id = overrides.id || createId('machine');
  const rawLayers = Array.isArray(overrides.layers) && overrides.layers.length
    ? overrides.layers
    : [{
      id: `machineLayer_${id}_default`, name: 'Base Layer', order: 0, enabled: true,
      initial: overrides.initial ?? null, states: overrides.states || [], transitions: overrides.transitions || [], graph: { x: 0, y: 0 },
    }];
  const layers = rawLayers.map((layer, index) => createMachineLayer({ ...layer, order: layer.order ?? index }));
  layers.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));
  layers.forEach((layer,index)=>{ layer.order=index; });
  const compatibilityLayerId = overrides.compatibilityLayer?.id || overrides.compatibilityLayerId || layers[0].id;
  const compatibility = layers.find((layer) => layer.id === compatibilityLayerId);
  if (!compatibility) throw new TypeError(`State machine compatibility layer ${compatibilityLayerId} does not exist.`);
  return {
    id,
    name: String(overrides.name || 'State Machine'),
    layerVersion: VEYRA_MACHINE_LAYER_VERSION,
    compatibilityLayer: createReference('machineLayer', compatibility.id),
    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),
    layers,
    // Temporary M0-M8 compatibility view over one stable layer. Reordering
    // layers never changes legacy runtime behavior or stable authored identity.
    initial: compatibility.initial, states: compatibility.states, transitions: compatibility.transitions,
  };
}

export function createPointerListener(overrides = {}) {
  const kind = String(overrides.kind || 'pointer');
  if (!VEYRA_LISTENER_KINDS.includes(kind)) throw new TypeError(`Unsupported listener kind: ${kind}`);
  const event = String(overrides.event || '');
  if (!VEYRA_LISTENER_EVENTS.includes(event)) throw new TypeError(`Unsupported listener event: ${event}`);
  const action = String(overrides.action || '');
  if (!VEYRA_LISTENER_ACTIONS.includes(action)) throw new TypeError(`Unsupported listener action: ${action}`);
  const target = normalizeReference(overrides.target ?? overrides.targetId, 'node', 'listener.target');
  if (!target) throw new TypeError('listener.target is required.');
  const machineValue = overrides.machine ?? overrides.machineId;
  const inputValue = overrides.input ?? overrides.inputId;
  const timelineValue = overrides.timeline ?? overrides.timelineId;
  const machine = machineValue == null || machineValue === '' ? null : normalizeReference(machineValue, 'stateMachine', 'listener.machine');
  const input = inputValue == null || inputValue === '' ? null : normalizeReference(inputValue, 'machineInput', 'listener.input');
  const timeline = timelineValue == null || timelineValue === '' ? null : normalizeReference(timelineValue, 'timeline', 'listener.timeline');
  const machineAction = action === 'setInput' || action === 'fire';
  const timelineAction = action === 'play' || action === 'stop' || action === 'seek';
  if (machineAction && timelineValue != null && timelineValue !== '') throw new TypeError(`listener.timeline is not allowed for ${action}.`);
  if (timelineAction && ((machineValue != null && machineValue !== '') || (inputValue != null && inputValue !== ''))) {
    throw new TypeError(`listener.machine/input are not allowed for ${action}.`);
  }
  if (machineAction && !machine) throw new TypeError(`listener.machine is required for ${action}.`);
  if (machineAction && !input) throw new TypeError(`listener.input is required for ${action}.`);
  if (timelineAction && !timeline) throw new TypeError(`listener.timeline is required for ${action}.`);
  if (action === 'setInput' && overrides.value === undefined) throw new TypeError('listener.value is required for setInput.');
  if (action === 'seek' && (!Number.isFinite(Number(overrides.value)) || Number(overrides.value) < 0)) {
    throw new TypeError('listener.value must be a non-negative finite number for seek.');
  }
  return {
    id: String(overrides.id || createId('listener')),
    kind,
    event,
    target,
    ...(machine ? { machine } : {}),
    ...(input ? { input } : {}),
    ...(timeline ? { timeline } : {}),
    action,
    ...(action === 'setInput' || action === 'seek' ? { value: cloneValue(overrides.value) } : {}),
  };
}

export function createDocument(overrides = {}) {
  const now = new Date().toISOString();
  return {
    format: VEYRA_FORMAT,
    version: VEYRA_VERSION,
    conventions: {
      ...VEYRA_COORDINATE_CONVENTIONS,
      transformOrder: [...VEYRA_COORDINATE_CONVENTIONS.transformOrder],
    },
    id: overrides.id || createId('document'),
    name: overrides.name || 'Untitled Veyra',
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    artboard: {
      x: 0,
      y: 0,
      width: 960,
      height: 640,
      background: '#fff7fc',
      ...(overrides.artboard || {}),
    },
    ...(overrides.artboards ? { artboards: cloneValue(overrides.artboards) } : {}),
    components: cloneValue(overrides.components || []),
    componentInstances: cloneValue(overrides.componentInstances || []),
    assets: cloneValue(overrides.assets || []),
    nodes: cloneValue(overrides.nodes || []),
    semantics: cloneValue(overrides.semantics || []),
    bones: cloneValue(overrides.bones || []),
    meshes: cloneValue(overrides.meshes || []),
    controls: cloneValue(overrides.controls || []),
    constraints: cloneValue(overrides.constraints || []),
    timelines: cloneValue(overrides.timelines || []),
    stateMachines: cloneValue(overrides.stateMachines || []),
    listeners: cloneValue(overrides.listeners || []),
    viewModels: cloneValue(overrides.viewModels || []),
    viewModelInstances: cloneValue(overrides.viewModelInstances || []),
    enums: cloneValue(overrides.enums || []),
    converters: cloneValue(overrides.converters || []),
    propertyGroups: cloneValue(overrides.propertyGroups || []),
    lists: cloneValue(overrides.lists || []),
    bindings: cloneValue(overrides.bindings || []),
  };
}

function normalizeGradientStops(stops, path) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new TypeError(`${path} must contain at least two gradient stops.`);
  }
  if (stops.length > 256) throw new RangeError(`${path} contains too many gradient stops.`);
  const ids = new Set();
  return stops.map((stop, index) => {
    const id = String(stop?.id || createId('gradientStop'));
    if (ids.has(id)) throw new TypeError(`${path} contains duplicate stop id ${id}.`);
    ids.add(id);
    return {
      id,
      offset: bounded(stop?.offset ?? 0, `${path}[${index}].offset`, 0, 1),
      color: gradientColor(stop?.color ?? '#000000', `${path}[${index}].color`),
      opacity: bounded(stop?.opacity ?? 1, `${path}[${index}].opacity`, 0, 1),
    };
  }).sort((a, b) => a.offset - b.offset);
}

function normalizeFill(fill, path, inputVersion, fallback) {
  if (typeof fill === 'string') {
    if (inputVersion >= 3) throw new TypeError(`${path} must be a tagged fill object in version 3.`);
    return createSolidFill(color(fill, path));
  }
  const source = fill ?? createSolidFill(fallback);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${path} must be a tagged fill object.`);
  }
  const type = String(source.type || '');
  if (!VEYRA_FILL_TYPES.includes(type)) throw new TypeError(`${path}.type is unsupported.`);
  if (type === 'solid') {
    return { type, color: color(source.color ?? fallback, `${path}.color`) };
  }
  const common = {
    type,
    stops: normalizeGradientStops(source.stops, `${path}.stops`),
  };
  if (type === 'linearGradient') {
    return {
      ...common,
      x1: bounded(source.x1 ?? 0, `${path}.x1`, -10, 10),
      y1: bounded(source.y1 ?? 0, `${path}.y1`, -10, 10),
      x2: bounded(source.x2 ?? 1, `${path}.x2`, -10, 10),
      y2: bounded(source.y2 ?? 1, `${path}.y2`, -10, 10),
    };
  }
  return {
    ...common,
    cx: bounded(source.cx ?? 0.5, `${path}.cx`, -10, 10),
    cy: bounded(source.cy ?? 0.5, `${path}.cy`, -10, 10),
    r: bounded(source.r ?? 0.5, `${path}.r`, 0.000001, 10),
    fx: bounded(source.fx ?? source.cx ?? 0.5, `${path}.fx`, -10, 10),
    fy: bounded(source.fy ?? source.cy ?? 0.5, `${path}.fy`, -10, 10),
  };
}

function normalizeTransform(transform, path, anglesUseDegrees) {
  const angle = (value, property) => {
    const normalized = finite(value ?? 0, `${path}.${property}`);
    return anglesUseDegrees ? degreesToRadians(normalized) : normalized;
  };
  return {
    x: finite(transform?.x ?? 0, `${path}.x`),
    y: finite(transform?.y ?? 0, `${path}.y`),
    rotation: angle(transform?.rotation, 'rotation'),
    skewX: bounded(angle(transform?.skewX, 'skewX'), `${path}.skewX`, -1.5533430342749532, 1.5533430342749532),
    skewY: bounded(angle(transform?.skewY, 'skewY'), `${path}.skewY`, -1.5533430342749532, 1.5533430342749532),
    scaleX: bounded(transform?.scaleX ?? 1, `${path}.scaleX`, -100, 100),
    scaleY: bounded(transform?.scaleY ?? 1, `${path}.scaleY`, -100, 100),
    pivotX: finite(transform?.pivotX ?? 0, `${path}.pivotX`),
    pivotY: finite(transform?.pivotY ?? 0, `${path}.pivotY`),
  };
}

function normalizeGeometry(type, geometry, path) {
  switch (type) {
    case 'image': {
      const fit = String(geometry?.fit || 'contain');
      if (!['contain', 'cover', 'fill', 'none'].includes(fit)) throw new TypeError(`${path}.fit must be contain, cover, fill, or none.`);
      return {
        width: bounded(geometry?.width, `${path}.width`, 0.01, 100000),
        height: bounded(geometry?.height, `${path}.height`, 0.01, 100000),
        fit,
      };
    }
    case 'group':
      return null;
    case 'rectangle':
      return {
        width: bounded(geometry?.width, `${path}.width`, 0.01, 100000),
        height: bounded(geometry?.height, `${path}.height`, 0.01, 100000),
        cornerRadius: bounded(geometry?.cornerRadius ?? 0, `${path}.cornerRadius`, 0, 100000),
      };
    case 'ellipse':
      return {
        width: bounded(geometry?.width, `${path}.width`, 0.01, 100000),
        height: bounded(geometry?.height, `${path}.height`, 0.01, 100000),
      };
    case 'polygon':
      return {
        radius: bounded(geometry?.radius, `${path}.radius`, 0.01, 100000),
        sides: integer(geometry?.sides, `${path}.sides`, 3, 256),
      };
    case 'star':
      return {
        outerRadius: bounded(geometry?.outerRadius, `${path}.outerRadius`, 0.01, 100000),
        innerRadius: bounded(geometry?.innerRadius, `${path}.innerRadius`, 0, 100000),
        points: integer(geometry?.points, `${path}.points`, 2, 256),
      };
    case 'path': {
      if (!Array.isArray(geometry?.vertices) || geometry.vertices.length < 2) {
        throw new TypeError(`${path}.vertices must contain at least two vertices.`);
      }
      if (geometry.vertices.length > 100000) throw new RangeError(`${path}.vertices is too large.`);
      const ids = new Set();
      const legacyPrefix = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      const vertices = geometry.vertices.map((vertex, index) => {
        const id = String(vertex.id || `pathVertex_${legacyPrefix}_${index}`);
        if (ids.has(id)) throw new TypeError(`${path}.vertices contains duplicate id ${id}.`);
        ids.add(id);
        const explicitMode = vertex.handleMode == null ? null : String(vertex.handleMode);
        if (explicitMode != null && !VEYRA_VERTEX_HANDLE_MODES.includes(explicitMode)) {
          throw new TypeError(`${path}.vertices[${index}].handleMode must be one of ${VEYRA_VERTEX_HANDLE_MODES.join(', ')}.`);
        }
        const rawHandles = {
          inX: finite(vertex.inX ?? 0, `${path}.vertices[${index}].inX`),
          inY: finite(vertex.inY ?? 0, `${path}.vertices[${index}].inY`),
          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
        };
        const handleMode = explicitMode || Object.values(rawHandles).some((value) => Math.abs(value) > 0.0001)
          ? (explicitMode || 'detached')
          : 'straight';
        const handles = handleMode === 'straight' ? { inX: 0, inY: 0, outX: 0, outY: 0 } : rawHandles;
        return {
          id,
          x: finite(vertex.x, `${path}.vertices[${index}].x`),
          y: finite(vertex.y, `${path}.vertices[${index}].y`),
          ...handles,
          handleMode,
          cornerRadius: bounded(vertex.cornerRadius ?? 0, `${path}.vertices[${index}].cornerRadius`, 0, 100000),
        };
      });
      return { closed: Boolean(geometry.closed), vertices };
    }
    default:
      throw new TypeError(`Unsupported geometry type: ${type}`);
  }
}

function normalizeNode(node, index, anglesUseDegrees, inputVersion) {
  const type = String(node?.type || '');
  if (!VEYRA_NODE_TYPES.includes(type)) throw new TypeError(`nodes[${index}].type is unsupported.`);
  const id = String(node.id || '');
  if (!id) throw new TypeError(`nodes[${index}].id is required.`);
  const pointerEvents = String(node.pointerEvents || 'auto');
  if (!VEYRA_POINTER_EVENT_MODES.includes(pointerEvents)) {
    throw new TypeError(`nodes[${index}].pointerEvents must be one of ${VEYRA_POINTER_EVENT_MODES.join(', ')}.`);
  }
  const result = {
    id,
    type,
    name: String(node.name || type),
    parent: normalizeReference(node.parent ?? node.parentId, 'node', `nodes[${index}].parent`),
    visible: node.visible !== false,
    locked: Boolean(node.locked),
    ...(pointerEvents !== 'auto' ? { pointerEvents } : {}),
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
    transform: normalizeTransform(node.transform, `nodes[${index}].transform`, anglesUseDegrees),
    paint: {
      fill: normalizeFill(node.paint?.fill, `nodes[${index}].paint.fill`, inputVersion, '#ec4899'),
      stroke: color(node.paint?.stroke ?? 'none', `nodes[${index}].paint.stroke`),
      strokeWidth: bounded(node.paint?.strokeWidth ?? 0, `nodes[${index}].paint.strokeWidth`, 0, 10000),
    },
    geometry: normalizeGeometry(type, node.geometry, `nodes[${index}].geometry`),
  };
  if (type === 'image') result.asset = normalizeReference(node.asset ?? node.assetId, 'asset', `nodes[${index}].asset`);
  return result;
}

function normalizeAsset(asset, index) {
  const type = String(asset?.type || '');
  if (!VEYRA_ASSET_TYPES.includes(type)) throw new TypeError(`assets[${index}].type is unsupported.`);
  const id = String(asset?.id || '');
  if (!id) throw new TypeError(`assets[${index}].id is required.`);
  const sourceKind = String(asset?.source?.kind || '');
  if (!['external', 'embedded'].includes(sourceKind)) {
    throw new TypeError(`assets[${index}].source.kind must be "external" or "embedded".`);
  }
  const source = sourceKind === 'external'
    ? { kind: sourceKind, uri: String(asset.source.uri || '') }
    : { kind: sourceKind, data: String(asset.source.data || '') };
  const optionalMetric = (value, path) => value == null ? null : bounded(value, path, 0, 1000000000);
  return {
    id,
    type,
    name: String(asset.name || type),
    mimeType: String(asset.mimeType || ''),
    source,
    metadata: {
      width: optionalMetric(asset.metadata?.width, `assets[${index}].metadata.width`),
      height: optionalMetric(asset.metadata?.height, `assets[${index}].metadata.height`),
      duration: optionalMetric(asset.metadata?.duration, `assets[${index}].metadata.duration`),
    },
  };
}

function normalizeRigTransform(transform, path, anglesUseDegrees) {
  const angleValue = finite(transform?.rotation ?? 0, `${path}.rotation`);
  return {
    x: finite(transform?.x ?? 0, `${path}.x`),
    y: finite(transform?.y ?? 0, `${path}.y`),
    rotation: anglesUseDegrees ? degreesToRadians(angleValue) : angleValue,
    scaleX: bounded(transform?.scaleX ?? 1, `${path}.scaleX`, -100, 100),
    scaleY: bounded(transform?.scaleY ?? 1, `${path}.scaleY`, -100, 100),
  };
}

function normalizeBone(bone, index, anglesUseDegrees) {
  const id = String(bone?.id || '');
  if (!id) throw new TypeError(`bones[${index}].id is required.`);
  return {
    id,
    name: String(bone.name || 'Bone'),
    parent: normalizeReference(bone.parent, 'bone', `bones[${index}].parent`),
    visible: bone.visible !== false,
    locked: Boolean(bone.locked),
    length: bounded(bone.length ?? 100, `bones[${index}].length`, 0.01, 100000),
    color: color(bone.color ?? '#22d3ee', `bones[${index}].color`),
    rest: normalizeRigTransform(bone.rest, `bones[${index}].rest`, anglesUseDegrees),
    pose: normalizeRigTransform(bone.pose, `bones[${index}].pose`, anglesUseDegrees),
  };
}

function normalizeControl(control, index) {
  const id = String(control?.id || '');
  if (!id) throw new TypeError(`controls[${index}].id is required.`);
  const kind = String(control.kind || 'position');
  if (!['position', 'scalar'].includes(kind)) throw new TypeError(`controls[${index}].kind is unsupported.`);
  const min = finite(control.min ?? 0, `controls[${index}].min`);
  const max = finite(control.max ?? 1, `controls[${index}].max`);
  if (min > max) throw new RangeError(`controls[${index}].min cannot exceed max.`);
  return {
    id,
    kind,
    name: String(control.name || 'Control'),
    visible: control.visible !== false,
    locked: Boolean(control.locked),
    position: {
      x: finite(control.position?.x ?? 0, `controls[${index}].position.x`),
      y: finite(control.position?.y ?? 0, `controls[${index}].position.y`),
    },
    value: bounded(control.value ?? min, `controls[${index}].value`, min, max),
    min,
    max,
    color: color(control.color ?? '#facc15', `controls[${index}].color`),
  };
}

function normalizeMesh(mesh, index, inputVersion) {
  const id = String(mesh?.id || '');
  if (!id) throw new TypeError(`meshes[${index}].id is required.`);
  if (!Array.isArray(mesh.vertices) || mesh.vertices.length < 3) {
    throw new TypeError(`meshes[${index}].vertices must contain at least three vertices.`);
  }
  if (mesh.vertices.length > 100000) throw new RangeError(`meshes[${index}].vertices is too large.`);
  const vertexIds = new Set();
  const vertices = mesh.vertices.map((vertex, vertexIndex) => {
    const vertexId = String(vertex?.id || '');
    if (!vertexId) throw new TypeError(`meshes[${index}].vertices[${vertexIndex}].id is required.`);
    if (vertexIds.has(vertexId)) throw new TypeError(`Mesh ${id} contains duplicate vertex id ${vertexId}.`);
    vertexIds.add(vertexId);
    if (!Array.isArray(vertex.weights)) throw new TypeError(`Mesh vertex ${vertexId}.weights must be an array.`);
    if (vertex.weights.length > 8) throw new RangeError(`Mesh vertex ${vertexId} has more than eight bone influences.`);
    const boneIds = new Set();
    const weights = vertex.weights.map((weight, weightIndex) => {
      const bone = normalizeReference(weight?.bone, 'bone', `meshes[${index}].vertices[${vertexIndex}].weights[${weightIndex}].bone`);
      const boneId = referenceId(bone, 'bone');
      if (boneIds.has(boneId)) throw new TypeError(`Mesh vertex ${vertexId} has duplicate bone weight ${boneId}.`);
      boneIds.add(boneId);
      return {
        bone,
        value: bounded(weight.value, `meshes[${index}].vertices[${vertexIndex}].weights[${weightIndex}].value`, 0, 1),
      };
    });
    return {
      id: vertexId,
      x: finite(vertex.x, `meshes[${index}].vertices[${vertexIndex}].x`),
      y: finite(vertex.y, `meshes[${index}].vertices[${vertexIndex}].y`),
      weights,
    };
  });
  if (!Array.isArray(mesh.triangles)) throw new TypeError(`meshes[${index}].triangles must be an array.`);
  const triangles = mesh.triangles.map((triangle, triangleIndex) => {
    if (!Array.isArray(triangle) || triangle.length !== 3) {
      throw new TypeError(`meshes[${index}].triangles[${triangleIndex}] must contain three vertex references.`);
    }
    return triangle.map((reference, cornerIndex) => {
      const normalized = normalizeReference(reference, 'meshVertex', `meshes[${index}].triangles[${triangleIndex}][${cornerIndex}]`);
      const vertexId = referenceId(normalized, 'meshVertex');
      if (!vertexIds.has(vertexId)) throw new TypeError(`Mesh ${id} triangle targets missing vertex ${vertexId}.`);
      return normalized;
    });
  });
  return {
    id,
    name: String(mesh.name || 'Mesh'),
    visible: mesh.visible !== false,
    locked: Boolean(mesh.locked),
    opacity: bounded(mesh.opacity ?? 1, `meshes[${index}].opacity`, 0, 1),
    paint: {
      fill: normalizeFill(mesh.paint?.fill, `meshes[${index}].paint.fill`, inputVersion, '#f472b6'),
      stroke: color(mesh.paint?.stroke ?? '#831843', `meshes[${index}].paint.stroke`),
      strokeWidth: bounded(mesh.paint?.strokeWidth ?? 2, `meshes[${index}].paint.strokeWidth`, 0, 10000),
    },
    vertices,
    triangles,
  };
}

function requiredReference(value, kind, path) {
  const reference = normalizeReference(value, kind, path);
  if (!reference) throw new TypeError(`${path} is required.`);
  return reference;
}

function normalizeConstraint(constraint, index, anglesUseDegrees) {
  const type = String(constraint?.type || '');
  if (!VEYRA_CONSTRAINT_TYPES.includes(type)) throw new TypeError(`constraints[${index}].type is unsupported.`);
  const id = String(constraint.id || '');
  if (!id) throw new TypeError(`constraints[${index}].id is required.`);
  const base = {
    id,
    type,
    name: String(constraint.name || `${type} constraint`),
    enabled: constraint.enabled !== false,
    strength: bounded(constraint.strength ?? 1, `constraints[${index}].strength`, 0, 1),
    order: integer(constraint.order ?? 0, `constraints[${index}].order`, -100000, 100000),
  };
  if (type === 'ik') {
    if (!Array.isArray(constraint.bones) || ![1, 2].includes(constraint.bones.length)) {
      throw new TypeError(`constraints[${index}].bones must contain one or two bone references.`);
    }
    return {
      ...base,
      bones: constraint.bones.map((bone, boneIndex) => requiredReference(bone, 'bone', `constraints[${index}].bones[${boneIndex}]`)),
      target: requiredReference(constraint.target, 'control', `constraints[${index}].target`),
      bendDirection: Number(constraint.bendDirection) < 0 ? -1 : 1,
    };
  }
  if (type === 'distance') return {
    ...base,
    bone: requiredReference(constraint.bone, 'bone', `constraints[${index}].bone`),
    target: requiredReference(constraint.target, 'control', `constraints[${index}].target`),
    distance: bounded(constraint.distance ?? 100, `constraints[${index}].distance`, 0, 100000),
  };
  if (type === 'path') return {
    ...base,
    bone: requiredReference(constraint.bone, 'bone', `constraints[${index}].bone`),
    path: requiredReference(constraint.path, 'node', `constraints[${index}].path`),
    position: bounded(constraint.position ?? 0, `constraints[${index}].position`, 0, 1),
    rotate: constraint.rotate !== false,
  };
  const offsetValue = finite(constraint.offset ?? 0, `constraints[${index}].offset`);
  return {
    ...base,
    bone: requiredReference(constraint.bone, 'bone', `constraints[${index}].bone`),
    target: requiredReference(constraint.target, 'bone', `constraints[${index}].target`),
    offset: anglesUseDegrees && ['rotation', 'transform'].includes(type)
      ? degreesToRadians(offsetValue)
      : offsetValue,
  };
}

function validateRigReferences(bones, meshes, controls, constraints, nodes) {
  const boneById = new Map(bones.map((bone) => [bone.id, bone]));
  const controlIds = new Set(controls.map((control) => control.id));
  const nodeByIdMap = new Map(nodes.map((node) => [node.id, node]));
  for (const bone of bones) {
    const parentId = referenceId(bone.parent, 'bone');
    if (parentId && !boneById.has(parentId)) throw new TypeError(`Bone ${bone.id} has dangling parent ${parentId}.`);
    if (parentId === bone.id) throw new TypeError(`Bone ${bone.id} cannot parent itself.`);
    const seen = new Set([bone.id]);
    let cursor = parentId;
    while (cursor) {
      if (seen.has(cursor)) throw new TypeError(`Bone hierarchy cycle detected at ${bone.id}.`);
      seen.add(cursor);
      cursor = referenceId(boneById.get(cursor)?.parent, 'bone');
    }
  }
  for (const mesh of meshes) {
    for (const vertex of mesh.vertices) {
      for (const weight of vertex.weights) {
        const boneId = referenceId(weight.bone, 'bone');
        if (!boneById.has(boneId)) throw new TypeError(`Mesh ${mesh.id} weight targets missing bone ${boneId}.`);
      }
    }
  }
  for (const constraint of constraints) {
    const boneRefs = constraint.type === 'ik' ? constraint.bones : [constraint.bone];
    for (const boneRef of boneRefs) {
      const boneId = referenceId(boneRef, 'bone');
      if (!boneById.has(boneId)) throw new TypeError(`Constraint ${constraint.id} targets missing bone ${boneId}.`);
    }
    if (constraint.target?.kind === 'bone' && !boneById.has(referenceId(constraint.target, 'bone'))) {
      throw new TypeError(`Constraint ${constraint.id} targets a missing bone.`);
    }
    if (constraint.target?.kind === 'control' && !controlIds.has(referenceId(constraint.target, 'control'))) {
      throw new TypeError(`Constraint ${constraint.id} targets a missing control.`);
    }
    if (constraint.type === 'path') {
      const path = nodeByIdMap.get(referenceId(constraint.path, 'node'));
      if (!path || path.type !== 'path') throw new TypeError(`Constraint ${constraint.id} requires an authored path node.`);
    }
    if (constraint.type === 'ik' && constraint.bones.length === 2) {
      const firstId = referenceId(constraint.bones[0], 'bone');
      const second = boneById.get(referenceId(constraint.bones[1], 'bone'));
      if (referenceId(second?.parent, 'bone') !== firstId) {
        throw new TypeError(`Constraint ${constraint.id} IK bones must form a parent-child chain.`);
      }
    }
  }
}

function validateHierarchy(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const parentId = referenceId(node.parent, 'node');
    if (parentId != null && !byId.has(parentId)) {
      throw new TypeError(`Node ${node.id} has dangling parent ${parentId}.`);
    }
    if (parentId === node.id) throw new TypeError(`Node ${node.id} cannot parent itself.`);
    const seen = new Set([node.id]);
    let cursor = parentId;
    while (cursor != null) {
      if (seen.has(cursor)) throw new TypeError(`Hierarchy cycle detected at ${node.id}.`);
      seen.add(cursor);
      cursor = referenceId(byId.get(cursor)?.parent, 'node');
    }
  }
}

function normalizeKeyframeValue(value, address, inputVersion, path) {
  if (inputVersion <= 2 && /\/paint\/fill$/.test(address) && typeof value === 'string') {
    return normalizeFill(value, path, inputVersion, '#ec4899');
  }
  return cloneValue(value);
}

function normalizeKeyframe(keyframe, trackPath, index, address, inputVersion, trackId) {
  const frame = integer(keyframe?.frame ?? 0, `${trackPath}.keyframes[${index}].frame`, 0, 100000);
  // Legacy keyframes had no identity. The deterministic migration id is written
  // into the normalized document once, then preserved on every later load;
  // authored ids always win and are validated for duplicates below.
  const id = String(keyframe?.id || `keyframe_${trackId}_${index}`);
  const easing = String(keyframe?.easing || 'linear');
  if (!VEYRA_EASING_TYPES.includes(easing)) {
    throw new TypeError(`${trackPath}.keyframes[${index}].easing must be a valid easing type.`);
  }
  const normalized = {
    id,
    frame,
    value: normalizeKeyframeValue(keyframe?.value, address, inputVersion, `${trackPath}.keyframes[${index}].value`),
    easing,
  };
  if (easing === 'cubic-bezier') {
    if (!Array.isArray(keyframe?.easingParams) || keyframe.easingParams.length !== 4) {
      throw new TypeError(`${trackPath}.keyframes[${index}].easingParams must be an array of 4 numbers.`);
    }
    normalized.easingParams = keyframe.easingParams.map((param, i) =>
      bounded(param, `${trackPath}.keyframes[${index}].easingParams[${i}]`, 0, 1)
    );
  }
  return normalized;
}

function normalizeTrack(track, timelinePath, index, inputVersion) {
  const id = String(track?.id || createId('track'));
  const address = String(track?.address || '');
  if (!address) throw new TypeError(`${timelinePath}.tracks[${index}].address is required.`);
  const trackPath = `${timelinePath}.tracks[${index}]`;
  if (!Array.isArray(track?.keyframes)) {
    throw new TypeError(`${trackPath}.keyframes must be an array.`);
  }
  const keyframes = track.keyframes
    .map((keyframe, kfIndex) => normalizeKeyframe(keyframe, trackPath, kfIndex, address, inputVersion, id))
    .sort((a, b) => a.frame - b.frame);
  return { id, address, keyframes };
}

function normalizeTimeline(timeline, index, inputVersion) {
  const id = String(timeline?.id || createId('timeline'));
  const name = String(timeline?.name || 'Timeline');
  const duration = integer(timeline?.duration ?? 60, `timelines[${index}].duration`, 1, 1000000);
  const fps = integer(timeline?.fps ?? 30, `timelines[${index}].fps`, 1, 240);
  const loop = String(timeline?.loop || 'none');
  if (!VEYRA_LOOP_MODES.includes(loop)) {
    throw new TypeError(`timelines[${index}].loop must be a valid loop mode.`);
  }
  const workStart = integer(timeline?.workStart ?? 0, `timelines[${index}].workStart`, 0, duration);
  const workEnd = integer(timeline?.workEnd ?? duration, `timelines[${index}].workEnd`, workStart, duration);
  if (workEnd === workStart) {
    throw new RangeError(`timelines[${index}].workEnd must be greater than timelines[${index}].workStart.`);
  }
  if (!Array.isArray(timeline?.tracks)) {
    throw new TypeError(`timelines[${index}].tracks must be an array.`);
  }
  const tracks = timeline.tracks.map((track, trackIndex) =>
    normalizeTrack(track, `timelines[${index}]`, trackIndex, inputVersion)
  );
  return { id, name, duration, fps, loop, workStart, workEnd, tracks };
}

function normalizeMachineInput(input, index, machinePath) {
  const path = `${machinePath}.inputs[${index}]`;
  const type = String(input?.type || '');
  if (!VEYRA_MACHINE_INPUT_TYPES.includes(type)) {
    throw new TypeError(`${path}.type must be a valid machine input type.`);
  }
  const id = String(input.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const value = type === 'number' ? finite(input.value, `${path}.value`) : Boolean(input.value);
  return { id, name: String(input.name || ''), type, value };
}

// Single source of truth for the condition operator/type matrix, per
// docs/VEYRA_INTERACTION_SURFACE.md "Operator/type integrity": ordering ops
// gate numbers only, equality ops gate numbers or bools with a strictly
// type-matched value (never a silently coerced one), fired/!fired are
// trigger-only, and no comparison may gate a trigger. `normalizeMachineCondition`
// enforces it at load; the store's edit commands pre-flight type changes with
// the same function, so loader and editor can never drift. Returns a violation
// phrase, or null when the condition is legal.
export const VEYRA_MACHINE_ORDERING_OPS = Object.freeze(['<', '<=', '>', '>=']);

export function machineConditionViolation(op, value, inputType) {
  if (op === 'fired' || op === '!fired') {
    return inputType === 'trigger' ? null : 'requires a trigger input';
  }
  if (value === undefined) {
    return 'requires a comparison value for operator';
  }
  if (inputType === 'trigger') {
    return 'is a comparison operator and cannot gate a trigger input';
  }
  if (VEYRA_MACHINE_ORDERING_OPS.includes(op) && inputType !== 'number') {
    return 'requires a number input';
  }
  if (inputType === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    return 'requires a finite number value';
  }
  if (inputType === 'bool' && typeof value !== 'boolean') {
    return 'requires a boolean value';
  }
  return null;
}

function normalizeMachineCondition(condition, path, inputsById) {
  const id = String(condition?.id || createId('machineCondition'));
  const hasDataSource = condition?.source != null;
  const hasLegacyInput = condition?.input != null || condition?.inputId != null;
  if (hasDataSource && hasLegacyInput) throw new TypeError(`${path} cannot define both source and input.`);
  let source = null, input = null;
  if (hasDataSource) source = normalizeMachineDataEndpoint(condition.source, `${path}.source`);
  else {
    const inputRef = requiredReference(condition?.input ?? condition?.inputId, 'machineInput', `${path}.input`);
    const inputKey = referenceId(inputRef, 'machineInput');
    input = inputsById.get(inputKey)
      || [...inputsById.values()].find((candidate) => candidate.name === inputKey)
      || null;
    if (!input) throw new TypeError(`${path}.input references missing machine input ${inputKey}.`);
  }
  const op = String(condition?.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) throw new TypeError(`${path}.op must be a valid condition operator.`);
  const hasCompare = condition?.compare != null;
  if ((op === 'fired' || op === '!fired') && hasCompare) throw new TypeError(`${path}.compare is not allowed for operator ${op}.`);
  if (hasCompare && condition?.value !== undefined) throw new TypeError(`${path} cannot define both compare and value.`);
  if (input) {
    if (hasCompare) {
      if (input.type === 'trigger') throw new TypeError(`${path}.op '${op}' is a comparison operator and cannot gate a trigger input.`);
      if (VEYRA_MACHINE_ORDERING_OPS.includes(op) && input.type !== 'number') throw new TypeError(`${path}.op '${op}' requires a number input.`);
    } else {
      const violation = machineConditionViolation(op, condition?.value, input.type);
      if (violation) throw new TypeError(`${path}.op '${op}' ${violation} (input ${JSON.stringify(input.name || input.id)} is ${input.type}).`);
    }
  }
  const result = { id, ...(source ? { source } : { input: { kind: 'machineInput', id: input.id } }), op };
  if (op === 'fired' || op === '!fired') return result;
  if (hasCompare) result.compare = normalizeMachineDataEndpoint(condition.compare, `${path}.compare`);
  else {
    if (condition?.value === undefined) throw new TypeError(`${path}.value or compare is required for operator ${op}.`);
    result.value = cloneValue(condition.value);
  }
  return result;
}

function machineInputDescriptor(input) {
  if (!input) return null;
  return { type: input.type === 'bool' ? 'boolean' : input.type };
}

function machineDataEndpointDescriptor(document, endpointInput, path) {
  const endpoint = normalizeMachineDataEndpoint(endpointInput, path);
  const instance = dataViewModelInstanceById(document, endpoint.instance.id);
  if (!instance) throw new TypeError(`${path}.instance references missing View Model instance ${endpoint.instance.id}.`);
  let model = dataViewModelById(document, instance.viewModel.id);
  if (!model) throw new TypeError(`${path}.instance references missing View Model ${instance.viewModel.id}.`);
  let property = null;
  for (let index = 0; index < endpoint.path.length; index += 1) {
    const ref = endpoint.path[index];
    property = model.properties.find(candidate => candidate.id === ref.id) || null;
    if (!property) throw new TypeError(`${path}.path[${index}] references property ${ref.id} outside View Model ${model.id}.`);
    if (index < endpoint.path.length - 1) {
      if (property.type !== 'viewModel' || !property.viewModel) throw new TypeError(`${path}.path[${index}] must be a View Model reference property.`);
      model = dataViewModelById(document, property.viewModel.id);
      if (!model) throw new TypeError(`${path}.path[${index}] references missing View Model ${property.viewModel.id}.`);
    }
  }
  return dataTypeDescriptor(property);
}

function machineLiteralDescriptor(document, value, declared) {
  if (value == null) return { type: 'null' };
  if (typeof value === 'number') return Number.isFinite(value) ? { type: 'number', min: value, max: value } : { type: 'invalid-number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'string') return { type: declared?.type === 'color' ? 'color' : 'string' };
  if (value?.kind === 'enumValue') {
    const owner = (document.enums || []).find(item => item.values.some(entry => entry.id === value.id));
    return { type: 'enum', enum: owner ? { kind: 'enum', id: owner.id } : null };
  }
  if (value?.kind === 'viewModelInstance') {
    const instance = dataViewModelInstanceById(document, value.id);
    return { type: 'viewModel', viewModel: instance?.viewModel || null };
  }
  if (value?.kind === 'list') {
    const list = dataListById(document, value.id);
    const property = list ? graphDataPropertyById(document, list.property.id) : null;
    return property?.type === 'list' ? dataTypeDescriptor(property) : { type: 'list', itemType: null };
  }
  if (value?.kind === 'asset') return { type: 'image' };
  if (value?.kind === 'artboard') return { type: 'artboard' };
  return { type: 'any' };
}

function validateMachineDataConditions(document) {
  for (const machine of document.stateMachines || []) {
    const inputs = new Map(machine.inputs.map(input => [input.id, input]));
    for (const layer of machine.layers || []) for (const transition of layer.transitions || []) {
      for (const condition of transition.conditions || []) {
        const label = `stateMachine ${machine.id}/layer ${layer.id}/transition ${transition.id}/condition ${condition.id}`;
        const source = condition.source
          ? machineDataEndpointDescriptor(document, condition.source, `${label}.source`)
          : machineInputDescriptor(inputs.get(referenceId(condition.input, 'machineInput')));
        if (!source) throw new TypeError(`[machine-condition-source] ${label} has no resolvable source.`);
        if (condition.op === 'fired' || condition.op === '!fired') {
          if (source.type !== 'trigger') throw new TypeError(`[machine-condition-type] ${label}.${condition.op} requires a trigger source.`);
          continue;
        }
        if (source.type === 'trigger') throw new TypeError(`[machine-condition-type] ${label} cannot compare a trigger source.`);
        const compare = condition.compare
          ? machineDataEndpointDescriptor(document, condition.compare, `${label}.compare`)
          : machineLiteralDescriptor(document, condition.value, source);
        if (VEYRA_MACHINE_ORDERING_OPS.includes(condition.op) && (source.type !== 'number' || compare.type !== 'number')) {
          throw new TypeError(`[machine-condition-type] ${label}.${condition.op} requires number sources on both sides.`);
        }
        if (!dataTypeAccepts(source, compare) || !dataTypeAccepts(compare, source)) {
          throw new TypeError(`[machine-condition-type] ${label} compares incompatible definitions ${JSON.stringify(source)} and ${JSON.stringify(compare)}.`);
        }
      }
    }
  }
}

function validateMachineDataActions(document) {
  for (const machine of document.stateMachines || []) for (const layer of machine.layers || []) {
    const owners = [
      ...(layer.states || []).map(state => ({ kind: 'state', id: state.id, actions: state.actions || [] })),
      ...(layer.transitions || []).map(transition => ({ kind: 'transition', id: transition.id, actions: transition.actions || [] })),
    ];
    for (const owner of owners) for (const action of owner.actions) {
      if (action.type !== 'data-set' && action.type !== 'data-fire') continue;
      const label = `stateMachine ${machine.id}/layer ${layer.id}/${owner.kind} ${owner.id}/action ${action.id}`;
      const descriptor = machineDataEndpointDescriptor(document, action.target, `${label}.target`);
      const property = graphDataPropertyById(document, action.target.path.at(-1).id);
      if (!property?.writable) throw new TypeError(`[machine-action-readonly] ${label} targets a read-only data property.`);
      if (action.type === 'data-fire') {
        if (descriptor.type !== 'trigger') throw new TypeError(`[machine-action-type] ${label} data-fire requires a trigger target.`);
        continue;
      }
      if (descriptor.type === 'trigger') throw new TypeError(`[machine-action-type] ${label} cannot data-set a trigger; use data-fire.`);
      const value = machineLiteralDescriptor(document, action.value, descriptor);
      if (!dataTypeAccepts(descriptor, value)) throw new TypeError(`[machine-action-type] ${label} value is incompatible with ${JSON.stringify(descriptor)}.`);
      if (descriptor.type === 'number') {
        if (typeof action.value !== 'number' || !Number.isFinite(action.value)) throw new TypeError(`[machine-action-type] ${label} requires a finite number.`);
        if (descriptor.min != null && action.value < descriptor.min || descriptor.max != null && action.value > descriptor.max) throw new RangeError(`[machine-action-range] ${label} is outside the data property range.`);
      }
    }
  }
}

function resolveMachineNumberInput(value, path, inputsById) {
  if (value && typeof value === 'object' && value.kind === 'data') {
    return normalizeMachineDataEndpoint(value, path);
  }
  const ref = requiredReference(value, 'machineInput', path);
  const key = referenceId(ref, 'machineInput');
  const input = inputsById.get(key) || [...inputsById.values()].find(candidate => candidate.name === key) || null;
  if (!input) throw new TypeError(`${path} references missing machine input ${key}.`);
  if (input.type !== 'number') throw new TypeError(`${path} requires a number input.`);
  return { kind: 'machineInput', id: input.id };
}

function normalizeBlendChild(child, index, path, timelineIds, inputsById, type) {
  const childPath = `${path}.children[${index}]`;
  const id = String(child?.id || '');
  if (!id) throw new TypeError(`${childPath}.id is required.`);
  const timeline = requiredReference(child?.timeline ?? child?.timelineId, 'timeline', `${childPath}.timeline`);
  const timelineId = referenceId(timeline, 'timeline');
  if (!timelineIds.has(timelineId)) throw new TypeError(`${childPath}.timeline references missing timeline ${timelineId}.`);
  const speed = finite(child?.speed ?? 1, `${childPath}.speed`);
  if (speed === 0) throw new TypeError(`${childPath}.speed cannot be zero.`);
  const result = { id, timeline, speed };
  if (type === 'blend1d') result.threshold = finite(child?.threshold, `${childPath}.threshold`);
  if (type === 'directBlend' || type === 'additiveBlend') result.input = resolveMachineNumberInput(child?.input ?? child?.inputId, `${childPath}.input`, inputsById);
  return result;
}

function normalizeMachineAction(action, index, ownerPath, ownerKind, timelineIds, inputsById) {
  const path = `${ownerPath}.actions[${index}]`;
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new TypeError(`${path} must be an action object.`);
  const id = String(action.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const result = createMachineAction({ ...action, id });
  const allowed = ownerKind === 'state' ? ['state-start', 'state-end'] : ['transition-start', 'transition-end'];
  if (!allowed.includes(result.phase)) throw new TypeError(`${path}.phase must be ${allowed.join(' or ')}.`);
  if (result.type === 'input-set' || result.type === 'input-fire') {
    const key = referenceId(result.input, 'machineInput');
    const input = inputsById.get(key) || [...inputsById.values()].find(candidate => candidate.name === key) || null;
    if (!input) throw new TypeError(`${path}.input references missing machine input ${key}.`);
    result.input = createReference('machineInput', input.id);
    if (result.type === 'input-fire' && input.type !== 'trigger') throw new TypeError(`${path}.input must be a trigger input for input-fire.`);
    if (result.type === 'input-set') {
      if (input.type === 'trigger') throw new TypeError(`${path}.input is a trigger; use input-fire.`);
      if (input.type === 'number') {
        if (typeof result.value !== 'number' || !Number.isFinite(result.value)) throw new TypeError(`${path}.value must be finite for number input ${input.id}.`);
      } else if (typeof result.value !== 'boolean') throw new TypeError(`${path}.value must be boolean for bool input ${input.id}.`);
    }
  }
  if (result.type === 'timeline' && !timelineIds.has(referenceId(result.timeline, 'timeline'))) {
    throw new TypeError(`${path}.timeline references missing timeline ${referenceId(result.timeline, 'timeline')}.`);
  }
  return result;
}

function normalizeMachineState(state, index, layerPath, timelineIds, inputsById) {
  const path = `${layerPath}.states[${index}]`;
  const id = String(state?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const type = String(state?.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`${path}.type must be a valid machine state type.`);
  const timelineValue = state?.timeline ?? state?.timelineId;
  const timeline = timelineValue == null || timelineValue === '' ? null : requiredReference(timelineValue, 'timeline', `${path}.timeline`);
  if (type === 'animation' && !timeline) throw new TypeError(`${path}.timeline is required for animation states.`);
  if (timeline && !timelineIds.has(referenceId(timeline, 'timeline'))) throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  if (['entry', 'exit', 'any', 'blend1d', 'directBlend', 'additiveBlend'].includes(type) && timeline) throw new TypeError(`${path}.${type} state cannot own a direct timeline.`);
  const speed = finite(state?.speed ?? 1, `${path}.speed`);
  if (speed === 0) throw new TypeError(`${path}.speed cannot be zero.`);
  const graph = state?.graph && typeof state.graph === 'object' && !Array.isArray(state.graph)
    ? { x: finite(state.graph.x ?? 0, `${path}.graph.x`), y: finite(state.graph.y ?? 0, `${path}.graph.y`) }
    : { x: 0, y: 0 };
  const result = { id, name: String(state.name || ''), displayNameAdvisory: true, caption: String(state.caption ?? ''), type, speed, graph, ...(state.randomizeExit ? { randomizeExit: true } : {}) };
  if (result.randomizeExit && ['entry', 'exit', 'any'].includes(type)) throw new TypeError(`${path}.${type} pseudo-state cannot enable Randomize Exit.`);
  if (timeline) result.timeline = timeline;
  if (state.actions !== undefined && state.actions !== null && !Array.isArray(state.actions)) throw new TypeError(`${path}.actions must be an array.`);
  const actions = (Array.isArray(state.actions) ? state.actions : []).map((action,i)=>normalizeMachineAction(action,i,path,'state',timelineIds,inputsById));
  if (['entry', 'exit', 'any'].includes(type) && actions.length) throw new TypeError(`${path}.${type} pseudo-state cannot own lifecycle actions.`);
  if (actions.length) result.actions = actions;
  if (type === 'blend1d' || type === 'directBlend' || type === 'additiveBlend') {
    if (!Array.isArray(state?.children)) throw new TypeError(`${path}.children must be an array.`);
    result.children = state.children.map((child,i)=>normalizeBlendChild(child,i,path,timelineIds,inputsById,type));
    const childIds = new Set();
    for (const child of result.children) {
      if (childIds.has(child.id)) throw new TypeError(`Duplicate machine blend child id ${child.id} in ${path}.`);
      childIds.add(child.id);
    }
    if (type === 'blend1d') {
      if (result.children.length < 2) throw new TypeError(`${path}.blend1d requires at least two children.`);
      result.input = resolveMachineNumberInput(state?.input ?? state?.inputId, `${path}.input`, inputsById);
      for (let i=1;i<result.children.length;i+=1) if (!(result.children[i].threshold > result.children[i-1].threshold)) {
        throw new TypeError(`${path}.blend1d child thresholds must be strictly increasing in authored order.`);
      }
    } else if (!result.children.length) throw new TypeError(`${path}.${type} requires at least one child.`);
  }
  return result;
}

function normalizeMachineTransition(transition, index, layerPath, stateIds, inputsById, timelineIds) {
  const path = `${layerPath}.transitions[${index}]`;
  const id = String(transition?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const from = requiredReference(transition?.from, 'machineState', `${path}.from`);
  const to = requiredReference(transition?.to, 'machineState', `${path}.to`);
  for (const reference of [from,to]) if (!stateIds.has(referenceId(reference,'machineState'))) throw new TypeError(`${path} references missing machine state ${referenceId(reference,'machineState')}.`);
  if (from.id === to.id) throw new TypeError(`${path} cannot target the same state.`);
  const duration = bounded(transition.duration ?? 0, `${path}.duration`, 0, 10000);
  const after = transition.after == null ? null : bounded(transition.after, `${path}.after`, 0, 100000);
  const exitTime = normalizeTransitionExitTimeValue(transition.exitTime, `${path}.exitTime`);
  const pauseSource = Boolean(transition.pauseSource);
  const allowExitDuringTransition = Boolean(transition.allowExitDuringTransition);
  let randomWeight;
  if (transition.randomWeight != null) {
    randomWeight = finite(transition.randomWeight, `${path}.randomWeight`);
    if (!(randomWeight > 0)) throw new RangeError(`${path}.randomWeight must be positive.`);
  }
  const easing = String(transition.easing || 'linear');
  if (!VEYRA_EASING_TYPES.includes(easing)) throw new TypeError(`${path}.easing must be one of ${VEYRA_EASING_TYPES.join(', ')}.`);
  let easingParams;
  if (easing === 'cubic-bezier') {
    if (!Array.isArray(transition.easingParams) || transition.easingParams.length !== 4) throw new TypeError(`${path}.easingParams must contain four values for cubic-bezier.`);
    easingParams=transition.easingParams.map((value,i)=>bounded(value,`${path}.easingParams[${i}]`,0,1));
  }
  if (transition.conditions !== undefined && transition.conditions !== null && !Array.isArray(transition.conditions)) throw new TypeError(`${path}.conditions must be an array of conditions.`);
  const conditions=(Array.isArray(transition.conditions)?transition.conditions:[]).map((condition,i)=>normalizeMachineCondition(condition,`${path}.conditions[${i}]`,inputsById));
  if (transition.actions !== undefined && transition.actions !== null && !Array.isArray(transition.actions)) throw new TypeError(`${path}.actions must be an array.`);
  const actions=(Array.isArray(transition.actions)?transition.actions:[]).map((action,i)=>normalizeMachineAction(action,i,path,'transition',timelineIds,inputsById));
  return { id, from, to, enabled: transition.enabled !== false, duration, after, exitTime, pauseSource, allowExitDuringTransition, ...(randomWeight != null ? { randomWeight } : {}), easing, ...(easingParams?{easingParams}:{}), conditions, ...(actions.length?{actions}: {}) };
}

function normalizeMachineLayer(layer, index, machinePath, timelineIds, inputsById, globalStateIds, globalTransitionIds) {
  const path=`${machinePath}.layers[${index}]`;
  const id=String(layer?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const states=(Array.isArray(layer?.states)?layer.states:[]).map((state,i)=>normalizeMachineState(state,i,path,timelineIds,inputsById));
  const stateIds=new Set();
  for(const state of states){
    if(stateIds.has(state.id) || globalStateIds.has(state.id)) throw new TypeError(`Duplicate machine state id ${state.id} in ${machinePath}.`);
    stateIds.add(state.id); globalStateIds.add(state.id);
  }
  const transitions=(Array.isArray(layer?.transitions)?layer.transitions:[]).map((transition,i)=>normalizeMachineTransition(transition,i,path,stateIds,inputsById,timelineIds));
  const statesById=new Map(states.map(state=>[state.id,state]));
  for(const transition of transitions){
    const source=statesById.get(referenceId(transition.from,'machineState'));
    if(transition.exitTime && source && ['entry','any','exit'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id}.exitTime is not meaningful for ${source.type} pseudo-states.`);
    if((transition.actions || []).length && source && ['entry','any'].includes(source.type)) throw new TypeError(`${path} transition ${transition.id} from ${source.type} pseudo-state cannot own lifecycle actions.`);
    if(globalTransitionIds.has(transition.id)) throw new TypeError(`Duplicate machine transition id ${transition.id} in ${machinePath}.`);
    globalTransitionIds.add(transition.id);
  }
  const initial=normalizeReference(layer?.initial,'machineState',`${path}.initial`);
  if(initial && !stateIds.has(referenceId(initial,'machineState'))) throw new TypeError(`${path}.initial references missing machine state ${referenceId(initial,'machineState')}.`);
  const graph=layer?.graph && typeof layer.graph==='object' && !Array.isArray(layer.graph)
    ? {x:finite(layer.graph.x ?? 0,`${path}.graph.x`),y:finite(layer.graph.y ?? 0,`${path}.graph.y`)} : {x:0,y:0};
  return {id,name:String(layer?.name || ''),displayNameAdvisory:true,enabled:layer?.enabled!==false,weight:bounded(layer?.weight ?? 1,`${path}.weight`,0,1),order:Number.isFinite(Number(layer?.order))?Math.trunc(Number(layer.order)):index,initial,states,transitions,graph};
}

function normalizeStateMachine(machine, index, timelineIds) {
  const machinePath=`stateMachines[${index}]`;
  const id=String(machine?.id || '');
  if(!id) throw new TypeError(`${machinePath}.id is required.`);
  const inputs=(Array.isArray(machine?.inputs)?machine.inputs:[]).map((input,i)=>normalizeMachineInput(input,i,machinePath));
  const inputsById=new Map(), inputNames=new Set();
  for(const input of inputs){
    if(inputsById.has(input.id)) throw new TypeError(`Duplicate machine input id ${input.id} in ${machinePath}.`);
    if(input.name && inputNames.has(input.name)) throw new TypeError(`Duplicate machine input name "${input.name}" in ${machinePath}.`);
    inputsById.set(input.id,input); if(input.name) inputNames.add(input.name);
  }
  let rawLayers;
  if(Array.isArray(machine?.layers) && machine.layers.length){
    rawLayers=machine.layers.map((layer,i)=>({...cloneValue(layer),order:layer.order ?? i}));
  } else {
    rawLayers=[{id:`machineLayer_${id}_default`,name:'Base Layer',enabled:true,order:0,initial:machine?.initial ?? null,states:Array.isArray(machine?.states)?machine.states:[],transitions:Array.isArray(machine?.transitions)?machine.transitions:[],graph:{x:0,y:0}}];
  }
  const compatibilityInput = machine?.compatibilityLayer ?? machine?.compatibilityLayerId ?? rawLayers[0].id;
  const compatibilityRef = normalizeReference(compatibilityInput, 'machineLayer', `${machinePath}.compatibilityLayer`);
  const compatibilityLayerId = referenceId(compatibilityRef, 'machineLayer');
  const compatibilityIndex = rawLayers.findIndex((layer)=>String(layer.id||'')===compatibilityLayerId);
  if(compatibilityIndex<0) throw new TypeError(`${machinePath}.compatibilityLayer references missing machine layer ${compatibilityLayerId}.`);
  // Existing flat-store commands target compatibility aliases. Fold those
  // edits back only when the source is genuinely a legacy flat machine. For
  // an explicitly layered document the layer records are authoritative; the
  // root fields are compatibility views and may otherwise be stale after a
  // layer-scoped edit (for example deleting the active state).
  if (!(Array.isArray(machine?.layers) && machine.layers.length)) {
    rawLayers[compatibilityIndex]={...rawLayers[compatibilityIndex],
      ...(Array.isArray(machine.states)?{states:machine.states}:{}),
      ...(Array.isArray(machine.transitions)?{transitions:machine.transitions}:{}),
      ...(Object.prototype.hasOwnProperty.call(machine,'initial')?{initial:machine.initial}:{}),
    };
  }
  const layerIds=new Set(), globalStateIds=new Set(), globalTransitionIds=new Set();
  const layers=rawLayers.map((layer,i)=>normalizeMachineLayer(layer,i,machinePath,timelineIds,inputsById,globalStateIds,globalTransitionIds));
  for(const layer of layers){ if(layerIds.has(layer.id)) throw new TypeError(`Duplicate machine layer id ${layer.id} in ${machinePath}.`); layerIds.add(layer.id); }
  layers.sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)); layers.forEach((layer,i)=>{layer.order=i;});
  const compatibility=layers.find((layer)=>layer.id===compatibilityLayerId);
  return {id,name:String(machine.name || ''),layerVersion:VEYRA_MACHINE_LAYER_VERSION,compatibilityLayer:createReference('machineLayer',compatibilityLayerId),inputs,layers,initial:compatibility.initial,states:compatibility.states,transitions:compatibility.transitions};
}

function normalizeListener(listener, index, nodeIds, machinesById, timelineIds) {
  const path = `listeners[${index}]`;
  const kind = String(listener?.kind || '');
  if (!VEYRA_LISTENER_KINDS.includes(kind)) throw new TypeError(`${path}.kind must be a supported listener kind.`);
  const event = String(listener?.event || '');
  if (!VEYRA_LISTENER_EVENTS.includes(event)) throw new TypeError(`${path}.event must be a supported pointer event.`);
  const action = String(listener?.action || '');
  if (!VEYRA_LISTENER_ACTIONS.includes(action)) throw new TypeError(`${path}.action must be one of ${VEYRA_LISTENER_ACTIONS.join(', ')}.`);
  const target = requiredReference(listener?.target ?? listener?.targetId, 'node', `${path}.target`);
  const targetId = referenceId(target, 'node');
  if (!nodeIds.has(targetId)) throw new TypeError(`${path}.target references missing node ${targetId}.`);
  const machineAction = action === 'setInput' || action === 'fire';
  const timelineAction = action === 'play' || action === 'stop' || action === 'seek';
  const machineValue = listener?.machine ?? listener?.machineId;
  const inputValue = listener?.input ?? listener?.inputId;
  const timelineValue = listener?.timeline ?? listener?.timelineId;
  if (machineAction && timelineValue != null) throw new TypeError(`${path}.timeline is not allowed for ${action}.`);
  if (timelineAction && (machineValue != null || inputValue != null)) throw new TypeError(`${path}.machine/input are not allowed for ${action}.`);
  const result = { id: String(listener?.id || createId('listener')), kind, event, target, action };
  if (machineAction) {
    const machineRef = requiredReference(machineValue, 'stateMachine', `${path}.machine`);
    const machineId = referenceId(machineRef, 'stateMachine');
    const machine = machinesById.get(machineId);
    if (!machine) throw new TypeError(`${path}.machine references missing state machine ${machineId}.`);
    if (!machine.states.length) console.warn(`${path} targets state machine ${machineId} with no playable state; interaction will be ignored at runtime. No playable animation is configured for this interaction.`);
    const inputRef = requiredReference(inputValue, 'machineInput', `${path}.input`);
    const inputId = referenceId(inputRef, 'machineInput');
    const input = machine.inputs.find((candidate) => candidate.id === inputId || candidate.name === inputId);
    if (!input) throw new TypeError(`${path}.input references missing machine input ${inputId}.`);
    result.machine = createStateMachineRef(machineId);
    result.input = createMachineInputRef(input.id);
    if (action === 'fire' && input.type !== 'trigger') {
      throw new TypeError(`${path}.input must be a trigger input for fire.`);
    }
    if (action === 'setInput') {
      if (input.type === 'trigger') throw new TypeError(`${path}.input is a trigger; use fire instead of setInput.`);
      if (listener.value === undefined) throw new TypeError(`${path}.value is required for setInput.`);
      if (input.type === 'number') {
        const value = Number(listener.value);
        if (!Number.isFinite(value)) throw new TypeError(`${path}.value must be finite for number input ${input.id}.`);
        result.value = value;
      } else {
        if (typeof listener.value !== 'boolean') throw new TypeError(`${path}.value must be boolean for bool input ${input.id}.`);
        result.value = listener.value;
      }
    }
  } else if (timelineAction) {
    const timelineRef = requiredReference(timelineValue, 'timeline', `${path}.timeline`);
    const timelineId = referenceId(timelineRef, 'timeline');
    if (!timelineIds.has(timelineId)) throw new TypeError(`${path}.timeline references missing timeline ${timelineId}.`);
    result.timeline = createTimelineRef(timelineId);
    if (action === 'seek') {
      const value = Number(listener.value);
      if (!Number.isFinite(value) || value < 0) throw new TypeError(`${path}.value must be a non-negative finite number for seek.`);
      result.value = value;
    }
  }
  return result;
}

function validateStableIdentities(document) {
  const seen = new Map();
  const register = (kind, id, path) => {
    const normalized = String(id || '');
    if (!normalized) throw new TypeError(`${path} requires a stable ${kind} id.`);
    const entries = seen.get(kind) || new Map();
    if (entries.has(normalized)) {
      throw new TypeError(`Duplicate ${kind} id ${normalized}: ${path} conflicts with ${entries.get(normalized)}.`);
    }
    entries.set(normalized, path);
    seen.set(kind, entries);
  };
  const registerPaint = (paint, path) => {
    const stops = paint?.fill?.stops || [];
    stops.forEach((stop, index) => register('gradientStop', stop.id, `${path}.fill.stops[${index}]`));
  };

  register('document', document.id, 'document');
  document.artboards.forEach((artboard, index) => register('artboard', artboard.id, `artboards[${index}]`));
  document.components.forEach((component, index) => register('component', component.id, `components[${index}]`));
  document.componentInstances.forEach((instance, index) => {
    register('componentInstance', instance.id, `componentInstances[${index}]`);
    instance.overrides.forEach((override, overrideIndex) => register('componentOverride', override.id, `componentInstances[${index}].overrides[${overrideIndex}]`));
  });
  document.nodes.forEach((node, index) => {
    register('node', node.id, `nodes[${index}]`);
    if (node.type === 'path') {
      node.geometry.vertices.forEach((vertex, vertexIndex) => register('pathVertex', vertex.id, `nodes[${index}].geometry.vertices[${vertexIndex}]`));
    }
    registerPaint(node.paint, `nodes[${index}].paint`);
  });
  document.assets.forEach((asset, index) => register('asset', asset.id, `assets[${index}]`));
  document.bones.forEach((bone, index) => register('bone', bone.id, `bones[${index}]`));
  document.meshes.forEach((mesh, index) => {
    register('mesh', mesh.id, `meshes[${index}]`);
    mesh.vertices.forEach((vertex, vertexIndex) => register('meshVertex', vertex.id, `meshes[${index}].vertices[${vertexIndex}]`));
    registerPaint(mesh.paint, `meshes[${index}].paint`);
  });
  document.controls.forEach((control, index) => register('control', control.id, `controls[${index}]`));
  document.constraints.forEach((constraint, index) => register('constraint', constraint.id, `constraints[${index}]`));
  document.timelines.forEach((timeline, timelineIndex) => {
    register('timeline', timeline.id, `timelines[${timelineIndex}]`);
    timeline.tracks.forEach((track, trackIndex) => {
      register('track', track.id, `timelines[${timelineIndex}].tracks[${trackIndex}]`);
      track.keyframes.forEach((keyframe, keyframeIndex) => register(
        'keyframe', keyframe.id, `timelines[${timelineIndex}].tracks[${trackIndex}].keyframes[${keyframeIndex}]`,
      ));
    });
  });
  document.stateMachines.forEach((machine, machineIndex) => {
    register('stateMachine', machine.id, `stateMachines[${machineIndex}]`);
    machine.inputs.forEach((input, inputIndex) => register('machineInput', input.id, `stateMachines[${machineIndex}].inputs[${inputIndex}]`));
    machine.layers.forEach((layer, layerIndex) => {
      register('machineLayer', layer.id, `stateMachines[${machineIndex}].layers[${layerIndex}]`);
      layer.states.forEach((state, stateIndex) => {
        register('machineState', state.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}]`);
        (state.children || []).forEach((child, childIndex) => register('machineBlendChild', child.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}].children[${childIndex}]`));
        (state.actions || []).forEach((action, actionIndex) => register('machineAction', action.id, `stateMachines[${machineIndex}].layers[${layerIndex}].states[${stateIndex}].actions[${actionIndex}]`));
      });
      layer.transitions.forEach((transition, transitionIndex) => {
        register('machineTransition', transition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}]`);
        transition.conditions.forEach((condition, conditionIndex) => register('machineCondition', condition.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`));
        (transition.actions || []).forEach((action, actionIndex) => register('machineAction', action.id, `stateMachines[${machineIndex}].layers[${layerIndex}].transitions[${transitionIndex}].actions[${actionIndex}]`));
      });
    });
  });
  document.listeners.forEach((listener, index) => register('listener', listener.id, `listeners[${index}]`));
  document.viewModels.forEach((model, modelIndex) => {
    register('viewModel', model.id, `viewModels[${modelIndex}]`);
    model.properties.forEach((property, propertyIndex) => register('dataProperty', property.id, `viewModels[${modelIndex}].properties[${propertyIndex}]`));
  });
  document.viewModelInstances.forEach((instance, index) => register('viewModelInstance', instance.id, `viewModelInstances[${index}]`));
  document.enums.forEach((item, enumIndex) => {
    register('enum', item.id, `enums[${enumIndex}]`);
    item.values.forEach((value, valueIndex) => register('enumValue', value.id, `enums[${enumIndex}].values[${valueIndex}]`));
  });
  document.converters.forEach((item, index) => register('converter', item.id, `converters[${index}]`));
  document.propertyGroups.forEach((group, groupIndex) => {
    register('propertyGroup', group.id, `propertyGroups[${groupIndex}]`);
    group.properties.forEach((property, propertyIndex) => register('propertyGroupProperty', property.id, `propertyGroups[${groupIndex}].properties[${propertyIndex}]`));
  });
  document.lists.forEach((list, listIndex) => {
    register('list', list.id, `lists[${listIndex}]`);
    list.items.forEach((item, itemIndex) => register('listItem', item.id, `lists[${listIndex}].items[${itemIndex}]`));
  });
  document.bindings.forEach((binding, index) => register('binding', binding.id, `bindings[${index}]`));
  for (const [collection, kind] of [
    ['texts', 'text'], ['layouts', 'layout'], ['events', 'event'], ['accessibility', 'accessibility'],
    ['scripts', 'script'], ['shaders', 'shader'], ['renderPresets', 'renderPreset'], ['interchangeAssets', 'interchangeAsset'],
  ]) {
    (document[collection] || []).forEach((item, index) => {
      register(kind, item.id, `${collection}[${index}]`);
      if (kind === 'text') {
        (item.runs || []).forEach((run, runIndex) => register('textRun', run.id, `${collection}[${index}].runs[${runIndex}]`));
        (item.modifiers || []).forEach((modifier, modifierIndex) => register('textModifier', modifier.id, `${collection}[${index}].modifiers[${modifierIndex}]`));
      }
      if (kind === 'layout') (item.items || []).forEach((child, childIndex) => register('layoutItem', child.id, `${collection}[${index}].items[${childIndex}]`));
      if (kind === 'event') (item.actions || []).forEach((action, actionIndex) => register('eventAction', action.id, `${collection}[${index}].actions[${actionIndex}]`));
    });
  }
}

export function normalizeDocument(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Veyra document must be an object.');
  if (input.format !== VEYRA_FORMAT) throw new TypeError(`Expected format "${VEYRA_FORMAT}".`);
  const inputVersion = Number(input.version);
  if (!VEYRA_SUPPORTED_VERSIONS.includes(inputVersion)) {
    throw new TypeError(`Unsupported Veyra version ${input.version}; expected one of ${VEYRA_SUPPORTED_VERSIONS.join(', ')}.`);
  }
  if (!Array.isArray(input.nodes)) throw new TypeError('nodes must be an array.');
  if (input.nodes.length > 10000) throw new RangeError('Veyra document contains too many nodes.');

  const anglesUseDegrees = inputAnglesUseDegrees(input.conventions);
  const conventions = normalizeConventions(input.conventions);
  const nodes = input.nodes.map((node, index) => normalizeNode(node, index, anglesUseDegrees, inputVersion));
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new TypeError(`Duplicate node id ${node.id}.`);
    ids.add(node.id);
  }
  validateHierarchy(nodes);

  const bones = Array.isArray(input.bones)
    ? input.bones.map((bone, index) => normalizeBone(bone, index, anglesUseDegrees))
    : [];
  const meshes = Array.isArray(input.meshes)
    ? input.meshes.map((mesh, index) => normalizeMesh(mesh, index, inputVersion))
    : [];
  const controls = Array.isArray(input.controls)
    ? input.controls.map((control, index) => normalizeControl(control, index))
    : [];
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map((constraint, index) => normalizeConstraint(constraint, index, anglesUseDegrees))
    : [];
  for (const [label, items] of Object.entries({ bone: bones, mesh: meshes, control: controls, constraint: constraints })) {
    const itemIds = new Set();
    for (const item of items) {
      if (itemIds.has(item.id)) throw new TypeError(`Duplicate ${label} id ${item.id}.`);
      itemIds.add(item.id);
    }
  }
  validateRigReferences(bones, meshes, controls, constraints, nodes);

  const assets = Array.isArray(input.assets)
    ? input.assets.map((asset, index) => normalizeAsset(asset, index))
    : [];
  const assetIds = new Set();
  for (const asset of assets) {
    if (assetIds.has(asset.id)) throw new TypeError(`Duplicate asset id ${asset.id}.`);
    assetIds.add(asset.id);
  }
  for (const [index, node] of nodes.entries()) {
    if (node.type !== 'image' || !node.asset) continue;
    if (!assetIds.has(node.asset.id)) throw new TypeError(`nodes[${index}].asset references missing asset ${node.asset.id}.`);
    const asset = assets.find((candidate) => candidate.id === node.asset.id);
    if (asset.type !== 'image') throw new TypeError(`nodes[${index}].asset must reference an image asset, not ${asset.type}.`);
  }

  const semantics = normalizeSemanticRecords(input.semantics || [], { nodes, meshes });

  const timelines = Array.isArray(input.timelines)
    ? input.timelines.map((timeline, index) => normalizeTimeline(timeline, index, inputVersion))
    : [];
  const timelineIds = new Set();
  for (const timeline of timelines) {
    if (timelineIds.has(timeline.id)) throw new TypeError(`Duplicate timeline id ${timeline.id}.`);
    timelineIds.add(timeline.id);
  }

  const stateMachines = Array.isArray(input.stateMachines)
    ? input.stateMachines.map((machine, index) => normalizeStateMachine(machine, index, timelineIds))
    : [];
  const machineIds = new Set();
  const machinesById = new Map();
  for (const machine of stateMachines) {
    if (machineIds.has(machine.id)) throw new TypeError(`Duplicate state machine id ${machine.id}.`);
    machineIds.add(machine.id);
    machinesById.set(machine.id, machine);
  }

  const rawListenersPresent = Object.prototype.hasOwnProperty.call(input, 'listeners');
  if (rawListenersPresent && !Array.isArray(input.listeners)) {
    throw new TypeError('listeners must be an array.');
  }
  const listeners = (Array.isArray(input.listeners) ? input.listeners : []).map(
    (listener, index) => normalizeListener(listener, index, ids, machinesById, timelineIds)
  );
  const listenerIds = new Set();
  for (const listener of listeners) {
    if (listenerIds.has(listener.id)) throw new TypeError(`Duplicate listener id ${listener.id}.`);
    listenerIds.add(listener.id);
  }

  const document = {
    format: VEYRA_FORMAT,
    version: listeners.length > 0 ? VEYRA_LISTENER_VERSION : VEYRA_VERSION,
    conventions,
    id: String(input.id || createId('document')),
    name: String(input.name || 'Untitled Veyra'),
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
    artboard: {
      // Legacy documents had an implicit frame origin at world (0,0). Keep
      // that migration deterministic while making frame position authored.
      x: finite(input.artboard?.x ?? 0, 'artboard.x'),
      y: finite(input.artboard?.y ?? 0, 'artboard.y'),
      width: bounded(input.artboard?.width ?? 960, 'artboard.width', 1, 100000),
      height: bounded(input.artboard?.height ?? 640, 'artboard.height', 1, 100000),
      background: color(input.artboard?.background ?? '#fff7fc', 'artboard.background'),
    },
    assets,
    nodes,
    semantics,
    bones,
    meshes,
    controls,
    constraints,
    timelines,
    stateMachines,
    listeners,
  };
  const projectDocument = normalizeProjectDocument(input, document);
  const dataDocument = normalizeDataGraphDocument(input, projectDocument);
  validateMachineDataConditions(dataDocument);
  validateMachineDataActions(dataDocument);
  // Feature families are an additive graph layer, but they still participate
  // in the universal identity and semantic registries. Normalize them before
  // those validators so feature targets can be annotated and duplicate IDs
  // cannot slip through merely because they live in a nested collection.
  const featureDocument = normalizeFeatureGraphDocument(input, dataDocument);
  validateStableIdentities(featureDocument);
  validateSemanticRecords(featureDocument);
  // A machine document is always persisted in the canonical layered schema.
  // Data-free/non-machine projects retain their existing v5/v6 generation so
  // existing interchange and golden fixtures remain byte-compatible.
  if (featureDocument.stateMachines?.length) featureDocument.version = VEYRA_LAYERED_MACHINE_VERSION;
  return featureDocument;
}

export function semanticsFor(document, targetOrNodeId) {
  const target = typeof targetOrNodeId === 'string' ? createNodeRef(targetOrNodeId) : targetOrNodeId;
  return semanticsForTarget(document, target);
}

export function semanticFor(document, targetOrNodeId, create = false) {
  const target = typeof targetOrNodeId === 'string' ? createNodeRef(targetOrNodeId) : targetOrNodeId;
  let record = semanticForTarget(document, target);
  if (!record && create) {
    record = createUniversalSemanticRecord(target);
    document.semantics.push(record);
  }
  return record;
}

export function semanticRecordById(document, semanticId) {
  return findSemanticRecordById(document, semanticId);
}

export function artboardById(document, artboardId) { return projectArtboardById(document, artboardId); }
export function componentById(document, componentId) { return projectComponentById(document, componentId); }
export function componentInstanceById(document, instanceId) { return projectComponentInstanceById(document, instanceId); }

export function nodeById(document, nodeId) {
  return document.nodes.find((node) => node.id === nodeId) || null;
}

export function boneById(document, boneId) {
  return document.bones.find((bone) => bone.id === boneId) || null;
}

export function meshById(document, meshId) {
  return document.meshes.find((mesh) => mesh.id === meshId) || null;
}

export function controlById(document, controlId) {
  return document.controls.find((control) => control.id === controlId) || null;
}

export function constraintById(document, constraintId) {
  return document.constraints.find((constraint) => constraint.id === constraintId) || null;
}

export function assetById(document, assetId) {
  return document.assets.find((asset) => asset.id === assetId) || null;
}

export function meshVertexById(document, vertexId) {
  for (const mesh of document.meshes) {
    const vertex = mesh.vertices.find((candidate) => candidate.id === vertexId);
    if (vertex) return vertex;
  }
  return null;
}

export function pathVertexById(document, vertexId) {
  for (const node of document.nodes) {
    if (node.type !== 'path') continue;
    const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
    if (vertex) return vertex;
  }
  return null;
}

export function viewModelById(document, id) { return dataViewModelById(document, id); }
export function viewModelInstanceById(document, id) { return dataViewModelInstanceById(document, id); }
export function dataPropertyById(document, id) { return graphDataPropertyById(document, id); }
export function enumById(document, id) { return dataEnumById(document, id); }
export function enumValueById(document, id) { return dataEnumValueById(document, id); }
export function bindingById(document, id) { return dataBindingById(document, id); }
export function converterById(document, id) { return dataConverterById(document, id); }
export function propertyGroupById(document, id) { return dataPropertyGroupById(document, id); }
export function propertyGroupPropertyById(document, id) { return dataPropertyGroupPropertyById(document, id); }
export function listById(document, id) { return dataListById(document, id); }
export function listItemById(document, id) { return dataListItemById(document, id); }

export function gradientStopById(document, stopId) {
  for (const node of document.nodes) {
    const stop = node.paint?.fill?.stops?.find((candidate) => candidate.id === stopId);
    if (stop) return stop;
  }
  for (const mesh of document.meshes) {
    const stop = mesh.paint?.fill?.stops?.find((candidate) => candidate.id === stopId);
    if (stop) return stop;
  }
  return null;
}

export function trackById(document, trackId) {
  for (const timeline of document.timelines) {
    const track = timeline.tracks.find((candidate) => candidate.id === trackId);
    if (track) return track;
  }
  return null;
}

export function keyframeById(document, keyframeId) {
  for (const timeline of document.timelines) {
    for (const track of timeline.tracks) {
      const keyframe = track.keyframes.find((candidate) => candidate.id === keyframeId);
      if (keyframe) return keyframe;
    }
  }
  return null;
}

export function machineLayerById(document, machineId, layerId) {
  return machineById(document, machineId)?.layers?.find((layer) => layer.id === layerId) || null;
}

/** Return layers in deterministic authored order, with a legacy fallback. */
export function machineLayers(machine) {
  if (!machine) return [];
  if (Array.isArray(machine.layers) && machine.layers.length) {
    return [...machine.layers].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id).localeCompare(String(b.id)));
  }
  if (Array.isArray(machine.states) || Array.isArray(machine.transitions)) {
    return [{
      id: machine.compatibilityLayer?.id || `machineLayer_${machine.id}_default`,
      name: 'Base Layer',
      enabled: true,
      order: 0,
      initial: machine.initial || null,
      states: machine.states || [],
      transitions: machine.transitions || [],
      graph: { x: 0, y: 0 },
    }];
  }
  return [];
}

export function machineStates(machine) {
  return machineLayers(machine).flatMap((layer) => layer.states || []);
}

export function machineTransitions(machine) {
  return machineLayers(machine).flatMap((layer) => layer.transitions || []);
}

export function machineLayerForState(machine, stateId) {
  const id = typeof stateId === 'string' ? stateId : stateId?.id;
  return machineLayers(machine).find((layer) => (layer.states || []).some((state) => state.id === id)) || null;
}

export function machineLayerForTransition(machine, transitionId) {
  const id = typeof transitionId === 'string' ? transitionId : transitionId?.id;
  return machineLayers(machine).find((layer) => (layer.transitions || []).some((transition) => transition.id === id)) || null;
}

export function machineTransitionById(document, machineId, transitionId) {
  const machine = machineById(document, machineId);
  for (const layer of machine?.layers || []) { const found=layer.transitions.find((transition)=>transition.id===transitionId); if(found) return found; }
  return null;
}

export function machineConditionById(document, machineId, conditionId) {
  const machine = machineById(document, machineId);
  for (const layer of machine?.layers || []) for (const transition of layer.transitions) {
    const condition = transition.conditions.find((candidate) => candidate.id === conditionId);
    if (condition) return condition;
  }
  return null;
}

export function listenerById(document, listenerId) {
  return (document.listeners || []).find((listener) => listener.id === listenerId) || null;
}

export function semanticRecordByTarget(document, nodeId) {
  return semanticFor(document, nodeId);
}

export function childrenOf(document, parentId) {
  return document.nodes.filter((node) => referenceId(node.parent, 'node') === parentId);
}

export function descendantIds(document, nodeId) {
  const result = [];
  const visit = (parentId) => {
    for (const child of childrenOf(document, parentId)) {
      result.push(child.id);
      visit(child.id);
    }
  };
  visit(nodeId);
  return result;
}

export function timelineById(document, timelineId) {
  return document.timelines.find((timeline) => timeline.id === timelineId) || null;
}

export function machineById(document, machineId) {
  return (document.stateMachines || []).find((machine) => machine.id === machineId) || null;
}

export function machineStateById(document, machineId, stateId) {
  return machineStates(machineById(document, machineId)).find((state) => state.id === stateId) || null;
}

export function machineInputById(document, machineId, inputId) {
  return machineById(document, machineId)?.inputs.find((input) => input.id === inputId) || null;
}

export function machineTransitionsFrom(document, machineId, stateId) {
  return machineTransitions(machineById(document, machineId)).filter(
    (transition) => referenceId(transition.from, 'machineState') === stateId
  );
}

export function trackByAddress(timeline, address) {
  return timeline.tracks.find((track) => track.address === address) || null;
}

export function createStarterDocument() {
  const character = createNode('group', {
    name: 'Veyra Bloom',
    transform: { x: 480, y: 330 },
    paint: { fill: 'none', stroke: 'none', strokeWidth: 0 },
  });
  const halo = createNode('star', {
    name: 'Signal Halo',
    parent: createNodeRef(character.id),
    transform: { x: 0, y: -8, rotation: degreesToRadians(-8) },
    geometry: { outerRadius: 215, innerRadius: 202, points: 24 },
    paint: { fill: '#fce7f3', stroke: '#f9a8d4', strokeWidth: 2 },
    opacity: 0.72,
  });
  const face = createNode('ellipse', {
    name: 'Face',
    parent: createNodeRef(character.id),
    transform: { x: 0, y: 0 },
    geometry: { width: 310, height: 360 },
    paint: { fill: '#fff7ed', stroke: '#831843', strokeWidth: 5 },
  });
  const leftEye = createNode('ellipse', {
    name: 'Left Eye',
    parent: createNodeRef(character.id),
    transform: { x: -66, y: -38 },
    geometry: { width: 72, height: 46 },
    paint: { fill: '#0f172a', stroke: 'none', strokeWidth: 0 },
  });
  const rightEye = createNode('ellipse', {
    name: 'Right Eye',
    parent: createNodeRef(character.id),
    transform: { x: 66, y: -38 },
    geometry: { width: 72, height: 46 },
    paint: { fill: '#0f172a', stroke: 'none', strokeWidth: 0 },
  });
  const leftSpark = createNode('ellipse', {
    name: 'Left Eye Light',
    parent: createNodeRef(character.id),
    transform: { x: -53, y: -48 },
    geometry: { width: 18, height: 13 },
    paint: { fill: '#22d3ee', stroke: 'none', strokeWidth: 0 },
  });
  const rightSpark = createNode('ellipse', {
    name: 'Right Eye Light',
    parent: createNodeRef(character.id),
    transform: { x: 79, y: -48 },
    geometry: { width: 18, height: 13 },
    paint: { fill: '#22d3ee', stroke: 'none', strokeWidth: 0 },
  });
  const mouth = createNode('path', {
    name: 'Smile',
    parent: createNodeRef(character.id),
    transform: { x: 0, y: 72 },
    geometry: {
      closed: false,
      vertices: [
        { id: createId('vertex'), x: -70, y: -5, inX: 0, inY: 0, outX: 34, outY: 55 },
        { id: createId('vertex'), x: 0, y: 38, inX: -30, inY: 0, outX: 30, outY: 0 },
        { id: createId('vertex'), x: 70, y: -5, inX: -34, inY: 55, outX: 0, outY: 0 },
      ],
    },
    paint: { fill: 'none', stroke: '#ec4899', strokeWidth: 10 },
  });
  const accent = createNode('star', {
    name: 'Veyra Mark',
    parent: createNodeRef(character.id),
    transform: { x: 166, y: -152, rotation: degreesToRadians(12) },
    geometry: { outerRadius: 48, innerRadius: 20, points: 6 },
    paint: { fill: '#06b6d4', stroke: '#155e75', strokeWidth: 3 },
  });

  const upperArm = createBone({
    name: 'Right Upper Arm',
    length: 90,
    rest: { x: 560, y: 390, rotation: 0 },
    color: '#22d3ee',
  });
  const forearm = createBone({
    name: 'Right Forearm',
    parent: createBoneRef(upperArm.id),
    length: 90,
    rest: { x: 90, y: 0, rotation: 0 },
    color: '#67e8f9',
  });
  const handTarget = createControl({
    name: 'Right Hand Target',
    position: { x: 720, y: 450 },
    color: '#facc15',
  });
  const armVertices = [
    { id: createId('meshVertex'), x: 560, y: 375, weights: [{ bone: createBoneRef(upperArm.id), value: 1 }] },
    { id: createId('meshVertex'), x: 560, y: 405, weights: [{ bone: createBoneRef(upperArm.id), value: 1 }] },
    { id: createId('meshVertex'), x: 650, y: 375, weights: [{ bone: createBoneRef(upperArm.id), value: 0.5 }, { bone: createBoneRef(forearm.id), value: 0.5 }] },
    { id: createId('meshVertex'), x: 650, y: 405, weights: [{ bone: createBoneRef(upperArm.id), value: 0.5 }, { bone: createBoneRef(forearm.id), value: 0.5 }] },
    { id: createId('meshVertex'), x: 740, y: 375, weights: [{ bone: createBoneRef(forearm.id), value: 1 }] },
    { id: createId('meshVertex'), x: 740, y: 405, weights: [{ bone: createBoneRef(forearm.id), value: 1 }] },
  ];
  const armMesh = createMesh({
    name: 'Right Arm Skin',
    opacity: 0.58,
    paint: { fill: '#f472b6', stroke: '#831843', strokeWidth: 2 },
    vertices: armVertices,
    triangles: [
      [armVertices[0], armVertices[1], armVertices[2]].map((vertex) => createMeshVertexRef(vertex.id)),
      [armVertices[1], armVertices[3], armVertices[2]].map((vertex) => createMeshVertexRef(vertex.id)),
      [armVertices[2], armVertices[3], armVertices[4]].map((vertex) => createMeshVertexRef(vertex.id)),
      [armVertices[3], armVertices[5], armVertices[4]].map((vertex) => createMeshVertexRef(vertex.id)),
    ],
  });
  const armIk = createConstraint('ik', {
    name: 'Right Arm IK',
    bones: [createBoneRef(upperArm.id), createBoneRef(forearm.id)],
    target: createControlRef(handTarget.id),
    bendDirection: 1,
    strength: 1,
  });

  return normalizeDocument(createDocument({
    name: 'Veyra Bloom Rig',
    nodes: [character, halo, face, leftEye, rightEye, leftSpark, rightSpark, mouth, accent],
    bones: [upperArm, forearm],
    meshes: [armMesh],
    controls: [handTarget],
    constraints: [armIk],
    semantics: [
      createSemanticRecord(character.id, {
        role: 'character',
        description: 'Root character component for the Veyra starter scene.',
        tags: ['character', 'root'],
      }),
      createSemanticRecord(leftEye.id, { role: 'eye', tags: ['face', 'eye', 'left_eye'] }),
      createSemanticRecord(rightEye.id, { role: 'eye', tags: ['face', 'eye', 'right_eye'] }),
      createSemanticRecord(mouth.id, { role: 'mouth', tags: ['face', 'mouth', 'expression'] }),
      createSemanticRecord(accent.id, { role: 'brand_mark', tags: ['veyra', 'accent'] }),
    ],
  }));
}
