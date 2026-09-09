from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, count))

# Browser shell shares one data runtime with top-level and nested Component evaluation.
patch('veyra.js',
"import { createComponentRuntimeRegistry, createComponentRuntimeScope } from './src/veyra/components.js';",
"import { createComponentRuntimeRegistry, createComponentRuntimeScope } from './src/veyra/components.js';\nimport {\n  VEYRA_DATA_PROPERTY_TYPES, VEYRA_CONVERTER_TYPES, createVeyraDataRuntime,\n  viewModelById as dataViewModelById, dataPropertyById as graphDataPropertyById,\n  enumById as graphEnumById, propertyGroupById as graphPropertyGroupById,\n  listById as graphListById,\n} from './src/veyra/dataGraph.js';")
patch('veyra.js',
"const componentRuntimeRegistry = createComponentRuntimeRegistry(() => store.document);",
"const componentRuntimeRegistry = createComponentRuntimeRegistry(() => store.document);\nconst dataRuntime = createVeyraDataRuntime(() => store.document);")
patch('veyra.js',
"  evaluatedScene = evaluateDocument(store.document, layers, null, { artboardId: activeArtboard().id, componentRuntime: componentRuntimeRegistry });",
"  evaluatedScene = evaluateDocument(store.document, layers, null, {\n    artboardId: activeArtboard().id,\n    componentRuntime: componentRuntimeRegistry,\n    dataRuntime,\n  });")
patch('veyra.js',
"  getEvaluatedScene: () => cloneValue(evaluateDocument(store.document, {}, null, { artboardId: activeArtboard().id, componentRuntime: componentRuntimeRegistry })),",
"  getEvaluatedScene: () => cloneValue(evaluateDocument(store.document, {}, null, { artboardId: activeArtboard().id, componentRuntime: componentRuntimeRegistry, dataRuntime })),")

# Bounded but real authoring UI: all persistent changes cross projectCommand -> canonical dispatcher.
ui = r'''
function dataRuntimeCommit(instanceId, property, value) {
  try {
    let normalized = value;
    if (property.type === 'number') normalized = Number(value);
    else if (property.type === 'boolean') normalized = Boolean(value);
    else if (property.type === 'enum') normalized = value ? { kind: 'enumValue', id: value } : null;
    else if (property.type === 'image') normalized = value ? { kind: 'asset', id: value } : null;
    else if (property.type === 'artboard') normalized = value ? { kind: 'artboard', id: value } : null;
    else if (property.type === 'viewModel') normalized = value ? { kind: 'viewModelInstance', id: value } : null;
    else if (property.type === 'list') normalized = value ? { kind: 'list', id: value } : null;
    const changed = dataRuntime.setValue(instanceId, property.id, normalized, { source: 'human-preview' });
    if (changed) evaluateCurrentFrame();
    return changed;
  } catch (error) {
    showToast(error.message || String(error), true);
    renderInspector();
    return false;
  }
}

function appendDataGraphInspector() {
  const artboard = activeArtboard();
  const models = store.document.viewModels || [];
  const instances = (store.document.viewModelInstances || []).filter((item) => item.artboard.id === artboard.id);
  const groups = (store.document.propertyGroups || []).filter((item) => item.artboard.id === artboard.id);
  const bindings = (store.document.bindings || []).filter((item) => item.artboard.id === artboard.id);
  const converters = store.document.converters || [];
  const lists = store.document.lists || [];

  const authored = section('View Models & Data Binding');
  authored.grid.classList.add('oneColumn');
  const counts = document.createElement('div');
  counts.className = 'vertexSummary';
  counts.innerHTML = `<span>${models.length} models · ${instances.length} instances · ${bindings.length} bindings</span><strong>${groups.length} groups · ${lists.length} lists</strong>`;
  authored.fieldset.appendChild(counts);

  const actions = document.createElement('div');
  actions.className = 'inlineActions';
  actions.append(
    inspectorAction('New View Model', 'plus', () => {
      const name = prompt('View Model name:', `View Model ${models.length + 1}`);
      if (!name) return;
      projectCommand('createViewModel', { overrides: { name } }, `Create View Model ${name}`);
    }),
    inspectorAction('New Property Group', 'plus', () => {
      const name = prompt('Property Group name:', `Properties ${groups.length + 1}`);
      if (!name) return;
      projectCommand('createPropertyGroup', { overrides: { name, artboard: activeArtboardRef() } }, `Create Property Group ${name}`);
    }),
  );
  authored.fieldset.appendChild(actions);

  const model = models[0] || null;
  if (model) {
    authored.grid.append(field('Model name', model.name, (name) => projectCommand('updateViewModel', { modelId: model.id, changes: { name } }, `Rename ${model.name}`)));
    const modelActions = document.createElement('div'); modelActions.className = 'inlineActions';
    modelActions.append(
      inspectorAction('Add property', 'plus', () => {
        const name = prompt('Property name:', `Property ${model.properties.length + 1}`); if (!name) return;
        const type = prompt(`Property type (${VEYRA_DATA_PROPERTY_TYPES.join(', ')}):`, 'number'); if (!type) return;
        const overrides = { name, type };
        if (type === 'enum') { const item = store.document.enums?.[0]; if (!item) return showToast('Create an enum through the API before adding an enum property.', true); overrides.enum = { kind: 'enum', id: item.id }; }
        if (type === 'viewModel') overrides.viewModel = { kind: 'viewModel', id: model.id };
        if (type === 'list') overrides.itemType = { type: 'string' };
        projectCommand('addDataProperty', { modelId: model.id, overrides }, `Add ${name}`);
      }),
      inspectorAction('Add instance', 'plus', () => projectCommand('createViewModelInstance', { overrides: { name: `${model.name} Instance`, viewModel: { kind: 'viewModel', id: model.id }, artboard: activeArtboardRef() } }, `Create ${model.name} instance`)),
    );
    authored.fieldset.appendChild(modelActions);
    const property = model.properties[0] || null;
    if (property) {
      authored.grid.append(field('First property', property.name, (name) => projectCommand('updateDataProperty', { modelId: model.id, propertyId: property.id, changes: { name } }, `Rename data property ${property.id}`)));
    }
  }

  const converter = converters[0] || null;
  const converterActions = document.createElement('div'); converterActions.className = 'inlineActions';
  converterActions.append(inspectorAction('New converter', 'plus', () => {
    const type = prompt(`Converter type (${VEYRA_CONVERTER_TYPES.join(', ')}):`, 'numberToString');
    if (!type) return;
    projectCommand('createConverter', { overrides: { name: type, type } }, `Create converter ${type}`);
  }));
  authored.fieldset.appendChild(converterActions);
  if (converter) {
    authored.grid.append(
      field('Converter name', converter.name, (name) => projectCommand('updateConverter', { converterId: converter.id, changes: { name } }, `Rename converter ${converter.id}`)),
      field('Converter config JSON', JSON.stringify(converter.config || {}), (text) => {
        try { projectCommand('updateConverter', { converterId: converter.id, changes: { config: JSON.parse(text || '{}') } }, `Configure converter ${converter.id}`); }
        catch (error) { showToast(`Invalid converter JSON: ${error.message}`, true); }
      }, { full: true }),
    );
  }

  const group = groups[0] || null;
  if (group) {
    authored.grid.append(field('Property Group', group.name, (name) => projectCommand('updatePropertyGroup', { groupId: group.id, changes: { name } }, `Rename Property Group ${group.id}`)));
    const groupActions = document.createElement('div'); groupActions.className = 'inlineActions';
    groupActions.append(inspectorAction('Add group property', 'plus', () => {
      const name = prompt('Property Group property name:', `Value ${group.properties.length + 1}`); if (!name) return;
      projectCommand('addPropertyGroupProperty', { groupId: group.id, overrides: { name, type: 'number', value: 0, keyable: true } }, `Add ${name}`);
    }));
    authored.fieldset.appendChild(groupActions);
    const property = group.properties[0] || null;
    if (property) {
      const address = `propertyGroupProperty:${property.id}/value`;
      authored.grid.append(field('Group value', property.value ?? '', (value) => projectCommand('updatePropertyGroupProperty', { groupId: group.id, propertyId: property.id, changes: { value: Number(value) } }, `Set ${property.name}`), { type: 'number', number: true, address }));
    }
  }

  const instance = instances[0] || null;
  const listProperty = instance ? dataViewModelById(store.document, instance.viewModel.id)?.properties.find((item) => item.type === 'list') : null;
  const ownedList = instance && listProperty ? lists.find((item) => item.owner.id === instance.id && item.property.id === listProperty.id) : null;
  if (instance && listProperty && !ownedList) {
    const listActions = document.createElement('div'); listActions.className = 'inlineActions';
    listActions.append(inspectorAction('Create authored list', 'plus', () => projectCommand('createList', { overrides: { name: `${listProperty.name} Items`, owner: { kind: 'viewModelInstance', id: instance.id }, property: { kind: 'dataProperty', id: listProperty.id }, items: [] } }, `Create ${listProperty.name} list`)));
    authored.fieldset.appendChild(listActions);
  }
  if (ownedList) {
    authored.grid.append(field('List name', ownedList.name, (name) => projectCommand('updateList', { listId: ownedList.id, changes: { name } }, `Rename list ${ownedList.id}`)));
    const itemActions = document.createElement('div'); itemActions.className = 'inlineActions';
    itemActions.append(inspectorAction('Add authored item', 'plus', () => {
      const value = prompt('List item value:', 'Item'); if (value == null) return;
      projectCommand('addListItem', { listId: ownedList.id, overrides: { value } }, `Add item to ${ownedList.name}`);
    }));
    authored.fieldset.appendChild(itemActions);
    const item = ownedList.items[0];
    if (item) authored.grid.append(field('First item', typeof item.value === 'string' ? item.value : JSON.stringify(item.value), (value) => projectCommand('updateListItem', { listId: ownedList.id, itemId: item.id, changes: { value } }, `Update list item ${item.id}`)));
  }

  if (instance && model?.properties.length) {
    const bindingActions = document.createElement('div'); bindingActions.className = 'inlineActions';
    bindingActions.append(inspectorAction('Bind data → property', 'link', () => {
      const sourceProperty = dataViewModelById(store.document, instance.viewModel.id)?.properties[0];
      if (!sourceProperty) return showToast('The instance needs a data property first.', true);
      const defaultTarget = store.selectedNode ? nodePropertyAddress(store.selectedNode.id, 'opacity') : store.document.nodes[0] ? nodePropertyAddress(store.document.nodes[0].id, 'opacity') : '';
      const address = prompt('Target property address:', defaultTarget); if (!address) return;
      const mode = prompt('Binding mode (oneWay or twoWay):', 'oneWay') || 'oneWay';
      projectCommand('createBinding', { overrides: { name: `${sourceProperty.name} Binding`, artboard: activeArtboardRef(), source: { kind: 'data', instance: { kind: 'viewModelInstance', id: instance.id }, path: [{ kind: 'dataProperty', id: sourceProperty.id }] }, target: { kind: 'property', address }, mode } }, `Create binding ${sourceProperty.name}`);
    }));
    authored.fieldset.appendChild(bindingActions);
  }
  const binding = bindings[0] || null;
  if (binding) {
    authored.grid.append(
      field('Binding name', binding.name, (name) => projectCommand('updateBinding', { bindingId: binding.id, changes: { name } }, `Rename binding ${binding.id}`)),
      field('Binding mode', binding.mode, (mode) => projectCommand('updateBinding', { bindingId: binding.id, changes: { mode } }, `Set binding mode ${binding.id}`), { select: [{ value: 'oneWay', label: 'One-way' }, { value: 'twoWay', label: 'Two-way' }] }),
      checkbox('Binding enabled', binding.enabled, (enabled) => projectCommand('updateBinding', { bindingId: binding.id, changes: { enabled } }, `${enabled ? 'Enable' : 'Disable'} binding ${binding.id}`)),
    );
  }
  appendNote(authored.fieldset, 'Persistent data definitions use stable IDs and canonical commands. Human names are display-only. Property Group values can be keyframed and bound.');
  inspector.appendChild(authored.fieldset);

  const runtime = section('Runtime Data Preview');
  runtime.grid.classList.add('oneColumn');
  for (const current of instances) {
    const currentModel = dataViewModelById(store.document, current.viewModel.id);
    if (!currentModel) continue;
    const summary = document.createElement('div'); summary.className = 'vertexSummary';
    summary.innerHTML = `<span>${current.name}</span><strong>${current.id}</strong>`; runtime.fieldset.appendChild(summary);
    for (const property of currentModel.properties) {
      if (property.type === 'trigger') {
        const row = document.createElement('div'); row.className = 'inlineActions';
        row.append(inspectorAction(`Fire ${property.name}`, 'play', () => { dataRuntime.fire(current.id, property.id, { source: 'human-preview' }); evaluateCurrentFrame(); renderInspector(); }));
        runtime.fieldset.appendChild(row); continue;
      }
      const value = dataRuntime.getValue(current.id, property.id);
      if (property.type === 'boolean') runtime.grid.append(checkbox(property.name, value, (next) => dataRuntimeCommit(current.id, property, next)));
      else if (property.type === 'enum') {
        const item = property.enum ? graphEnumById(store.document, property.enum.id) : null;
        runtime.grid.append(field(property.name, referenceId(value, 'enumValue') || '', (next) => dataRuntimeCommit(current.id, property, next), { select: [{ value: '', label: 'None' }, ...(item?.values || []).map((candidate) => ({ value: candidate.id, label: candidate.name }))] }));
      } else if (property.type === 'number') runtime.grid.append(field(property.name, value, (next) => dataRuntimeCommit(current.id, property, next), { type: 'number', number: true, step: 0.01 }));
      else if (property.type !== 'list') runtime.grid.append(field(property.name, value?.id || value || '', (next) => dataRuntimeCommit(current.id, property, next)));
    }
  }
  const runtimeActions = document.createElement('div'); runtimeActions.className = 'inlineActions';
  runtimeActions.append(inspectorAction('Reset runtime', 'reset', () => { dataRuntime.reset({ source: 'human-preview' }); evaluateCurrentFrame(); renderInspector(); }));
  const runtimeList = lists.find((item) => instances.some((candidate) => candidate.id === item.owner.id));
  if (runtimeList) runtimeActions.append(inspectorAction('Add runtime list item', 'plus', () => {
    const value = prompt('Runtime list value:', 'Preview Item'); if (value == null) return;
    dataRuntime.insertListItem(runtimeList.id, value); evaluateCurrentFrame(); renderInspector();
  }));
  runtime.fieldset.appendChild(runtimeActions);
  appendNote(runtime.fieldset, 'Runtime values, trigger edges, subscriptions, dirty caches and runtime list edits are ephemeral and never serialized into .veyra.');
  inspector.appendChild(runtime.fieldset);
}

'''
patch('veyra.js', "function renderArtboardInspector(artboard = activeArtboard()) {", ui + "function renderArtboardInspector(artboard = activeArtboard()) {")
patch('veyra.js',
"  inspector.appendChild(frame.fieldset);\n}",
"  inspector.appendChild(frame.fieldset);\n  appendDataGraphInspector();\n}", 1)

# Canonical persistent browser/AI helpers. The M3 audit checks each source block.
helpers = r'''  createViewModel: (overrides = {}) => dispatchCompatibilityCommand('createViewModel', { overrides }, { label: 'Create View Model', source: 'script' }),
  updateViewModel: (modelId, changes) => dispatchCompatibilityCommand('updateViewModel', { modelId, changes }, { label: `Update View Model ${modelId}`, source: 'script' }),
  removeViewModel: (modelId) => dispatchCompatibilityCommand('removeViewModel', { modelId }, { label: `Remove View Model ${modelId}`, source: 'script' }),
  addDataProperty: (modelId, overrides) => dispatchCompatibilityCommand('addDataProperty', { modelId, overrides }, { label: `Add data property ${modelId}`, source: 'script' }),
  updateDataProperty: (modelId, propertyId, changes) => dispatchCompatibilityCommand('updateDataProperty', { modelId, propertyId, changes }, { label: `Update data property ${propertyId}`, source: 'script' }),
  removeDataProperty: (modelId, propertyId) => dispatchCompatibilityCommand('removeDataProperty', { modelId, propertyId }, { label: `Remove data property ${propertyId}`, source: 'script' }),
  createViewModelInstance: (overrides) => dispatchCompatibilityCommand('createViewModelInstance', { overrides }, { label: 'Create View Model instance', source: 'script' }),
  updateViewModelInstance: (instanceId, changes) => dispatchCompatibilityCommand('updateViewModelInstance', { instanceId, changes }, { label: `Update View Model instance ${instanceId}`, source: 'script' }),
  removeViewModelInstance: (instanceId) => dispatchCompatibilityCommand('removeViewModelInstance', { instanceId }, { label: `Remove View Model instance ${instanceId}`, source: 'script' }),
  createBinding: (overrides) => dispatchCompatibilityCommand('createBinding', { overrides }, { label: 'Create binding', source: 'script' }),
  updateBinding: (bindingId, changes) => dispatchCompatibilityCommand('updateBinding', { bindingId, changes }, { label: `Update binding ${bindingId}`, source: 'script' }),
  removeBinding: (bindingId) => dispatchCompatibilityCommand('removeBinding', { bindingId }, { label: `Remove binding ${bindingId}`, source: 'script' }),
  createEnum: (overrides = {}) => dispatchCompatibilityCommand('createEnum', { overrides }, { label: 'Create enum', source: 'script' }),
  updateEnum: (enumId, changes) => dispatchCompatibilityCommand('updateEnum', { enumId, changes }, { label: `Update enum ${enumId}`, source: 'script' }),
  removeEnum: (enumId) => dispatchCompatibilityCommand('removeEnum', { enumId }, { label: `Remove enum ${enumId}`, source: 'script' }),
  addEnumValue: (enumId, overrides) => dispatchCompatibilityCommand('addEnumValue', { enumId, overrides }, { label: `Add enum value ${enumId}`, source: 'script' }),
  updateEnumValue: (enumId, valueId, changes) => dispatchCompatibilityCommand('updateEnumValue', { enumId, valueId, changes }, { label: `Update enum value ${valueId}`, source: 'script' }),
  removeEnumValue: (enumId, valueId) => dispatchCompatibilityCommand('removeEnumValue', { enumId, valueId }, { label: `Remove enum value ${valueId}`, source: 'script' }),
  createConverter: (overrides) => dispatchCompatibilityCommand('createConverter', { overrides }, { label: 'Create converter', source: 'script' }),
  updateConverter: (converterId, changes) => dispatchCompatibilityCommand('updateConverter', { converterId, changes }, { label: `Update converter ${converterId}`, source: 'script' }),
  removeConverter: (converterId) => dispatchCompatibilityCommand('removeConverter', { converterId }, { label: `Remove converter ${converterId}`, source: 'script' }),
  createPropertyGroup: (overrides) => dispatchCompatibilityCommand('createPropertyGroup', { overrides }, { label: 'Create Property Group', source: 'script' }),
  updatePropertyGroup: (groupId, changes) => dispatchCompatibilityCommand('updatePropertyGroup', { groupId, changes }, { label: `Update Property Group ${groupId}`, source: 'script' }),
  removePropertyGroup: (groupId) => dispatchCompatibilityCommand('removePropertyGroup', { groupId }, { label: `Remove Property Group ${groupId}`, source: 'script' }),
  addPropertyGroupProperty: (groupId, overrides) => dispatchCompatibilityCommand('addPropertyGroupProperty', { groupId, overrides }, { label: `Add Property Group property ${groupId}`, source: 'script' }),
  updatePropertyGroupProperty: (groupId, propertyId, changes) => dispatchCompatibilityCommand('updatePropertyGroupProperty', { groupId, propertyId, changes }, { label: `Update Property Group property ${propertyId}`, source: 'script' }),
  removePropertyGroupProperty: (groupId, propertyId) => dispatchCompatibilityCommand('removePropertyGroupProperty', { groupId, propertyId }, { label: `Remove Property Group property ${propertyId}`, source: 'script' }),
  createList: (overrides) => dispatchCompatibilityCommand('createList', { overrides }, { label: 'Create list', source: 'script' }),
  updateList: (listId, changes) => dispatchCompatibilityCommand('updateList', { listId, changes }, { label: `Update list ${listId}`, source: 'script' }),
  removeList: (listId) => dispatchCompatibilityCommand('removeList', { listId }, { label: `Remove list ${listId}`, source: 'script' }),
  addListItem: (listId, overrides, index = null) => dispatchCompatibilityCommand('addListItem', { listId, overrides, ...(index == null ? {} : { index }) }, { label: `Add list item ${listId}`, source: 'script' }),
  updateListItem: (listId, itemId, changes) => dispatchCompatibilityCommand('updateListItem', { listId, itemId, changes }, { label: `Update list item ${itemId}`, source: 'script' }),
  removeListItem: (listId, itemId) => dispatchCompatibilityCommand('removeListItem', { listId, itemId }, { label: `Remove list item ${itemId}`, source: 'script' }),
  moveListItem: (listId, itemId, index) => dispatchCompatibilityCommand('moveListItem', { listId, itemId, index }, { label: `Move list item ${itemId}`, source: 'script' }),
  setDataRuntimeValue: (instanceId, propertyId, value, options = {}) => { const changed = dataRuntime.setValue(instanceId, propertyId, value, options); if (changed) evaluateCurrentFrame(); return changed; },
  getDataRuntimeValue: (instanceId, propertyId, options = {}) => cloneValue(dataRuntime.getValue(instanceId, propertyId, options)),
  fireDataTrigger: (instanceId, propertyId, options = {}) => { const sequence = dataRuntime.fire(instanceId, propertyId, options); evaluateCurrentFrame(); return sequence; },
  resetDataRuntime: (options = {}) => { const result = dataRuntime.reset(options); evaluateCurrentFrame(); return result; },
  insertRuntimeListItem: (listId, value, index = null, options = {}) => { const result = dataRuntime.insertListItem(listId, value, index, options); evaluateCurrentFrame(); return result; },
  removeRuntimeListItem: (listId, itemId, options = {}) => { const result = dataRuntime.removeListItem(listId, itemId, options); if (result) evaluateCurrentFrame(); return result; },
  moveRuntimeListItem: (listId, itemId, index, options = {}) => { const result = dataRuntime.moveListItem(listId, itemId, index, options); if (result) evaluateCurrentFrame(); return result; },
  replaceRuntimeListItem: (listId, itemId, value, options = {}) => { const result = dataRuntime.replaceListItem(listId, itemId, value, options); if (result) evaluateCurrentFrame(); return result; },
  setTwoWayBindingTarget: (bindingId, value, options = {}) => { const result = dataRuntime.setTwoWayTarget(bindingId, value, options); if (result) evaluateCurrentFrame(); return result; },
  getDataRuntimeStats: () => cloneValue(dataRuntime.stats),
'''
patch('veyra.js',
"globalThis.veyra = Object.freeze({\n  getActiveArtboard:",
"globalThis.veyra = Object.freeze({\n" + helpers + "  getActiveArtboard:")

print('M8 browser/runtime/authoring shell patches applied')
