from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)

# Preview and canonical single-command dispatch must derive the same generated
# stable IDs for the same document + descriptor. Plan steps retain step salts
# to avoid collisions among multiple generated entities in one plan.
control = read('src/veyra/controlPlane.js')
control = replace_once(
    control,
    "prepareCommandDescriptor(store.document, descriptor, 'preview')",
    "prepareCommandDescriptor(store.document, descriptor, 'canonical')",
    'preview canonical id salt',
)
control = replace_once(
    control,
    "prepareCommandDescriptor(store.document, command, `dispatch:${store.revision}`)",
    "prepareCommandDescriptor(store.document, command, 'canonical')",
    'dispatch canonical id salt',
)
write('src/veyra/controlPlane.js', control)

# Preserve the M2 browser compatibility contract: query/resolve remain thin
# wrappers over the one canonical resolver implementation. The rest of the
# M3 service surface is routed through createVeyraControlPlane.
browser = read('veyra.js')
browser = replace_once(
    browser,
    "import { buildSemanticIndex } from './src/veyra/resolver.js';",
    "import { buildSemanticIndex, queryEntities, resolveSemantic } from './src/veyra/resolver.js';",
    'resolver compatibility import',
)
browser = replace_once(
    browser,
    """  queryEntities: (query = {}, options = {}) => controlPlane.queryEntities(query, options),
  resolveSemantic: (intent, options = {}) => controlPlane.resolveSemantic(intent, options),
""",
    """  queryEntities: (query = {}, options = {}) => queryEntities(store.document, query, options),
  resolveSemantic: (intent, options = {}) => resolveSemantic(store.document, intent, options),
""",
    'resolver compatibility adapters',
)
write('veyra.js', browser)

# M3 mechanically checks the new control-plane browser adapters, while the
# unchanged M2 suite already mechanically checks queryEntities/resolveSemantic.
tests = read('tests/veyra-control-plane.test.mjs')
tests = replace_once(
    tests,
    """for (const service of ['getManifest', 'queryEntities', 'resolveSemantic', 'read', 'previewCommand', 'dispatchCommand', 'dispatchPlan', 'validateDocument', 'verifyChange', 'getDependencyGraph', 'getOwnership']) {
  assert.match(browserSource, new RegExp(`${service}:.*controlPlane\\.${service}\\(`), `browser ${service} must be a thin canonical adapter`);
}
""",
    """for (const service of ['getManifest', 'read', 'previewCommand', 'dispatchCommand', 'dispatchPlan', 'validateDocument', 'verifyChange', 'getDependencyGraph', 'getOwnership']) {
  assert.match(browserSource, new RegExp(`${service}:.*controlPlane\\.${service}\\(`), `browser ${service} must be a thin canonical adapter`);
}
assert.match(browserSource, /queryEntities:\\s*\\(query = \\{\\}, options = \\{\\}\\) => queryEntities\\(store\\.document, query, options\\)/);
assert.match(browserSource, /resolveSemantic:\\s*\\(intent, options = \\{\\}\\) => resolveSemantic\\(store\\.document, intent, options\\)/);
""",
    'M3 browser adapter compatibility assertions',
)
write('tests/veyra-control-plane.test.mjs', tests)
