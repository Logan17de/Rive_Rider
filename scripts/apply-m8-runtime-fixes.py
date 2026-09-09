from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, count))

# Owner containers are not dependency blockers for their own nested entities.
patch('src/veyra/dataGraph.js',
"  for (const group of document.propertyGroups || []) check('propertyGroup', group.id, group);\n  for (const model of document.viewModels || []) check('viewModel', model.id, model);\n  return blockers.filter((item) => !(item.kind === kind && item.id === targetId)).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));",
"  for (const group of document.propertyGroups || []) {\n    const ownsTarget = kind === 'propertyGroupProperty' && group.properties.some((item) => item.id === targetId);\n    if (!ownsTarget) check('propertyGroup', group.id, group);\n  }\n  for (const model of document.viewModels || []) {\n    const ownsTarget = kind === 'dataProperty' && model.properties.some((item) => item.id === targetId);\n    if (!ownsTarget) check('viewModel', model.id, model);\n  }\n  for (const item of document.enums || []) {\n    const ownsTarget = kind === 'enumValue' && item.values.some((value) => value.id === targetId);\n    if (!ownsTarget) check('enum', item.id, item);\n  }\n  for (const list of document.lists || []) {\n    const ownsTarget = kind === 'listItem' && list.items.some((item) => item.id === targetId);\n    if (!ownsTarget) check('list', list.id, list);\n  }\n  return blockers.filter((item) => !(item.kind === kind && item.id === targetId)).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));")

# Validate authored list item values against the list property's item descriptor.
patch('src/veyra/dataGraph.js',
"    uniqueIds(list.items, 'listItem', `lists[${listIndex}].items`);\n    for (const [itemIndex, item] of list.items.entries()) registerSub('listItem', item.id, `lists[${listIndex}].items[${itemIndex}]`);",
"    uniqueIds(list.items, 'listItem', `lists[${listIndex}].items`);\n    const itemProperty = { ...property.itemType, readable: true, writable: true, bindable: true };\n    for (const [itemIndex, item] of list.items.entries()) {\n      registerSub('listItem', item.id, `lists[${listIndex}].items[${itemIndex}]`);\n      item.value = validateTypedValueTarget(document, itemProperty, item.value, `lists[${listIndex}].items[${itemIndex}].value`);\n    }")

# Trigger reads are recorded only for a live edge. A consumed trigger therefore
# forces exactly one follow-up recompute to false and then reaches a settled cache.
patch('src/veyra/dataGraph.js',
"        const key = runtimePropertyKey(scope, instance.id, property.id); value = (this.#triggers.get(key) || 0) > 0; triggerReads.add(key);",
"        const key = runtimePropertyKey(scope, instance.id, property.id);\n        const count = this.#triggers.get(key) || 0;\n        value = count > 0;\n        if (count > 0) triggerReads.add({ key, endpointKey: bindingEndpointKey({ kind: 'data', instance: createReference('viewModelInstance', instance.id), path: [createReference('dataProperty', property.id)] }) });")

# Extract one deterministic dirty-cascade helper so runtime writes, animated
# property sources, and trigger reset all invalidate only reachable bindings.
patch('src/veyra/dataGraph.js',
"  #markDirty(document, artboardId, scope, sourceKey) {\n    const bindings = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);\n    if (!bindings.length) return;\n    const index = this.#index(document, artboardId); const dirty = this.#dirty.get(scope) || new Set(); const queue = [...(index.bySource.get(sourceKey) || [])]; const seen = new Set();\n    while (queue.length) { const current = queue.shift(); if (seen.has(current)) continue; seen.add(current); dirty.add(current); for (const next of index.downstream.get(current) || []) queue.push(next); }\n    this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += seen.size;\n  }",
"  #cascadeDirty(index, dirty, bindingIds) {\n    const queue = [...bindingIds]; const seen = new Set();\n    while (queue.length) {\n      const current = queue.shift();\n      if (seen.has(current)) continue;\n      seen.add(current); dirty.add(current);\n      for (const next of index.downstream.get(current) || []) queue.push(next);\n    }\n    return seen.size;\n  }\n  #markDirty(document, artboardId, scope, sourceKey) {\n    const bindings = (document.bindings || []).filter((item) => item.enabled && item.artboard.id === artboardId);\n    if (!bindings.length) return;\n    const index = this.#index(document, artboardId);\n    const dirty = this.#dirty.get(scope) || new Set();\n    const count = this.#cascadeDirty(index, dirty, index.bySource.get(sourceKey) || []);\n    this.#dirty.set(scope, dirty); this.#stats.dirtyInvalidations += count;\n  }")

# Property and Property-Group sources can be changed by the preceding animation
# layer each frame. Mark those branches dirty on an explicit evaluation call;
# data-only branches remain fully settled/cached until a runtime write occurs.
patch('src/veyra/dataGraph.js',
"    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }\n    const virtual = new Map();",
"    if (!dirty) { dirty = new Set(index.winners.map((item) => item.id)); this.#dirty.set(scope, dirty); }\n    for (const binding of index.ordered) {\n      if (binding.source.kind !== 'data') this.#cascadeDirty(index, dirty, [binding.id]);\n    }\n    const virtual = new Map();")

patch('src/veyra/dataGraph.js',
"    for (const key of triggerReads) this.#triggers.set(key, 0);\n    this.#dirty.set(scope, dirty);",
"    if (triggerReads.size) {\n      for (const item of triggerReads) {\n        this.#triggers.set(item.key, 0);\n        this.#cascadeDirty(index, dirty, index.bySource.get(item.endpointKey) || []);\n      }\n    }\n    this.#dirty.set(scope, dirty);")

print('M8 runtime safety fixes applied')
