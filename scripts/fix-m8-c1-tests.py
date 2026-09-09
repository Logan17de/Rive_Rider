from pathlib import Path

p = Path('tests/veyra-m8-c1-corrections.test.mjs')
text = p.read_text()
old = """    const cp = createVeyraControlPlane(store);
    const before = snapshot(store);
    const source = testCase.role === 'source' ? dataEndpoint('inst_main', testCase.id) : dataEndpoint('inst_main', 'num');
    const target = testCase.role === 'target' ? dataEndpoint('inst_main', testCase.id) : pgEndpoint('missing');
    if (testCase.role === 'source') {
      store.createPropertyGroup({ id: `pg_${testCase.id}`, artboard: ref('artboard', 'art_main'), properties: [{ id: `pgp_${testCase.id}`, type: 'number', value: 0 }] });
    }
    const actualTarget = testCase.role === 'source' ? pgEndpoint(`pgp_${testCase.id}`) : target;
"""
new = """    const cp = createVeyraControlPlane(store);
    const source = testCase.role === 'source' ? dataEndpoint('inst_main', testCase.id) : dataEndpoint('inst_main', 'num');
    const target = testCase.role === 'target' ? dataEndpoint('inst_main', testCase.id) : pgEndpoint('missing');
    if (testCase.role === 'source') {
      store.createPropertyGroup({ id: `pg_${testCase.id}`, artboard: ref('artboard', 'art_main'), properties: [{ id: `pgp_${testCase.id}`, type: 'number', value: 0 }] });
    }
    const actualTarget = testCase.role === 'source' ? pgEndpoint(`pgp_${testCase.id}`) : target;
    const before = snapshot(store);
"""
if old not in text:
    raise SystemExit('M8-C1 atomicity fixture anchor missing')
p.write_text(text.replace(old, new, 1))
print('M8-C1 atomicity fixture snapshot moved after legal setup')
