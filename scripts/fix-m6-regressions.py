from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def repl(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, count)

# ---------------------------------------------------------------------------
# Product fixes discovered by the first full M6 integration gate.
# ---------------------------------------------------------------------------

# 1. Command metadata (human labels/source) must not affect implicit stable IDs.
p = 'src/veyra/controlPlane.js'
t = read(p)
old = """  const seed = stableString({ documentId: document.id, generation: stableIdGeneration(document), descriptor: next, salt });"""
new = """  // Human-facing command metadata is provenance/display context, not executable identity.\n  // Preview and dispatch on the same stable snapshot therefore derive the same implicit IDs\n  // even when their labels differ.\n  const identityDescriptor = cloneValue(next);\n  delete identityDescriptor.command;\n  const seed = stableString({ documentId: document.id, generation: stableIdGeneration(document), descriptor: identityDescriptor, salt });"""
t = repl(t, old, new, 'control-plane identity seed')
write(p, t)

# 2. Legacy opaque animation addresses remain legal. M6 only applies cross-artboard
# ownership checks when an address identifies a typed persistent target.
p = 'src/veyra/projectGraph.js'
t = read(p)
old = """      if (!match) throw new TypeError(`Timeline ${timeline.id} has invalid property address ${track.address}.`);\n      validateSameOwner(document, timeline.artboard.id, [{ kind: match[1], id: match[2] }], `Timeline ${timeline.id}`);"""
new = """      if (!match) continue; // Preserve the verified pre-M6 opaque-address animation contract.\n      validateSameOwner(document, timeline.artboard.id, [{ kind: match[1], id: match[2] }], `Timeline ${timeline.id}`);"""
t = repl(t, old, new, 'legacy opaque timeline address')

# Normalized entities from old single-artboard documents can be composed by verified
# M0-M5 APIs. Their deterministic legacy owner is remapped only when there is exactly
# one unambiguous destination artboard. Arbitrary/multi-artboard dangling refs still fail.
old = """    if (!owner) throw new TypeError(`${label}[${index}].artboard is required when a project has multiple artboards.`);\n    if (!artboardIds.has(owner.id)) throw new TypeError(`${label}[${index}].artboard references missing artboard ${owner.id}.`);\n    return { ...item, artboard: owner };"""
new = """    if (!owner) throw new TypeError(`${label}[${index}].artboard is required when a project has multiple artboards.`);\n    const resolvedOwner = !artboardIds.has(owner.id)\n      && fallback\n      && String(owner.id).startsWith('artboard_legacy_')\n      ? fallback\n      : owner;\n    if (!artboardIds.has(resolvedOwner.id)) throw new TypeError(`${label}[${index}].artboard references missing artboard ${resolvedOwner.id}.`);\n    return { ...item, artboard: resolvedOwner };"""
t = repl(t, old, new, 'legacy owner remap')
write(p, t)

# ---------------------------------------------------------------------------
# Compatibility tests: M6 intentionally migrates the canonical project format to v5.
# Keep the old fixtures as migration inputs and strengthen them around deterministic
# first-write migration instead of pretending v3/v4 output can remain byte-identical.
# ---------------------------------------------------------------------------

p = 'tests/veyra-foundation.test.mjs'
t = read(p)
t = repl(t, "assert.equal(migrated.version, 3);", "assert.equal(migrated.version, 5);", 'foundation migrated version')
write(p, t)

p = 'tests/veyra-model.test.mjs'
t = read(p)
t = repl(t, "assert.equal(starter.version, 3);", "assert.equal(starter.version, 5);", 'model starter project version')
write(p, t)

p = 'tests/veyra-manifest.test.mjs'
t = read(p)
t = repl(t, "assert.equal(manifest.document.version, 3);", "assert.equal(manifest.document.version, 5);", 'manifest document version')
old = """assert.deepEqual(manifest.document.counts, {\n  assets: 3,\n  nodes: 1,"""
new = """assert.deepEqual(manifest.document.counts, {\n  artboards: 1,\n  components: 0,\n  componentInstances: 0,\n  assets: 3,\n  nodes: 1,"""
t = repl(t, old, new, 'manifest project counts')
write(p, t)

p = 'tests/veyra-listeners.test.mjs'
t = read(p)
t = repl(t, "assert.equal(normalized.version, 4, 'listener feature projects to v4');", "assert.equal(normalized.version, 5, 'M6 project graph supersedes the legacy listener-v4 emitted format');", 'listener v5 positive')
t = repl(t, "// Plain documents remain v3 and normalize with an additive empty registry.", "// Plain legacy documents now migrate to the canonical v5 project graph with an additive empty listener registry.", 'listener plain comment')
t = repl(t, "assert.equal(plain.version, 3);", "assert.equal(plain.version, 5);", 'listener plain v5')
t = repl(t, "assert.equal(oldAccepts(plain), true);", "assert.equal(oldAccepts(plain), false, 'pre-project readers reject canonical v5 output');", 'listener old reader plain')
t = repl(t, "console.log('✓ listener-free documents remain v3-compatible and emitted versions are readable');", "console.log('✓ listener-free legacy documents migrate to v5 while historical versions remain readable');", 'listener plain log')
t = repl(t, "assert.equal(oldAccepts(listenerDoc), false, 'old reader rejects v4 before normalization');", "assert.equal(oldAccepts(listenerDoc), false, 'old reader rejects canonical v5 before normalization');", 'listener cross version old reader')
t = repl(t, "assert.equal(current.listeners.length, 1, 'current reader preserves listener-bearing v4');", "assert.equal(current.listeners.length, 1, 'current reader preserves listener-bearing v5');", 'listener cross version current')
t = repl(t, "assert.equal(downgraded.version, 3, 'intentional removal projects back to v3');", "assert.equal(downgraded.version, 5, 'listener removal keeps the canonical v5 project graph');", 'listener no downgrade')
t = repl(t, "console.log('✓ v4 rejection boundary and deterministic downgrade');", "console.log('✓ legacy reader rejection boundary and deterministic v5 serialization');", 'listener cross version log')
write(p, t)

# M5 frame semantics stay exact; v5 adds stable artboard identity/display metadata.
p = 'tests/veyra-m5-artboard-origin-final.test.mjs'
t = read(p)
anchor = """function close(actual, expected, epsilon = 1e-9, message = '') {\n  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);\n}\n"""
insert = anchor + """\nfunction authoredFrame(artboard) {\n  return { x: artboard.x, y: artboard.y, width: artboard.width, height: artboard.height, background: artboard.background };\n}\n"""
t = repl(t, anchor, insert, 'M5 frame projection helper')
t = repl(t, "assert.deepEqual(store.document.artboard, { ...baseFrame, x: 40, width: 760 });", "assert.deepEqual(authoredFrame(store.document.artboard), { ...baseFrame, x: 40, width: 760 });", 'M5 left frame')
t = repl(t, "assert.deepEqual(store.document.artboard, { ...baseFrame, y: 30, height: 570 });", "assert.deepEqual(authoredFrame(store.document.artboard), { ...baseFrame, y: 30, height: 570 });", 'M5 top frame')
t = repl(t, "const { background, ...frame } = store.document.artboard;", "const { background, ...frame } = authoredFrame(store.document.artboard);", 'M5 composed frame')
write(p, t)

# Old golden .veyra files intentionally remain v3 migration fixtures. Their v5 SVG
# hashes change only because exported metadata truthfully reports formatVersion=5.
p = 'tests/veyra-golden.test.mjs'
t = read(p)
replacements = {
    "animated: 'e73a39cc65aa41f7b35369cf21008de7485172cddde2619b1b0ac1325d9a5712'": "animated: 'aa989c4bf157db1ae2b11e36d01d4601bc84e8e329f402a1b478ccc37e08b670'",
    "rectangle: 'f5ffcd82208ae60e67459ff6d29b4ef098c418e6341ab2e6480331085e379810'": "rectangle: '8819fbbbd1712fb3c6063589c33368926675018cfd95cc7a9336d7d22ba86ace'",
    "'bezier-face': '5ce88bf9652213542f7a6c11bcca7d7994f03571e5a2625bccac1205b19497a0'": "'bezier-face': 'e514408bcbce113b1db5f93f9f89c2d9b2fc1892ee362dcba68e533852f40db1'",
    "gradients: '1d6a0d34fc95fbb4ba52a484d73a5db26a28acd75cd8fce2e9b74d4fca9f3c43'": "gradients: '59ef23a11dfeffa08be8970113bfcc958d2d51e3cfdb09515975e13d7408492f'",
    "'ik-arm': '9447c8d798df4512515a79819ecec5742f05bf43b88acd28fe43cd252d15b943'": "'ik-arm': 'a036c47d8b51da8f6699d04f1185721ad39970897e7b2a1e47333cf8ae4aeef2'",
}
for old, new in replacements.items():
    t = repl(t, old, new, f'golden hash {old[:18]}')
old = """  check(`${name} remains canonical JSON`, () => {\n    assert.equal(serializeVeyra(document), raw.trimEnd(), `${name} must remain canonical JSON.`);\n  });"""
new = """  check(`${name} migrates to stable canonical v5 JSON`, () => {\n    const once = serializeVeyra(document);\n    const twice = serializeVeyra(parseVeyra(once));\n    assert.equal(document.version, 5, `${name} must migrate to v5.`);\n    assert.ok(Number(JSON.parse(raw).version) < 5, `${name} remains a legacy migration fixture.`);\n    assert.equal(once, twice, `${name} migration must stabilize after the first canonical write.`);\n  });"""
t = repl(t, old, new, 'golden deterministic migration')
t = repl(t, "'0710dbfbb72c460b0a1dab14501869bbaa6e7c662728e5fd9299effb4460d8fe'", "'dca81ba512028470b426ffb7022c190f05b1f3b2b65e4593cfe9edc2c469afca'", 'golden animated frame hash')
write(p, t)

print('M6 regression fixes applied')
