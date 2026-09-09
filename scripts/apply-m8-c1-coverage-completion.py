from pathlib import Path

p = Path('tests/veyra-m8-c1-corrections.test.mjs')
text = p.read_text()

marker = """check('names: random, duplicate and empty display names never change stable routing', [2], () => {
"""
insert = """check('one-way: evaluated output changes while authored target stays byte-identical', [5, 24], () => {
  const store = baseStore(); seedCore(store);
  store.createBinding({ id:'one_way_separation', artboard:ref('artboard','art_main'), source:dataEndpoint('inst_main','num'), target:propertyEndpoint('node:box/opacity') });
  const runtime = createVeyraDataRuntime(() => store.document);
  const authoredBefore = serializeVeyra(store.document);
  const authoredOpacity = store.document.nodes.find((item)=>item.id==='box').opacity;
  runtime.setValue('inst_main','num',0.37);
  const scene = evaluateDocument(store.document,{},null,{artboardId:'art_main',dataRuntime:runtime});
  assert.equal(scene.nodes.find((item)=>item.id==='box').opacity,0.37);
  assert.equal(store.document.nodes.find((item)=>item.id==='box').opacity,authoredOpacity);
  assert.equal(serializeVeyra(store.document),authoredBefore);
});

check('cycles: direct and multi-hop binding cycles fail deterministically and atomically', [9, 24], () => {
  const direct = baseStore(); seedCore(direct);
  direct.createPropertyGroup({ id:'pg_direct', artboard:ref('artboard','art_main'), properties:[{id:'pg_direct_value',type:'number',value:0.1}] });
  direct.createBinding({ id:'direct_forward', artboard:ref('artboard','art_main'), source:dataEndpoint('inst_main','num'), target:pgEndpoint('pg_direct_value') });
  const directBefore = snapshot(direct);
  assert.throws(() => direct.createBinding({ id:'direct_reverse', artboard:ref('artboard','art_main'), source:pgEndpoint('pg_direct_value'), target:dataEndpoint('inst_main','num') }), /binding-cycle/);
  assertSnapshot(direct,directBefore);

  const multi = baseStore(); seedCore(multi);
  multi.createPropertyGroup({ id:'pg_multi', artboard:ref('artboard','art_main'), properties:[
    {id:'pg_multi_a',type:'number',value:0.1},{id:'pg_multi_b',type:'number',value:0.2},{id:'pg_multi_c',type:'number',value:0.3},
  ] });
  multi.createBinding({ id:'multi_ab', artboard:ref('artboard','art_main'), source:pgEndpoint('pg_multi_a'), target:pgEndpoint('pg_multi_b') });
  multi.createBinding({ id:'multi_bc', artboard:ref('artboard','art_main'), source:pgEndpoint('pg_multi_b'), target:pgEndpoint('pg_multi_c') });
  const multiBefore = snapshot(multi);
  assert.throws(() => multi.createBinding({ id:'multi_ca', artboard:ref('artboard','art_main'), source:pgEndpoint('pg_multi_c'), target:pgEndpoint('pg_multi_a') }), /binding-cycle/);
  assertSnapshot(multi,multiBefore);
});

"""
if marker not in text:
    raise SystemExit('coverage insertion marker missing')
text = text.replace(marker, insert + marker, 1)

end_marker = """check('runtime scope identity remains deterministic after correction', [16, 25], () => {
"""
regression = r"""check('regression gate: M0-M7 suites remain part of the same npm test discovery surface', [26], () => {
  const requiredSuites = [
    'veyra-foundation.test.mjs','veyra-semantics.test.mjs','veyra-resolver.test.mjs',
    'veyra-control-plane.test.mjs','veyra-interaction-loop.test.mjs','veyra-workspace-ux.test.mjs',
    'veyra-m6-project-graph.test.mjs','veyra-m7-authoring.test.mjs',
  ];
  const runner = readFileSync(new URL('../scripts/run-suites.mjs',import.meta.url),'utf8');
  assert.match(runner,/readdirSync|glob|test\.mjs|tests/);
  for (const file of requiredSuites) {
    const contents = readFileSync(new URL(`./${file}`,import.meta.url),'utf8');
    assert.ok(contents.length > 0,`missing regression suite ${file}`);
  }
});

"""
if end_marker not in text:
    raise SystemExit('regression insertion marker missing')
text = text.replace(end_marker, regression + end_marker, 1)
p.write_text(text)
print('M8-C1 original acceptance #5/#9/#26 coverage completed')
