from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, count))

# Add query/index descriptions from the single data graph; resolver remains the only semantic index implementation.
p = Path('src/veyra/dataGraph.js')
t = p.read_text()
append = r'''

function endpointEntityRef(document, endpoint) {
  if (endpoint.kind === 'data') return endpoint.path.at(-1) || endpoint.instance;
  if (endpoint.kind === 'propertyGroupProperty') return endpoint.property;
  if (endpoint.kind === 'property') {
    try {
      const parsed = parseDataAwarePropertyAddress(endpoint.address);
      return createReference(parsed.kind, parsed.id);
    } catch { return null; }
  }
  return null;
}

export function dataIndexEntitySpecs(document) {
  const specs = [];
  const push = (kind, item, type = kind, displayName = item?.name || '', capabilities = []) => specs.push({
    ref: createReference(kind, item.id), object: item, type, displayName,
    capabilities: [...new Set([`data:${kind}`, 'stable-id', 'name-independent', ...capabilities])],
  });
  for (const model of document.viewModels || []) {
    push('viewModel', model, 'viewModel', model.name, ['data-definition']);
    for (const property of model.properties) push('dataProperty', property, property.type, property.name, ['typed-data-property', property.readable ? 'readable' : '', property.writable ? 'writable' : '', property.bindable ? 'bindable' : ''].filter(Boolean));
  }
  for (const instance of document.viewModelInstances || []) push('viewModelInstance', instance, 'viewModelInstance', instance.name, ['runtime-instance', 'authored-initial-values']);
  for (const item of document.enums || []) {
    push('enum', item, 'enum', item.name, ['enum-definition']);
    for (const value of item.values) push('enumValue', value, 'enumValue', value.name, ['enum-value']);
  }
  for (const converter of document.converters || []) push('converter', converter, converter.type, converter.name, ['converter', 'deterministic-evaluator']);
  for (const group of document.propertyGroups || []) {
    push('propertyGroup', group, 'propertyGroup', group.name, ['artboard-local', 'keyable']);
    for (const property of group.properties) push('propertyGroupProperty', property, property.type, property.name, ['keyable', 'bindable']);
  }
  for (const list of document.lists || []) {
    push('list', list, 'list', list.name, ['stable-list', 'runtime-clonable']);
    for (const item of list.items) push('listItem', item, 'listItem', '', ['stable-list-item']);
  }
  for (const binding of document.bindings || []) push('binding', binding, binding.mode, binding.name, ['binding', binding.mode, binding.enabled ? 'enabled' : 'disabled']);
  return specs.sort((a, b) => a.ref.kind.localeCompare(b.ref.kind) || a.ref.id.localeCompare(b.ref.id));
}

export function dataIndexRelationshipSpecs(document) {
  const result = [];
  const add = (from, relation, to, reverse = null, detail = undefined, source = 'data-graph') => {
    if (!from || !to) return;
    result.push({ from: clone(from), relation, to: clone(to), reverse, detail: clone(detail), source });
  };
  const documentRef = createReference('document', document.id);
  for (const model of document.viewModels || []) {
    const modelRef = createReference('viewModel', model.id); add(modelRef, 'owner', documentRef, 'owns');
    for (const property of model.properties) add(createReference('dataProperty', property.id), 'owner', modelRef, 'owns');
  }
  for (const instance of document.viewModelInstances || []) {
    const ref = createReference('viewModelInstance', instance.id);
    add(ref, 'owner', instance.artboard, 'owns'); add(ref, 'instance_of', instance.viewModel, 'instantiated_by');
  }
  for (const item of document.enums || []) {
    const enumRef = createReference('enum', item.id); add(enumRef, 'owner', documentRef, 'owns');
    for (const value of item.values) add(createReference('enumValue', value.id), 'owner', enumRef, 'owns');
  }
  for (const converter of document.converters || []) add(createReference('converter', converter.id), 'owner', documentRef, 'owns');
  for (const group of document.propertyGroups || []) {
    const groupRef = createReference('propertyGroup', group.id); add(groupRef, 'owner', group.artboard, 'owns');
    for (const property of group.properties) add(createReference('propertyGroupProperty', property.id), 'owner', groupRef, 'owns');
  }
  for (const list of document.lists || []) {
    const listRef = createReference('list', list.id); add(listRef, 'owner', list.owner, 'owns'); add(listRef, 'list_property', list.property, 'used_by_list');
    for (const item of list.items) add(createReference('listItem', item.id), 'owner', listRef, 'owns');
  }
  for (const binding of document.bindings || []) {
    const bindingRef = createReference('binding', binding.id); add(bindingRef, 'owner', binding.artboard, 'owns');
    const sourceRef = endpointEntityRef(document, binding.source);
    const targetRef = endpointEntityRef(document, binding.target);
    if (sourceRef) add(bindingRef, 'binding_reads', sourceRef, 'read_by_binding', { endpoint: clone(binding.source), endpointKey: bindingEndpointKey(binding.source) });
    if (targetRef) add(bindingRef, 'binding_writes', targetRef, 'written_by_binding', { endpoint: clone(binding.target), endpointKey: bindingEndpointKey(binding.target), address: binding.target.kind === 'property' ? binding.target.address : binding.target.kind === 'propertyGroupProperty' ? `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value` : undefined });
    for (const converter of binding.converterChain) add(bindingRef, 'uses_converter', converter, 'used_by_binding');
  }
  return result.sort((a, b) => `${a.from.kind}:${a.from.id}:${a.relation}:${a.to.kind}:${a.to.id}`.localeCompare(`${b.from.kind}:${b.from.id}:${b.relation}:${b.to.kind}:${b.to.id}`));
}

export function bindingControllersForAddress(document, address) {
  return (document.bindings || []).filter((binding) => binding.enabled && (
    (binding.target.kind === 'property' && binding.target.address === address)
    || (binding.target.kind === 'propertyGroupProperty' && address === `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value`)
  )).sort(bindingOrder).map((binding, index, all) => ({
    kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,
    source: clone(binding.source), target: clone(binding.target), converters: binding.converterChain.map((ref) => clone(ref)),
    priority: binding.priority, activeByConflictPolicy: index === 0,
    conflictPolicy: all.length > 1 ? clone(VEYRA_BINDING_CONFLICT_POLICY) : null,
    evidence: [{ kind: 'binding-target', address, sourceKey: bindingEndpointKey(binding.source), targetKey: bindingEndpointKey(binding.target) }],
  }));
}
'''
if 'export function dataIndexEntitySpecs' not in t:
    p.write_text(t + append)

# Store receives M8 methods through a focused installer; authored mutations still use Store.execute/normalization/history.
patch('src/veyra/store.js',
"import {\n  addVertexToDocument,",
"import { installVeyraDataStoreMethods } from './dataStore.js';\nimport {\n  addVertexToDocument,")
# Append installer after class definition.
p = Path('src/veyra/store.js')
t = p.read_text()
if 'installVeyraDataStoreMethods(VeyraStore);' not in t:
    p.write_text(t + "\n\ninstallVeyraDataStoreMethods(VeyraStore);\n")

# Canonical M8 JSON-safe command table.
commands = r'''  createViewModel: { summary: 'Create a stable View Model definition.', params: [param('overrides','object',false)], run: (store,args,command) => store.createViewModel(args.overrides ?? {},command ?? {}) },
  updateViewModel: { summary: 'Update View Model display metadata by stable id.', params: [param('modelId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateViewModel(args.modelId,args.changes,command ?? {}) },
  removeViewModel: { summary: 'Remove an unused View Model definition fail-closed on dependencies.', params: [param('modelId','string',true)], run: (store,args,command) => store.removeViewModel(args.modelId,command ?? {}) },
  addDataProperty: { summary: 'Add a typed stable dataProperty to a View Model.', params: [param('modelId','string',true),param('overrides','object',true)], run: (store,args,command) => store.addDataProperty(args.modelId,args.overrides,command ?? {}) },
  updateDataProperty: { summary: 'Update a typed dataProperty without changing identity.', params: [param('modelId','string',true),param('propertyId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateDataProperty(args.modelId,args.propertyId,args.changes,command ?? {}) },
  removeDataProperty: { summary: 'Remove a dataProperty only when dependency evidence is clear.', params: [param('modelId','string',true),param('propertyId','string',true)], run: (store,args,command) => store.removeDataProperty(args.modelId,args.propertyId,command ?? {}) },
  createViewModelInstance: { summary: 'Create an authored View Model instance with initial values.', params: [param('overrides','object',true)], run: (store,args,command) => store.createViewModelInstance(args.overrides,command ?? {}) },
  updateViewModelInstance: { summary: 'Update View Model instance metadata or authored initial values.', params: [param('instanceId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateViewModelInstance(args.instanceId,args.changes,command ?? {}) },
  removeViewModelInstance: { summary: 'Remove a View Model instance and its owned runtime-data bindings/lists.', params: [param('instanceId','string',true)], run: (store,args,command) => store.removeViewModelInstance(args.instanceId,command ?? {}) },
  createBinding: { summary: 'Create a typed stable one-way or legal two-way Binding.', params: [param('overrides','object',true)], run: (store,args,command) => store.createBinding(args.overrides,command ?? {}) },
  updateBinding: { summary: 'Update a Binding through full graph validation and cycle checks.', params: [param('bindingId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateBinding(args.bindingId,args.changes,command ?? {}) },
  removeBinding: { summary: 'Remove a Binding without destroying source or target data.', params: [param('bindingId','string',true)], run: (store,args,command) => store.removeBinding(args.bindingId,command ?? {}) },
  createEnum: { summary: 'Create a stable enum definition.', params: [param('overrides','object',false)], run: (store,args,command) => store.createEnum(args.overrides ?? {},command ?? {}) },
  updateEnum: { summary: 'Update enum metadata while preserving value identities.', params: [param('enumId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateEnum(args.enumId,args.changes,command ?? {}) },
  removeEnum: { summary: 'Remove an unused enum fail-closed on dependencies.', params: [param('enumId','string',true)], run: (store,args,command) => store.removeEnum(args.enumId,command ?? {}) },
  addEnumValue: { summary: 'Add a stable enumValue.', params: [param('enumId','string',true),param('overrides','object',true)], run: (store,args,command) => store.addEnumValue(args.enumId,args.overrides,command ?? {}) },
  updateEnumValue: { summary: 'Rename an enumValue without changing identity.', params: [param('enumId','string',true),param('valueId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateEnumValue(args.enumId,args.valueId,args.changes,command ?? {}) },
  removeEnumValue: { summary: 'Remove an unused enumValue fail-closed.', params: [param('enumId','string',true),param('valueId','string',true)], run: (store,args,command) => store.removeEnumValue(args.enumId,args.valueId,command ?? {}) },
  createConverter: { summary: 'Create a deterministic typed converter.', params: [param('overrides','object',true)], run: (store,args,command) => store.createConverter(args.overrides,command ?? {}) },
  updateConverter: { summary: 'Update converter type/config with binding revalidation.', params: [param('converterId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateConverter(args.converterId,args.changes,command ?? {}) },
  removeConverter: { summary: 'Remove an unused converter fail-closed.', params: [param('converterId','string',true)], run: (store,args,command) => store.removeConverter(args.converterId,command ?? {}) },
  createPropertyGroup: { summary: 'Create an artboard-local keyable Property Group.', params: [param('overrides','object',true)], run: (store,args,command) => store.createPropertyGroup(args.overrides,command ?? {}) },
  updatePropertyGroup: { summary: 'Update Property Group metadata by stable id.', params: [param('groupId','string',true),param('changes','object',true)], run: (store,args,command) => store.updatePropertyGroup(args.groupId,args.changes,command ?? {}) },
  removePropertyGroup: { summary: 'Remove a Property Group only when properties are unreferenced.', params: [param('groupId','string',true)], run: (store,args,command) => store.removePropertyGroup(args.groupId,command ?? {}) },
  addPropertyGroupProperty: { summary: 'Add a keyable/data-bindable Property Group property.', params: [param('groupId','string',true),param('overrides','object',true)], run: (store,args,command) => store.addPropertyGroupProperty(args.groupId,args.overrides,command ?? {}) },
  updatePropertyGroupProperty: { summary: 'Update Property Group property while preserving identity.', params: [param('groupId','string',true),param('propertyId','string',true),param('changes','object',true)], run: (store,args,command) => store.updatePropertyGroupProperty(args.groupId,args.propertyId,args.changes,command ?? {}) },
  removePropertyGroupProperty: { summary: 'Remove a Property Group property fail-closed on dependencies.', params: [param('groupId','string',true),param('propertyId','string',true)], run: (store,args,command) => store.removePropertyGroupProperty(args.groupId,args.propertyId,command ?? {}) },
  createList: { summary: 'Create an authored initial stable list owned by a data property.', params: [param('overrides','object',true)], run: (store,args,command) => store.createList(args.overrides,command ?? {}) },
  updateList: { summary: 'Update list metadata/ownership without replacing item identities.', params: [param('listId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateList(args.listId,args.changes,command ?? {}) },
  removeList: { summary: 'Remove an unused authored list.', params: [param('listId','string',true)], run: (store,args,command) => store.removeList(args.listId,command ?? {}) },
  addListItem: { summary: 'Insert a stable authored listItem.', params: [param('listId','string',true),param('overrides','object',true),param('index','number',false)], run: (store,args,command) => store.addListItem(args.listId,args.overrides,args.index ?? null,command ?? {}) },
  updateListItem: { summary: 'Replace an authored listItem value without changing identity.', params: [param('listId','string',true),param('itemId','string',true),param('changes','object',true)], run: (store,args,command) => store.updateListItem(args.listId,args.itemId,args.changes,command ?? {}) },
  removeListItem: { summary: 'Remove an authored listItem by stable id.', params: [param('listId','string',true),param('itemId','string',true)], run: (store,args,command) => store.removeListItem(args.listId,args.itemId,command ?? {}) },
  moveListItem: { summary: 'Reorder an authored listItem without changing identity.', params: [param('listId','string',true),param('itemId','string',true),param('index','number',true)], run: (store,args,command) => store.moveListItem(args.listId,args.itemId,args.index,command ?? {}) },
'''
patch('src/veyra/commands.js',
"  setComponentOverride: {\n    summary: 'Set one bounded source-property override on a Component instance.',",
commands + "  setComponentOverride: {\n    summary: 'Set one bounded source-property override on a Component instance.',")

overrides = r'''  createViewModel: { targetKind: 'viewModel', capabilities: ['data-definition','stable-id','transactional','undoable','returns-ref'] },
  updateViewModel: { targetKind: 'viewModel', capabilities: ['data-definition','stable-id','transactional','undoable'] },
  removeViewModel: { targetKind: 'viewModel', capabilities: ['dependency-checked','transactional','undoable'] },
  addDataProperty: { targetKind: 'dataProperty', capabilities: ['typed-data','stable-id','transactional','undoable','returns-ref'] },
  updateDataProperty: { targetKind: 'dataProperty', capabilities: ['typed-data','stable-id','transactional','undoable'] },
  removeDataProperty: { targetKind: 'dataProperty', capabilities: ['dependency-checked','transactional','undoable'] },
  createViewModelInstance: { targetKind: 'viewModelInstance', capabilities: ['runtime-instance','authored-initial-values','transactional','undoable','returns-ref'] },
  updateViewModelInstance: { targetKind: 'viewModelInstance', capabilities: ['authored-initial-values','transactional','undoable'] },
  removeViewModelInstance: { targetKind: 'viewModelInstance', capabilities: ['owned-data-cascade','transactional','undoable'] },
  createBinding: { targetKind: 'binding', capabilities: ['data-binding','cycle-checked','type-checked','transactional','undoable','returns-ref'] },
  updateBinding: { targetKind: 'binding', capabilities: ['data-binding','cycle-checked','type-checked','transactional','undoable'] },
  removeBinding: { targetKind: 'binding', capabilities: ['data-binding','non-destructive','transactional','undoable'] },
  createEnum: { targetKind: 'enum', capabilities: ['enum-definition','stable-id','transactional','undoable','returns-ref'] },
  updateEnum: { targetKind: 'enum', capabilities: ['enum-definition','stable-values','transactional','undoable'] },
  removeEnum: { targetKind: 'enum', capabilities: ['dependency-checked','transactional','undoable'] },
  addEnumValue: { targetKind: 'enumValue', capabilities: ['enum-value','stable-id','transactional','undoable','returns-ref'] },
  updateEnumValue: { targetKind: 'enumValue', capabilities: ['enum-value','stable-id','transactional','undoable'] },
  removeEnumValue: { targetKind: 'enumValue', capabilities: ['dependency-checked','transactional','undoable'] },
  createConverter: { targetKind: 'converter', capabilities: ['typed-converter','deterministic','transactional','undoable','returns-ref'] },
  updateConverter: { targetKind: 'converter', capabilities: ['typed-converter','binding-revalidation','transactional','undoable'] },
  removeConverter: { targetKind: 'converter', capabilities: ['dependency-checked','transactional','undoable'] },
  createPropertyGroup: { targetKind: 'propertyGroup', capabilities: ['artboard-local','keyable','transactional','undoable','returns-ref'] },
  updatePropertyGroup: { targetKind: 'propertyGroup', capabilities: ['artboard-local','transactional','undoable'] },
  removePropertyGroup: { targetKind: 'propertyGroup', capabilities: ['dependency-checked','transactional','undoable'] },
  addPropertyGroupProperty: { targetKind: 'propertyGroupProperty', capabilities: ['keyable','bindable','stable-id','transactional','undoable','returns-ref'] },
  updatePropertyGroupProperty: { targetKind: 'propertyGroupProperty', capabilities: ['keyable','bindable','transactional','undoable'] },
  removePropertyGroupProperty: { targetKind: 'propertyGroupProperty', capabilities: ['dependency-checked','transactional','undoable'] },
  createList: { targetKind: 'list', capabilities: ['stable-list','authored-initial-data','transactional','undoable','returns-ref'] },
  updateList: { targetKind: 'list', capabilities: ['stable-list','transactional','undoable'] },
  removeList: { targetKind: 'list', capabilities: ['dependency-checked','transactional','undoable'] },
  addListItem: { targetKind: 'listItem', capabilities: ['stable-list-item','transactional','undoable','returns-ref'] },
  updateListItem: { targetKind: 'listItem', capabilities: ['stable-list-item','transactional','undoable'] },
  removeListItem: { targetKind: 'listItem', capabilities: ['stable-list-item','transactional','undoable'] },
  moveListItem: { targetKind: 'listItem', capabilities: ['stable-list-item','identity-preserving','transactional','undoable'] },
'''
patch('src/veyra/commands.js', "const COMMAND_MANIFEST_OVERRIDES = {\n", "const COMMAND_MANIFEST_OVERRIDES = {\n" + overrides)

# Deterministic implicit IDs for every M8 create/sub-create.
prepare = r'''  if (next.action === 'createViewModel') {
    next.args.overrides = withId(next.args.overrides, 'viewModel', seed, 'viewModel');
    if (Array.isArray(next.args.overrides.properties)) next.args.overrides.properties = next.args.overrides.properties.map((item,index) => withId(item,'dataProperty',seed,`dataProperty:${index}`));
  }
  if (next.action === 'addDataProperty') next.args.overrides = withId(next.args.overrides, 'dataProperty', seed, 'dataProperty');
  if (next.action === 'createViewModelInstance') next.args.overrides = withId(next.args.overrides, 'viewModelInstance', seed, 'viewModelInstance');
  if (next.action === 'createBinding') next.args.overrides = withId(next.args.overrides, 'binding', seed, 'binding');
  if (next.action === 'createEnum') {
    next.args.overrides = withId(next.args.overrides, 'enum', seed, 'enum');
    if (Array.isArray(next.args.overrides.values)) next.args.overrides.values = next.args.overrides.values.map((item,index) => withId(item,'enumValue',seed,`enumValue:${index}`));
  }
  if (next.action === 'addEnumValue') next.args.overrides = withId(next.args.overrides, 'enumValue', seed, 'enumValue');
  if (next.action === 'createConverter') next.args.overrides = withId(next.args.overrides, 'converter', seed, 'converter');
  if (next.action === 'createPropertyGroup') {
    next.args.overrides = withId(next.args.overrides, 'propertyGroup', seed, 'propertyGroup');
    if (Array.isArray(next.args.overrides.properties)) next.args.overrides.properties = next.args.overrides.properties.map((item,index) => withId(item,'propertyGroupProperty',seed,`propertyGroupProperty:${index}`));
  }
  if (next.action === 'addPropertyGroupProperty') next.args.overrides = withId(next.args.overrides, 'propertyGroupProperty', seed, 'propertyGroupProperty');
  if (next.action === 'createList') {
    next.args.overrides = withId(next.args.overrides, 'list', seed, 'list');
    if (Array.isArray(next.args.overrides.items)) next.args.overrides.items = next.args.overrides.items.map((item,index) => withId(item,'listItem',seed,`listItem:${index}`));
  }
  if (next.action === 'addListItem') next.args.overrides = withId(next.args.overrides, 'listItem', seed, 'listItem');
'''
patch('src/veyra/controlPlane.js', "  if (next.action === 'addSemantic')", prepare + "  if (next.action === 'addSemantic')")
patch('src/veyra/controlPlane.js',
"import { VEYRA_SERVICE_NAMES } from './serviceRegistry.js';",
"import { VEYRA_SERVICE_NAMES } from './serviceRegistry.js';\nimport { bindingControllersForAddress } from './dataGraph.js';")
patch('src/veyra/controlPlane.js',
"  const scene = evaluateDocument(document, layers);",
"  const scene = evaluateDocument(document, layers, null, { dataRuntime: options.dataRuntime, artboardId: options.artboardId, runtimeScopePath: options.runtimeScopePath || [] });")
patch('src/veyra/controlPlane.js',
"  const constraints = constraintControllers(document, parsed.reference);\n  const potentialControllers = [\n    ...tracks,\n    ...constraints,\n  ];",
"  const constraints = constraintControllers(document, parsed.reference);\n  const bindings = bindingControllersForAddress(document, address);\n  const potentialControllers = [\n    ...tracks,\n    ...bindings,\n    ...constraints,\n  ];")
patch('src/veyra/controlPlane.js',
"  if (source === 'animation' || source === 'playback') {",
"  if (source === 'data-binding') {\n    const runtimeOwner = evaluation.scene.data?.bindingOwnership?.[address];\n    const activeBinding = runtimeOwner?.ref ? bindings.find((item) => referencesEqual(item.ref, runtimeOwner.ref)) : bindings[0];\n    activeOwner = activeBinding ? { ...cloneValue(activeBinding), source: 'data-binding', chain: { binding: cloneValue(activeBinding.ref), source: cloneValue(activeBinding.source), converters: cloneValue(activeBinding.converters), target: cloneValue(activeBinding.target) } } : { kind: 'data-binding', source: 'data-binding', evidence: [{ kind: 'binding-owner-missing' }] };\n  } else if (source === 'animation' || source === 'playback') {")

# Resolver indexes M8 entities/relationships through the same one semantic index.
patch('src/veyra/resolver.js',
"} from './references.js';",
"} from './references.js';\nimport { dataIndexEntitySpecs, dataIndexRelationshipSpecs } from './dataGraph.js';")
patch('src/veyra/resolver.js',
"  for (const listener of document.listeners || []) add(makeEntity(createReference('listener', listener.id), listener, { type: listener.kind, displayName: listener.name || '' }));\n  for (const record of document.semantics || [])",
"  for (const listener of document.listeners || []) add(makeEntity(createReference('listener', listener.id), listener, { type: listener.kind, displayName: listener.name || '' }));\n  for (const spec of dataIndexEntitySpecs(document)) add(makeEntity(spec.ref, spec.object, { type: spec.type, displayName: spec.displayName, capabilities: spec.capabilities }));\n  for (const record of document.semantics || [])")
patch('src/veyra/resolver.js',
"  const documentRef = createReference('document', document.id);\n  for (const artboard",
"  const documentRef = createReference('document', document.id);\n  for (const relation of dataIndexRelationshipSpecs(document)) link(byKey, relation.from, relation.relation, relation.to, relation.reverse, relation.detail, relation.source);\n  for (const artboard")

# Dependency graph converts binding relationships to machine-readable reads/writes/converter dependencies, including exact target addresses.
patch('src/veyra/dependencyGraph.js',
"      if (entity.kind === 'component' && relationship.relation === 'source_artboard') {",
"      if (entity.kind === 'binding') {\n        if (relationship.relation === 'binding_reads') { addPair('reads', 'usedBy', from, to, detail, 'data-binding'); continue; }\n        if (relationship.relation === 'binding_writes') {\n          if (relationship.detail?.address) { addAddressNode(relationship.detail.address); addPair('writes', 'usedBy', from, { address: relationship.detail.address }, detail, 'data-binding'); }\n          else addPair('writes', 'usedBy', from, to, detail, 'data-binding');\n          continue;\n        }\n        if (relationship.relation === 'uses_converter') { addPair('dependsOn', 'usedBy', from, to, detail, 'data-binding'); continue; }\n      }\n      if (entity.kind === 'component' && relationship.relation === 'source_artboard') {")

# Summary/read manifests expose definitions and authored initial values, never runtime dirtiness/subscriptions/trigger queues.
patch('src/veyra/summary.js',
"    semantics: document.semantics.map(semanticSummary),",
"    data: {\n      viewModels: (document.viewModels || []).map((model) => ({ ref: { kind: 'viewModel', id: model.id }, name: model.name, properties: model.properties.map((property) => ({ ref: { kind: 'dataProperty', id: property.id }, name: property.name, type: property.type, readable: property.readable, writable: property.writable, bindable: property.bindable, ...(property.defaultValue !== undefined ? { defaultValue: cloneValue(property.defaultValue) } : {}) })) })),\n      instances: (document.viewModelInstances || []).map((instance) => ({ ref: { kind: 'viewModelInstance', id: instance.id }, name: instance.name, viewModel: cloneValue(instance.viewModel), artboard: cloneValue(instance.artboard), initialValues: cloneValue(instance.initialValues) })),\n      enums: cloneValue(document.enums || []),\n      converters: cloneValue(document.converters || []),\n      propertyGroups: cloneValue(document.propertyGroups || []),\n      lists: cloneValue(document.lists || []),\n      bindings: cloneValue(document.bindings || []),\n      runtimeStateSerialized: false,\n    },\n    semantics: document.semantics.map(semanticSummary),")

patch('src/veyra/manifest.js',
"  'components.name-independent',\n]);",
"  'components.name-independent',\n  'data.view-models',\n  'data.bindings',\n  'data.property-groups',\n  'data.enums-converters-lists',\n  'data.runtime-isolated',\n  'data.incremental-dirty-evaluation',\n]);")
patch('src/veyra/manifest.js',
"    projectGraph: {",
"    dataGraph: {\n      identity: 'viewModel/viewModelInstance/dataProperty/enum/enumValue/binding/converter/propertyGroup/propertyGroupProperty/list/listItem stable refs; names advisory only',\n      propertyTypes: ['number','boolean','trigger','string','enum','color','viewModel','list','image','artboard'],\n      bindingModes: ['oneWay','twoWay'],\n      evaluationOrder: ['authored','animation','playback','data-binding','constraints','interactive'],\n      runtimeState: 'ephemeral and scope-isolated; never serialized',\n      conflictPolicy: { priority: 'higher-wins', tieBreak: 'lexicographically-lower-binding-id-wins' },\n      cyclePolicy: 'direct and multi-hop forward binding cycles fail normalization atomically',\n      performance: 'zero bindings take O(1) fast path; dirty sources invalidate reachable binding branches only',\n    },\n    projectGraph: {")
# Runtime affordances are manifest-only, not Store/history mutations.
patch('src/veyra/manifest.js',
"const NON_COMMAND_ACTIONS = Object.freeze([\n  action('read-property'",
"const NON_COMMAND_ACTIONS = Object.freeze([\n  action('set-data-runtime-value', 'Set data runtime value', 'Set one writable View Model runtime value without changing authored defaults.', 'dataProperty', [parameter('instanceId','string',true,'Stable View Model instance id.'),parameter('propertyId','string',true,'Stable dataProperty id.'),parameter('value','any',true,'Runtime value.')], ['runtime-only','ephemeral','scope-aware'], { transport: 'runtime', hostAvailability: 'runtime-only' }),\n  action('fire-data-trigger', 'Fire data trigger', 'Fire one trigger edge in a View Model runtime scope.', 'dataProperty', [parameter('instanceId','string',true,'Stable View Model instance id.'),parameter('propertyId','string',true,'Stable trigger dataProperty id.')], ['runtime-only','ephemeral','one-shot'], { transport: 'runtime', hostAvailability: 'runtime-only' }),\n  action('reset-data-runtime', 'Reset data runtime', 'Reset runtime values to authored initial/default values without document mutation.', 'viewModelInstance', [], ['runtime-only','ephemeral','deterministic'], { transport: 'runtime', hostAvailability: 'runtime-only' }),\n  action('read-property'")

# Browser mutation parity registry for all M8 persistent and runtime data helpers.
registry_entries = r'''  createViewModel: Object.freeze({ transport: 'command', action: 'createViewModel' }),
  updateViewModel: Object.freeze({ transport: 'command', action: 'updateViewModel' }),
  removeViewModel: Object.freeze({ transport: 'command', action: 'removeViewModel' }),
  addDataProperty: Object.freeze({ transport: 'command', action: 'addDataProperty' }),
  updateDataProperty: Object.freeze({ transport: 'command', action: 'updateDataProperty' }),
  removeDataProperty: Object.freeze({ transport: 'command', action: 'removeDataProperty' }),
  createViewModelInstance: Object.freeze({ transport: 'command', action: 'createViewModelInstance' }),
  updateViewModelInstance: Object.freeze({ transport: 'command', action: 'updateViewModelInstance' }),
  removeViewModelInstance: Object.freeze({ transport: 'command', action: 'removeViewModelInstance' }),
  createBinding: Object.freeze({ transport: 'command', action: 'createBinding' }),
  updateBinding: Object.freeze({ transport: 'command', action: 'updateBinding' }),
  removeBinding: Object.freeze({ transport: 'command', action: 'removeBinding' }),
  createEnum: Object.freeze({ transport: 'command', action: 'createEnum' }),
  updateEnum: Object.freeze({ transport: 'command', action: 'updateEnum' }),
  removeEnum: Object.freeze({ transport: 'command', action: 'removeEnum' }),
  addEnumValue: Object.freeze({ transport: 'command', action: 'addEnumValue' }),
  updateEnumValue: Object.freeze({ transport: 'command', action: 'updateEnumValue' }),
  removeEnumValue: Object.freeze({ transport: 'command', action: 'removeEnumValue' }),
  createConverter: Object.freeze({ transport: 'command', action: 'createConverter' }),
  updateConverter: Object.freeze({ transport: 'command', action: 'updateConverter' }),
  removeConverter: Object.freeze({ transport: 'command', action: 'removeConverter' }),
  createPropertyGroup: Object.freeze({ transport: 'command', action: 'createPropertyGroup' }),
  updatePropertyGroup: Object.freeze({ transport: 'command', action: 'updatePropertyGroup' }),
  removePropertyGroup: Object.freeze({ transport: 'command', action: 'removePropertyGroup' }),
  addPropertyGroupProperty: Object.freeze({ transport: 'command', action: 'addPropertyGroupProperty' }),
  updatePropertyGroupProperty: Object.freeze({ transport: 'command', action: 'updatePropertyGroupProperty' }),
  removePropertyGroupProperty: Object.freeze({ transport: 'command', action: 'removePropertyGroupProperty' }),
  createList: Object.freeze({ transport: 'command', action: 'createList' }),
  updateList: Object.freeze({ transport: 'command', action: 'updateList' }),
  removeList: Object.freeze({ transport: 'command', action: 'removeList' }),
  addListItem: Object.freeze({ transport: 'command', action: 'addListItem' }),
  updateListItem: Object.freeze({ transport: 'command', action: 'updateListItem' }),
  removeListItem: Object.freeze({ transport: 'command', action: 'removeListItem' }),
  moveListItem: Object.freeze({ transport: 'command', action: 'moveListItem' }),
  setDataRuntimeValue: Object.freeze({ transport: 'runtime', reason: 'View Model live values are ephemeral runtime state; authored defaults remain unchanged.' }),
  getDataRuntimeValue: Object.freeze({ transport: 'runtime', reason: 'Runtime reads are ephemeral and non-mutating.' }),
  fireDataTrigger: Object.freeze({ transport: 'runtime', reason: 'Trigger firing is a one-shot runtime event, never authored data.' }),
  resetDataRuntime: Object.freeze({ transport: 'runtime', reason: 'Runtime reset restores live values from authored initial/default values without project mutation.' }),
  insertRuntimeListItem: Object.freeze({ transport: 'runtime', reason: 'Runtime list mutation is scope-local ephemeral data.' }),
  removeRuntimeListItem: Object.freeze({ transport: 'runtime', reason: 'Runtime list mutation is scope-local ephemeral data.' }),
  moveRuntimeListItem: Object.freeze({ transport: 'runtime', reason: 'Runtime list mutation is scope-local ephemeral data.' }),
  replaceRuntimeListItem: Object.freeze({ transport: 'runtime', reason: 'Runtime list mutation is scope-local ephemeral data.' }),
'''
patch('src/veyra/serviceRegistry.js',
"  setViewport: Object.freeze({ transport: 'runtime'",
registry_entries + "  setViewport: Object.freeze({ transport: 'runtime'")

# Public exports.
p = Path('src/index.js')
t = p.read_text()
if "from './veyra/dataGraph.js'" not in t:
    t += r'''

// M8 View Models/Data Binding: persistent definitions stay authored while live values,
// trigger queues, subscriptions and dirty caches remain DOM-free runtime state.
export {
  VEYRA_DATA_VERSION, VEYRA_DATA_PROPERTY_TYPES, VEYRA_BINDING_MODES, VEYRA_CONVERTER_TYPES,
  VEYRA_DATA_RUNTIME_SCOPE_KIND, VEYRA_BINDING_CONFLICT_POLICY, VEYRA_DATA_EVALUATION_COMPLEXITY,
  createDataProperty, createViewModel, createViewModelInstance, createEnum, createEnumValue,
  createConverter, createPropertyGroup, createPropertyGroupProperty, createList, createListItem, createBinding,
  normalizeBindingEndpoint, normalizeDataGraphDocument, validateDataGraphDocument,
  viewModelById, viewModelInstanceById, dataPropertyById, enumById, enumValueById, converterById,
  propertyGroupById, propertyGroupPropertyById, listById, listItemById, bindingById,
  bindingEndpointKey, bindingEndpointType, bindingControllersForAddress,
  createDataRuntimeScope, VeyraDataRuntime, createVeyraDataRuntime,
  bindingDependencyRecords, bindingComplexityEnvelope,
} from './veyra/dataGraph.js';
'''
    p.write_text(t)

print('M8 command/control-plane patches applied')
