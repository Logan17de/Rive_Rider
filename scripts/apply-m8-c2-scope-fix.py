from pathlib import Path

p = Path('src/veyra/dataGraph.js')
text = p.read_text()
old = """  getPropertyGroupValue(propertyId, options = {}) {
    const document = this.#document();
    const property = propertyGroupPropertyById(document, propertyId);
    if (!property) throw new TypeError(`Runtime Property Group target ${propertyId} does not exist.`);
    const scope = scopeKey(options.scopePath); const key = runtimePropertyGroupKey(scope, property.id);
    return clone(this.#propertyGroupValues.has(key) ? this.#propertyGroupValues.get(key) : property.value);
  }
  hasPropertyGroupOverride(propertyId, options = {}) {
    return this.#propertyGroupValues.has(runtimePropertyGroupKey(scopeKey(options.scopePath), propertyId));
  }
"""
new = """  #propertyGroupValue(document, propertyId, scope) {
    const property = propertyGroupPropertyById(document, propertyId);
    if (!property) throw new TypeError(`Runtime Property Group target ${propertyId} does not exist.`);
    const key = runtimePropertyGroupKey(scope, property.id);
    return clone(this.#propertyGroupValues.has(key) ? this.#propertyGroupValues.get(key) : property.value);
  }
  getPropertyGroupValue(propertyId, options = {}) {
    return this.#propertyGroupValue(this.#document(), propertyId, scopeKey(options.scopePath));
  }
  hasPropertyGroupOverride(propertyId, options = {}) {
    return this.#propertyGroupValues.has(runtimePropertyGroupKey(scopeKey(options.scopePath), propertyId));
  }
"""
if old not in text:
    raise SystemExit('Property Group accessor anchor missing')
text = text.replace(old, new, 1)
old2 = """    if (endpoint.kind === 'data') return this.#dataEndpointValue(document, endpoint, scope, triggerReads);
    if (endpoint.kind === 'propertyGroupProperty') return this.getPropertyGroupValue(endpoint.property.id, { scopePath: scope === 'root' ? [] : scope.split('/').map((part) => { const colon = part.indexOf(':'); return { kind: part.slice(0, colon), id: part.slice(colon + 1) }; }) });
"""
new2 = """    if (endpoint.kind === 'data') return this.#dataEndpointValue(document, endpoint, scope, triggerReads);
    if (endpoint.kind === 'propertyGroupProperty') return this.#propertyGroupValue(document, endpoint.property.id, scope);
"""
if old2 not in text:
    raise SystemExit('Property Group endpoint scope anchor missing')
p.write_text(text.replace(old2, new2, 1))
print('M8-C2 typed Property Group runtime scope preserved internally')
