from pathlib import Path
p=Path('src/veyra/model.js')
t=p.read_text()
old="""  createMeshVertexRef,\n  createNodeRef,\n  createTimelineRef,\n  normalizeReference,\n"""
new="""  createMeshVertexRef,\n  createNodeRef,\n  createTimelineRef,\n  createReference,\n  normalizeReference,\n"""
if t.count(old)!=1: raise SystemExit(f'expected one model reference import block, found {t.count(old)}')
p.write_text(t.replace(old,new,1))
print('M9 compatibility reference import added')
