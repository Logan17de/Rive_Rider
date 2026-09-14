from pathlib import Path
p=Path('src/veyra/references.js')
t=p.read_text()
old="  'machineCondition',\n"
new="  'machineCondition',\n  'machineBlendChild',\n"
if t.count(old)!=1: raise SystemExit('machineCondition kind marker missing')
t=t.replace(old,new,1)
old="export function createMachineConditionRef(id) { return createReference('machineCondition', id); }\n"
new=old+"export function createMachineBlendChildRef(id) { return createReference('machineBlendChild', id); }\n"
if t.count(old)!=1: raise SystemExit('machineCondition helper marker missing')
p.write_text(t.replace(old,new,1))
print('M9 blend-child reference identity patch applied')
