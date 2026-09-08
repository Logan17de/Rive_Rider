from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Could not find patch target in {path}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')

patch(
    'tests/veyra-interaction-loop.test.mjs',
    "manifest.authoring.schema.listener.variants.machine.hostAvailability",
    "manifest.authoring.listener.variants.machine.hostAvailability",
)
