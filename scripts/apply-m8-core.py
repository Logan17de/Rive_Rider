from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

# dataGraph schema version + M8 version promotion.
p = Path('src/veyra/dataGraph.js')
t = p.read_text()
t = t.replace("export const VEYRA_DATA_PROPERTY_TYPES", "export const VEYRA_DATA_VERSION = 6;\nexport const VEYRA_DATA_PROPERTY_TYPES", 1)
t = t.replace(
"export function normalizeDataGraphDocument(input, baseDocument) {\n  const document = normalizeGraphInput(input, baseDocument);\n  validateDataGraphDocument(document);\n  return document;\n}",
"export function normalizeDataGraphDocument(input, baseDocument) {\n  const document = normalizeGraphInput(input, baseDocument);\n  validateDataGraphDocument(document);\n  const hasDataGraph = ['viewModels','viewModelInstances','enums','converters','propertyGroups','lists','bindings'].some((key) => document[key].length > 0);\n  return { ...document, version: hasDataGraph ? VEYRA_DATA_VERSION : document.version };\n}", 1)
t = t.replace("if (before !== items.length) this.#markListDirty(document, listId, scope); return before !== items.length;", "const changed = before !== this.#lists.get(runtimeListKey(scope, listId)).length; if (changed) this.#markListDirty(document, listId, scope); return changed;", 1)
p.write_text(t)

# Reference kinds and typed constructors.
patch('src/veyra/references.js',
"  'listener',\n  'semanticRecord',",
"  'listener',\n  'viewModel',\n  'viewModelInstance',\n  'dataProperty',\n  'enum',\n  'enumValue',\n  'binding',\n  'converter',\n  'propertyGroup',\n  'propertyGroupProperty',\n  'list',\n  'listItem',\n  'semanticRecord',")
patch('src/veyra/references.js',
"export function createSemanticRecordRef(id) { return createReference('semanticRecord', id); }",
"export function createViewModelRef(id) { return createReference('viewModel', id); }\nexport function createViewModelInstanceRef(id) { return createReference('viewModelInstance', id); }\nexport function createDataPropertyRef(id) { return createReference('dataProperty', id); }\nexport function createEnumRef(id) { return createReference('enum', id); }\nexport function createEnumValueRef(id) { return createReference('enumValue', id); }\nexport function createBindingRef(id) { return createReference('binding', id); }\nexport function createConverterRef(id) { return createReference('converter', id); }\nexport function createPropertyGroupRef(id) { return createReference('propertyGroup', id); }\nexport function createPropertyGroupPropertyRef(id) { return createReference('propertyGroupProperty', id); }\nexport function createListRef(id) { return createReference('list', id); }\nexport function createListItemRef(id) { return createReference('listItem', id); }\nexport function createSemanticRecordRef(id) { return createReference('semanticRecord', id); }")

# Model owns normalization boundary; M8 data graph enters before global stable-id/semantic validation.
patch('src/veyra/model.js',
"} from './projectGraph.js';\n\nexport { VEYRA_PROJECT_VERSION };",
"} from './projectGraph.js';\nimport {\n  VEYRA_DATA_VERSION,\n  normalizeDataGraphDocument,\n  viewModelById as dataViewModelById,\n  viewModelInstanceById as dataViewModelInstanceById,\n  dataPropertyById as graphDataPropertyById,\n  enumById as dataEnumById,\n  enumValueById as dataEnumValueById,\n  bindingById as dataBindingById,\n  converterById as dataConverterById,\n  propertyGroupById as dataPropertyGroupById,\n  propertyGroupPropertyById as dataPropertyGroupPropertyById,\n  listById as dataListById,\n  listItemById as dataListItemById,\n} from './dataGraph.js';\n\nexport { VEYRA_PROJECT_VERSION, VEYRA_DATA_VERSION };")
patch('src/veyra/model.js',
"export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4, 5]);",
"export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4, 5, 6]);")
patch('src/veyra/model.js',
"    listeners: cloneValue(overrides.listeners || []),\n  };",
"    listeners: cloneValue(overrides.listeners || []),\n    viewModels: cloneValue(overrides.viewModels || []),\n    viewModelInstances: cloneValue(overrides.viewModelInstances || []),\n    enums: cloneValue(overrides.enums || []),\n    converters: cloneValue(overrides.converters || []),\n    propertyGroups: cloneValue(overrides.propertyGroups || []),\n    lists: cloneValue(overrides.lists || []),\n    bindings: cloneValue(overrides.bindings || []),\n  };")
patch('src/veyra/model.js',
"  document.listeners.forEach((listener, index) => register('listener', listener.id, `listeners[${index}]`));\n}",
"  document.listeners.forEach((listener, index) => register('listener', listener.id, `listeners[${index}]`));\n  document.viewModels.forEach((model, modelIndex) => {\n    register('viewModel', model.id, `viewModels[${modelIndex}]`);\n    model.properties.forEach((property, propertyIndex) => register('dataProperty', property.id, `viewModels[${modelIndex}].properties[${propertyIndex}]`));\n  });\n  document.viewModelInstances.forEach((instance, index) => register('viewModelInstance', instance.id, `viewModelInstances[${index}]`));\n  document.enums.forEach((item, enumIndex) => {\n    register('enum', item.id, `enums[${enumIndex}]`);\n    item.values.forEach((value, valueIndex) => register('enumValue', value.id, `enums[${enumIndex}].values[${valueIndex}]`));\n  });\n  document.converters.forEach((item, index) => register('converter', item.id, `converters[${index}]`));\n  document.propertyGroups.forEach((group, groupIndex) => {\n    register('propertyGroup', group.id, `propertyGroups[${groupIndex}]`);\n    group.properties.forEach((property, propertyIndex) => register('propertyGroupProperty', property.id, `propertyGroups[${groupIndex}].properties[${propertyIndex}]`));\n  });\n  document.lists.forEach((list, listIndex) => {\n    register('list', list.id, `lists[${listIndex}]`);\n    list.items.forEach((item, itemIndex) => register('listItem', item.id, `lists[${listIndex}].items[${itemIndex}]`));\n  });\n  document.bindings.forEach((binding, index) => register('binding', binding.id, `bindings[${index}]`));\n}")
patch('src/veyra/model.js',
"  const projectDocument = normalizeProjectDocument(input, document);\n  validateStableIdentities(projectDocument);\n  validateSemanticRecords(projectDocument);\n  return projectDocument;",
"  const projectDocument = normalizeProjectDocument(input, document);\n  const dataDocument = normalizeDataGraphDocument(input, projectDocument);\n  validateStableIdentities(dataDocument);\n  validateSemanticRecords(dataDocument);\n  return dataDocument;")
patch('src/veyra/model.js',
"export function gradientStopById(document, stopId) {",
"export function viewModelById(document, id) { return dataViewModelById(document, id); }\nexport function viewModelInstanceById(document, id) { return dataViewModelInstanceById(document, id); }\nexport function dataPropertyById(document, id) { return graphDataPropertyById(document, id); }\nexport function enumById(document, id) { return dataEnumById(document, id); }\nexport function enumValueById(document, id) { return dataEnumValueById(document, id); }\nexport function bindingById(document, id) { return dataBindingById(document, id); }\nexport function converterById(document, id) { return dataConverterById(document, id); }\nexport function propertyGroupById(document, id) { return dataPropertyGroupById(document, id); }\nexport function propertyGroupPropertyById(document, id) { return dataPropertyGroupPropertyById(document, id); }\nexport function listById(document, id) { return dataListById(document, id); }\nexport function listItemById(document, id) { return dataListItemById(document, id); }\n\nexport function gradientStopById(document, stopId) {")

# Property addresses gain keyable Property Group properties; this is the bridge for timeline <-> PG <-> data graph.
patch('src/veyra/properties.js',
"} from './model.js';\nimport { supportsNodeProperty, supportsRigProperty } from './capabilities.js';",
"} from './model.js';\nimport { propertyGroupPropertyById } from './dataGraph.js';\nimport { supportsNodeProperty, supportsRigProperty } from './capabilities.js';")
patch('src/veyra/properties.js',
"  'control',\n]);",
"  'control',\n  'propertyGroupProperty',\n]);")
patch('src/veyra/properties.js',
"function propertyTarget(document, address, createSemantic = false) {\n  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;\n  if (parsed.reference.kind !== 'node') {",
"function propertyTarget(document, address, createSemantic = false) {\n  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;\n  if (parsed.reference.kind === 'propertyGroupProperty') {\n    const property = propertyGroupPropertyById(document, parsed.reference.id);\n    if (!property) throw new TypeError(`Property Group property ${parsed.reference.id} does not exist.`);\n    if (parsed.path !== 'value') throw new TypeError(`Property Group property supports only value, not ${parsed.path}.`);\n    return { parsed, object: property, container: property, key: 'value' };\n  }\n  if (parsed.reference.kind !== 'node') {")
patch('src/veyra/properties.js',
"export function propertyTargetStatus(document, address) {\n  const parsed = parsePropertyAddress(address);\n  if (parsed.reference.kind !== 'node') {",
"export function propertyTargetStatus(document, address) {\n  const parsed = parsePropertyAddress(address);\n  if (parsed.reference.kind === 'propertyGroupProperty') {\n    const property = propertyGroupPropertyById(document, parsed.reference.id);\n    if (!property) return 'missing-target';\n    return parsed.path === 'value' && property.keyable !== false ? 'animatable' : 'non-animatable';\n  }\n  if (parsed.reference.kind !== 'node') {")

# Semantics can target all M8 stable entities.
patch('src/veyra/semantics.js',
"} from './references.js';",
"} from './references.js';\nimport { dataEntityByReference } from './dataGraph.js';")
patch('src/veyra/semantics.js',
"export function entityByReference(document, reference) {\n  const ref = qualifyPaintReference(normalizeSemanticReference(reference), document, 'reference');\n  const find =",
"export function entityByReference(document, reference) {\n  const ref = qualifyPaintReference(normalizeSemanticReference(reference), document, 'reference');\n  const dataEntity = dataEntityByReference(document, ref);\n  if (dataEntity) return dataEntity;\n  const find =")

# Project graph ownership understands new artboard-local data entities.
patch('src/veyra/projectGraph.js',
"export function entityArtboardId(document, reference) {\n  if (!reference) return null;",
"export function entityArtboardId(document, reference) {\n  if (!reference) return null;\n  if (reference.kind === 'viewModelInstance') return document.viewModelInstances?.find((item) => item.id === reference.id)?.artboard?.id || null;\n  if (reference.kind === 'binding') return document.bindings?.find((item) => item.id === reference.id)?.artboard?.id || null;\n  if (reference.kind === 'propertyGroup') return document.propertyGroups?.find((item) => item.id === reference.id)?.artboard?.id || null;\n  if (reference.kind === 'propertyGroupProperty') return document.propertyGroups?.find((group) => group.properties?.some((item) => item.id === reference.id))?.artboard?.id || null;\n  if (reference.kind === 'list') { const list = document.lists?.find((item) => item.id === reference.id); return list ? document.viewModelInstances?.find((item) => item.id === list.owner?.id)?.artboard?.id || null : null; }\n  if (reference.kind === 'listItem') { const list = document.lists?.find((item) => item.items?.some((child) => child.id === reference.id)); return list ? document.viewModelInstances?.find((item) => item.id === list.owner?.id)?.artboard?.id || null : null; }")

# Evaluation adds one explicit data-binding stage after animation/playback and before constraint/interactive ownership.
patch('src/veyra/evaluation.js',
"import { evaluateComponentContent } from './components.js';",
"import { evaluateComponentContent } from './components.js';\nimport { createVeyraDataRuntime } from './dataGraph.js';")
patch('src/veyra/evaluation.js',
"  'playback',\n  'constraints',",
"  'playback',\n  'data-binding',\n  'constraints',")
patch('src/veyra/evaluation.js',
"  applyLayer(evaluatedDocument, animationLayer, 'animation', sources);\n  applyLayer(evaluatedDocument, playbackOverrides, 'playback', sources);\n  applyLayer(evaluatedDocument, layers.constraints, 'constraints', sources);",
"  applyLayer(evaluatedDocument, animationLayer, 'animation', sources);\n  applyLayer(evaluatedDocument, playbackOverrides, 'playback', sources);\n  evaluatedDocument = normalizeDocument(evaluatedDocument);\n  const dataRuntime = options.dataRuntime || createVeyraDataRuntime(evaluatedDocument);\n  const dataResult = dataRuntime.evaluateBindings(evaluatedDocument, {\n    artboardId: String(options.artboardId || evaluatedDocument.artboards[0]?.id || ''),\n    scopePath: options.runtimeScopePath || [],\n  });\n  applyLayer(evaluatedDocument, dataResult.overrides, 'data-binding', sources);\n  applyLayer(evaluatedDocument, layers.constraints, 'constraints', sources);")
patch('src/veyra/evaluation.js',
"    sources,\n  };",
"    sources,\n    data: cloneValue({\n      bindingOwnership: dataResult.ownership,\n      virtualValues: dataResult.virtualValues || {},\n      diagnostics: dataResult.diagnostics,\n      stats: dataResult.stats,\n      runtimeScopePath: options.runtimeScopePath || [],\n    }),\n  };")

print('M8 core integration patches applied')
