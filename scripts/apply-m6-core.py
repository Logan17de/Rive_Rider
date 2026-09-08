from pathlib import Path

ROOT = Path('.')

def read(path): return (ROOT / path).read_text(encoding='utf-8')
def write(path, text): (ROOT / path).write_text(text, encoding='utf-8')
def repl(text, old, new, label):
    if old not in text: raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# projectGraph: break model cycle, tighten scope validation, duplicate all
# persistent nested ids deterministically.
# ---------------------------------------------------------------------------
p='src/veyra/projectGraph.js'; t=read(p)
t=t.replace("import { cloneValue } from './model.js';\n", '')
anchor="""} from './references.js';\n\nexport const VEYRA_PROJECT_VERSION = 5;"""
t=repl(t, anchor, """} from './references.js';\n\nfunction cloneValue(value) {\n  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));\n}\n\nexport const VEYRA_PROJECT_VERSION = 5;""", 'project clone helper')
# Track/property scope is part of artboard ownership.
anchor="""  for (const machine of document.stateMachines) {\n    validateSameOwner(document, machine.artboard.id, machine.states.map((state) => state.timeline), `State machine ${machine.id}`);\n  }"""
t=repl(t, anchor, """  for (const timeline of document.timelines) {\n    for (const track of timeline.tracks) {\n      const match = /^([^:]+):([^/]+)\\//.exec(track.address);\n      if (!match) throw new TypeError(`Timeline ${timeline.id} has invalid property address ${track.address}.`);\n      validateSameOwner(document, timeline.artboard.id, [{ kind: match[1], id: match[2] }], `Timeline ${timeline.id}`);\n    }\n  }\n  for (const machine of document.stateMachines) {\n    validateSameOwner(document, machine.artboard.id, machine.states.map((state) => state.timeline), `State machine ${machine.id}`);\n  }""", 'track owner validation')
# Fix duplicate nested ids.
old="""  const duplicateCollection = (kind, key) => {\n    const copies = [];\n    for (const item of document[key].filter((entry) => entry.artboard?.id === sourceArtboardId)) {\n      const copy = deepRemap(cloneValue(item), idMap);\n      copy.id = idMap.get(`${kind}:${item.id}`);\n      copy.artboard = createArtboardRef(targetId);\n      copies.push(copy);\n    }\n    document[key].push(...copies);\n  };"""
new="""  const rewriteNestedIds = (kind, source, copy) => {\n    const mapped = (childKind, id) => idMap.get(`${childKind}:${id}`) || id;\n    const rewriteStops = (sourcePaint, copyPaint) => {\n      for (let index = 0; index < (sourcePaint?.fill?.stops || []).length; index += 1) {\n        copyPaint.fill.stops[index].id = mapped('gradientStop', sourcePaint.fill.stops[index].id);\n      }\n    };\n    if (kind === 'node') {\n      if (source.type === 'path') source.geometry.vertices.forEach((vertex, index) => { copy.geometry.vertices[index].id = mapped('pathVertex', vertex.id); });\n      rewriteStops(source.paint, copy.paint);\n    } else if (kind === 'mesh') {\n      source.vertices.forEach((vertex, index) => { copy.vertices[index].id = mapped('meshVertex', vertex.id); });\n      rewriteStops(source.paint, copy.paint);\n    } else if (kind === 'timeline') {\n      source.tracks.forEach((track, trackIndex) => {\n        copy.tracks[trackIndex].id = mapped('track', track.id);\n        track.keyframes.forEach((keyframe, keyframeIndex) => { copy.tracks[trackIndex].keyframes[keyframeIndex].id = mapped('keyframe', keyframe.id); });\n      });\n    } else if (kind === 'stateMachine') {\n      source.inputs.forEach((item, index) => { copy.inputs[index].id = mapped('machineInput', item.id); });\n      source.states.forEach((item, index) => { copy.states[index].id = mapped('machineState', item.id); });\n      source.transitions.forEach((item, index) => {\n        copy.transitions[index].id = mapped('machineTransition', item.id);\n        item.conditions.forEach((condition, conditionIndex) => { copy.transitions[index].conditions[conditionIndex].id = mapped('machineCondition', condition.id); });\n      });\n    } else if (kind === 'componentInstance') {\n      source.overrides.forEach((item, index) => { copy.overrides[index].id = mapped('componentOverride', item.id); });\n    }\n  };\n\n  const duplicateCollection = (kind, key) => {\n    const copies = [];\n    for (const item of document[key].filter((entry) => entry.artboard?.id === sourceArtboardId)) {\n      const copy = deepRemap(cloneValue(item), idMap);\n      copy.id = idMap.get(`${kind}:${item.id}`);\n      copy.artboard = createArtboardRef(targetId);\n      rewriteNestedIds(kind, item, copy);\n      copies.push(copy);\n    }\n    document[key].push(...copies);\n  };"""
t=repl(t, old, new, 'duplicate nested ids')
# M6 defines clip capability explicitly as unsupported rather than silently wrong.
t=t.replace("    clip: Boolean(overrides.clip),", "    clip: (() => { if (overrides.clip) throw new TypeError('componentInstance.clip=true is not supported in M6; use clip=false.'); return false; })(),")
t=t.replace("    clipping: 'instance-frame-flag',", "    clipping: 'none-only',")
write(p,t)

# ---------------------------------------------------------------------------
# Model: v5 support, canonical M6 normalization, stable-id registration/lookup.
# ---------------------------------------------------------------------------
p='src/veyra/model.js'; t=read(p)
anchor="""} from './semantics.js';\n\nexport const VEYRA_FORMAT = 'veyra';"""
t=repl(t, anchor, """} from './semantics.js';\nimport {\n  VEYRA_PROJECT_VERSION,\n  normalizeProjectDocument,\n  artboardById as projectArtboardById,\n  componentById as projectComponentById,\n  componentInstanceById as projectComponentInstanceById,\n} from './projectGraph.js';\n\nexport { VEYRA_PROJECT_VERSION };\n\nexport const VEYRA_FORMAT = 'veyra';""", 'model project import')
t=t.replace("export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4]);", "export const VEYRA_SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4, 5]);")
anchor="""    artboard: {\n      x: 0,\n      y: 0,\n      width: 960,\n      height: 640,\n      background: '#fff7fc',\n      ...(overrides.artboard || {}),\n    },\n    assets:"""
t=repl(t, anchor, """    artboard: {\n      x: 0,\n      y: 0,\n      width: 960,\n      height: 640,\n      background: '#fff7fc',\n      ...(overrides.artboard || {}),\n    },\n    ...(overrides.artboards ? { artboards: cloneValue(overrides.artboards) } : {}),\n    components: cloneValue(overrides.components || []),\n    componentInstances: cloneValue(overrides.componentInstances || []),\n    assets:""", 'createDocument project registries')
anchor="""  register('document', document.id, 'document');\n  document.nodes.forEach"""
t=repl(t, anchor, """  register('document', document.id, 'document');\n  document.artboards.forEach((artboard, index) => register('artboard', artboard.id, `artboards[${index}]`));\n  document.components.forEach((component, index) => register('component', component.id, `components[${index}]`));\n  document.componentInstances.forEach((instance, index) => {\n    register('componentInstance', instance.id, `componentInstances[${index}]`);\n    instance.overrides.forEach((override, overrideIndex) => register('componentOverride', override.id, `componentInstances[${index}].overrides[${overrideIndex}]`));\n  });\n  document.nodes.forEach""", 'stable project ids')
old="""  validateStableIdentities(document);\n  validateSemanticRecords(document);\n  return document;\n}"""
new="""  const projectDocument = normalizeProjectDocument(input, document);\n  validateStableIdentities(projectDocument);\n  validateSemanticRecords(projectDocument);\n  return projectDocument;\n}"""
t=repl(t, old, new, 'normalize project return')
anchor="""export function nodeById(document, nodeId) {\n  return document.nodes.find((node) => node.id === nodeId) || null;\n}"""
t=repl(t, anchor, """export function artboardById(document, artboardId) { return projectArtboardById(document, artboardId); }\nexport function componentById(document, componentId) { return projectComponentById(document, componentId); }\nexport function componentInstanceById(document, instanceId) { return projectComponentInstanceById(document, instanceId); }\n\nexport function nodeById(document, nodeId) {\n  return document.nodes.find((node) => node.id === nodeId) || null;\n}""", 'project lookup exports')
write(p,t)

# ---------------------------------------------------------------------------
# Semantics: M6 entity kinds become real universal semantic targets.
# ---------------------------------------------------------------------------
p='src/veyra/semantics.js'; t=read(p)
anchor="""  switch (ref.kind) {\n    case 'document': return document.id === ref.id ? document : null;\n    case 'node':"""
t=repl(t, anchor, """  switch (ref.kind) {\n    case 'document': return document.id === ref.id ? document : null;\n    case 'artboard': return find(document.artboards);\n    case 'component': return find(document.components);\n    case 'componentInstance': return find(document.componentInstances);\n    case 'componentOverride':\n      for (const instance of document.componentInstances || []) {\n        const override = find(instance.overrides);\n        if (override) return override;\n      }\n      return null;\n    case 'node':""", 'semantic M6 lookup')
write(p,t)

# ---------------------------------------------------------------------------
# IO: v5 serializes canonical artboards registry; compatibility alias never
# persists. Legacy files migrate on first parse and are then stable.
# ---------------------------------------------------------------------------
p='src/veyra/io.js'; t=read(p)
old="""export function canonicalVeyraValue(documentModel) {\n  const normalized = normalizeDocument(documentModel);\n  const canonical = canonicalize(normalized);\n  // x/y=0 are the legacy implicit defaults. Omitting only those default values\n  // keeps old canonical files byte-stable; any moved frame persists explicitly.\n  if (canonical.artboard?.x === 0) delete canonical.artboard.x;\n  if (canonical.artboard?.y === 0) delete canonical.artboard.y;\n  return canonical;\n}"""
new="""export function canonicalVeyraValue(documentModel) {\n  const normalized = normalizeDocument(documentModel);\n  const canonical = canonicalize(normalized);\n  // `artboard` is a runtime compatibility alias for M0-M5 code. v5 persistence\n  // has exactly one source of truth: the stable `artboards[]` registry.\n  delete canonical.artboard;\n  return canonical;\n}"""
t=repl(t, old, new, 'canonical project serialization')
write(p,t)

# ---------------------------------------------------------------------------
# Evaluation: evaluate a specific artboard and expand component instances only
# in evaluated output. Source authored data remains untouched.
# ---------------------------------------------------------------------------
p='src/veyra/evaluation.js'; t=read(p)
t=t.replace("import { evaluateRig } from './rigging.js';", "import { evaluateRig } from './rigging.js';\nimport { artboardById } from './projectGraph.js';\nimport { evaluateComponentInstances } from './components.js';")
t=t.replace("export function evaluateDocument(authoredDocument, layers = {}, animationPlayback = null) {", "export function evaluateDocument(authoredDocument, layers = {}, animationPlayback = null, options = {}) {")
old="""  return {\n    kind: 'veyra-evaluated-scene',\n    documentId: evaluatedDocument.id,\n    name: evaluatedDocument.name,\n    version: evaluatedDocument.version,\n    conventions: cloneValue(evaluatedDocument.conventions),\n    artboard: cloneValue(evaluatedDocument.artboard),\n    assets: cloneValue(evaluatedDocument.assets),\n    semantics: cloneValue(evaluatedDocument.semantics),\n    nodes: nodeResult.nodes,\n    bones: cloneValue(rig.bones),\n    meshes: cloneValue(rig.meshes),\n    controls: cloneValue(rig.controls),\n    constraints: cloneValue(rig.constraints),\n    diagnostics: cloneValue({\n      ...rig.diagnostics,\n      collisions: [\n        ...(rig.diagnostics?.collisions || []),\n        ...diagnostics.collisions,\n      ],\n    }),\n    evaluationOrder: [...VEYRA_EVALUATION_ORDER],\n    sources,\n  };"""
new="""  const artboardId = String(options.artboardId || evaluatedDocument.artboards[0]?.id || '');\n  const activeArtboard = artboardById(evaluatedDocument, artboardId);\n  if (!activeArtboard) throw new TypeError(`Evaluation artboard ${artboardId} does not exist.`);\n  const owned = (item) => item.artboard?.id === artboardId;\n  const baseNodes = nodeResult.nodes.filter(owned);\n  const baseScene = {\n    kind: 'veyra-evaluated-scene',\n    documentId: evaluatedDocument.id,\n    name: evaluatedDocument.name,\n    version: evaluatedDocument.version,\n    conventions: cloneValue(evaluatedDocument.conventions),\n    artboard: cloneValue(activeArtboard),\n    artboards: cloneValue(evaluatedDocument.artboards),\n    components: cloneValue(evaluatedDocument.components),\n    componentInstances: cloneValue(evaluatedDocument.componentInstances.filter(owned)),\n    assets: cloneValue(evaluatedDocument.assets),\n    semantics: cloneValue(evaluatedDocument.semantics),\n    nodes: baseNodes,\n    bones: cloneValue(rig.bones.filter(owned)),\n    meshes: cloneValue(rig.meshes.filter(owned)),\n    controls: cloneValue(rig.controls.filter(owned)),\n    constraints: cloneValue(rig.constraints.filter(owned)),\n    diagnostics: cloneValue({\n      ...rig.diagnostics,\n      collisions: [\n        ...(rig.diagnostics?.collisions || []),\n        ...diagnostics.collisions,\n      ],\n    }),\n    evaluationOrder: [...VEYRA_EVALUATION_ORDER],\n    sources,\n  };\n  if (options.includeComponents === false) return { ...baseScene, componentEvaluatedNodes: [] };\n  const componentEvaluatedNodes = evaluateComponentInstances({\n    document: evaluatedDocument,\n    artboardId,\n    baseScene,\n    runtimeRegistry: options.componentRuntime || null,\n    depth: Number(options.depth || 0),\n    componentPath: options.componentPath || [],\n    evaluateSource: (sourceDocument, sourceArtboardId, sourceLayers, nested = {}) => evaluateDocument(\n      sourceDocument, sourceLayers, null, {\n        ...options,\n        ...nested,\n        artboardId: sourceArtboardId,\n        componentRuntime: options.componentRuntime || null,\n        includeComponents: true,\n      },\n    ),\n  });\n  return {\n    ...baseScene,\n    nodes: [...baseNodes, ...componentEvaluatedNodes],\n    componentEvaluatedNodes,\n  };"""
t=repl(t, old, new, 'evaluated project scene')
write(p,t)

# components: map only direct source persistent nodes, preserve opacity hierarchy.
p='src/veyra/components.js'; t=read(p)
t=t.replace("    const sourceById = new Map(sourceScene.nodes.map((node) => [node.id, node]));", "    const directSourceNodes = sourceScene.nodes.filter((node) => !node.componentInstanceRef);\n    const sourceById = new Map(directSourceNodes.map((node) => [node.id, node]));")
t=t.replace("    for (const sourceNode of sourceScene.nodes) {", "    for (const sourceNode of directSourceNodes) {")
t=t.replace("        opacity: Math.max(0, Math.min(1, opacityProduct(sourceNode, sourceById) * instance.opacity)),", "        opacity: Math.max(0, Math.min(1, Number(sourceNode.opacity ?? 1) * (sourceNode.parent?.id ? 1 : instance.opacity))),")
write(p,t)

# ---------------------------------------------------------------------------
# Scene summary: expose project registries and explicit ownership.
# ---------------------------------------------------------------------------
p='src/veyra/summary.js'; t=read(p)
t=t.replace("  createDocumentRef,", "  createDocumentRef,\n  createArtboardRef,\n  createComponentRef,\n  createComponentInstanceRef,\n  createComponentOverrideRef,")
t=t.replace("      artboard: cloneValue(document.artboard),", "      artboard: cloneValue(document.artboard),\n      artboards: document.artboards.map((artboard) => ({ ref: createArtboardRef(artboard.id), ...cloneValue(artboard) })),")
t=t.replace("        parent: cloneValue(node.parent),", "        parent: cloneValue(node.parent),\n        artboard: cloneValue(node.artboard),")
anchor="""    semantics: document.semantics.map(semanticSummary),\n    objects:"""
t=repl(t, anchor, """    semantics: document.semantics.map(semanticSummary),\n    components: (document.components || []).map((component) => ({\n      ref: createComponentRef(component.id),\n      name: component.name,\n      displayNameAdvisory: true,\n      source: cloneValue(component.source),\n      semantics: document.semantics.filter((record) => record.target.kind === 'component' && record.target.id === component.id).map(semanticSummary),\n    })),\n    componentInstances: (document.componentInstances || []).map((instance) => ({\n      ref: createComponentInstanceRef(instance.id),\n      name: instance.name,\n      artboard: cloneValue(instance.artboard),\n      component: cloneValue(instance.component),\n      parent: cloneValue(instance.parent),\n      transform: cloneValue(instance.transform),\n      frame: cloneValue(instance.frame),\n      fit: instance.fit, alignX: instance.alignX, alignY: instance.alignY, clip: instance.clip,\n      opacity: instance.opacity, visible: instance.visible,\n      overrides: instance.overrides.map((override) => ({ ref: createComponentOverrideRef(override.id), ...cloneValue(override) })),\n      runtime: cloneValue(instance.runtime),\n      semantics: document.semantics.filter((record) => record.target.kind === 'componentInstance' && record.target.id === instance.id).map(semanticSummary),\n    })),\n    objects:""", 'summary components')
# add artboard owner to rig/timeline-ish summaries.
t=t.replace("        parent: cloneValue(bone.parent),", "        parent: cloneValue(bone.parent),\n        artboard: cloneValue(bone.artboard),")
t=t.replace("        name: mesh.name,\n        paint:", "        name: mesh.name,\n        artboard: cloneValue(mesh.artboard),\n        paint:")
t=t.replace("        kind: control.kind,\n        name:", "        kind: control.kind,\n        artboard: cloneValue(control.artboard),\n        name:")
t=t.replace("        type: constraint.type,\n        name:", "        type: constraint.type,\n        artboard: cloneValue(constraint.artboard),\n        name:")
t=t.replace("      name: machine.name,\n      capabilities:", "      name: machine.name,\n      artboard: cloneValue(machine.artboard),\n      capabilities:")
t=t.replace("      kind: listener.kind,\n      event:", "      kind: listener.kind,\n      artboard: cloneValue(listener.artboard),\n      event:")
write(p,t)

print('M6 core integration applied')
