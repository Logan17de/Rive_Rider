from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


def regex_once(path, pattern, replacement):
    p = Path(path)
    text = p.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'pattern count {count} in {path}: {pattern[:120]!r}')
    p.write_text(next_text)

# dataGraph.js — authored generation signature, nested invalidation aliases,
# scoped Property Group runtime values, and settled-cache correctness.
replace_once(
    'src/veyra/dataGraph.js',
    "function bindingIndexSignature(document, artboardId) {\n  const bindings = (document.bindings || []).filter((item) => item.artboard.id === artboardId).map((item) => ({ id: item.id, source: item.source, target: item.target, mode: item.mode, enabled: item.enabled, priority: item.priority, converters: item.converterChain }));\n  const converters = (document.converters || []).map((item) => ({ id: item.id, type: item.type, inputType: item.inputType, outputType: item.outputType, config: item.config }));\n  return hash(stableString({ bindings, converters }));\n}\n",
    "function bindingIndexSignature(document, artboardId) {\n  const bindings = (document.bindings || []).filter((item) => item.artboard.id === artboardId).map((item) => ({ id: item.id, source: item.source, target: item.target, mode: item.mode, enabled: item.enabled, priority: item.priority, converters: item.converterChain }));\n  const converters = (document.converters || []).map((item) => ({ id: item.id, type: item.type, inputType: item.inputType, outputType: item.outputType, config: item.config }));\n  return hash(stableString({ bindings, converters }));\n}\nfunction authoredRuntimeSignature(document, artboardId) {\n  const viewModels = (document.viewModels || []).map((model) => ({\n    id: model.id,\n    properties: model.properties.map((property) => ({\n      id: property.id, type: property.type, readable: property.readable, writable: property.writable, bindable: property.bindable,\n      defaultValue: property.defaultValue, min: property.min, max: property.max, enum: property.enum, viewModel: property.viewModel, itemType: property.itemType,\n    })),\n  }));\n  const viewModelInstances = (document.viewModelInstances || []).map((instance) => ({\n    id: instance.id, viewModel: instance.viewModel, artboard: instance.artboard, initialValues: instance.initialValues,\n  }));\n  const propertyGroups = (document.propertyGroups || []).filter((group) => group.artboard.id === artboardId).map((group) => ({\n    id: group.id, artboard: group.artboard, properties: group.properties.map((property) => ({\n      id: property.id, type: property.type, readable: property.readable, writable: property.writable, bindable: property.bindable, keyable: property.keyable,\n      min: property.min, max: property.max, enum: property.enum, viewModel: property.viewModel, itemType: property.itemType,\n    })),\n  }));\n  const lists = (document.lists || []).map((list) => ({ id: list.id, owner: list.owner, property: list.property, items: list.items }));\n  return hash(stableString({ bindingIndex: bindingIndexSignature(document, artboardId), viewModels, viewModelInstances, propertyGroups, lists }));\n}\n"
)
replace_once(
    'src/veyra/dataGraph.js',
    "function runtimePropertyKey(scope, instanceId, propertyId) { return `${scope}|${instanceId}|${propertyId}`; }\nfunction runtimeListKey(scope, listId) { return `${scope}|${listId}`; }\nfunction runtimeBindingKey(scope, bindingId) { return `${scope}|${bindingId}`; }",
    "function runtimePropertyKey(scope, instanceId, propertyId) { return `${scope}|${instanceId}|${propertyId}`; }\nfunction runtimePropertyGroupKey(scope, propertyId) { return `${scope}|propertyGroupProperty|${propertyId}`; }\nfunction runtimeListKey(scope, listId) { return `${scope}|${listId}`; }\nfunction runtimeBindingKey(scope, bindingId) { return `${scope}|${bindingId}`; }"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #lists = new Map();\n  #indexes = new Map();\n  #bindingCache = new Map();\n  #sourceSnapshots = new Map();\n  #dirty = new Map();",
    "  #lists = new Map();\n  #propertyGroupValues = new Map();\n  #indexes = new Map();\n  #bindingCache = new Map();\n  #sourceSnapshots = new Map();\n  #authoredSignatures = new Map();\n  #dirty = new Map();"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #stats = { graphBuilds: 0, evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, sourceChecks: 0, sourceInvalidations: 0, triggerPulsesConsumed: 0, notifications: 0, zeroBindingFastPaths: 0 };",
    "  #stats = { graphBuilds: 0, evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, authoredInvalidations: 0, sourceChecks: 0, sourceInvalidations: 0, triggerPulsesConsumed: 0, notifications: 0, zeroBindingFastPaths: 0 };"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  getValue(instanceId, propertyId, options = {}) {\n    const document = this.#document(); const { instance, property } = this.#instanceProperty(document, instanceId, propertyId); const scope = scopeKey(options.scopePath);\n    if (property.type === 'trigger') return (this.#triggers.get(runtimePropertyKey(scope, instance.id, property.id)) || 0) > 0;\n    const key = runtimePropertyKey(scope, instance.id, property.id);\n    return clone(this.#values.has(key) ? this.#values.get(key) : initialValueFor(document, instance, property));\n  }",
    "  getValue(instanceId, propertyId, options = {}) {\n    const document = this.#document(); const { instance, property } = this.#instanceProperty(document, instanceId, propertyId); const scope = scopeKey(options.scopePath);\n    if (property.type === 'trigger') return (this.#triggers.get(runtimePropertyKey(scope, instance.id, property.id)) || 0) > 0;\n    const key = runtimePropertyKey(scope, instance.id, property.id);\n    return clone(this.#values.has(key) ? this.#values.get(key) : initialValueFor(document, instance, property));\n  }\n  getPropertyGroupValue(propertyId, options = {}) {\n    const document = this.#document();\n    const property = propertyGroupPropertyById(document, propertyId);\n    if (!property) throw new TypeError(`Runtime Property Group target ${propertyId} does not exist.`);\n    const scope = scopeKey(options.scopePath); const key = runtimePropertyGroupKey(scope, property.id);\n    return clone(this.#propertyGroupValues.has(key) ? this.#propertyGroupValues.get(key) : property.value);\n  }\n  hasPropertyGroupOverride(propertyId, options = {}) {\n    return this.#propertyGroupValues.has(runtimePropertyGroupKey(scopeKey(options.scopePath), propertyId));\n  }"
)
replace_once(
    'src/veyra/dataGraph.js',
    "    this.#values.set(key, clone(normalized));\n    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };\n    this.#markDirty(document, instance.artboard.id, scope, bindingEndpointKey(endpoint));",
    "    this.#values.set(key, clone(normalized));\n    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };\n    this.#markDataPropertyDirty(document, scope, instance.id, property.id);"
)
replace_once(
    'src/veyra/dataGraph.js',
    "    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };\n    this.#markDirty(document, instance.artboard.id, scope, bindingEndpointKey(endpoint));\n    this.#notify({ target: endpoint, oldValue: false, newValue: true, event: 'trigger', sequence: count, source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });",
    "    const endpoint = { kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] };\n    this.#markDataPropertyDirty(document, scope, instance.id, property.id);\n    this.#notify({ target: endpoint, oldValue: false, newValue: true, event: 'trigger', sequence: count, source: String(options.source || 'runtime'), provenance: clone(options.provenance || null), runtimeScope: createDataRuntimeScope(options.scopePath || []) });"
)
replace_once(
    'src/veyra/dataGraph.js',
    "    for (const map of [this.#values, this.#triggers, this.#lists, this.#bindingCache, this.#sourceSnapshots]) for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);\n    this.#dirty.delete(scope);",
    "    for (const map of [this.#values, this.#triggers, this.#lists, this.#propertyGroupValues, this.#bindingCache, this.#sourceSnapshots, this.#authoredSignatures]) for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);\n    this.#dirty.delete(scope);"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #index(document, artboardId) {\n    const signature = bindingIndexSignature(document, artboardId); const key = `${artboardId}|${signature}`;\n    if (this.#indexes.has(key)) return this.#indexes.get(key);\n    const index = buildRuntimeIndex(document, artboardId); this.#indexes.clear(); this.#indexes.set(key, index); this.#stats.graphBuilds += 1; return index;\n  }",
    "  #index(document, artboardId) {\n    const signature = bindingIndexSignature(document, artboardId); const key = `${artboardId}|${signature}`;\n    if (this.#indexes.has(key)) return this.#indexes.get(key);\n    const index = buildRuntimeIndex(document, artboardId); this.#indexes.clear(); this.#indexes.set(key, index); this.#stats.graphBuilds += 1; return index;\n  }\n  #ensureAuthoredGeneration(document, artboardId, scope, index) {\n    const signature = authoredRuntimeSignature(document, artboardId);\n    const key = `${scope}|${artboardId}`;\n    const previous = this.#authoredSignatures.get(key);\n    if (previous === signature) return false;\n    this.#authoredSignatures.set(key, signature);\n    if (previous === undefined) return false;\n    const cachePrefix = `${scope}|`;\n    for (const cacheKey of [...this.#bindingCache.keys()]) if (cacheKey.startsWith(cachePrefix)) this.#bindingCache.delete(cacheKey);\n    const snapshotPrefix = `${scope}|${artboardId}|`;\n    for (const snapshotKey of [...this.#sourceSnapshots.keys()]) if (snapshotKey.startsWith(snapshotPrefix)) this.#sourceSnapshots.delete(snapshotKey);\n    const dirty = this.#dirty.get(scope) || new Set();\n    for (const binding of index.winners) dirty.add(binding.id);\n    this.#dirty.set(scope, dirty);\n    this.#stats.authoredInvalidations += index.winners.length;\n    this.#stats.dirtyInvalidations += index.winners.length;\n    return true;\n  }"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #markDirty(document, artboardId, scope, sourceKey) {\n    const bindings = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);\n    if (!bindings.length) return;\n    const index = this.#index(document, artboardId);\n    const dirty = this.#dirty.get(scope) || new Set();\n    const count = this.#cascadeDirty(index, dirty, index.bySource.get(sourceKey) || []);\n    this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += count;\n  }",
    "  #markDirty(document, artboardId, scope, sourceKey) {\n    const bindings = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);\n    if (!bindings.length) return;\n    const index = this.#index(document, artboardId);\n    const dirty = this.#dirty.get(scope) || new Set();\n    const count = this.#cascadeDirty(index, dirty, index.bySource.get(sourceKey) || []);\n    this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += count;\n  }\n  #dataEndpointTouches(document, endpoint, scope, instanceId, propertyId) {\n    let instance = viewModelInstanceById(document, endpoint.instance.id);\n    if (!instance) return false;\n    for (let index = 0; index < endpoint.path.length; index += 1) {\n      const model = viewModelById(document, instance.viewModel.id);\n      const property = model?.properties.find((item) => item.id === endpoint.path[index].id) || null;\n      if (!property) return false;\n      if (instance.id === instanceId && property.id === propertyId) return true;\n      if (index >= endpoint.path.length - 1) break;\n      if (property.type !== 'viewModel') return false;\n      const key = runtimePropertyKey(scope, instance.id, property.id);\n      const nested = this.#values.has(key) ? this.#values.get(key) : initialValueFor(document, instance, property);\n      if (nested?.kind !== 'viewModelInstance') return false;\n      instance = viewModelInstanceById(document, nested.id);\n      if (!instance) return false;\n    }\n    return false;\n  }\n  #markDataPropertyDirty(document, scope, instanceId, propertyId) {\n    const artboards = [...new Set((document.bindings || []).filter((item) => item.enabled && item.source.kind === 'data').map((item) => item.artboard.id))].sort();\n    for (const artboardId of artboards) {\n      const index = this.#index(document, artboardId);\n      const ids = index.winners.filter((binding) => binding.source.kind === 'data' && this.#dataEndpointTouches(document, binding.source, scope, instanceId, propertyId)).map((binding) => binding.id);\n      if (!ids.length) continue;\n      const dirty = this.#dirty.get(scope) || new Set();\n      const count = this.#cascadeDirty(index, dirty, ids);\n      this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += count;\n    }\n  }"
)
replace_once(
    'src/veyra/dataGraph.js',
    "    if (endpoint.kind === 'data') return this.#dataEndpointValue(document, endpoint, scope, triggerReads);\n    if (endpoint.kind === 'propertyGroupProperty') return clone(propertyGroupPropertyById(document, endpoint.property.id)?.value);",
    "    if (endpoint.kind === 'data') return this.#dataEndpointValue(document, endpoint, scope, triggerReads);\n    if (endpoint.kind === 'propertyGroupProperty') return this.getPropertyGroupValue(endpoint.property.id, { scopePath: scope === 'root' ? [] : scope.split('/').map((part) => { const colon = part.indexOf(':'); return { kind: part.slice(0, colon), id: part.slice(colon + 1) }; }) });"
)
replace_once(
    'src/veyra/dataGraph.js',
    "    const index = this.#index(document, artboardId); const scope = scopeKey(options.scopePath); let dirty = this.#dirty.get(scope);\n    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }",
    "    const index = this.#index(document, artboardId); const scope = scopeKey(options.scopePath);\n    this.#ensureAuthoredGeneration(document, artboardId, scope, index);\n    let dirty = this.#dirty.get(scope);\n    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }"
)
regex_once(
    'src/veyra/dataGraph.js',
    r"    if \(binding\.source\.kind === 'propertyGroupProperty'\) \{.*?\n      return true;\n    \}",
    "    if (binding.source.kind === 'propertyGroupProperty') {\n      const property = propertyGroupPropertyById(document, binding.source.property.id);\n      if (!property) throw new TypeError(`[binding-two-way-source] missing Property Group property ${binding.source.property.id}.`);\n      const normalized = validateTypedValueTarget(document, property, value, `two-way Property Group ${property.id}`);\n      const scope = scopeKey(options.scopePath);\n      const key = runtimePropertyGroupKey(scope, property.id);\n      const oldValue = this.getPropertyGroupValue(property.id, options);\n      if (stableString(oldValue) === stableString(normalized)) return false;\n      this.#propertyGroupValues.set(key, clone(normalized));\n      this.#markDirty(document, binding.artboard.id, scope, bindingEndpointKey(binding.source));\n      this.#notify({ target: clone(binding.source), oldValue, newValue: clone(normalized), source: String(options.source || 'two-way-binding'), provenance: { binding: createReference('binding', binding.id), authoredPropertyGroupWrite: false, runtimePropertyGroupWrite: true, ...(options.provenance || {}) }, runtimeScope: createDataRuntimeScope(options.scopePath || []) });\n      return true;\n    }"
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #markListDirty(document, listId, scope) { const list = listById(document, listId); if (!list) return; const endpoint = { kind: 'data', instance: clone(list.owner), path: [clone(list.property)] }; this.#markDirty(document, viewModelInstanceById(document, list.owner.id)?.artboard.id, scope, bindingEndpointKey(endpoint)); this.#notify({ target: createReference('list', listId), event: 'list-change', source: 'runtime-list', runtimeScope: { kind: VEYRA_DATA_RUNTIME_SCOPE_KIND, key: scope, path: [] } }); }",
    "  #markListDirty(document, listId, scope) { const list = listById(document, listId); if (!list) return; this.#markDataPropertyDirty(document, scope, list.owner.id, list.property.id); this.#notify({ target: createReference('list', listId), event: 'list-change', source: 'runtime-list', runtimeScope: { kind: VEYRA_DATA_RUNTIME_SCOPE_KIND, key: scope, path: [] } }); }"
)

# ownership: two-way Property Group editing is a scoped runtime port; one-way stays authored.
replace_once(
    'src/veyra/controlPlane.js',
    "    } else if (endpoint?.kind === 'propertyGroupProperty') {\n      const sourceAddress = `propertyGroupProperty:${encodeURIComponent(endpoint.property.id)}/value`;\n      writableSource = { kind: 'property-group-property', binding: cloneValue(activeOwner.ref), ref: cloneValue(endpoint.property), address: sourceAddress, mode: activeOwner.mode, authored: true, targetEditsPropagate: activeOwner.mode === 'twoWay' };\n      warnings.push('The visible value is data-bound from an authored Property Group property; edit that source property rather than the visual target.');",
    "    } else if (endpoint?.kind === 'propertyGroupProperty') {\n      const sourceAddress = `propertyGroupProperty:${encodeURIComponent(endpoint.property.id)}/value`;\n      if (activeOwner.mode === 'twoWay') {\n        const runtimeOverride = typeof options.dataRuntime?.hasPropertyGroupOverride === 'function'\n          ? options.dataRuntime.hasPropertyGroupOverride(endpoint.property.id, { scopePath: activeOwner.runtimeScope?.path || options.runtimeScopePath || [] })\n          : false;\n        writableSource = { kind: 'property-group-runtime-property', binding: cloneValue(activeOwner.ref), ref: cloneValue(endpoint.property), authoredAddress: sourceAddress, mode: activeOwner.mode, authored: false, runtimeOverride, runtimeScope: cloneValue(activeOwner.runtimeScope), edit: { transport: 'runtime', port: 'setTwoWayTarget' }, targetEditsPropagate: true };\n        warnings.push('The visible value is two-way data-bound from a Property Group. Runtime interaction writes the scoped evaluated Property Group value; use the canonical Property Group command only for intentional persistence.');\n      } else {\n        writableSource = { kind: 'property-group-property', binding: cloneValue(activeOwner.ref), ref: cloneValue(endpoint.property), address: sourceAddress, mode: activeOwner.mode, authored: true, targetEditsPropagate: false };\n        warnings.push('The visible value is data-bound from an authored Property Group property; edit that source property rather than the visual target.');\n      }"
)

# Update the C1 assertion to preserve its executable two-way contract while respecting
# the authored/runtime boundary corrected by C2.
p = Path('tests/veyra-m8-c1-corrections.test.mjs')
text = p.read_text()
old = """check('two-way: Property Group source has explicit authored reverse-write semantics', [6, 17], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_two', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_two_value', type: 'number', value: 0.3 }] });
  store.createBinding({ id: 'pg_two_way', mode: 'twoWay', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_two_value'), target: propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  assert.equal(runtime.setTwoWayTarget('pg_two_way', 0.62), true);
  assert.equal(store.document.propertyGroups[0].properties[0].value, 0.62);
});
"""
new = """check('two-way: Property Group source has explicit scoped runtime reverse-write semantics', [6, 17, 24], () => {
  const store = baseStore(); seedCore(store);
  store.createPropertyGroup({ id: 'pg_two', artboard: ref('artboard','art_main'), properties: [{ id: 'pg_two_value', type: 'number', value: 0.3 }] });
  store.createBinding({ id: 'pg_two_way', mode: 'twoWay', artboard: ref('artboard','art_main'), source: pgEndpoint('pg_two_value'), target: propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const before = snapshot(store);
  assert.equal(runtime.setTwoWayTarget('pg_two_way', 0.62), true);
  assert.equal(runtime.getPropertyGroupValue('pg_two_value'), 0.62);
  assert.equal(store.document.propertyGroups[0].properties[0].value, 0.3);
  assertSnapshot(store, before);
  runtime.reset();
  assert.equal(runtime.getPropertyGroupValue('pg_two_value'), 0.3);
});
"""
if old not in text:
    raise SystemExit('C1 Property Group assertion anchor missing')
p.write_text(text.replace(old, new, 1))

print('M8-C2 warm runtime corrections applied')
