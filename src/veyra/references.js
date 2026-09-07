// Typed identity kinds are part of the persisted AI/reference contract. Value
// objects (transforms, geometry parameters, colors, and condition values) are
// intentionally excluded; they are addressed through their owning entity.
export const VEYRA_REFERENCE_KINDS = Object.freeze([
  'document',
  'node',
  'pathVertex',
  'bone',
  'paint',
  'gradientStop',
  'asset',
  'constraint',
  'mesh',
  'meshVertex',
  'control',
  'timeline',
  'track',
  'keyframe',
  'stateMachine',
  'machineState',
  'machineInput',
  'machineTransition',
  'machineCondition',
  'listener',
]);

export function createReference(kind, id) {
  if (!VEYRA_REFERENCE_KINDS.includes(kind)) throw new TypeError(`Unsupported Veyra reference kind: ${kind}`);
  const normalizedId = String(id || '');
  if (!normalizedId) throw new TypeError(`${kind} reference id is required.`);
  return { kind, id: normalizedId };
}

export function createDocumentRef(id) {
  return createReference('document', id);
}

export function createNodeRef(id) {
  return createReference('node', id);
}

export function createPathVertexRef(id) {
  return createReference('pathVertex', id);
}

export function createAssetRef(id) {
  return createReference('asset', id);
}

export function createBoneRef(id) {
  return createReference('bone', id);
}

export function createMeshRef(id) {
  return createReference('mesh', id);
}

export function createMeshVertexRef(id) {
  return createReference('meshVertex', id);
}

export function createConstraintRef(id) {
  return createReference('constraint', id);
}

export function createControlRef(id) {
  return createReference('control', id);
}

export function createTimelineRef(id) {
  return createReference('timeline', id);
}

export function createTrackRef(id) {
  return createReference('track', id);
}

export function createKeyframeRef(id) {
  return createReference('keyframe', id);
}

export function createStateMachineRef(id) {
  return createReference('stateMachine', id);
}

export function createMachineStateRef(id) {
  return createReference('machineState', id);
}

export function createMachineInputRef(id) {
  return createReference('machineInput', id);
}

export function createMachineTransitionRef(id) {
  return createReference('machineTransition', id);
}

export function createMachineConditionRef(id) {
  return createReference('machineCondition', id);
}

export function createListenerRef(id) {
  return createReference('listener', id);
}

export function createPaintRef(id) {
  return createReference('paint', id);
}

export function createGradientStopRef(id) {
  return createReference('gradientStop', id);
}

export function createSemanticTargetRef(id) {
  return createNodeRef(id);
}

export function normalizeReference(value, expectedKind, path = 'reference') {
  if (value == null) return null;
  const reference = typeof value === 'string'
    ? createReference(expectedKind, value)
    : createReference(String(value.kind || ''), value.id);
  if (reference.kind !== expectedKind) {
    throw new TypeError(`${path} must be a ${expectedKind} reference, not ${reference.kind}.`);
  }
  return reference;
}

export function referenceId(value, expectedKind = null) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (expectedKind && value.kind !== expectedKind) return null;
  return String(value.id || '') || null;
}

export function referencesEqual(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return left.kind === right.kind && left.id === right.id;
}
