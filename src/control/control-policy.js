export const ControlKind = Object.freeze({
  SEMANTIC_PROPERTY: 'semantic-property',
  VIEW_MODEL: 'view-model',
  STATE_MACHINE: 'state-machine',
  IK_TARGET: 'ik-target',
  CONSTRAINT: 'constraint',
  BONE_TRANSFORM: 'bone-transform',
  LAYOUT_PROPERTY: 'layout-property',
  PARAMETRIC_GEOMETRY: 'parametric-geometry',
  POINTS_PATH: 'points-path',
  RAW_BEZIER: 'raw-bezier',
  SKIN_WEIGHT: 'skin-weight',
});

const PRIORITY = new Map([
  [ControlKind.SEMANTIC_PROPERTY, 0],
  [ControlKind.VIEW_MODEL, 10],
  [ControlKind.STATE_MACHINE, 20],
  [ControlKind.IK_TARGET, 30],
  [ControlKind.CONSTRAINT, 40],
  [ControlKind.BONE_TRANSFORM, 50],
  [ControlKind.LAYOUT_PROPERTY, 60],
  [ControlKind.PARAMETRIC_GEOMETRY, 70],
  [ControlKind.POINTS_PATH, 80],
  [ControlKind.RAW_BEZIER, 90],
  // Weights are a deformation-repair tool, not a normal pose/shape control.
  [ControlKind.SKIN_WEIGHT, 100],
]);

export function controlPriority(kind) {
  return PRIORITY.get(kind) ?? Number.POSITIVE_INFINITY;
}

export function rankAvailableControls(controls) {
  return Array.from(controls || [])
    .map((control, order) => ({ control, order }))
    .filter(({ control }) => control?.available !== false)
    .sort((a, b) =>
      controlPriority(a.control.kind) - controlPriority(b.control.kind)
      || a.order - b.order)
    .map(({ control }) => control);
}

export function preferredControl(controls) {
  return rankAvailableControls(controls)[0] || null;
}
