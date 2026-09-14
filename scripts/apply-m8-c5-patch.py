from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one exact match, found {count}')
    path.write_text(text.replace(old, new, 1))

model = ROOT / 'src/veyra/model.js'
replace_once(
    model,
    "} from './contracts.js';\n",
    "} from './contracts.js';\nimport { finite, bounded, integer, color, gradientColor } from './propertyValueContract.js';\n",
)
model_text = model.read_text()
model_text, count = re.subn(
    r"\nfunction finite\(value, path\) \{.*?\nfunction normalizeGradientStops",
    "\nfunction normalizeGradientStops",
    model_text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'{model}: expected one scalar-normalizer block, found {count}')
model.write_text(model_text)

contract = ROOT / 'src/veyra/propertyValueContract.js'
replace_once(
    contract,
    "  if (parsed.reference.kind === 'node') return validateNode(object, parsed.segments, value, path);\n  if (parsed.reference.kind === 'bone') return validateBone(object, parsed.segments, value, path);\n  if (parsed.reference.kind === 'mesh') return validateMesh(object, parsed.segments, value, path);\n  if (parsed.reference.kind === 'control') return validateControl(object, parsed.segments, value, path);\n  if (parsed.reference.kind === 'constraint') return validateConstraint(object, parsed.segments, value, path);\n  throw new TypeError(`${label} has no ordinary property value contract.`);\n",
    "  if (parsed.reference.kind === 'node') validateNode(object, parsed.segments, value, path);\n  else if (parsed.reference.kind === 'bone') validateBone(object, parsed.segments, value, path);\n  else if (parsed.reference.kind === 'mesh') validateMesh(object, parsed.segments, value, path);\n  else if (parsed.reference.kind === 'control') validateControl(object, parsed.segments, value, path);\n  else if (parsed.reference.kind === 'constraint') validateConstraint(object, parsed.segments, value, path);\n  else throw new TypeError(`${label} has no ordinary property value contract.`);\n  // Validation must not rewrite the binding graph's published value. In\n  // particular, null is an intentional sentinel for empty list converters;\n  // canonical document normalization may interpret it as a property default.\n  return clone(value);\n",
)

data = ROOT / 'src/veyra/dataGraph.js'
replace_once(
    data,
    "import { parsePropertyAddress, formatPropertyAddress } from './propertyAddress.js';\n",
    "import { parsePropertyAddress, formatPropertyAddress } from './propertyAddress.js';\nimport { validateBindingPropertyValue } from './propertyValueContract.js';\n",
)
replace_once(
    data,
    "    if (resolution.endpoint.kind === 'property') return value;\n",
    "    if (resolution.endpoint.kind === 'property') return validateBindingPropertyValue(document, resolution.endpoint.address, value, `[binding-runtime-type] ${label}`);\n",
)

text = data.read_text()
pattern = re.compile(r'''  setTwoWayTarget\(bindingId, value, options = \{\}\) \{.*?\n  \}\n\n  setPropertyGroupValue''', re.S)
replacement = '''  setTwoWayTarget(bindingId, value, options = {}) {\n    const document = this.#document(), binding = bindingById(document, bindingId);\n    if (!binding || binding.mode !== 'twoWay' || !binding.enabled) throw new TypeError(`[binding-two-way-unavailable] ${bindingId} is not an enabled two-way binding.`);\n    const source = normalizeBindingEndpoint(binding.source), capabilities = bindingEndpointCapabilities(document, source);\n    if (!capabilities.reverseWritable) throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(source)} has no deterministic reverse-write port.`);\n    if (source.kind === 'data') {\n      // Resolve reverse writes from the same settled effective graph used by\n      // forward evaluation. The private fork sees current scoped runtime values,\n      // authored generation changes and derived View Model reference writers, but\n      // cannot consume live triggers, mutate live caches/counters, or notify.\n      const scopePath = createDataRuntimeScope(options.scopePath ?? options.runtimeScopePath ?? []).path;\n      const artboardId = String(binding.artboard?.id || options.artboardId || document.artboards?.[0]?.id || '');\n      const probe = this.fork();\n      probe.evaluateBindings(document, { artboardId, scopePath });\n      const bucket = probe.#buckets.get(runtimeBucketKey(scopeKey(scopePath), artboardId));\n      const resolved = bucket?.resolutions.get(binding.id)?.source;\n      if (!resolved || resolved.error || !resolved.endpoint) {\n        const detail = resolved?.error?.message ? `: ${resolved.error.message}` : '';\n        throw new TypeError(`[binding-two-way-source-unresolved] ${binding.id} has no current effective reverse-write terminal${detail}`);\n      }\n      const terminal = normalizeBindingEndpoint(resolved.endpoint);\n      const effectiveCapabilities = bindingEndpointCapabilities(document, terminal);\n      if (terminal.kind !== 'data' || !effectiveCapabilities.reverseWritable) {\n        throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(terminal)} has no deterministic reverse-write port.`);\n      }\n      return this.setValue(terminal.instance.id, terminal.path[0].id, value, { ...options, scopePath, source: options.source || 'two-way-binding', provenance: { ...(options.provenance || {}), binding: createReference('binding', binding.id) } });\n    }\n    if (source.kind === 'propertyGroupProperty') {\n      return this.setPropertyGroupValue(source.property.id, value, { ...options, source: options.source || 'two-way-binding',\n        provenance: { ...(options.provenance || {}), binding: createReference('binding', binding.id) } });\n    }\n    throw new TypeError(`[binding-two-way-source-unsupported] ${bindingEndpointKey(source)} has no deterministic reverse-write port.`);\n  }\n\n  setPropertyGroupValue'''
text2, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'{data}: expected one setTwoWayTarget block, found {count}')
data.write_text(text2)

# Measure live evaluator counters before the intentional forward evaluation.
test = ROOT / 'tests/veyra-m8-c5-effective-writes.test.mjs'
replace_once(
    test,
    "  assert.equal(f.r.getValue('child2', 'value'), .47);\n  assert.equal(advance(f).overrides['node:box/opacity'], .47);\n  assert.equal(beforeStats.evaluations, f.r.stats.evaluations, 'reverse resolution must use an observation snapshot, not advance the live evaluator');\n",
    "  assert.equal(f.r.getValue('child2', 'value'), .47);\n  assert.equal(beforeStats.evaluations, f.r.stats.evaluations, 'reverse resolution must use an observation snapshot, not advance the live evaluator');\n  assert.equal(advance(f).overrides['node:box/opacity'], .47);\n",
)

print('M8-C5 source patch applied')
