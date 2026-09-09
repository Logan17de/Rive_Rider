// Public host names are distinct from implementation-class method names. Both
// the manifest and the executable host consume this JSON-safe contract.
export const VEYRA_DATA_RUNTIME_PORTS = Object.freeze({
  setDataRuntimeValue: Object.freeze({ method: 'setValue', arguments: ['instanceId', 'propertyId', 'value', 'options'], valueIndex: 2, mutation: true }),
  getDataRuntimeValue: Object.freeze({ method: 'getValue', arguments: ['instanceId', 'propertyId', 'options'], mutation: false }),
  fireDataTrigger: Object.freeze({ method: 'fire', arguments: ['instanceId', 'propertyId', 'options'], mutation: true }),
  resetDataRuntime: Object.freeze({ method: 'reset', arguments: ['options'], mutation: true }),
  getRuntimeList: Object.freeze({ method: 'getList', arguments: ['listId', 'options'], mutation: false }),
  insertRuntimeListItem: Object.freeze({ method: 'insertListItem', arguments: ['listId', 'value', 'index', 'options'], valueIndex: 1, mutation: true }),
  removeRuntimeListItem: Object.freeze({ method: 'removeListItem', arguments: ['listId', 'itemId', 'options'], mutation: true }),
  moveRuntimeListItem: Object.freeze({ method: 'moveListItem', arguments: ['listId', 'itemId', 'index', 'options'], mutation: true }),
  replaceRuntimeListItem: Object.freeze({ method: 'replaceListItem', arguments: ['listId', 'itemId', 'value', 'options'], valueIndex: 2, mutation: true }),
  setPropertyGroupRuntimeValue: Object.freeze({ method: 'setPropertyGroupValue', arguments: ['propertyId', 'value', 'options'], valueIndex: 1, mutation: true }),
  setTwoWayBindingTarget: Object.freeze({ method: 'setTwoWayTarget', arguments: ['bindingId', 'value', 'options'], valueIndex: 1, mutation: true }),
});

export const VEYRA_DATA_RUNTIME_CONTRACT = Object.freeze({
  scopeIdentity: 'exact JSON array of ordered [kind,id] tuples; opaque IDs; structural reset/subtree matching',
  endpointIdentity: 'canonical property-address parser; equivalent Property Group endpoints share conflict/cycle identity',
  observation: 'read/ownership/scene inspection evaluate a live-state snapshot with the same evaluator and do not consume events',
  advancement: 'advanceDataRuntime explicitly evaluates one artboard/scope; each terminal trigger pulse is consumed once, independently of binding fan-out',
  generation: 'replace authored document snapshots (Store default), or call VeyraDataRuntime.invalidateAuthoredDocument() after mutable-host edits',
  listPrecedence: 'authored list until first successful runtime mutation; scoped copy-on-write list then wins until reset',
  listIndex: 'finite numeric indexes truncate and clamp; invalid types/NaN/infinity reject before mutation; missing item returns false',
  emptyList: 'numberToListIndex returns null for an empty list; out-of-range finite indexes clamp to first/last item',
  runtimePorts: VEYRA_DATA_RUNTIME_PORTS,
  advancePort: 'advanceDataRuntime',
  authored: false,
});
