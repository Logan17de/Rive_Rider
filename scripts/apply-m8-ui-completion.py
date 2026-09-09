from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:220]!r}')
    p.write_text(text.replace(old, new, count))

# Share value coercion between authored initial values and runtime preview values.
patch('veyra.js',
"function appendDataGraphInspector() {",
r'''function normalizeDataEditorValue(property, value) {
  if (property.type === 'number') return Number(value);
  if (property.type === 'boolean') return Boolean(value);
  if (property.type === 'enum') return value ? { kind: 'enumValue', id: String(value) } : null;
  if (property.type === 'image') return value ? { kind: 'asset', id: String(value) } : null;
  if (property.type === 'artboard') return value ? { kind: 'artboard', id: String(value) } : null;
  if (property.type === 'viewModel') return value ? { kind: 'viewModelInstance', id: String(value) } : null;
  if (property.type === 'list') return value ? { kind: 'list', id: String(value) } : null;
  return String(value ?? '');
}

function setAuthoredDataInitial(instance, property, rawValue) {
  const value = normalizeDataEditorValue(property, rawValue);
  const initialValues = (instance.initialValues || [])
    .filter((entry) => entry.property.id !== property.id)
    .concat([{ property: { kind: 'dataProperty', id: property.id }, value }]);
  return projectCommand('updateViewModelInstance', {
    instanceId: instance.id,
    changes: { initialValues },
  }, `Set ${instance.name} initial ${property.name}`);
}

function appendDataGraphInspector() {''')

# Global authored creation actions include enums as required by Task 10.
patch('veyra.js',
"    inspectorAction('New Property Group', 'plus', () => {\n      const name = prompt('Property Group name:', `Properties ${groups.length + 1}`);\n      if (!name) return;\n      projectCommand('createPropertyGroup', { overrides: { name, artboard: activeArtboardRef() } }, `Create Property Group ${name}`);\n    }),",
"    inspectorAction('New Property Group', 'plus', () => {\n      const name = prompt('Property Group name:', `Properties ${groups.length + 1}`);\n      if (!name) return;\n      projectCommand('createPropertyGroup', { overrides: { name, artboard: activeArtboardRef() } }, `Create Property Group ${name}`);\n    }),\n    inspectorAction('New Enum', 'plus', () => {\n      const name = prompt('Enum name:', `Enum ${(store.document.enums || []).length + 1}`);\n      if (!name) return;\n      projectCommand('createEnum', { overrides: { name, values: [{ name: 'Value' }] } }, `Create enum ${name}`);\n    }),")

# View Model deletion and property deletion are available in the same bounded panel.
patch('veyra.js',
"      inspectorAction('Add instance', 'plus', () => projectCommand('createViewModelInstance', { overrides: { name: `${model.name} Instance`, viewModel: { kind: 'viewModel', id: model.id }, artboard: activeArtboardRef() } }, `Create ${model.name} instance`)),\n    );",
"      inspectorAction('Add instance', 'plus', () => projectCommand('createViewModelInstance', { overrides: { name: `${model.name} Instance`, viewModel: { kind: 'viewModel', id: model.id }, artboard: activeArtboardRef() } }, `Create ${model.name} instance`)),\n      inspectorAction('Delete View Model', 'delete', () => projectCommand('removeViewModel', { modelId: model.id }, `Delete View Model ${model.name}`)),\n    );")
patch('veyra.js',
"    if (property) {\n      authored.grid.append(field('First property', property.name, (name) => projectCommand('updateDataProperty', { modelId: model.id, propertyId: property.id, changes: { name } }, `Rename data property ${property.id}`)));\n    }",
"    if (property) {\n      authored.grid.append(field('First property', property.name, (name) => projectCommand('updateDataProperty', { modelId: model.id, propertyId: property.id, changes: { name } }, `Rename data property ${property.id}`)));\n      const propertyActions = document.createElement('div'); propertyActions.className = 'inlineActions';\n      propertyActions.append(inspectorAction('Delete first property', 'delete', () => projectCommand('removeDataProperty', { modelId: model.id, propertyId: property.id }, `Delete data property ${property.name}`)));\n      authored.fieldset.appendChild(propertyActions);\n    }")

# Enum editing uses stable enum/enumValue ids; rename/reorder never uses names as identity.
patch('veyra.js',
"  const converter = converters[0] || null;",
r'''  const enumDefinition = (store.document.enums || [])[0] || null;
  if (enumDefinition) {
    authored.grid.append(field('Enum name', enumDefinition.name, (name) => projectCommand('updateEnum', { enumId: enumDefinition.id, changes: { name } }, `Rename enum ${enumDefinition.id}`)));
    const enumValue = enumDefinition.values[0] || null;
    if (enumValue) authored.grid.append(field('First enum value', enumValue.name, (name) => projectCommand('updateEnumValue', { enumId: enumDefinition.id, valueId: enumValue.id, changes: { name } }, `Rename enum value ${enumValue.id}`)));
    const enumActions = document.createElement('div'); enumActions.className = 'inlineActions';
    enumActions.append(
      inspectorAction('Add enum value', 'plus', () => {
        const name = prompt('Enum value:', `Value ${enumDefinition.values.length + 1}`); if (!name) return;
        projectCommand('addEnumValue', { enumId: enumDefinition.id, overrides: { name } }, `Add enum value ${name}`);
      }),
      ...(enumValue ? [inspectorAction('Delete first enum value', 'delete', () => projectCommand('removeEnumValue', { enumId: enumDefinition.id, valueId: enumValue.id }, `Delete enum value ${enumValue.name}`))] : []),
      inspectorAction('Delete enum', 'delete', () => projectCommand('removeEnum', { enumId: enumDefinition.id }, `Delete enum ${enumDefinition.name}`)),
    );
    authored.fieldset.appendChild(enumActions);
  }

  const converter = converters[0] || null;''')

# Converter creation/edit/delete.
patch('veyra.js',
"  if (converter) {\n    authored.grid.append(\n      field('Converter name', converter.name, (name) => projectCommand('updateConverter', { converterId: converter.id, changes: { name } }, `Rename converter ${converter.id}`)),",
"  if (converter) {\n    authored.grid.append(\n      field('Converter name', converter.name, (name) => projectCommand('updateConverter', { converterId: converter.id, changes: { name } }, `Rename converter ${converter.id}`)),")
patch('veyra.js',
"    );\n  }\n\n  const group = groups[0] || null;",
"    );\n    const converterEditActions = document.createElement('div'); converterEditActions.className = 'inlineActions';\n    converterEditActions.append(inspectorAction('Delete converter', 'delete', () => projectCommand('removeConverter', { converterId: converter.id }, `Delete converter ${converter.name}`)));\n    authored.fieldset.appendChild(converterEditActions);\n  }\n\n  const group = groups[0] || null;", 1)

# Property Group removal and property removal.
patch('veyra.js',
"    groupActions.append(inspectorAction('Add group property', 'plus', () => {\n      const name = prompt('Property Group property name:', `Value ${group.properties.length + 1}`); if (!name) return;\n      projectCommand('addPropertyGroupProperty', { groupId: group.id, overrides: { name, type: 'number', value: 0, keyable: true } }, `Add ${name}`);\n    }));",
"    groupActions.append(\n      inspectorAction('Add group property', 'plus', () => {\n        const name = prompt('Property Group property name:', `Value ${group.properties.length + 1}`); if (!name) return;\n        projectCommand('addPropertyGroupProperty', { groupId: group.id, overrides: { name, type: 'number', value: 0, keyable: true } }, `Add ${name}`);\n      }),\n      inspectorAction('Delete Property Group', 'delete', () => projectCommand('removePropertyGroup', { groupId: group.id }, `Delete Property Group ${group.name}`)),\n    );")
patch('veyra.js',
"      authored.grid.append(field('Group value', property.value ?? '', (value) => projectCommand('updatePropertyGroupProperty', { groupId: group.id, propertyId: property.id, changes: { value: Number(value) } }, `Set ${property.name}`), { type: 'number', number: true, address }));\n    }",
"      authored.grid.append(field('Group value', property.value ?? '', (value) => projectCommand('updatePropertyGroupProperty', { groupId: group.id, propertyId: property.id, changes: { value: Number(value) } }, `Set ${property.name}`), { type: 'number', number: true, address }));\n      const groupPropertyActions = document.createElement('div'); groupPropertyActions.className = 'inlineActions';\n      groupPropertyActions.append(inspectorAction('Delete group property', 'delete', () => projectCommand('removePropertyGroupProperty', { groupId: group.id, propertyId: property.id }, `Delete ${property.name}`)));\n      authored.fieldset.appendChild(groupPropertyActions);\n    }")

# Authored View Model instance initial values and instance deletion.
patch('veyra.js',
"  const instance = instances[0] || null;\n  const listProperty = instance ? dataViewModelById(store.document, instance.viewModel.id)?.properties.find((item) => item.type === 'list') : null;",
r'''  const instance = instances[0] || null;
  if (instance) {
    const instanceModel = dataViewModelById(store.document, instance.viewModel.id);
    authored.grid.append(field('Instance name', instance.name, (name) => projectCommand('updateViewModelInstance', { instanceId: instance.id, changes: { name } }, `Rename instance ${instance.id}`)));
    for (const property of instanceModel?.properties || []) {
      if (property.type === 'trigger') continue;
      const authoredEntry = (instance.initialValues || []).find((entry) => entry.property.id === property.id);
      const initialValue = authoredEntry ? authoredEntry.value : property.defaultValue;
      if (property.type === 'boolean') {
        authored.grid.append(checkbox(`Initial ${property.name}`, Boolean(initialValue), (value) => setAuthoredDataInitial(instance, property, value)));
      } else if (property.type === 'enum') {
        const item = property.enum ? graphEnumById(store.document, property.enum.id) : null;
        authored.grid.append(field(`Initial ${property.name}`, referenceId(initialValue, 'enumValue') || '', (value) => setAuthoredDataInitial(instance, property, value), { select: [{ value: '', label: 'None' }, ...(item?.values || []).map((candidate) => ({ value: candidate.id, label: candidate.name }))] }));
      } else if (property.type === 'number') {
        authored.grid.append(field(`Initial ${property.name}`, initialValue ?? 0, (value) => setAuthoredDataInitial(instance, property, value), { type: 'number', number: true, step: 0.01 }));
      } else {
        authored.grid.append(field(`Initial ${property.name}`, initialValue?.id || initialValue || '', (value) => setAuthoredDataInitial(instance, property, value)));
      }
    }
    const instanceActions = document.createElement('div'); instanceActions.className = 'inlineActions';
    instanceActions.append(inspectorAction('Delete instance', 'delete', () => projectCommand('removeViewModelInstance', { instanceId: instance.id }, `Delete data instance ${instance.name}`)));
    authored.fieldset.appendChild(instanceActions);
  }
  const listProperty = instance ? dataViewModelById(store.document, instance.viewModel.id)?.properties.find((item) => item.type === 'list') : null;''')

# Persistent list add/update/move/remove and list deletion.
patch('veyra.js',
"    itemActions.append(inspectorAction('Add authored item', 'plus', () => {\n      const value = prompt('List item value:', 'Item'); if (value == null) return;\n      projectCommand('addListItem', { listId: ownedList.id, overrides: { value } }, `Add item to ${ownedList.name}`);\n    }));",
"    itemActions.append(\n      inspectorAction('Add authored item', 'plus', () => {\n        const value = prompt('List item value:', 'Item'); if (value == null) return;\n        projectCommand('addListItem', { listId: ownedList.id, overrides: { value } }, `Add item to ${ownedList.name}`);\n      }),\n      inspectorAction('Delete list', 'delete', () => projectCommand('removeList', { listId: ownedList.id }, `Delete list ${ownedList.name}`)),\n    );")
patch('veyra.js',
"    const item = ownedList.items[0];\n    if (item) authored.grid.append(field('First item', typeof item.value === 'string' ? item.value : JSON.stringify(item.value), (value) => projectCommand('updateListItem', { listId: ownedList.id, itemId: item.id, changes: { value } }, `Update list item ${item.id}`)));",
"    const item = ownedList.items[0];\n    if (item) {\n      authored.grid.append(field('First item', typeof item.value === 'string' ? item.value : JSON.stringify(item.value), (value) => projectCommand('updateListItem', { listId: ownedList.id, itemId: item.id, changes: { value } }, `Update list item ${item.id}`)));\n      const itemEditActions = document.createElement('div'); itemEditActions.className = 'inlineActions';\n      itemEditActions.append(\n        inspectorAction('Move first item down', 'fit', () => projectCommand('moveListItem', { listId: ownedList.id, itemId: item.id, index: Math.min(1, ownedList.items.length - 1) }, `Move list item ${item.id}`)),\n        inspectorAction('Delete first item', 'delete', () => projectCommand('removeListItem', { listId: ownedList.id, itemId: item.id }, `Delete list item ${item.id}`)),\n      );\n      authored.fieldset.appendChild(itemEditActions);\n    }")

# Binding converter-chain editing plus deletion/removal.
patch('veyra.js',
"      checkbox('Binding enabled', binding.enabled, (enabled) => projectCommand('updateBinding', { bindingId: binding.id, changes: { enabled } }, `${enabled ? 'Enable' : 'Disable'} binding ${binding.id}`)),\n    );\n  }",
"      checkbox('Binding enabled', binding.enabled, (enabled) => projectCommand('updateBinding', { bindingId: binding.id, changes: { enabled } }, `${enabled ? 'Enable' : 'Disable'} binding ${binding.id}`)),\n      field('Converter chain IDs', binding.converterChain.map((item) => item.id).join(', '), (value) => {\n        const converterChain = String(value || '').split(',').map((item) => item.trim()).filter(Boolean).map((id) => ({ kind: 'converter', id }));\n        projectCommand('updateBinding', { bindingId: binding.id, changes: { converterChain } }, `Edit converter chain ${binding.id}`);\n      }, { full: true }),\n    );\n    const bindingEditActions = document.createElement('div'); bindingEditActions.className = 'inlineActions';\n    bindingEditActions.append(inspectorAction('Delete binding', 'delete', () => projectCommand('removeBinding', { bindingId: binding.id }, `Delete binding ${binding.name}`)));\n    authored.fieldset.appendChild(bindingEditActions);\n  }")

print('M8 bounded human authoring surface completed')
