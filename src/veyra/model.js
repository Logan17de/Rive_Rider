import {
  degreesToRadians,
  inputAnglesUseDegrees,
  normalizeConventions,
  VEYRA_COORDINATE_CONVENTIONS,
} from './contracts.js';
import {
  createBoneRef,
  createControlRef,
  createMachineInputRef,
  createMachineStateRef,
  createMeshVertexRef,
  createNodeRef,
  createTimelineRef,
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

export const VEYRA_FORMAT = 'veyra';
// v4 is feature-gated: ordinary documents continue to normalize as v3, while
// listener-bearing documents are loud to readers that predate the registry.
export const VEYRA_VERSION = 3;
export const VEYRA_LISTENER_VERSION = 4;
export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4]);
export const VEYRA_LISTENER_KINDS = Object.freeze(['pointer']);
export const VEYRA_LISTENER_EVENTS = Object.freeze([
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
]);
export const VEYRA_LISTENER_ACTIONS = Object.freeze(['setInput', 'fire', 'play', 'stop', 'seek']);
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
  'path',
  'rectangle',
  'ellipse',
  'polygon',
  'star',
]);
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
export const VEYRA_MACHINE_STATE_TYPES = Object.freeze(['animation']);
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
          { id: createId('vertex'), x: -80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0 },
          { id: createId('vertex'), x: 0, y: -70, inX: 0, inY: 0, outX: 0, outY: 0 },
          { id: createId('vertex'), x: 80, y: 55, inX: 0, inY: 0, outX: 0, outY: 0 },
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

export function createMachineCondition(overrides = {}) {
  const op = String(overrides.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) throw new TypeError(`Unsupported condition operator: ${op}`);
  const input = normalizeReference(overrides.input ?? overrides.inputId, 'machineInput', 'condition.input');
  if (!input) throw new TypeError('condition.input is required.');
  const condition = {
    id: overrides.id || createId('machineCondition'),
    input,
    op,
  };
  if (op !== 'fired' && op !== '!fired') {
    if (overrides.value === undefined) throw new TypeError(`condition.value is required for operator ${op}.`);
    condition.value = cloneValue(overrides.value);
  }
  return condition;
}

export function createMachineState(overrides = {}) {
  const type = overrides.type || 'animation';
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) throw new TypeError(`Unsupported machine state type: ${type}`);
  const timeline = overrides.timeline
    ? normalizeReference(overrides.timeline, 'timeline', 'state.timeline')
    : overrides.timelineId
      ? createTimelineRef(overrides.timelineId)
      : null;
  if (type === 'animation' && !timeline) throw new TypeError('animation states require a timeline reference.');
  return {
    id: overrides.id || createId('machineState'),
    name: String(overrides.name || 'State'),
    type,
    timeline,
  };
}

export function createMachineTransition(overrides = {}) {
  const from = normalizeReference(overrides.from, 'machineState', 'transition.from');
  const to = normalizeReference(overrides.to, 'machineState', 'transition.to');
  if (!from || !to) throw new TypeError('transitions require from and to state references.');
  if (from.id === to.id) throw new TypeError('transitions cannot target the same state.');
  const duration = finite(overrides.duration ?? 0, 'transition.duration');
  if (duration < 0) throw new RangeError('transition.duration must be zero or positive.');
  const transition = {
    id: overrides.id || createId('machineTransition'),
    from,
    to,
    duration,
    after: overrides.after == null ? null : finite(overrides.after, 'transition.after'),
    conditions: (overrides.conditions || []).map((condition) => createMachineCondition(condition)),
  };
  if (transition.after !== null && transition.after < 0) {
    throw new RangeError('transition.after must be zero or positive.');
  }
  return transition;
}

export function createStateMachine(overrides = {}) {
  return {
    id: overrides.id || createId('machine'),
    name: String(overrides.name || 'State Machine'),
    initial: overrides.initial == null
      ? null
      : normalizeReference(overrides.initial, 'machineState', 'machine.initial'),
    inputs: (overrides.inputs || []).map((input) => createMachineInput(input)),
    states: (overrides.states || []).map((state) => createMachineState(state)),
    transitions: (overrides.transitions || []).map((transition) => createMachineTransition(transition)),
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
  const machine = machineValue == null || machineValue === '' ? null : String(machineValue);
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
      width: 960,
      height: 640,
      background: '#fff7fc',
      ...(overrides.artboard || {}),
    },
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
  };
}

function finite(value, path) {
  if (!Number.isFinite(Number(value))) throw new TypeError(`${path} must be finite.`);
  return Number(value);
}

function bounded(value, path, min, max) {
  const number = finite(value, path);
  if (number < min || number > max) throw new RangeError(`${path} must be between ${min} and ${max}.`);
  return number;
}

function integer(value, path, min, max) {
  const number = bounded(value, path, min, max);
  if (!Number.isInteger(number)) throw new TypeError(`${path} must be an integer.`);
  return number;
}

function color(value, path) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'none' || /^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  throw new TypeError(`${path} must be "none" or a six-digit hex color.`);
}

function gradientColor(value, path) {
  const normalized = color(value, path);
  if (normalized === 'none') throw new TypeError(`${path} must be a six-digit hex color.`);
  return normalized;
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
        return {
          id,
          x: finite(vertex.x, `${path}.vertices[${index}].x`),
          y: finite(vertex.y, `${path}.vertices[${index}].y`),
          inX: finite(vertex.inX ?? 0, `${path}.vertices[${index}].inX`),
          inY: finite(vertex.inY ?? 0, `${path}.vertices[${index}].inY`),
          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
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
  return {
    id,
    type,
    name: String(node.name || type),
    parent: normalizeReference(node.parent ?? node.parentId, 'node', `nodes[${index}].parent`),
    visible: node.visible !== false,
    locked: Boolean(node.locked),
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
    transform: normalizeTransform(node.transform, `nodes[${index}].transform`, anglesUseDegrees),
    paint: {
      fill: normalizeFill(node.paint?.fill, `nodes[${index}].paint.fill`, inputVersion, '#ec4899'),
      stroke: color(node.paint?.stroke ?? 'none', `nodes[${index}].paint.stroke`),
      strokeWidth: bounded(node.paint?.strokeWidth ?? 0, `nodes[${index}].paint.strokeWidth`, 0, 10000),
    },
    geometry: normalizeGeometry(type, node.geometry, `nodes[${index}].geometry`),
  };
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
  const inputRef = requiredReference(condition?.input ?? condition?.inputId, 'machineInput', `${path}.input`);
  const inputKey = referenceId(inputRef, 'machineInput');
  // Inputs are addressed by stable id, but a unique input name is also
  // accepted so authored documents and AI commands can use the friendlier
  // form; both normalize to the stable id reference.
  const input = inputsById.get(inputKey)
    || [...inputsById.values()].find((candidate) => candidate.name === inputKey)
    || null;
  if (!input) throw new TypeError(`${path}.input references missing machine input ${inputKey}.`);
  const op = String(condition?.op || '');
  if (!VEYRA_CONDITION_OPS.includes(op)) {
    throw new TypeError(`${path}.op must be a valid condition operator.`);
  }
  const violation = machineConditionViolation(op, condition?.value, input.type);
  if (violation) {
    throw new TypeError(
      `${path}.op '${op}' ${violation} (input ${JSON.stringify(input.name || input.id)} is ${input.type}).`,
    );
  }
  const resolvedInput = { kind: 'machineInput', id: input.id };
  if (op === 'fired' || op === '!fired') {
    return { id, input: resolvedInput, op };
  }
  // No coercion: a surviving value is the authored value, type and all.
  return { id, input: resolvedInput, op, value: cloneValue(condition.value) };
}

function normalizeMachineState(state, index, machinePath, timelineIds) {
  const path = `${machinePath}.states[${index}]`;
  const id = String(state?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const type = String(state?.type || 'animation');
  if (!VEYRA_MACHINE_STATE_TYPES.includes(type)) {
    throw new TypeError(`${path}.type must be a valid machine state type.`);
  }
  const timeline = requiredReference(state?.timeline ?? state?.timelineId, 'timeline', `${path}.timeline`);
  if (!timelineIds.has(referenceId(timeline, 'timeline'))) {
    throw new TypeError(`${path}.timeline references missing timeline ${referenceId(timeline, 'timeline')}.`);
  }
  return { id, name: String(state.name || ''), type, timeline };
}

function normalizeMachineTransition(transition, index, machinePath, stateIds, inputsById) {
  const path = `${machinePath}.transitions[${index}]`;
  const id = String(transition?.id || '');
  if (!id) throw new TypeError(`${path}.id is required.`);
  const from = requiredReference(transition?.from, 'machineState', `${path}.from`);
  const to = requiredReference(transition?.to, 'machineState', `${path}.to`);
  for (const reference of [from, to]) {
    if (!stateIds.has(referenceId(reference, 'machineState'))) {
      throw new TypeError(`${path} references missing machine state ${referenceId(reference, 'machineState')}.`);
    }
  }
  if (from.id === to.id) throw new TypeError(`${path} cannot target the same state.`);
  const duration = bounded(transition.duration ?? 0, `${path}.duration`, 0, 10000);
  let after = null;
  if (transition.after != null) {
    after = bounded(transition.after, `${path}.after`, 0, 100000);
  }
  if (transition.conditions !== undefined && transition.conditions !== null
    && !Array.isArray(transition.conditions)) {
    // A malformed conditions field must never empty out to `[]`: that turns a
    // gated transition into an unconditional one — firing EARLIER than
    // authored, with no trace. Same silently-discard family as the operator
    // matrix; refuse rather than repair.
    throw new TypeError(`${path}.conditions must be an array of conditions.`);
  }
  const conditions = (Array.isArray(transition.conditions) ? transition.conditions : []).map(
    (condition, conditionIndex) =>
      normalizeMachineCondition(condition, `${path}.conditions[${conditionIndex}]`, inputsById)
  );
  return { id, from, to, duration, after, conditions };
}

function normalizeStateMachine(machine, index, timelineIds) {
  const machinePath = `stateMachines[${index}]`;
  const id = String(machine?.id || '');
  if (!id) throw new TypeError(`${machinePath}.id is required.`);
  const inputs = (Array.isArray(machine?.inputs) ? machine.inputs : []).map(
    (input, inputIndex) => normalizeMachineInput(input, inputIndex, machinePath)
  );
  const inputsById = new Map();
  const inputNames = new Set();
  for (const input of inputs) {
    if (inputsById.has(input.id)) throw new TypeError(`Duplicate machine input id ${input.id} in ${machinePath}.`);
    if (input.name && inputNames.has(input.name)) {
      throw new TypeError(`Duplicate machine input name "${input.name}" in ${machinePath}.`);
    }
    inputsById.set(input.id, input);
    if (input.name) inputNames.add(input.name);
  }
  const states = (Array.isArray(machine?.states) ? machine.states : []).map(
    (state, stateIndex) => normalizeMachineState(state, stateIndex, machinePath, timelineIds)
  );
  const stateIds = new Set();
  for (const state of states) {
    if (stateIds.has(state.id)) throw new TypeError(`Duplicate machine state id ${state.id} in ${machinePath}.`);
    stateIds.add(state.id);
  }
  const transitions = (Array.isArray(machine?.transitions) ? machine.transitions : []).map(
    (transition, transitionIndex) => normalizeMachineTransition(transition, transitionIndex, machinePath, stateIds, inputsById)
  );
  const transitionIds = new Set();
  for (const transition of transitions) {
    if (transitionIds.has(transition.id)) throw new TypeError(`Duplicate machine transition id ${transition.id} in ${machinePath}.`);
    transitionIds.add(transition.id);
  }
  const initial = normalizeReference(machine?.initial, 'machineState', `${machinePath}.initial`);
  if (initial && !stateIds.has(referenceId(initial, 'machineState'))) {
    throw new TypeError(`${machinePath}.initial references missing machine state ${referenceId(initial, 'machineState')}.`);
  }
  return {
    id,
    name: String(machine.name || ''),
    initial,
    inputs,
    states,
    transitions,
  };
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
    const machineId = String(machineValue || '');
    const machine = machinesById.get(machineId);
    if (!machine) throw new TypeError(`${path}.machine references missing state machine ${machineId}.`);
    if (!machine.states.length) console.warn(`${path} targets state machine ${machineId} with no playable state; interaction will be ignored at runtime. No playable animation is configured for this interaction.`);
    const inputRef = requiredReference(inputValue, 'machineInput', `${path}.input`);
    const inputId = referenceId(inputRef, 'machineInput');
    const input = machine.inputs.find((candidate) => candidate.id === inputId || candidate.name === inputId);
    if (!input) throw new TypeError(`${path}.input references missing machine input ${inputId}.`);
    result.machine = machineId;
    result.input = createMachineInputRef(input.id);
    if (action === 'setInput') {
      if (listener.value === undefined) throw new TypeError(`${path}.value is required for setInput.`);
      result.value = cloneValue(listener.value);
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
    machine.states.forEach((state, stateIndex) => register('machineState', state.id, `stateMachines[${machineIndex}].states[${stateIndex}]`));
    machine.transitions.forEach((transition, transitionIndex) => {
      register('machineTransition', transition.id, `stateMachines[${machineIndex}].transitions[${transitionIndex}]`);
      transition.conditions.forEach((condition, conditionIndex) => register(
        'machineCondition', condition.id,
        `stateMachines[${machineIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}]`,
      ));
    });
  });
  document.listeners.forEach((listener, index) => register('listener', listener.id, `listeners[${index}]`));
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

  const semantics = normalizeSemanticRecords(input.semantics || []);

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
  validateStableIdentities(document);
  validateSemanticRecords(document);
  return document;
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

export function machineTransitionById(document, machineId, transitionId) {
  const machine = machineById(document, machineId);
  return machine?.transitions.find((transition) => transition.id === transitionId) || null;
}

export function machineConditionById(document, machineId, conditionId) {
  const machine = machineById(document, machineId);
  for (const transition of machine?.transitions || []) {
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
  return machineById(document, machineId)?.states.find((state) => state.id === stateId) || null;
}

export function machineInputById(document, machineId, inputId) {
  return machineById(document, machineId)?.inputs.find((input) => input.id === inputId) || null;
}

export function machineTransitionsFrom(document, machineId, stateId) {
  return (machineById(document, machineId)?.transitions || []).filter(
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
