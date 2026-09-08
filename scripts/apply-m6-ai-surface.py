from pathlib import Path
ROOT=Path('.')
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,t): (ROOT/p).write_text(t,encoding='utf-8')
def repl(t,o,n,label):
    if o not in t: raise SystemExit(f'missing anchor: {label}')
    return t.replace(o,n,1)

# ---------------------------------------------------------------------------
# Semantic index: all artboards/components/instances are first-class entities;
# artboard ownership replaces implicit document ownership for scoped roots.
# ---------------------------------------------------------------------------
p='src/veyra/resolver.js'; t=read(p)
t=t.replace("  if (kind === 'listener') output.add('interaction-listener');", "  if (kind === 'artboard') output.add('project-artboard');\n  if (kind === 'component') output.add('component-source');\n  if (kind === 'componentInstance') output.add('component-instance');\n  if (kind === 'componentOverride') output.add('component-override');\n  if (kind === 'listener') output.add('interaction-listener');")
t=t.replace("  return { x: document.artboard.width / 2, y: document.artboard.height / 2 };", "  const artboard = document.artboards?.[0] || document.artboard;\n  return { x: artboard.x + artboard.width / 2, y: artboard.y + artboard.height / 2 };")
t=t.replace("const axis = owner?.geometry?.worldBounds?.center?.x ?? document.artboard.width / 2;", "const artboard = document.artboards?.[0] || document.artboard;\n    const axis = owner?.geometry?.worldBounds?.center?.x ?? (artboard.x + artboard.width / 2);")
old="""  const document = normalizeDocument(input);\n  const evaluated = evaluateDocument(document);"""
new="""  const document = normalizeDocument(input);\n  const evaluatedScenes = document.artboards.map((artboard) => evaluateDocument(document, {}, null, { artboardId: artboard.id }));\n  const evaluated = {\n    nodes: evaluatedScenes.flatMap((scene) => scene.nodes.filter((node) => !node.componentInstanceRef)),\n    bones: evaluatedScenes.flatMap((scene) => scene.bones || []),\n    meshes: evaluatedScenes.flatMap((scene) => scene.meshes || []),\n  };"""
t=repl(t,old,new,'resolver evaluate all artboards')
old="""  add(makeEntity(createReference('document', document.id), document, {\n    type: 'document', displayName: document.name,\n    geometry: { worldBounds: { minX: 0, minY: 0, maxX: document.artboard.width, maxY: document.artboard.height, width: document.artboard.width, height: document.artboard.height, center: { x: document.artboard.width / 2, y: document.artboard.height / 2 } } },\n  }));\n\n  const evaluatedNodes"""
new="""  const projectBounds = {\n    minX: Math.min(...document.artboards.map((item) => item.x)),\n    minY: Math.min(...document.artboards.map((item) => item.y)),\n    maxX: Math.max(...document.artboards.map((item) => item.x + item.width)),\n    maxY: Math.max(...document.artboards.map((item) => item.y + item.height)),\n  };\n  projectBounds.width = projectBounds.maxX - projectBounds.minX;\n  projectBounds.height = projectBounds.maxY - projectBounds.minY;\n  projectBounds.center = { x: (projectBounds.minX + projectBounds.maxX) / 2, y: (projectBounds.minY + projectBounds.maxY) / 2 };\n  add(makeEntity(createReference('document', document.id), document, {\n    type: 'document', displayName: document.name, geometry: { worldBounds: projectBounds },\n  }));\n  for (const artboard of document.artboards) add(makeEntity(createReference('artboard', artboard.id), artboard, {\n    type: 'artboard', displayName: artboard.name,\n    geometry: { worldBounds: { minX: artboard.x, minY: artboard.y, maxX: artboard.x + artboard.width, maxY: artboard.y + artboard.height, width: artboard.width, height: artboard.height, center: { x: artboard.x + artboard.width / 2, y: artboard.y + artboard.height / 2 } } },\n  }));\n  for (const component of document.components || []) add(makeEntity(createReference('component', component.id), component, { type: 'component', displayName: component.name }));\n  for (const instance of document.componentInstances || []) {\n    add(makeEntity(createReference('componentInstance', instance.id), instance, { type: 'componentInstance', displayName: instance.name }));\n    for (const override of instance.overrides || []) add(makeEntity(createReference('componentOverride', override.id), override, { type: 'componentOverride' }));\n  }\n\n  const evaluatedNodes"""
t=repl(t,old,new,'resolver project entities')
# Project relationships before nodes.
anchor="""  const documentRef = createReference('document', document.id);\n  for (const node of document.nodes) {"""
insert="""  const documentRef = createReference('document', document.id);\n  for (const artboard of document.artboards) link(byKey, createReference('artboard', artboard.id), 'owner', documentRef, 'owns');\n  for (const component of document.components || []) {\n    const componentRef = createReference('component', component.id);\n    link(byKey, componentRef, 'owner', documentRef, 'owns');\n    link(byKey, componentRef, 'source_artboard', component.source, 'component_source');\n  }\n  for (const instance of document.componentInstances || []) {\n    const instanceRef = createReference('componentInstance', instance.id);\n    link(byKey, instanceRef, 'owner', instance.artboard, 'owns');\n    link(byKey, instanceRef, 'instance_of', instance.component, 'instantiated_by');\n    if (instance.parent) link(byKey, instanceRef, 'parent', instance.parent, 'child_instance');\n    for (const override of instance.overrides || []) {\n      const overrideRef = createReference('componentOverride', override.id);\n      link(byKey, overrideRef, 'owner', instanceRef, 'override');\n      link(byKey, overrideRef, 'override_target', override.target, 'overridden_by_instance', { address: override.address });\n    }\n    for (const [relation, ref] of [\n      ['runtime_timeline', instance.runtime?.timeline], ['runtime_machine', instance.runtime?.stateMachine],\n      ['remap_timeline', instance.runtime?.remap?.timeline], ['remap_machine', instance.runtime?.remap?.stateMachine],\n    ]) if (ref) link(byKey, instanceRef, relation, ref, 'used_by_component_instance');\n  }\n  for (const node of document.nodes) {"""
t=repl(t,anchor,insert,'resolver project relationships')
# Scoped roots own artboard, not document.
t=t.replace("    else link(byKey, nodeRef, 'owner', documentRef, 'owns');", "    else link(byKey, nodeRef, 'owner', node.artboard, 'owns');")
t=t.replace("    else link(byKey, boneRef, 'owner', documentRef, 'owns');", "    else link(byKey, boneRef, 'owner', bone.artboard, 'owns');")
t=t.replace("    link(byKey, meshRef, 'owner', documentRef, 'owns');", "    link(byKey, meshRef, 'owner', mesh.artboard, 'owns');")
t=t.replace("for (const control of document.controls) link(byKey, createReference('control', control.id), 'owner', documentRef, 'owns');", "for (const control of document.controls) link(byKey, createReference('control', control.id), 'owner', control.artboard, 'owns');")
t=t.replace("    link(byKey, constraintRef, 'owner', documentRef, 'owns');", "    link(byKey, constraintRef, 'owner', constraint.artboard, 'owns');")
t=t.replace("    link(byKey, timelineRef, 'owner', documentRef, 'owns');", "    link(byKey, timelineRef, 'owner', timeline.artboard, 'owns');")
t=t.replace("    link(byKey, machineRef, 'owner', documentRef, 'owns');", "    link(byKey, machineRef, 'owner', machine.artboard, 'owns');")
t=t.replace("    link(byKey, listenerRef, 'owner', documentRef, 'owns');", "    link(byKey, listenerRef, 'owner', listener.artboard, 'owns');")
write(p,t)

# ---------------------------------------------------------------------------
# Dependency graph: represent component source/instance/override/runtime edges.
# ---------------------------------------------------------------------------
p='src/veyra/dependencyGraph.js'; t=read(p)
anchor="""      if (entity.kind === 'listener' && ['targets', 'uses_timeline', 'uses_machine', 'uses_input'].includes(relationship.relation)) {"""
insert="""      if (entity.kind === 'component' && relationship.relation === 'source_artboard') {\n        addPair('dependsOn', 'usedBy', from, to, detail, 'component');\n        continue;\n      }\n      if (entity.kind === 'componentInstance' && relationship.relation === 'instance_of') {\n        addPair('dependsOn', 'usedBy', from, to, detail, 'component');\n        continue;\n      }\n      if (entity.kind === 'componentInstance' && ['runtime_timeline','runtime_machine','remap_timeline','remap_machine'].includes(relationship.relation)) {\n        addPair('runtimeUses', 'usedBy', from, to, detail, 'component-runtime');\n        continue;\n      }\n      if (entity.kind === 'componentOverride' && relationship.relation === 'override_target') {\n        if (relationship.detail?.address) {\n          addAddressNode(relationship.detail.address);\n          addPair('writes', 'usedBy', from, { address: relationship.detail.address }, detail, 'component-override');\n        }\n        addPair('references', 'referencedBy', from, to, detail, 'component-override');\n        continue;\n      }\n      if (entity.kind === 'listener' && ['targets', 'uses_timeline', 'uses_machine', 'uses_input'].includes(relationship.relation)) {"""
t=repl(t,anchor,insert,'dependency component edges')
write(p,t)

# ---------------------------------------------------------------------------
# Manifest: project graph registries/capabilities + AI contract.
# ---------------------------------------------------------------------------
p='src/veyra/manifest.js'; t=read(p)
# imports
anchor="""import { VEYRA_BROWSER_MUTATION_COMPATIBILITY, VEYRA_SERVICE_DEFINITIONS, VEYRA_UI_MUTATION_PARITY_AUDIT } from './serviceRegistry.js';"""
t=repl(t,anchor,anchor+"\nimport { projectGraphCapabilities } from './projectGraph.js';",'manifest project import')
# capabilities
anchor="""  'interaction.evaluated-geometry-hit-test',\n]);"""
t=repl(t,anchor,"""  'interaction.evaluated-geometry-hit-test',\n  'project.multi-artboard',\n  'project.explicit-artboard-ownership',\n  'components.sources-instances',\n  'components.instance-overrides',\n  'components.independent-runtime',\n  'components.name-independent',\n]);""",'manifest M6 capabilities')
# document registries/counts
anchor="""      artboard: cloneValue(document.artboard),\n      conventions:"""
t=repl(t,anchor,"""      artboard: cloneValue(document.artboard),\n      artboards: document.artboards.map((artboard) => ({ ref: { kind: 'artboard', id: artboard.id }, ...cloneValue(artboard) })),\n      components: document.components.map((component) => ({ ref: { kind: 'component', id: component.id }, ...cloneValue(component), displayNameAdvisory: true })),\n      componentInstances: document.componentInstances.map((instance) => ({ ref: { kind: 'componentInstance', id: instance.id }, ...cloneValue(instance), displayNameAdvisory: true })),\n      conventions:""",'manifest project registries')
anchor="""        assets: document.assets.length,\n        nodes:"""
t=repl(t,anchor,"""        artboards: document.artboards.length,\n        components: document.components.length,\n        componentInstances: document.componentInstances.length,\n        assets: document.assets.length,\n        nodes:""",'manifest project counts')
# authoring contract projectGraph
anchor="""  return {\n    controlPlane: {"""
t=repl(t,anchor,"""  return {\n    projectGraph: {\n      ...projectGraphCapabilities(),\n      identity: 'artboard/component/componentInstance stable refs; human names are advisory only',\n      authoredVsEvaluated: 'source artboard and instance records are authored; expanded instance descendants are evaluated-only',\n      deletionPolicy: 'live dependents block unless the command explicitly requests cascade',\n    },\n    controlPlane: {""",'manifest authoring project graph')
write(p,t)

# ---------------------------------------------------------------------------
# Public module exports.
# ---------------------------------------------------------------------------
p='src/index.js'; t=read(p)
t += """\n// M6 project graph and Component primitives share the same authored model and runtime evaluation seams.\nexport {\n  VEYRA_PROJECT_VERSION, VEYRA_COMPONENT_FIT_MODES, VEYRA_COMPONENT_ALIGN_X, VEYRA_COMPONENT_ALIGN_Y, VEYRA_COMPONENT_MAX_DEPTH,\n  createArtboard, createComponent, createComponentInstance, artboardById, componentById, componentInstanceById,\n  entityArtboardId, duplicateArtboardIntoDocument, projectGraphCapabilities,\n} from './veyra/projectGraph.js';\nexport {\n  ComponentRuntimeRegistry, createComponentRuntimeRegistry, componentInstanceSourceMatrix, evaluateComponentInstances,\n} from './veyra/components.js';\n"""
write(p,t)

print('M6 AI/project graph surfaces applied')
