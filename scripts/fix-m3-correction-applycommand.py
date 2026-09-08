from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'veyra.js'
text = path.read_text(encoding='utf-8')
old = """  applyCommand: ({ label, address, value, source = 'script' }) => {
    const result = controlPlane.dispatchCommand({
      action: 'setProperty',
      args: { address, value },
      command: { label, source, propertyAddresses: [address] },
    });
    if (!result.ok) throw new TypeError(result.error);
    return controlPlane.read(address).authoredValue;
  },
"""
new = """  applyCommand: ({ label, address, value, source = 'script' }) => {
    dispatchCompatibilityCommand('setProperty', { address, value }, {
      label, source, propertyAddresses: [address],
    });
    return controlPlane.read(address).authoredValue;
  },
"""
if old not in text:
    raise RuntimeError('Could not find post-M3 applyCommand compatibility helper')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
