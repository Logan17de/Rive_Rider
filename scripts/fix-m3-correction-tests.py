from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'tests/veyra-control-plane-corrections.test.mjs'
text = path.read_text(encoding='utf-8')

replacements = [
    (
        r"const mutatingStoreCall = /\\bstore\\.(?:execute|add|remove|update|set)[A-Za-z0-9_]*/;",
        r"const mutatingStoreCall = /\bstore\.(?:execute|add|remove|update|set)[A-Za-z0-9_]*/;",
        'direct Store mutation regex',
    ),
    (
        r"assert.match(browserSource, /queryEntities:\\s*\\(query = \\{\\}, options = \\{\\}\\) => controlPlane\\.queryEntities\\(query, options\\)/);",
        r"assert.match(browserSource, /queryEntities:\s*\(query = \{\}, options = \{\}\) => controlPlane\.queryEntities\(query, options\)/);",
        'queryEntities thin-adapter regex',
    ),
    (
        r"assert.match(browserSource, /resolveSemantic:\\s*\\(intent, options = \\{\\}\\) => controlPlane\\.resolveSemantic\\(intent, options\\)/);",
        r"assert.match(browserSource, /resolveSemantic:\s*\(intent, options = \{\}\) => controlPlane\.resolveSemantic\(intent, options\)/);",
        'resolveSemantic thin-adapter regex',
    ),
]

for old, new, label in replacements:
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    text = text.replace(old, new, 1)

old_parity = """const parityPlane = createVeyraControlPlane(new VeyraStore(fixture()));
assert.deepEqual(parityPlane.queryEntities({ kinds: ['node'] }), queryEntities(parityPlane.read({ kind: 'document', id: 'm3_correction_doc' }).status === 'ok' ? fixture() : fixture(), { kinds: ['node'] }));
assert.deepEqual(parityPlane.resolveSemantic({ ref: { kind: 'node', id: 'base_node' } }), resolveSemantic(fixture(), { ref: { kind: 'node', id: 'base_node' } }));
"""
new_parity = """const parityDocument = fixture();
const parityPlane = createVeyraControlPlane(new VeyraStore(parityDocument));
assert.deepEqual(
  parityPlane.queryEntities({ kinds: ['node'] }),
  queryEntities(parityDocument, { kinds: ['node'] }),
  'browser/control-plane query path must preserve canonical resolver behavior',
);
assert.deepEqual(
  parityPlane.resolveSemantic({ ref: { kind: 'node', id: 'base_node' } }),
  resolveSemantic(parityDocument, { ref: { kind: 'node', id: 'base_node' } }),
  'browser/control-plane resolve path must preserve canonical resolver behavior',
);
"""
if old_parity not in text:
    raise RuntimeError('Could not find resolver parity block')
text = text.replace(old_parity, new_parity, 1)

path.write_text(text, encoding='utf-8')
