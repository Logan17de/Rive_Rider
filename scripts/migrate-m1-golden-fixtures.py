from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / 'tests' / 'fixtures' / 'veyra'

def deterministic_id(key):
    value = 0x811c9dc5
    for ch in key:
        value ^= ord(ch)
        value = (value * 0x01000193) & 0xffffffff
    return f'semantic_legacy_{value:08x}'

for path in sorted(FIXTURE_DIR.glob('*.veyra')):
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = False
    for index, record in enumerate(data.get('semantics', [])):
        if record.get('id'):
            continue
        target = record.get('target') or {'kind': 'node', 'id': record.get('nodeId')}
        namespace = str(record.get('namespace', 'default')).strip() or 'default'
        key = f"{target['kind']}:{target['id']}\0{namespace}\0{index}"
        migrated = {
            'id': deterministic_id(key),
            'target': target,
            'namespace': namespace,
            'canonicalRole': str(record.get('canonicalRole', record.get('role', ''))).strip(),
            'description': str(record.get('description', '')),
            'tags': sorted(dict.fromkeys(str(tag).strip() for tag in record.get('tags', []) if str(tag).strip())),
            'aliases': [],
            'relations': [],
            'provenance': {'source': 'user'},
            'status': 'confirmed',
        }
        data['semantics'][index] = migrated
        changed = True
    if changed:
        path.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False), encoding='utf-8')
        print(f'migrated {path.relative_to(ROOT)}')
