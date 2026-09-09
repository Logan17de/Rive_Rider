from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:240]!r}')
    p.write_text(text.replace(old, new, count))

# Include artboard-local M8 identities in the same deterministic duplicate id map.
patch('src/veyra/projectGraph.js',
"  for (const instance of document.componentInstances.filter((item) => item.artboard.id === artboardId)) {\n    push('componentInstance', instance.id);\n    for (const override of instance.overrides) push('componentOverride', override.id);\n  }\n  for (const semantic of document.semantics) {",
"  for (const instance of document.componentInstances.filter((item) => item.artboard.id === artboardId)) {\n    push('componentInstance', instance.id);\n    for (const override of instance.overrides) push('componentOverride', override.id);\n  }\n  const dataInstanceIds = new Set((document.viewModelInstances || []).filter((item) => item.artboard.id === artboardId).map((item) => item.id));\n  for (const instance of document.viewModelInstances || []) if (dataInstanceIds.has(instance.id)) push('viewModelInstance', instance.id);\n  for (const group of (document.propertyGroups || []).filter((item) => item.artboard.id === artboardId)) {\n    push('propertyGroup', group.id);\n    for (const property of group.properties || []) push('propertyGroupProperty', property.id);\n  }\n  for (const binding of (document.bindings || []).filter((item) => item.artboard.id === artboardId)) push('binding', binding.id);\n  for (const list of (document.lists || []).filter((item) => dataInstanceIds.has(item.owner.id))) {\n    push('list', list.id);\n    for (const item of list.items || []) push('listItem', item.id);\n  }\n  for (const semantic of document.semantics) {")

# Nested child IDs for Property Groups/lists are remapped exactly like path vertices/tracks.
patch('src/veyra/projectGraph.js',
"    } else if (kind === 'componentInstance') {\n      source.overrides.forEach((item, index) => { copy.overrides[index].id = mapped('componentOverride', item.id); });\n    }\n  };",
"    } else if (kind === 'componentInstance') {\n      source.overrides.forEach((item, index) => { copy.overrides[index].id = mapped('componentOverride', item.id); });\n    } else if (kind === 'propertyGroup') {\n      source.properties.forEach((item, index) => { copy.properties[index].id = mapped('propertyGroupProperty', item.id); });\n    } else if (kind === 'list') {\n      source.items.forEach((item, index) => { copy.items[index].id = mapped('listItem', item.id); });\n    }\n  };")

# Duplicate M8 artboard-owned entities and their lists after the M6 families.
patch('src/veyra/projectGraph.js',
"  duplicateCollection('listener', 'listeners');\n  duplicateCollection('componentInstance', 'componentInstances');\n\n  const semanticCopies = [];",
"  duplicateCollection('listener', 'listeners');\n  duplicateCollection('componentInstance', 'componentInstances');\n  duplicateCollection('viewModelInstance', 'viewModelInstances');\n  duplicateCollection('propertyGroup', 'propertyGroups');\n  duplicateCollection('binding', 'bindings');\n\n  const sourceDataInstanceIds = new Set((document.viewModelInstances || []).filter((item) => item.artboard?.id === sourceArtboardId).map((item) => item.id));\n  const listCopies = [];\n  for (const item of (document.lists || []).filter((entry) => sourceDataInstanceIds.has(entry.owner.id))) {\n    const copy = deepRemap(cloneValue(item), idMap);\n    copy.id = idMap.get(`list:${item.id}`);\n    rewriteNestedIds('list', item, copy);\n    listCopies.push(copy);\n  }\n  document.lists.push(...listCopies);\n\n  const semanticCopies = [];")

# Artboard deletion cascades only the M8 entities actually owned by that artboard and
# removes cross-artboard bindings/initial refs that would otherwise dangle.
old = """      document.componentInstances = document.componentInstances.filter((item) => item.artboard.id !== artboardId);
      document.components = document.components.filter((item) => item.source.id !== artboardId);
      for (const key of ['nodes','bones','meshes','controls','constraints','timelines','stateMachines','listeners']) {
        document[key] = document[key].filter((item) => item.artboard?.id !== artboardId);
      }
      document.artboards = document.artboards.filter((item) => item.id !== artboardId);"""
new = """      document.componentInstances = document.componentInstances.filter((item) => item.artboard.id !== artboardId);
      document.components = document.components.filter((item) => item.source.id !== artboardId);
      const removedDataInstanceIds = new Set((document.viewModelInstances || []).filter((item) => item.artboard.id === artboardId).map((item) => item.id));
      const removedGroupPropertyIds = new Set((document.propertyGroups || []).filter((item) => item.artboard.id === artboardId).flatMap((item) => (item.properties || []).map((property) => property.id)));
      const removedListIds = new Set((document.lists || []).filter((item) => removedDataInstanceIds.has(item.owner.id)).map((item) => item.id));
      const endpointOwnedByDeletedArtboard = (endpoint) => {
        if (!endpoint) return false;
        if (endpoint.kind === 'data') return removedDataInstanceIds.has(endpoint.instance?.id);
        if (endpoint.kind === 'propertyGroupProperty') return removedGroupPropertyIds.has(endpoint.property?.id);
        if (endpoint.kind === 'property') {
          const match = /^([^:]+):([^/]+)\//.exec(String(endpoint.address || ''));
          return Boolean(match && entityArtboardId(document, { kind: match[1], id: match[2] }) === artboardId);
        }
        return false;
      };
      document.bindings = (document.bindings || []).filter((binding) => binding.artboard.id !== artboardId && !endpointOwnedByDeletedArtboard(binding.source) && !endpointOwnedByDeletedArtboard(binding.target));
      document.lists = (document.lists || []).filter((item) => !removedDataInstanceIds.has(item.owner.id));
      document.viewModelInstances = (document.viewModelInstances || []).filter((item) => item.artboard.id !== artboardId);
      for (const instance of document.viewModelInstances || []) {
        instance.initialValues = (instance.initialValues || []).filter((entry) => !(entry.value?.kind === 'viewModelInstance' && removedDataInstanceIds.has(entry.value.id)) && !(entry.value?.kind === 'list' && removedListIds.has(entry.value.id)));
      }
      document.propertyGroups = (document.propertyGroups || []).filter((item) => item.artboard.id !== artboardId);
      for (const key of ['nodes','bones','meshes','controls','constraints','timelines','stateMachines','listeners']) {
        document[key] = document[key].filter((item) => item.artboard?.id !== artboardId);
      }
      document.artboards = document.artboards.filter((item) => item.id !== artboardId);"""
patch('src/veyra/store.js', old, new)

print('M8 artboard lifecycle now duplicates/removes local data graph safely')
