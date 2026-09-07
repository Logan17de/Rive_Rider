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

manifest = read('src/veyra/manifest.js')
manifest = replace_once(
    manifest,
    "import { createSceneSummary } from './summary.js';",
    "import { createSceneSummary } from './summary.js';\nimport { VEYRA_RESOLVER_CAPABILITIES, VEYRA_RESOLVER_SCORING } from './resolver.js';",
    'manifest resolver import',
)
manifest = replace_once(
    manifest,
    "  'semantics.typed-relations',\n",
    "  'semantics.typed-relations',\n  'semantics.indexed-query',\n  'semantics.deterministic-resolution',\n  'semantics.name-independent',\n",
    'resolver project capabilities',
)
manifest = replace_once(
    manifest,
    "  return {\n\n    semanticRecord: {",
    "  return {\n\n    semanticResolver: {\n      functions: [...VEYRA_RESOLVER_CAPABILITIES.functions],\n      outcomes: [...VEYRA_RESOLVER_CAPABILITIES.outcomes],\n      displayNamePolicy: VEYRA_RESOLVER_CAPABILITIES.displayNamePolicy,\n      deterministic: VEYRA_RESOLVER_CAPABILITIES.deterministic,\n      readOnly: VEYRA_RESOLVER_CAPABILITIES.readOnly,\n      evidenceRequired: VEYRA_RESOLVER_CAPABILITIES.evidenceRequired,\n      scoring: { ...VEYRA_RESOLVER_SCORING },\n      identity: 'stable typed refs + semantic/structural evidence; display names contribute zero unless explicitly requested',\n    },\n    semanticRecord: {",
    'manifest resolver contract',
)
write('src/veyra/manifest.js', manifest)

veyra = read('veyra.js')
veyra = replace_once(
    veyra,
    "import { createSceneSummary } from './src/veyra/summary.js';",
    "import { createSceneSummary } from './src/veyra/summary.js';\nimport { buildSemanticIndex, queryEntities, resolveSemantic } from './src/veyra/resolver.js';",
    'browser resolver import',
)
veyra = replace_once(
    veyra,
    "  getSceneSummary: (options = {}) => createSceneSummary(store.document, options),\n",
    "  getSceneSummary: (options = {}) => createSceneSummary(store.document, options),\n  getSemanticIndex: (options = {}) => buildSemanticIndex(store.document, options),\n  queryEntities: (query = {}, options = {}) => queryEntities(store.document, query, options),\n  resolveSemantic: (intent, options = {}) => resolveSemantic(store.document, intent, options),\n",
    'browser resolver adapters',
)
write('veyra.js', veyra)

index = read('src/index.js')
if "from './veyra/resolver.js'" not in index:
    index += "\nexport {\n  VEYRA_RESOLVER_CAPABILITIES,\n  VEYRA_RESOLVER_SCORING,\n  buildSemanticIndex,\n  queryEntities,\n  resolveSemantic,\n} from './veyra/resolver.js';\n"
write('src/index.js', index)
