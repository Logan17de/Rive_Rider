// Typed identity kinds are part of the persisted AI/reference contract. Value
// objects (transforms, geometry parameters, colors, and condition values) are
// intentionally excluded; they are addressed through their owning entity.
export const VEYRA_REFERENCE_KINDS = Object.freeze([
  'document',
  'artboard',
  'component',
  'componentInstance',
  'componentOverride',
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
  'viewModel',
  'viewModelInstance',
  'dataProperty',
  'enum',
  'enumValue',
  'binding',
  'converter',
  'propertyGroup',
  'propertyGroupProperty',
  'list',
  'listItem',
  'semanticRecord',
]);

export function createReference(kind, id) {
  if (!VEYRA_REFERENCE_KINDS.includes(kind)) throw new TypeError(`Unsupported Veyra reference kind: ${kind}`);
  const normalizedId = String(id || '');
  if (!normalizedId) throw new TypeError(`${kind} reference id is required.`);
  return { kind, id: normalizedId };
}

export function createDocumentRef(id) { return createReference('document', id); }
export function createArtboardRef(id) { return createReference('artboard', id); }
export function createComponentRef(id) { return createReference('component', id); }
export function createComponentInstanceRef(id) { return createReference('componentInstance', id); }
export function createComponentOverrideRef(id) { return createReference('componentOverride', id); }
export function createNodeRef(id) { return createReference('node', id); }
export function createPathVertexRef(id) { return createReference('pathVertex', id); }
export function createAssetRef(id) { return createReference('asset', id); }
export function createBoneRef(id) { return createReference('bone', id); }
export function createMeshRef(id) { return createReference('mesh', id); }
export function createMeshVertexRef(id) { return createReference('meshVertex', id); }
export function createConstraintRef(id) { return createReference('constraint', id); }
export function createControlRef(id) { return createReference('control', id); }
export function createTimelineRef(id) { return createReference('timeline', id); }
export function createTrackRef(id) { return createReference('track', id); }
export function createKeyframeRef(id) { return createReference('keyframe', id); }
export function createStateMachineRef(id) { return createReference('stateMachine', id); }
export function createMachineStateRef(id) { return createReference('machineState', id); }
export function createMachineInputRef(id) { return createReference('machineInput', id); }
export function createMachineTransitionRef(id) { return createReference('machineTransition', id); }
export function createMachineConditionRef(id) { return createReference('machineCondition', id); }
export function createListenerRef(id) { return createReference('listener', id); }

export function createPaintRef(ownerKindOrRef, ownerId = null) {
  let ownerKind;
  let id;
  if (ownerKindOrRef && typeof ownerKindOrRef === 'object') {
    ownerKind = String(ownerKindOrRef.kind || '');
    id = String(ownerKindOrRef.id || '');
  } else if (ownerId == null) {
    const encoded = String(ownerKindOrRef || '');
    const separator = encoded.indexOf(':');
    if (separator <= 0) {
      throw new TypeError('paint references must be owner-qualified as node:<id> or mesh:<id>.');
    }
    ownerKind = encoded.slice(0, separator);
    id = encoded.slice(separator + 1);
  } else {
    ownerKind = String(ownerKindOrRef || '');
    id = String(ownerId || '');
  }
  if (!['node', 'mesh'].includes(ownerKind)) {
    throw new TypeError(`paint owner kind must be node or mesh, not ${ownerKind || 'empty'}.`);
  }
  if (!id) throw new TypeError('paint owner id is required.');
  return createReference('paint', `${ownerKind}:${id}`);
}

export function paintOwnerReference(value) {
  const ref = value && typeof value === 'object'
    ? createReference('paint', value.id)
    : createReference('paint', value);
  const separator = ref.id.indexOf(':');
  if (separator <= 0) throw new TypeError('paint reference is not owner-qualified.');
  const ownerKind = ref.id.slice(0, separator);
  const ownerId = ref.id.slice(separator + 1);
  if (!['node', 'mesh'].includes(ownerKind) || !ownerId) {
    throw new TypeError('paint reference must encode a node or mesh owner.');
  }
  return createReference(ownerKind, ownerId);
}

export function createGradientStopRef(id) { return createReference('gradientStop', id); }
export function createViewModelRef(id) { return createReference('viewModel', id); }
export function createViewModelInstanceRef(id) { return createReference('viewModelInstance', id); }
export function createDataPropertyRef(id) { return createReference('dataProperty', id); }
export function createEnumRef(id) { return createReference('enum', id); }
export function createEnumValueRef(id) { return createReference('enumValue', id); }
export function createBindingRef(id) { return createReference('binding', id); }
export function createConverterRef(id) { return createReference('converter', id); }
export function createPropertyGroupRef(id) { return createReference('propertyGroup', id); }
export function createPropertyGroupPropertyRef(id) { return createReference('propertyGroupProperty', id); }
export function createListRef(id) { return createReference('list', id); }
export function createListItemRef(id) { return createReference('listItem', id); }
export function createSemanticRecordRef(id) { return createReference('semanticRecord', id); }

export function createSemanticTargetRef(kindOrRefOrId, id = null) {
  if (kindOrRefOrId && typeof kindOrRefOrId === 'object') {
    return createReference(kindOrRefOrId.kind, kindOrRefOrId.id);
  }
  if (id == null) return createNodeRef(kindOrRefOrId);
  return createReference(kindOrRefOrId, id);
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
