from pathlib import Path
p = Path('tests/veyra-manifest.test.mjs')
text = p.read_text()
old = "const nonCommandActions = actions.filter((item) => item.transport !== 'command');\nassert.equal(nonCommandActions.length, 6);\nassert.deepEqual(\n  nonCommandActions.map((item) => item.ref.id).sort(),\n  ['fire-machine-input', 'read-property', 'reset-machine', 'scrub-machine', 'set-machine-input', 'step-machine'],\n);"
new = "const nonCommandActions = actions.filter((item) => item.transport !== 'command');\nassert.equal(nonCommandActions.length, 9);\nassert.deepEqual(\n  nonCommandActions.map((item) => item.ref.id).sort(),\n  ['fire-data-trigger', 'fire-machine-input', 'read-property', 'reset-data-runtime', 'reset-machine', 'scrub-machine', 'set-data-runtime-value', 'set-machine-input', 'step-machine'],\n);"
if old not in text:
    raise SystemExit('missing final manifest additive gate')
p.write_text(text.replace(old, new, 1))
print('M8 final manifest additive gate fixed')
