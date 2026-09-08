import {
  VEYRA_SEMANTIC_COMMAND_ACTIONS,
  VEYRA_SEMANTIC_SOURCES,
  VEYRA_SEMANTIC_STATUSES,
  VEYRA_SEMANTIC_TARGET_KINDS,
} from './semantics.js';

const COMMON_WRITABLE = Object.freeze([
  'name',
  'parent',
  'visible',
  'locked',
  'pointerEvents',
  'opacity',
  'transform.x',
  'transform.y',
  'transform.rotation',
  'transform.skewX',
  'transform.skewY',
  'transform.scaleX',
  'transform.scaleY',
  'transform.pivotX',
  'transform.pivotY',
  'paint.fill',
  'paint.stroke',
  'paint.strokeWidth',
]);

const COMMON_ANIMATABLE = Object.freeze([
  'visible',
  'opacity',
  'transform.x',
  'transform.y',
  'transform.rotation',
  'transform.skewX',
  'transform.skewY',
  'transform.scaleX',
  'transform.scaleY',
  'transform.pivotX',
  'transform.pivotY',
  'paint.fill',
  'paint.stroke',
  'paint.strokeWidth',
]);

function fillProperties(fill) {
  if (!fill || fill.type === 'solid') return ['paint.fill.color'];
  const stops = [
    'paint.fill.stops.*.offset',
    'paint.fill.stops.*.color',
    'paint.fill.stops.*.opacity',
  ];
  if (fill.type === 'linearGradient') {
    return ['paint.fill.x1', 'paint.fill.y1', 'paint.fill.x2', 'paint.fill.y2', ...stops];
  }
  if (fill.type === 'radialGradient') {
    return ['paint.fill.cx', 'paint.fill.cy', 'paint.fill.r', 'paint.fill.fx', 'paint.fill.fy', ...stops];
  }
  return [];
}

const GEOMETRY_PROPERTIES = Object.freeze({
  group: [],
  rectangle: ['geometry.width', 'geometry.height', 'geometry.cornerRadius'],
  ellipse: ['geometry.width', 'geometry.height'],
  polygon: ['geometry.radius', 'geometry.sides'],
  star: ['geometry.outerRadius', 'geometry.innerRadius', 'geometry.points'],
  path: [
    'geometry.closed',
    'geometry.vertices.*.x',
    'geometry.vertices.*.y',
    'geometry.vertices.*.inX',
    'geometry.vertices.*.inY',
    'geometry.vertices.*.outX',
    'geometry.vertices.*.outY',
  ],
});

export function nodeCapabilities(node) {
  const geometry = GEOMETRY_PROPERTIES[node.type] || [];
  const commonWritable = node.type === 'group'
    ? COMMON_WRITABLE.filter((path) => !path.startsWith('paint.'))
    : COMMON_WRITABLE;
  const commonAnimatable = node.type === 'group'
    ? COMMON_ANIMATABLE.filter((path) => !path.startsWith('paint.'))
    : COMMON_ANIMATABLE;
  const fill = node.type === 'group' ? [] : fillProperties(node.paint?.fill);
  return {
    transform: true,
    style: node.type !== 'group',
    resize: ['rectangle', 'ellipse', 'polygon', 'star'].includes(node.type),
    editVertices: node.type === 'path',
    groupChildren: node.type === 'group',
    writable: [...commonWritable, ...fill, ...geometry],
    animatable: [...commonAnimatable, ...fill, ...geometry],
  };
}

function pathPattern(path) {
  return path
    .replace(/\.vertices\.[^.]+\./, '.vertices.*.')
    .replace(/\.stops\.[^.]+\./, '.stops.*.');
}

export function supportsNodeProperty(node, path, mode = 'writable') {
  const candidates = nodeCapabilities(node)[mode] || [];
  return candidates.includes(pathPattern(path));
}

const RIG_CAPABILITIES = Object.freeze({
  bone: {
    writable: [
      'name', 'parent', 'visible', 'locked', 'length', 'color',
      'rest.x', 'rest.y', 'rest.rotation', 'rest.scaleX', 'rest.scaleY',
      'pose.x', 'pose.y', 'pose.rotation', 'pose.scaleX', 'pose.scaleY',
    ],
    animatable: [
      'visible', 'length',
      'pose.x', 'pose.y', 'pose.rotation', 'pose.scaleX', 'pose.scaleY',
    ],
  },
  mesh: {
    writable: ['name', 'visible', 'locked', 'opacity', 'paint.fill', 'paint.stroke', 'paint.strokeWidth'],
    animatable: ['visible', 'opacity', 'paint.fill', 'paint.stroke', 'paint.strokeWidth'],
  },
  control: {
    writable: ['name', 'visible', 'locked', 'position.x', 'position.y', 'value', 'min', 'max', 'color'],
    animatable: ['visible', 'position.x', 'position.y', 'value'],
  },
  constraint: {
    writable: [
      'name', 'enabled', 'strength', 'order', 'bendDirection', 'distance',
      'position', 'rotate', 'offset', 'bone', 'bones', 'target', 'path',
    ],
    animatable: ['enabled', 'strength', 'distance', 'position', 'offset'],
  },
});

export function rigCapabilities(kind, object) {
  const base = RIG_CAPABILITIES[kind];
  if (!base) throw new TypeError(`Unsupported rig capability kind: ${kind}`);
  const fill = kind === 'mesh' ? fillProperties(object.paint?.fill) : [];
  return {
    kind,
    draggable: kind === 'control' && object.kind === 'position',
    poseable: kind === 'bone',
    deformable: kind === 'mesh',
    constrainable: kind === 'bone',
    normalizeWeights: kind === 'mesh',
    mirrorWeights: kind === 'mesh',
    writable: [...base.writable, ...fill],
    animatable: [...base.animatable, ...fill],
  };
}

export function supportsRigProperty(kind, object, path, mode = 'writable') {
  return rigCapabilities(kind, object)[mode].includes(pathPattern(path));
}


export const VEYRA_SEMANTIC_CAPABILITIES = Object.freeze({
  targetKinds: Object.freeze([...VEYRA_SEMANTIC_TARGET_KINDS]),
  readable: Object.freeze(['id', 'target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  writable: Object.freeze(['target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  actions: Object.freeze([...VEYRA_SEMANTIC_COMMAND_ACTIONS]),
  statuses: Object.freeze([...VEYRA_SEMANTIC_STATUSES]),
  provenanceSources: Object.freeze([...VEYRA_SEMANTIC_SOURCES]),
});
