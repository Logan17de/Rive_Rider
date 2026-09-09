from pathlib import Path
p = Path('tests/veyra-m8-c2-warm-runtime.test.mjs')
text = p.read_text()
old = "store.execute({ label: 'Reorder stable data properties', source: 'test' }, (document) => {"
new = "store.execute({ label: 'Reorder stable data properties', source: 'user' }, (document) => {"
if old not in text:
    raise SystemExit('M8-C2 test provenance anchor missing')
p.write_text(text.replace(old, new, 1))
print('M8-C2 test provenance fixed')
