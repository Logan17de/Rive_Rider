from pathlib import Path

path = Path('scripts/apply-m6-core.py')
text = path.read_text(encoding='utf-8')
old = '''anchor="""} from './semantics.js';\\n\\nexport const VEYRA_FORMAT = 'veyra';"""\nt=repl(t, anchor, """} from './semantics.js';\\nimport {\\n  VEYRA_PROJECT_VERSION,\\n  normalizeProjectDocument,\\n  artboardById as projectArtboardById,\\n  componentById as projectComponentById,\\n  componentInstanceById as projectComponentInstanceById,\\n} from './projectGraph.js';\\n\\nexport { VEYRA_PROJECT_VERSION };\\n\\nexport const VEYRA_FORMAT = 'veyra';""", 'model project import')'''
new = '''anchor="export const VEYRA_FORMAT = 'veyra';"\nt=repl(t, anchor, """import {\n  VEYRA_PROJECT_VERSION,\n  normalizeProjectDocument,\n  artboardById as projectArtboardById,\n  componentById as projectComponentById,\n  componentInstanceById as projectComponentInstanceById,\n} from './projectGraph.js';\n\nexport { VEYRA_PROJECT_VERSION };\n\nexport const VEYRA_FORMAT = 'veyra';""", 'model project import')'''
if old not in text:
    raise SystemExit('stale M6 core model-import patch block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('M6 core anchor repaired')
