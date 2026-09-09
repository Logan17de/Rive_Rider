from pathlib import Path
p = Path('tests/veyra-m7-authoring.test.mjs')
t = p.read_text()
old = """  const document = normalizedSingle([rounded], { width: 200, height: 200 });
  const compiled = pathSegments(document.nodes[0].geometry);"""
new = """  rounded.paint.fill = { type: 'solid', color: '#abcdef' };
  const document = normalizedSingle([rounded], { width: 200, height: 200 });
  const compiled = pathSegments(document.nodes[0].geometry);"""
if old not in t:
    raise SystemExit('missing rounded hit-test fixture anchor')
p.write_text(t.replace(old, new, 1))
print('M7 rounded path hit-test fixture fixed')
