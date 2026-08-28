export const VEYRA_REFERENCE_KINDS = Object.freeze([
  'node',
  'bone',
  'paint',
  'asset',
  'constraint',
  'mesh',
  'meshVertex',
  'control',
  'timeline',
  'machineState',
  'machineInput',
]);

export function createReference(kind, id) {
  if (!VEYRA_REFERENCE_KINDS.includes(kind)) throw new TypeError(`Unsupported Veyra reference kind: ${kind}`);
  const normalizedId = String(id || '');
  if (!normalizedId) throw new TypeError(`${kind} reference id is required.`);
  return { kind, id: normalizedId };
}

export function createNodeRef(id) {
  return createReference('node', id);
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

export function createMachineStateRef(id) {
  return createReference('machineState', id);
}

export function createMachineInputRef(id) {
  return createReference('machineInput', id);
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
