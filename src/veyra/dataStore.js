import {
  addBindingInDocument,
  addConverterInDocument,
  addDataPropertyInDocument,
  addEnumInDocument,
  addEnumValueInDocument,
  addListInDocument,
  addListItemInDocument,
  addPropertyGroupInDocument,
  addPropertyGroupPropertyInDocument,
  addViewModelInDocument,
  addViewModelInstanceInDocument,
  bindingById,
  converterById,
  dataPropertyById,
  enumById,
  enumValueById,
  listById,
  listItemById,
  moveEnumValueInDocument,
  moveListItemInDocument,
  propertyGroupById,
  propertyGroupPropertyById,
  removeBindingInDocument,
  removeConverterInDocument,
  removeDataPropertyInDocument,
  removeEnumInDocument,
  removeEnumValueInDocument,
  removeListInDocument,
  removeListItemInDocument,
  removePropertyGroupInDocument,
  removePropertyGroupPropertyInDocument,
  removeViewModelInDocument,
  removeViewModelInstanceInDocument,
  updateBindingInDocument,
  updateConverterInDocument,
  updateDataPropertyInDocument,
  updateEnumInDocument,
  updateEnumValueInDocument,
  updateListInDocument,
  updateListItemInDocument,
  updatePropertyGroupInDocument,
  updatePropertyGroupPropertyInDocument,
  updateViewModelInDocument,
  updateViewModelInstanceInDocument,
  viewModelById,
  viewModelInstanceById,
} from './dataGraph.js';

function descriptor(commandDescriptor, label) {
  return typeof commandDescriptor === 'string'
    ? { label: commandDescriptor }
    : { label, source: 'user', ...(commandDescriptor || {}) };
}

function execute(store, commandDescriptor, label, mutation) {
  let result = null;
  store.execute(descriptor(commandDescriptor, label), (document) => { result = mutation(document); });
  return result;
}

export function installVeyraDataStoreMethods(StoreClass) {
  if (!StoreClass?.prototype || StoreClass.prototype.createViewModel) return StoreClass;
  const methods = {
    createViewModel(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create View Model ${overrides.name || ''}`.trim(), (document) => addViewModelInDocument(document, overrides));
    },
    updateViewModel(modelId, changes = {}, commandDescriptor = {}) {
      if (!viewModelById(this.document, modelId)) return false;
      return execute(this, commandDescriptor, `Update View Model ${modelId}`, (document) => updateViewModelInDocument(document, modelId, changes));
    },
    removeViewModel(modelId, commandDescriptor = {}) {
      if (!viewModelById(this.document, modelId)) return false;
      return execute(this, commandDescriptor, `Remove View Model ${modelId}`, (document) => removeViewModelInDocument(document, modelId));
    },
    addDataProperty(modelId, overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Add data property`, (document) => addDataPropertyInDocument(document, modelId, overrides));
    },
    updateDataProperty(modelId, propertyId, changes = {}, commandDescriptor = {}) {
      if (!dataPropertyById(this.document, propertyId)) return false;
      return execute(this, commandDescriptor, `Update data property ${propertyId}`, (document) => updateDataPropertyInDocument(document, modelId, propertyId, changes));
    },
    removeDataProperty(modelId, propertyId, commandDescriptor = {}) {
      if (!dataPropertyById(this.document, propertyId)) return false;
      return execute(this, commandDescriptor, `Remove data property ${propertyId}`, (document) => removeDataPropertyInDocument(document, modelId, propertyId));
    },
    createViewModelInstance(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create View Model instance ${overrides.name || ''}`.trim(), (document) => addViewModelInstanceInDocument(document, overrides));
    },
    updateViewModelInstance(instanceId, changes = {}, commandDescriptor = {}) {
      if (!viewModelInstanceById(this.document, instanceId)) return false;
      return execute(this, commandDescriptor, `Update View Model instance ${instanceId}`, (document) => updateViewModelInstanceInDocument(document, instanceId, changes));
    },
    removeViewModelInstance(instanceId, commandDescriptor = {}) {
      if (!viewModelInstanceById(this.document, instanceId)) return false;
      return execute(this, commandDescriptor, `Remove View Model instance ${instanceId}`, (document) => removeViewModelInstanceInDocument(document, instanceId));
    },
    createBinding(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create binding ${overrides.name || ''}`.trim(), (document) => addBindingInDocument(document, overrides));
    },
    updateBinding(bindingId, changes = {}, commandDescriptor = {}) {
      if (!bindingById(this.document, bindingId)) return false;
      return execute(this, commandDescriptor, `Update binding ${bindingId}`, (document) => updateBindingInDocument(document, bindingId, changes));
    },
    removeBinding(bindingId, commandDescriptor = {}) {
      if (!bindingById(this.document, bindingId)) return false;
      return execute(this, commandDescriptor, `Remove binding ${bindingId}`, (document) => removeBindingInDocument(document, bindingId));
    },
    createEnum(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create enum ${overrides.name || ''}`.trim(), (document) => addEnumInDocument(document, overrides));
    },
    updateEnum(enumId, changes = {}, commandDescriptor = {}) {
      if (!enumById(this.document, enumId)) return false;
      return execute(this, commandDescriptor, `Update enum ${enumId}`, (document) => updateEnumInDocument(document, enumId, changes));
    },
    removeEnum(enumId, commandDescriptor = {}) {
      if (!enumById(this.document, enumId)) return false;
      return execute(this, commandDescriptor, `Remove enum ${enumId}`, (document) => removeEnumInDocument(document, enumId));
    },
    addEnumValue(enumId, overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Add enum value`, (document) => addEnumValueInDocument(document, enumId, overrides));
    },
    updateEnumValue(enumId, valueId, changes = {}, commandDescriptor = {}) {
      if (!enumValueById(this.document, valueId)) return false;
      return execute(this, commandDescriptor, `Update enum value ${valueId}`, (document) => updateEnumValueInDocument(document, enumId, valueId, changes));
    },
    removeEnumValue(enumId, valueId, commandDescriptor = {}) {
      if (!enumValueById(this.document, valueId)) return false;
      return execute(this, commandDescriptor, `Remove enum value ${valueId}`, (document) => removeEnumValueInDocument(document, enumId, valueId));
    },
    moveEnumValue(enumId, valueId, index, commandDescriptor = {}) {
      if (!enumValueById(this.document, valueId)) return false;
      return execute(this, commandDescriptor, `Move enum value ${valueId}`, (document) => moveEnumValueInDocument(document, enumId, valueId, index));
    },
    createConverter(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create converter ${overrides.name || ''}`.trim(), (document) => addConverterInDocument(document, overrides));
    },
    updateConverter(converterId, changes = {}, commandDescriptor = {}) {
      if (!converterById(this.document, converterId)) return false;
      return execute(this, commandDescriptor, `Update converter ${converterId}`, (document) => updateConverterInDocument(document, converterId, changes));
    },
    removeConverter(converterId, commandDescriptor = {}) {
      if (!converterById(this.document, converterId)) return false;
      return execute(this, commandDescriptor, `Remove converter ${converterId}`, (document) => removeConverterInDocument(document, converterId));
    },
    createPropertyGroup(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create Property Group ${overrides.name || ''}`.trim(), (document) => addPropertyGroupInDocument(document, overrides));
    },
    updatePropertyGroup(groupId, changes = {}, commandDescriptor = {}) {
      if (!propertyGroupById(this.document, groupId)) return false;
      return execute(this, commandDescriptor, `Update Property Group ${groupId}`, (document) => updatePropertyGroupInDocument(document, groupId, changes));
    },
    removePropertyGroup(groupId, commandDescriptor = {}) {
      if (!propertyGroupById(this.document, groupId)) return false;
      return execute(this, commandDescriptor, `Remove Property Group ${groupId}`, (document) => removePropertyGroupInDocument(document, groupId));
    },
    addPropertyGroupProperty(groupId, overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Add Property Group property`, (document) => addPropertyGroupPropertyInDocument(document, groupId, overrides));
    },
    updatePropertyGroupProperty(groupId, propertyId, changes = {}, commandDescriptor = {}) {
      if (!propertyGroupPropertyById(this.document, propertyId)) return false;
      return execute(this, commandDescriptor, `Update Property Group property ${propertyId}`, (document) => updatePropertyGroupPropertyInDocument(document, groupId, propertyId, changes));
    },
    removePropertyGroupProperty(groupId, propertyId, commandDescriptor = {}) {
      if (!propertyGroupPropertyById(this.document, propertyId)) return false;
      return execute(this, commandDescriptor, `Remove Property Group property ${propertyId}`, (document) => removePropertyGroupPropertyInDocument(document, groupId, propertyId));
    },
    createList(overrides = {}, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Create list ${overrides.name || ''}`.trim(), (document) => addListInDocument(document, overrides));
    },
    updateList(listId, changes = {}, commandDescriptor = {}) {
      if (!listById(this.document, listId)) return false;
      return execute(this, commandDescriptor, `Update list ${listId}`, (document) => updateListInDocument(document, listId, changes));
    },
    removeList(listId, commandDescriptor = {}) {
      if (!listById(this.document, listId)) return false;
      return execute(this, commandDescriptor, `Remove list ${listId}`, (document) => removeListInDocument(document, listId));
    },
    addListItem(listId, overrides = {}, index = null, commandDescriptor = {}) {
      return execute(this, commandDescriptor, `Add list item`, (document) => addListItemInDocument(document, listId, overrides, index));
    },
    updateListItem(listId, itemId, changes = {}, commandDescriptor = {}) {
      if (!listItemById(this.document, itemId)) return false;
      return execute(this, commandDescriptor, `Update list item ${itemId}`, (document) => updateListItemInDocument(document, listId, itemId, changes));
    },
    removeListItem(listId, itemId, commandDescriptor = {}) {
      if (!listItemById(this.document, itemId)) return false;
      return execute(this, commandDescriptor, `Remove list item ${itemId}`, (document) => removeListItemInDocument(document, listId, itemId));
    },
    moveListItem(listId, itemId, index, commandDescriptor = {}) {
      if (!listItemById(this.document, itemId)) return false;
      return execute(this, commandDescriptor, `Move list item ${itemId}`, (document) => moveListItemInDocument(document, listId, itemId, index));
    },
  };
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(StoreClass.prototype, name, { value: method, writable: true, configurable: true });
  }
  return StoreClass;
}
