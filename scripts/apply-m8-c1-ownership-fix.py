from pathlib import Path

p = Path('src/veyra/controlPlane.js')
text = p.read_text()
old = """  if (activeOwner.kind === 'data-binding') {
    const endpoint = activeOwner.source;
"""
new = """  if (activeOwner.kind === 'data-binding') {
    const endpoint = activeOwner.chain?.source || null;
"""
if old not in text:
    raise SystemExit('M8-C1 ownership endpoint anchor missing')
p.write_text(text.replace(old, new, 1))
print('M8-C1 ownership writable source now follows canonical binding owner chain')
