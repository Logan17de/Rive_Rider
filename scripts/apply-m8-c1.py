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


# properties.js: remove the dataGraph import cycle and delegate target status to
# the shared low-level property binding capability classifier.
replace_once(
    'src/veyra/properties.js',
    "import { propertyGroupPropertyById } from './dataGraph.js';\nimport { supportsNodeProperty, supportsRigProperty } from './capabilities.js';",
    "import { supportsNodeProperty, supportsRigProperty } from './capabilities.js';\nimport { canonicalPropertyBindingCapabilities } from './propertyBinding.js';",
)
replace_once(
    'src/veyra/properties.js',
    "export const VEYRA_PROPERTY_TARGET_KINDS = Object.freeze([",
    "function propertyGroupPropertyById(document, value) {\n  for (const group of document.propertyGroups || []) {\n    const item = (group.properties || []).find((candidate) => candidate.id === value);\n    if (item) return item;\n  }\n  return null;\n}\n\nexport const VEYRA_PROPERTY_TARGET_KINDS = Object.freeze([",
)
regex_once(
    'src/veyra/properties.js',
    r"export function propertyTargetStatus\(document, address\) \{.*?\n\}\n\nexport function isAnimatableProperty",
    "export function propertyTargetStatus(document, address) {\n  const parsed = parsePropertyAddress(address);\n  return canonicalPropertyBindingCapabilities(document, parsed).status;\n}\n\nexport function propertyBindingCapabilities(document, address) {\n  const parsed = typeof address === 'string' ? parsePropertyAddress(address) : address;\n  return canonicalPropertyBindingCapabilities(document, parsed);\n}\n\nexport function isAnimatableProperty",
)

# dataGraph.js: share the same canonical property capability contract.
replace_once(
    'src/veyra/dataGraph.js',
    "import { createReference, normalizeReference, referenceId } from './references.js';",
    "import { createReference, normalizeReference, referenceId } from './references.js';\nimport { canonicalPropertyBindingCapabilities } from './propertyBinding.js';",
)
regex_once(
    'src/veyra/dataGraph.js',
    r"function endpointWritable\(document, endpoint\) \{.*?\n\}\nfunction initialValueFor",
    "export function bindingEndpointCapabilities(document, endpoint) {\n  if (!endpoint || typeof endpoint !== 'object') return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };\n  if (endpoint.kind === 'data') {\n    const property = endpointDataProperty(document, endpoint);\n    if (!property) return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };\n    const readable = property.readable !== false;\n    const writable = property.writable !== false;\n    const bindable = property.bindable !== false;\n    return {\n      exists: true, readable, writable, bindable,\n      drivable: writable && bindable,\n      reverseWritable: writable && bindable && property.type !== 'trigger',\n      type: property.type, property,\n    };\n  }\n  if (endpoint.kind === 'propertyGroupProperty') {\n    const property = propertyGroupPropertyById(document, endpoint.property.id);\n    if (!property) return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };\n    const readable = property.readable !== false;\n    const writable = property.writable !== false;\n    const bindable = property.bindable !== false;\n    return {\n      exists: true, readable, writable, bindable,\n      drivable: writable && bindable && property.keyable !== false,\n      reverseWritable: writable && bindable && property.type !== 'trigger',\n      type: property.type, property,\n    };\n  }\n  if (endpoint.kind === 'property') {\n    let parsed;\n    try { parsed = parseDataAwarePropertyAddress(endpoint.address); } catch { return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null }; }\n    const canonical = canonicalPropertyBindingCapabilities(document, parsed);\n    let type = null;\n    try { type = dataAwareAddressType(document, endpoint.address); } catch {}\n    return { ...canonical, type, reverseWritable: false };\n  }\n  return { exists: false, readable: false, writable: false, bindable: false, drivable: false, reverseWritable: false, type: null };\n}\nfunction initialValueFor",
)
regex_once(
    'src/veyra/dataGraph.js',
    r"function validateBindingTypes\(document, binding, index\) \{.*?\n\}\nfunction validateBindingCycles",
    "function bindingCapabilityError(code, binding, endpoint, detail) {\n  throw new TypeError(`[${code}] binding ${binding.id} ${detail}: ${bindingEndpointKey(endpoint)}.`);\n}\nfunction requireForwardSourceCapabilities(document, binding) {\n  const caps = bindingEndpointCapabilities(document, binding.source);\n  if (!caps.exists) bindingCapabilityError('binding-missing-source', binding, binding.source, 'source does not resolve');\n  if (!caps.readable) bindingCapabilityError('binding-source-unreadable', binding, binding.source, 'source is not readable');\n  if (!caps.bindable) bindingCapabilityError('binding-source-unbindable', binding, binding.source, 'source is not bindable');\n  return caps;\n}\nfunction requireForwardTargetCapabilities(document, binding) {\n  const caps = bindingEndpointCapabilities(document, binding.target);\n  if (!caps.exists) bindingCapabilityError('binding-missing-target', binding, binding.target, 'target does not resolve');\n  if (binding.target.kind === 'property' && !caps.drivable) bindingCapabilityError('binding-target-not-drivable', binding, binding.target, 'target is outside the canonical data-binding write surface');\n  if (!caps.writable) bindingCapabilityError('binding-target-readonly', binding, binding.target, 'target is not writable');\n  if (!caps.bindable) bindingCapabilityError('binding-target-unbindable', binding, binding.target, 'target is not bindable');\n  if (!caps.drivable) bindingCapabilityError('binding-target-not-drivable', binding, binding.target, 'target is not canonically drivable');\n  return caps;\n}\nfunction validateBindingTypes(document, binding, index) {\n  const sourceCaps = requireForwardSourceCapabilities(document, binding);\n  let type = sourceCaps.type ?? bindingEndpointType(document, binding.source);\n  if (!type) throw new TypeError(`[binding-missing-source] bindings[${index}] source does not resolve.`);\n  for (const ref of binding.converterChain) {\n    const converter = converterById(document, ref.id);\n    if (!converter) throw new TypeError(`[binding-missing-converter] binding ${binding.id} references missing converter ${ref.id}.`);\n    if (!typeAccepts(converter.inputType, type)) {\n      throw new TypeError(`[binding-converter-type-mismatch] binding ${binding.id} sends ${type} to converter ${ref.id} expecting ${converter.inputType}.`);\n    }\n    type = converter.outputType;\n  }\n  const targetCaps = requireForwardTargetCapabilities(document, binding);\n  const targetType = targetCaps.type ?? bindingEndpointType(document, binding.target);\n  if (!targetType) throw new TypeError(`[binding-missing-target] bindings[${index}] target does not resolve.`);\n  if (!typeAccepts(targetType, type)) {\n    throw new TypeError(`[binding-type-mismatch] binding ${binding.id} produces ${type} for ${targetType} target ${bindingEndpointKey(binding.target)}.`);\n  }\n  if (binding.mode === 'twoWay') {\n    if (binding.converterChain.length) {\n      throw new TypeError(`[binding-two-way-converter] binding ${binding.id} cannot be two-way while converters are present without an inverse converter contract.`);\n    }\n    if (!targetCaps.readable) bindingCapabilityError('binding-two-way-target-unreadable', binding, binding.target, 'two-way target is not readable for reverse propagation');\n    if (!targetCaps.bindable) bindingCapabilityError('binding-target-unbindable', binding, binding.target, 'two-way target is not bindable');\n    if (!sourceCaps.writable) bindingCapabilityError('binding-two-way-source-readonly', binding, binding.source, 'two-way source is not writable');\n    if (!sourceCaps.reverseWritable) bindingCapabilityError('binding-two-way-source-unsupported', binding, binding.source, 'two-way source has no deterministic reverse-write port');\n    if (!typeAccepts(type, targetType) || !typeAccepts(targetType, type)) throw new TypeError(`[binding-two-way-type-mismatch] binding ${binding.id} reverse direction is incompatible.`);\n  }\n}\nfunction validateBindingCycles",
)

# Structural typed blockers: exact (kind,id), never substring/unqualified-id scans.
regex_once(
    'src/veyra/dataGraph.js',
    r"function blockersForReference\(document, kind, targetId\) \{.*?\n\}\nfunction refuseBlockers",
    "function containsTypedReference(value, kind, targetId) {\n  if (Array.isArray(value)) return value.some((item) => containsTypedReference(item, kind, targetId));\n  if (!value || typeof value !== 'object') return false;\n  if (value.kind === kind && value.id === targetId) return true;\n  return Object.values(value).some((item) => containsTypedReference(item, kind, targetId));\n}\nfunction blockersForReference(document, kind, targetId) {\n  const blockers = [];\n  const check = (label, ownerId, value) => { if (containsTypedReference(value, kind, targetId)) blockers.push({ kind: label, id: ownerId }); };\n  for (const binding of document.bindings || []) check('binding', binding.id, binding);\n  for (const instance of document.viewModelInstances || []) check('viewModelInstance', instance.id, instance);\n  for (const converter of document.converters || []) check('converter', converter.id, converter);\n  for (const group of document.propertyGroups || []) {\n    const ownsTarget = kind === 'propertyGroupProperty' && group.properties.some((item) => item.id === targetId);\n    if (!ownsTarget) check('propertyGroup', group.id, group);\n  }\n  for (const model of document.viewModels || []) {\n    const ownsTarget = kind === 'dataProperty' && model.properties.some((item) => item.id === targetId);\n    if (!ownsTarget) check('viewModel', model.id, model);\n  }\n  for (const item of document.enums || []) {\n    const ownsTarget = kind === 'enumValue' && item.values.some((value) => value.id === targetId);\n    if (!ownsTarget) check('enum', item.id, item);\n  }\n  for (const list of document.lists || []) {\n    const ownsTarget = kind === 'listItem' && list.items.some((item) => item.id === targetId);\n    if (!ownsTarget) check('list', list.id, list);\n  }\n  return blockers\n    .filter((item) => !(item.kind === kind && item.id === targetId))\n    .filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.id === item.id) === index)\n    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));\n}\nfunction refuseBlockers",
)

# Runtime: one trigger fire == one queued pulse; non-data roots invalidate only
# when their actual source value changes.
replace_once(
    'src/veyra/dataGraph.js',
    "  #bindingCache = new Map();\n  #dirty = new Map();",
    "  #bindingCache = new Map();\n  #sourceSnapshots = new Map();\n  #dirty = new Map();",
)
replace_once(
    'src/veyra/dataGraph.js',
    "  #stats = { graphBuilds: 0, evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, notifications: 0, zeroBindingFastPaths: 0 };",
    "  #stats = { graphBuilds: 0, evaluations: 0, bindingEvaluations: 0, cacheHits: 0, dirtyInvalidations: 0, sourceChecks: 0, sourceInvalidations: 0, triggerPulsesConsumed: 0, notifications: 0, zeroBindingFastPaths: 0 };",
)
replace_once(
    'src/veyra/dataGraph.js',
    "    for (const map of [this.#values, this.#triggers, this.#lists, this.#bindingCache]) for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);",
    "    for (const map of [this.#values, this.#triggers, this.#lists, this.#bindingCache, this.#sourceSnapshots]) for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);",
)
replace_once(
    'src/veyra/dataGraph.js',
    "        if (count > 0) triggerReads.add({ key, endpointKey: bindingEndpointKey({ kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] }) });",
    "        if (count > 0) triggerReads.set(key, bindingEndpointKey({ kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] }));",
)
regex_once(
    'src/veyra/dataGraph.js',
    r"  evaluateBindings\(document, options = \{\}\) \{.*?\n  \}\n  setTwoWayTarget",
    "  evaluateBindings(document, options = {}) {\n    const artboardId = String(options.artboardId || document.artboards?.[0]?.id || ''); const relevant = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);\n    this.#stats.evaluations += 1;\n    if (!relevant.length) { this.#stats.zeroBindingFastPaths += 1; return { overrides: {}, ownership: {}, diagnostics: { conflicts: [], errors: [] }, stats: { evaluatedBindings: 0, cacheHits: 0, sourceInvalidations: 0, graphBuilt: false, zeroBindingFastPath: true } }; }\n    const index = this.#index(document, artboardId); const scope = scopeKey(options.scopePath); let dirty = this.#dirty.get(scope);\n    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }\n    for (const binding of index.winners) if (!this.#bindingCache.has(runtimeBindingKey(scope, binding.id))) dirty.add(binding.id);\n\n    let sourceInvalidations = 0;\n    const checkedSources = new Set();\n    for (const binding of index.ordered) {\n      if (binding.source.kind === 'data') continue;\n      const sourceKey = bindingEndpointKey(binding.source);\n      if (checkedSources.has(sourceKey) || index.byTarget.has(sourceKey)) continue;\n      checkedSources.add(sourceKey);\n      const snapshotKey = `${scope}|${artboardId}|${sourceKey}`;\n      const current = this.#endpointValue(document, binding.source, scope, new Map(), new Map());\n      this.#stats.sourceChecks += 1;\n      if (!this.#sourceSnapshots.has(snapshotKey)) { this.#sourceSnapshots.set(snapshotKey, clone(current)); continue; }\n      const previous = this.#sourceSnapshots.get(snapshotKey);\n      if (stableString(previous) !== stableString(current)) {\n        this.#sourceSnapshots.set(snapshotKey, clone(current));\n        const invalidated = this.#cascadeDirty(index, dirty, index.bySource.get(sourceKey) || []);\n        sourceInvalidations += invalidated;\n        this.#stats.sourceInvalidations += invalidated;\n        this.#stats.dirtyInvalidations += invalidated;\n      }\n    }\n\n    const virtual = new Map(); const overrides = {}; const ownership = {}; const triggerReads = new Map(); let evaluatedBindings = 0; let cacheHits = 0;\n    for (const binding of index.ordered) {\n      const cacheKey = runtimeBindingKey(scope, binding.id); let output;\n      if (!dirty.has(binding.id) && this.#bindingCache.has(cacheKey)) { output = clone(this.#bindingCache.get(cacheKey)); cacheHits += 1; this.#stats.cacheHits += 1; }\n      else {\n        output = this.#endpointValue(document, binding.source, scope, virtual, triggerReads);\n        for (const ref of binding.converterChain) output = converterValue(document, converterById(document, ref.id), output);\n        this.#bindingCache.set(cacheKey, clone(output)); evaluatedBindings += 1; this.#stats.bindingEvaluations += 1;\n      }\n      const targetKey = bindingEndpointKey(binding.target); virtual.set(targetKey, clone(output));\n      if (binding.target.kind === 'property') {\n        overrides[binding.target.address] = clone(output);\n        ownership[binding.target.address] = {\n          kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode,\n          source: clone(binding.source), converters: binding.converterChain.map((ref) => clone(ref)), target: clone(binding.target), runtimeScope: createDataRuntimeScope(options.scopePath || []),\n        };\n      } else if (binding.target.kind === 'propertyGroupProperty') {\n        const address = `propertyGroupProperty:${encodeURIComponent(binding.target.property.id)}/value`;\n        overrides[address] = clone(output);\n        ownership[address] = { kind: 'data-binding', ref: createReference('binding', binding.id), mode: binding.mode, source: clone(binding.source), converters: binding.converterChain.map((ref) => clone(ref)), target: clone(binding.target), runtimeScope: createDataRuntimeScope(options.scopePath || []) };\n      }\n      dirty.delete(binding.id);\n    }\n    if (triggerReads.size) {\n      for (const [key, endpointKey] of triggerReads) {\n        const count = this.#triggers.get(key) || 0;\n        const remaining = Math.max(0, count - 1);\n        if (remaining) this.#triggers.set(key, remaining); else this.#triggers.delete(key);\n        this.#stats.triggerPulsesConsumed += count > 0 ? 1 : 0;\n        this.#cascadeDirty(index, dirty, index.bySource.get(endpointKey) || []);\n      }\n    }\n    this.#dirty.set(scope, dirty);\n    return { overrides, ownership, virtualValues: Object.fromEntries([...virtual.entries()].map(([key, value]) => [key, clone(value)])), diagnostics: { conflicts: clone(index.conflicts), errors: [] }, stats: { evaluatedBindings, cacheHits, sourceInvalidations, graphBuilt: true, zeroBindingFastPath: false } };\n  }\n  setTwoWayTarget",
)
regex_once(
    'src/veyra/dataGraph.js',
    r"  setTwoWayTarget\(bindingId, value, options = \{\}\) \{.*?\n  \}\n\n  #runtimeList",
    "  setTwoWayTarget(bindingId, value, options = {}) {\n    const document = this.#document(); const binding = bindingById(document, bindingId);\n    if (!binding || binding.mode !== 'twoWay' || !binding.enabled) throw new TypeError(`[binding-two-way-unavailable] ${bindingId} is not an enabled two-way binding.`);\n    const capabilities = bindingEndpointCapabilities(document, binding.source);\n    if (!capabilities.reverseWritable) throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(binding.source)} has no deterministic reverse-write port.`);\n    if (binding.source.kind === 'data') {\n      let instanceId = binding.source.instance.id;\n      for (let index = 0; index < binding.source.path.length; index += 1) {\n        const propertyId = binding.source.path[index].id;\n        const { instance, property } = this.#instanceProperty(document, instanceId, propertyId);\n        if (index === binding.source.path.length - 1) {\n          return this.setValue(instance.id, property.id, value, { ...options, source: options.source || 'two-way-binding', provenance: { binding: createReference('binding', binding.id), ...(options.provenance || {}) } });\n        }\n        if (property.type !== 'viewModel') throw new TypeError(`[binding-two-way-source] ${property.id} is not a nested View Model property.`);\n        const nested = this.getValue(instance.id, property.id, options);\n        if (nested?.kind !== 'viewModelInstance') throw new TypeError(`[binding-two-way-source] ${property.id} does not resolve a nested View Model instance in this runtime scope.`);\n        instanceId = nested.id;\n      }\n    }\n    if (binding.source.kind === 'propertyGroupProperty') {\n      const property = propertyGroupPropertyById(document, binding.source.property.id);\n      if (!property) throw new TypeError(`[binding-two-way-source] missing Property Group property ${binding.source.property.id}.`);\n      const normalized = validateTypedValueTarget(document, property, value, `two-way Property Group ${property.id}`);\n      const oldValue = clone(property.value);\n      if (stableString(oldValue) === stableString(normalized)) return false;\n      property.value = clone(normalized);\n      const scope = scopeKey(options.scopePath);\n      this.#markDirty(document, binding.artboard.id, scope, bindingEndpointKey(binding.source));\n      this.#notify({ target: clone(binding.source), oldValue, newValue: clone(normalized), source: String(options.source || 'two-way-binding'), provenance: { binding: createReference('binding', binding.id), authoredPropertyGroupWrite: true, ...(options.provenance || {}) }, runtimeScope: createDataRuntimeScope(options.scopePath || []) });\n      return true;\n    }\n    throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(binding.source)} has no deterministic reverse-write port.`);\n  }\n\n  #runtimeList",
)
replace_once(
    'src/veyra/dataGraph.js',
    "    for (const property of group.properties) push('propertyGroupProperty', property, property.type, property.name, ['keyable', 'bindable']);",
    "    for (const property of group.properties) push('propertyGroupProperty', property, property.type, property.name, [property.keyable !== false ? 'keyable' : '', property.readable !== false ? 'readable' : '', property.writable !== false ? 'writable' : '', property.bindable !== false ? 'bindable' : ''].filter(Boolean));",
)

# Machine-readable command diagnostic code without changing legacy error strings.
replace_once(
    'src/veyra/commands.js',
    "function fail(action, message) {\n  return { ok: false, action, error: message };\n}",
    "function fail(action, message) {\n  const error = String(message);\n  const match = /^\\[([^\\]]+)\\]/.exec(error);\n  return { ok: false, action, error, ...(match ? { errorCode: match[1] } : {}) };\n}",
)

# Ownership: recommend the real data-binding source, not the authored target.
replace_once(
    'src/veyra/controlPlane.js',
    "    activeOwner = activeBinding ? { ...cloneValue(activeBinding), source: 'data-binding', chain: { binding: cloneValue(activeBinding.ref), source: cloneValue(activeBinding.source), converters: cloneValue(activeBinding.converters), target: cloneValue(activeBinding.target) } } : { kind: 'data-binding', source: 'data-binding', evidence: [{ kind: 'binding-owner-missing' }] };",
    "    activeOwner = activeBinding ? { ...cloneValue(activeBinding), source: 'data-binding', runtimeScope: cloneValue(runtimeOwner?.runtimeScope || null), chain: { binding: cloneValue(activeBinding.ref), source: cloneValue(activeBinding.source), converters: cloneValue(activeBinding.converters), target: cloneValue(activeBinding.target), mode: activeBinding.mode, runtimeScope: cloneValue(runtimeOwner?.runtimeScope || null) } } : { kind: 'data-binding', source: 'data-binding', evidence: [{ kind: 'binding-owner-missing' }] };",
)
replace_once(
    'src/veyra/controlPlane.js',
    "  if (activeOwner.kind === 'animation-track') {",
    "  if (activeOwner.kind === 'data-binding') {\n    const endpoint = activeOwner.source;\n    if (endpoint?.kind === 'data') {\n      writableSource = {\n        kind: 'data-runtime-property',\n        binding: cloneValue(activeOwner.ref),\n        endpoint: cloneValue(endpoint),\n        instance: cloneValue(endpoint.instance),\n        path: cloneValue(endpoint.path),\n        mode: activeOwner.mode,\n        runtimeScope: cloneValue(activeOwner.runtimeScope),\n        edit: { transport: 'runtime', port: 'setDataRuntimeValue' },\n        authored: false,\n        targetEditsPropagate: activeOwner.mode === 'twoWay',\n      };\n      warnings.push('The visible value is data-bound. Edit the runtime View Model source rather than the authored visual target.');\n    } else if (endpoint?.kind === 'propertyGroupProperty') {\n      const sourceAddress = `propertyGroupProperty:${encodeURIComponent(endpoint.property.id)}/value`;\n      writableSource = { kind: 'property-group-property', binding: cloneValue(activeOwner.ref), ref: cloneValue(endpoint.property), address: sourceAddress, mode: activeOwner.mode, authored: true, targetEditsPropagate: activeOwner.mode === 'twoWay' };\n      warnings.push('The visible value is data-bound from an authored Property Group property; edit that source property rather than the visual target.');\n    } else if (endpoint?.kind === 'property') {\n      writableSource = { kind: 'authored-property', binding: cloneValue(activeOwner.ref), address: endpoint.address, mode: activeOwner.mode, authored: true, targetEditsPropagate: activeOwner.mode === 'twoWay' };\n      warnings.push('The visible value is data-bound from another authored property; edit the binding source rather than the visual target.');\n    } else {\n      writableSource = { kind: 'data-binding-source', binding: cloneValue(activeOwner.ref), endpoint: cloneValue(endpoint), writable: false };\n    }\n  } else if (activeOwner.kind === 'animation-track') {",
)

# Manifest/AI metadata explicitly states the same endpoint capability rules.
replace_once(
    'src/veyra/manifest.js',
    "      bindingModes: ['oneWay','twoWay'],\n      evaluationOrder:",
    "      bindingModes: ['oneWay','twoWay'],\n      endpointCapabilities: { source: 'readable && bindable', target: 'writable && bindable && canonical-drivable', twoWay: 'forward capabilities plus target readable and source deterministic reverse-write; converters require a future inverse contract' },\n      evaluationOrder:",
)
replace_once(
    'src/veyra/manifest.js',
    "  'data.incremental-dirty-evaluation',",
    "  'data.incremental-dirty-evaluation',\n  'data.binding-capability-validation',",
)

# Public export for tests/AI tooling that needs to inspect endpoint capability.
replace_once(
    'src/index.js',
    "  bindingEndpointKey, bindingEndpointType, bindingControllersForAddress,",
    "  bindingEndpointKey, bindingEndpointType, bindingEndpointCapabilities, bindingControllersForAddress,",
)

print('M8-C1 production corrections applied')
