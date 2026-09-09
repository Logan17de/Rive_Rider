from pathlib import Path
import re

p = Path('src/veyra/capabilities.js')
text = p.read_text()
pattern = r"const COMMON_WRITABLE = Object\.freeze\(\[.*?export function supportsRigProperty\(kind, object, path, mode = 'writable'\) \{\n  return rigCapabilities\(kind, object\)\[mode\]\.includes\(pathPattern\(path\)\);\n\}\n\n"
replacement = "export { nodeCapabilities, supportsNodeProperty, rigCapabilities, supportsRigProperty } from './propertyCapabilities.js';\n\n"
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'capability extraction anchor count {count}')
p.write_text(text)
print('M8-C1 capability module cycle removed')
