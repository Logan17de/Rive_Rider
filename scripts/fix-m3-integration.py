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

# M3 mechanically checks the new M3-only browser adapters. The existing M2
# suite remains the canonical mechanical check for queryEntities/resolveSemantic.
tests = read('tests/veyra-control-plane.test.mjs')
tests = replace_once(
    tests,
    "['getManifest', 'queryEntities', 'resolveSemantic', 'read', 'previewCommand', 'dispatchCommand', 'dispatchPlan', 'validateDocument', 'verifyChange', 'getDependencyGraph', 'getOwnership']",
    "['getManifest', 'read', 'previewCommand', 'dispatchCommand', 'dispatchPlan', 'validateDocument', 'verifyChange', 'getDependencyGraph', 'getOwnership']",
    'M3 browser service compatibility list',
)
write('tests/veyra-control-plane.test.mjs', tests)
