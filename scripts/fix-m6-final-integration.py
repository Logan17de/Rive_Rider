from pathlib import Path
p = Path('scripts/apply-m6-final-corrections.py')
t = p.read_text(encoding='utf-8')
old = "\nsplitter anchored reset')"
new = "\n'splitter anchored reset')"
if old not in t:
    raise SystemExit('missing broken splitter label anchor')
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('M6 integration script syntax repaired')
