const COMMON_WRITABLE = Object.freeze([
  'name',
  'parent',
  'visible',
  'locked',
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
  'semantic.role',
  'semantic.tags',
  'semantic.description',
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
  return {
    transform: true,
    style: node.type !== 'group',
    resize: ['rectangle', 'ellipse', 'polygon', 'star'].includes(node.type),
    editVertices: node.type === 'path',
    groupChildren: node.type === 'group',
    writable: [...commonWritable, ...geometry],
    animatable: [...commonAnimatable, ...geometry],
  };
}

function pathPattern(path) {
  return path.replace(/\.vertices\.[^.]+\./, '.vertices.*.');
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
  return {
    kind,
    draggable: kind === 'control' && object.kind === 'position',
    poseable: kind === 'bone',
    deformable: kind === 'mesh',
    constrainable: kind === 'bone',
    normalizeWeights: kind === 'mesh',
    mirrorWeights: kind === 'mesh',
    writable: [...base.writable],
    animatable: [...base.animatable],
  };
}

export function supportsRigProperty(kind, object, path, mode = 'writable') {
  return rigCapabilities(kind, object)[mode].includes(pathPattern(path));
}
