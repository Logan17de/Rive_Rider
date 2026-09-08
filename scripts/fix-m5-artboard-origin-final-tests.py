from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing replacement anchor: {label}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')

replace_once(
    'tests/veyra-gestures.test.mjs',
    "assert.deepEqual(store.document.artboard, { width: 112, height: 92 }, 'scaled resize deltas reach store data');",
    "assert.deepEqual(store.document.artboard, { width: 112, height: 92, x: 0, y: 0 }, 'scaled resize deltas reach store data with default origin');",
    'legacy gesture artboard expectation',
)

replace_once(
    'tests/veyra-m5-artboard-origin-final.test.mjs',
    "assert.match(browser, /startArtboard: \\{/);",
    "assert.match(browser, /const startArtboard = \\{/);",
    'browser startArtboard source guard',
)

print('M5 artboard-origin test compatibility fixes applied')
