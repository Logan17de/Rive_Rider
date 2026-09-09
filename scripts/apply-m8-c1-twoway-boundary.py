from pathlib import Path

# Property Group reverse writes are authored mutations. Runtime data ports must
# not mutate authored Property Groups outside Store/history, so keep them out of
# the executable two-way reverse-source subset.
p = Path('src/veyra/dataGraph.js')
text = p.read_text()
old = """      drivable: writable && bindable && property.keyable !== false,
      reverseWritable: writable && bindable && property.type !== 'trigger',
      type: property.type, property,
"""
new = """      drivable: writable && bindable && property.keyable !== false,
      reverseWritable: false,
      type: property.type, property,
"""
if old not in text:
    raise SystemExit('Property Group reverseWritable anchor missing')
text = text.replace(old, new, 1)
old = """    if (binding.source.kind === 'propertyGroupProperty') {
      const property = propertyGroupPropertyById(document, binding.source.property.id);
      if (!property) throw new TypeError(`[binding-two-way-source] missing Property Group property ${binding.source.property.id}.`);
      const normalized = validateTypedValueTarget(document, property, value, `two-way Property Group ${property.id}`);
      const oldValue = clone(property.value);
      if (stableString(oldValue) === stableString(normalized)) return false;
      property.value = clone(normalized);
      const scope = scopeKey(options.scopePath);
      this.#markDirty(document, binding.artboard.id, scope, bindingEndpointKey(binding.source));
      this.#notify({ target: clone(binding.source), oldValue, newValue: clone(normalized), source: String(options.source || 'two-way-binding'), provenance: { binding: createReference('binding', binding.id), authoredPropertyGroupWrite: true, ...(options.provenance || {}) }, runtimeScope: createDataRuntimeScope(options.scopePath || []) });
      return true;
    }
"""
if old not in text:
    raise SystemExit('Property Group reverse-write runtime branch missing')
text = text.replace(old, '', 1)
p.write_text(text)

# Tell AI/UI exactly why the subset is bounded.
p = Path('src/veyra/manifest.js')
text = p.read_text()
old = "twoWay: 'forward capabilities plus target readable and source deterministic reverse-write; converters require a future inverse contract'"
new = "twoWay: 'forward capabilities plus target readable and runtime View Model data source deterministic reverse-write; authored Property Group/property sources require a future canonical authored-write bridge; converters require a future inverse contract'"
if old not in text:
    raise SystemExit('manifest twoWay contract anchor missing')
p.write_text(text.replace(old, new, 1))

print('M8-C1 two-way reverse source bounded to runtime View Model data')
