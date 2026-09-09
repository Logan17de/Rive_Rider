from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:220]!r}')
    p.write_text(text.replace(old, new, count))

# Canonical authored enum-value reorder preserves stable enumValue identity.
patch('src/veyra/dataGraph.js',
"export function removeEnumValueInDocument(document, enumId, valueId) { refuseBlockers(document, 'enumValue', valueId); const item = enumById(document, enumId); if (!item) return false; const before = item.values.length; item.values = item.values.filter((value) => value.id !== valueId); return before !== item.values.length; }",
"export function removeEnumValueInDocument(document, enumId, valueId) { refuseBlockers(document, 'enumValue', valueId); const item = enumById(document, enumId); if (!item) return false; const before = item.values.length; item.values = item.values.filter((value) => value.id !== valueId); return before !== item.values.length; }\nexport function moveEnumValueInDocument(document, enumId, valueId, index) {\n  const item = enumById(document, enumId);\n  const from = item?.values.findIndex((value) => value.id === valueId) ?? -1;\n  if (from < 0) throw new TypeError(`Unknown enum value ${valueId}.`);\n  const numeric = Number(index);\n  if (!Number.isFinite(numeric)) throw new TypeError('Enum value order index must be finite.');\n  const at = Math.max(0, Math.min(item.values.length - 1, Math.trunc(numeric)));\n  const [value] = item.values.splice(from, 1);\n  item.values.splice(at, 0, value);\n  return createReference('enumValue', valueId);\n}")

patch('src/veyra/dataStore.js',
"  moveListItemInDocument,",
"  moveEnumValueInDocument,\n  moveListItemInDocument,")
patch('src/veyra/dataStore.js',
"    removeEnumValue(enumId, valueId, commandDescriptor = {}) {\n      if (!enumValueById(this.document, valueId)) return false;\n      return execute(this, commandDescriptor, `Remove enum value ${valueId}`, (document) => removeEnumValueInDocument(document, enumId, valueId));\n    },",
"    removeEnumValue(enumId, valueId, commandDescriptor = {}) {\n      if (!enumValueById(this.document, valueId)) return false;\n      return execute(this, commandDescriptor, `Remove enum value ${valueId}`, (document) => removeEnumValueInDocument(document, enumId, valueId));\n    },\n    moveEnumValue(enumId, valueId, index, commandDescriptor = {}) {\n      if (!enumValueById(this.document, valueId)) return false;\n      return execute(this, commandDescriptor, `Move enum value ${valueId}`, (document) => moveEnumValueInDocument(document, enumId, valueId, index));\n    },")

# JSON-safe canonical command + manifest metadata.
patch('src/veyra/commands.js',
"  removeEnumValue: { summary: 'Remove an unused enumValue fail-closed.', params: [param('enumId','string',true),param('valueId','string',true)], run: (store,args,command) => store.removeEnumValue(args.enumId,args.valueId,command ?? {}) },",
"  removeEnumValue: { summary: 'Remove an unused enumValue fail-closed.', params: [param('enumId','string',true),param('valueId','string',true)], run: (store,args,command) => store.removeEnumValue(args.enumId,args.valueId,command ?? {}) },\n  moveEnumValue: { summary: 'Reorder an enumValue without changing stable identity.', params: [param('enumId','string',true),param('valueId','string',true),param('index','number',true)], run: (store,args,command) => store.moveEnumValue(args.enumId,args.valueId,args.index,command ?? {}) },")
patch('src/veyra/commands.js',
"  removeEnumValue: { targetKind: 'enumValue', capabilities: ['enum','dependency-checked','transactional','undoable'] },",
"  removeEnumValue: { targetKind: 'enumValue', capabilities: ['enum','dependency-checked','transactional','undoable'] },\n  moveEnumValue: { targetKind: 'enumValue', capabilities: ['enum','presentation-order','identity-preserving','transactional','undoable'] },")

# Persistent browser compatibility is mechanically audited against globalThis.veyra.
patch('src/veyra/serviceRegistry.js',
"  removeEnumValue: Object.freeze({ transport: 'command', action: 'removeEnumValue' }),",
"  removeEnumValue: Object.freeze({ transport: 'command', action: 'removeEnumValue' }),\n  moveEnumValue: Object.freeze({ transport: 'command', action: 'moveEnumValue' }),")
patch('veyra.js',
"  removeEnumValue: (enumId, valueId) => dispatchCompatibilityCommand('removeEnumValue', { enumId, valueId }, { label: `Remove enum value ${valueId}`, source: 'script' }),",
"  removeEnumValue: (enumId, valueId) => dispatchCompatibilityCommand('removeEnumValue', { enumId, valueId }, { label: `Remove enum value ${valueId}`, source: 'script' }),\n  moveEnumValue: (enumId, valueId, index) => dispatchCompatibilityCommand('moveEnumValue', { enumId, valueId, index }, { label: `Move enum value ${valueId}`, source: 'script' }),")

print('M8 stable enum reorder contract completed')
