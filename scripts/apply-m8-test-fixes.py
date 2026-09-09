from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:200]!r}')
    p.write_text(text.replace(old, new, count))

patch('tests/veyra-m6-project-graph.test.mjs',
"assert.match(browser, /evaluateDocument\\(store\\.document, layers, null, \\{ artboardId: activeArtboard\\(\\)\\.id, componentRuntime: componentRuntimeRegistry \\}\\)/);",
"assert.match(browser, /evaluateDocument\\(store\\.document, layers, null, \\{[\\s\\S]*artboardId: activeArtboard\\(\\)\\.id,[\\s\\S]*componentRuntime: componentRuntimeRegistry,[\\s\\S]*dataRuntime,[\\s\\S]*\\}\\);/);")

patch('tests/veyra-manifest.test.mjs',
"  ['fire-machine-input', 'reset-machine', 'scrub-machine', 'set-machine-input', 'step-machine'],",
"  ['fire-data-trigger', 'fire-machine-input', 'reset-data-runtime', 'reset-machine', 'scrub-machine', 'set-data-runtime-value', 'set-machine-input', 'step-machine'],")
patch('tests/veyra-manifest.test.mjs',
"// generated exactly once, while the six explicit read/runtime affordances map\n// to no Store command.",
"// generated exactly once, while explicit read/runtime affordances map\n// to no Store command.")

patch('tests/veyra-model.test.mjs',
"  assert.throws(() => parseVeyra(JSON.stringify({ ...fixture, version: 6 })), /Unsupported Veyra version/);",
"  assert.throws(() => parseVeyra(JSON.stringify({ ...fixture, version: 7 })), /Unsupported Veyra version/);")
patch('tests/veyra-model.test.mjs',
"  console.log('✓ every accepted historical/project version loads and canonicalizes to v5');",
"  console.log('✓ every accepted historical/project/data version loads; data-free documents canonicalize to v5');")

patch('tests/veyra-m8-data-binding.test.mjs',
"  const result=queryEntities(store.document,{kinds:['dataProperty']},{limit:100}); assert.ok(result.results.some((item)=>item.ref.id==='p_num'));",
"  const result=queryEntities(store.document,{kinds:['dataProperty']},{maxResults:100}); assert.ok(result.entities.some((item)=>item.ref.id==='p_num'));")

print('M8 additive test fixes applied')
