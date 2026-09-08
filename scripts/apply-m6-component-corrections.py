from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# 1) Runtime selection/remap is executable, not metadata-only.
# 2) Component expansion preserves nested local/world transform spaces.
# 3) Component expansion carries the current rig/mesh/control/constraint set.
# ---------------------------------------------------------------------------
p = 'src/veyra/components.js'
t = read(p)
t = replace_once(
    t,
    "import { invertMatrix, multiplyMatrices, transformMatrix } from './contracts.js';",
    "import { invertMatrix, multiplyMatrices, transformMatrix, transformPoint } from './contracts.js';",
    'components transformPoint import',
)

runtime_start = t.index('export class ComponentRuntimeRegistry {')
runtime_end = t.index('\nfunction applyInstanceOverrides', runtime_start)
runtime_block = r'''function effectiveTimelineId(instance, controllerId) {
  const selected = instance.runtime?.timeline?.id || null;
  const remapped = instance.runtime?.remap?.timeline?.id || null;
  return selected && controllerId === selected && remapped ? remapped : controllerId;
}

function effectiveMachineId(instance, controllerId) {
  const selected = instance.runtime?.stateMachine?.id || null;
  const remapped = instance.runtime?.remap?.stateMachine?.id || null;
  return selected && controllerId === selected && remapped ? remapped : controllerId;
}

export class ComponentRuntimeRegistry {
  #getDocument;
  #buckets = new Map();

  constructor(documentOrGetter) {
    this.#getDocument = typeof documentOrGetter === 'function' ? documentOrGetter : () => documentOrGetter;
  }

  #instance(instanceId) {
    const document = this.#getDocument();
    const instance = componentInstanceById(document, instanceId);
    if (!instance) throw new TypeError(`Unknown component instance ${instanceId}.`);
    const component = componentById(document, instance.component.id);
    if (!component) throw new TypeError(`Component instance ${instanceId} references missing component ${instance.component.id}.`);
    return { document, instance, component };
  }

  #bucket(instanceId) {
    const { document, instance } = this.#instance(instanceId);
    let bucket = this.#buckets.get(instanceId);
    if (!bucket) {
      bucket = {
        timelineTimes: new Map(),
        machines: new Map(),
        machineTargets: new Map(),
        documentId: document.id,
      };
      this.#buckets.set(instanceId, bucket);
    }
    return { document, instance, bucket };
  }

  #validateSourceRef(document, instance, ref) {
    const component = componentById(document, instance.component.id);
    const sourceArtboardId = component?.source.id;
    if (!sourceArtboardId || entityArtboardId(document, ref) !== sourceArtboardId) {
      throw new TypeError(`${ref.kind}:${ref.id} is not owned by source artboard ${sourceArtboardId || '(missing)'}.`);
    }
  }

  #machineRuntimeFor(document, instance, bucket, controllerId) {
    const controller = { kind: 'stateMachine', id: String(controllerId) };
    this.#validateSourceRef(document, instance, controller);
    const targetId = effectiveMachineId(instance, controller.id);
    const target = { kind: 'stateMachine', id: targetId };
    this.#validateSourceRef(document, instance, target);
    if (!bucket.machines.has(controller.id) || bucket.machineTargets.get(controller.id) !== targetId) {
      bucket.machines.set(controller.id, createMachineRuntime(() => this.#getDocument(), targetId));
      bucket.machineTargets.set(controller.id, targetId);
    }
    return bucket.machines.get(controller.id);
  }

  setTimelineTime(instanceId, timelineId, timeSeconds) {
    const { document, instance, bucket } = this.#bucket(instanceId);
    const ref = { kind: 'timeline', id: String(timelineId) };
    this.#validateSourceRef(document, instance, ref);
    const effective = { kind: 'timeline', id: effectiveTimelineId(instance, ref.id) };
    this.#validateSourceRef(document, instance, effective);
    const time = Number(timeSeconds);
    if (!Number.isFinite(time) || time < 0) throw new TypeError('Component timeline time must be a finite non-negative number.');
    bucket.timelineTimes.set(ref.id, time);
    return time;
  }

  clearTimeline(instanceId, timelineId = null) {
    const { bucket } = this.#bucket(instanceId);
    if (timelineId == null) bucket.timelineTimes.clear();
    else bucket.timelineTimes.delete(String(timelineId));
  }

  machineRuntime(instanceId, machineId) {
    const { document, instance, bucket } = this.#bucket(instanceId);
    return this.#machineRuntimeFor(document, instance, bucket, String(machineId));
  }

  setMachineInput(instanceId, machineId, inputId, value) {
    return this.machineRuntime(instanceId, machineId).setInput(inputId, value);
  }

  fireMachineInput(instanceId, machineId, inputId) {
    return this.machineRuntime(instanceId, machineId).fire(inputId);
  }

  stepMachine(instanceId, machineId, deltaSeconds) {
    return this.machineRuntime(instanceId, machineId).step(deltaSeconds);
  }

  resetInstance(instanceId) {
    const bucket = this.#buckets.get(instanceId);
    if (!bucket) return false;
    bucket.timelineTimes.clear();
    for (const runtime of bucket.machines.values()) runtime.reset();
    return true;
  }

  deleteInstance(instanceId) {
    return this.#buckets.delete(instanceId);
  }

  prune() {
    const document = this.#getDocument();
    const live = new Set((document.componentInstances || []).map((item) => item.id));
    for (const id of this.#buckets.keys()) if (!live.has(id)) this.#buckets.delete(id);
    return this.#buckets.size;
  }

  evaluate(instanceId) {
    const { document, instance, bucket } = this.#bucket(instanceId);
    const overrides = {};
    const timelineControllers = new Map(bucket.timelineTimes);
    const selectedTimelineId = instance.runtime?.timeline?.id || null;
    if (selectedTimelineId && !timelineControllers.has(selectedTimelineId)) timelineControllers.set(selectedTimelineId, 0);
    const timelineMappings = [];
    for (const [controllerId, timeSeconds] of [...timelineControllers.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const controller = { kind: 'timeline', id: controllerId };
      this.#validateSourceRef(document, instance, controller);
      const sourceTimelineId = effectiveTimelineId(instance, controllerId);
      const effective = { kind: 'timeline', id: sourceTimelineId };
      this.#validateSourceRef(document, instance, effective);
      const timeline = document.timelines.find((item) => item.id === sourceTimelineId);
      if (!timeline) throw new TypeError(`Component runtime timeline ${sourceTimelineId} does not exist.`);
      Object.assign(overrides, evaluateTimeline(timeline, timeSeconds));
      timelineMappings.push({ controllerId, sourceTimelineId, timeSeconds });
    }

    const machineControllers = new Set(bucket.machines.keys());
    const selectedMachineId = instance.runtime?.stateMachine?.id || null;
    if (selectedMachineId) machineControllers.add(selectedMachineId);
    const machineMappings = [];
    for (const controllerId of [...machineControllers].sort()) {
      const runtime = this.#machineRuntimeFor(document, instance, bucket, controllerId);
      Object.assign(overrides, runtime.evaluate().overrides);
      machineMappings.push({ controllerId, sourceMachineId: runtime.machineId });
    }

    return {
      instanceId,
      overrides: mixedRuntimeOverrides(document, overrides, instance.runtime?.mix ?? 1),
      timelineIds: [...timelineControllers.keys()].sort(),
      machineIds: [...machineControllers].sort(),
      mappings: { timeline: timelineMappings, stateMachine: machineMappings },
      mix: Number(instance.runtime?.mix ?? 1),
    };
  }

  get size() { return this.#buckets.size; }
}

export function createComponentRuntimeRegistry(documentOrGetter) {
  return new ComponentRuntimeRegistry(documentOrGetter);
}
'''
t = t[:runtime_start] + runtime_block + t[runtime_end:]

eval_start = t.index('function opacityProduct')
eval_block = r'''function scopedEvaluatedId(instanceId, sourceId) {
  return `componentEval:${instanceId}:${sourceId}`;
}

function remapEvaluatedReference(reference, maps) {
  if (!reference?.kind || !reference?.id) return reference ? cloneValue(reference) : reference;
  const map = maps[reference.kind];
  return map?.has(reference.id) ? { kind: reference.kind, id: map.get(reference.id) } : cloneValue(reference);
}

function evaluatedProvenance(item, kind, component, instance, directSource) {
  const sourceId = item.sourceRef?.id || item.id;
  const base = {
    sourceRef: item.sourceRef || { kind, id: sourceId },
    componentRef: directSource ? { kind: 'component', id: component.id } : cloneValue(item.componentRef),
    componentInstanceRef: directSource ? { kind: 'componentInstance', id: instance.id } : cloneValue(item.componentInstanceRef),
    evaluatedIdentity: directSource
      ? {
        kind: 'component-instance-descendant',
        persistent: false,
        source: { kind, id: sourceId },
        instance: { kind: 'componentInstance', id: instance.id },
      }
      : {
        ...(cloneValue(item.evaluatedIdentity) || {}),
        persistent: false,
        outerInstance: { kind: 'componentInstance', id: instance.id },
      },
  };
  if (!directSource) base.outerComponentInstanceRef = { kind: 'componentInstance', id: instance.id };
  return base;
}

/**
 * Expand authored Component instances into evaluated content. Every returned
 * identity is instance-scoped and non-persistent; source refs remain the
 * stable authored refs. The outer source mapping is applied exactly once to
 * subtree roots/world-space rig output while descendant local matrices stay
 * relative to their re-scoped evaluated parents.
 */
export function evaluateComponentContent({
  document,
  artboardId,
  baseScene,
  evaluateSource,
  runtimeRegistry = null,
  depth = 0,
  componentPath = [],
}) {
  if (depth > VEYRA_COMPONENT_MAX_DEPTH) throw new TypeError(`Component evaluation exceeded depth ${VEYRA_COMPONENT_MAX_DEPTH}.`);
  const hostNodes = new Map(baseScene.nodes.map((node) => [node.id, node]));
  const output = { nodes: [], bones: [], meshes: [], controls: [], constraints: [] };
  const instances = (document.componentInstances || [])
    .filter((instance) => instance.artboard.id === artboardId && instance.visible)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const instance of instances) {
    const component = componentById(document, instance.component.id);
    if (!component) continue;
    if (componentPath.includes(component.id)) throw new TypeError(`Component cycle during evaluation: ${[...componentPath, component.id].join(' -> ')}.`);
    const parentWorld = instance.parent ? hostNodes.get(instance.parent.id)?.worldMatrix || null : null;
    const wrapper = componentInstanceSourceMatrix(document, instance, parentWorld);
    const sourceDocument = applyInstanceOverrides(document, instance);
    const runtimeResult = runtimeRegistry
      ? runtimeRegistry.evaluate(instance.id)
      : createComponentRuntimeRegistry(document).evaluate(instance.id);
    const sourceScene = evaluateSource(sourceDocument, component.source.id, { animation: runtimeResult.overrides }, {
      depth: depth + 1,
      componentPath: [...componentPath, component.id],
    });

    const nodeIds = new Map(sourceScene.nodes.map((item) => [item.id, scopedEvaluatedId(instance.id, item.id)]));
    const boneIds = new Map((sourceScene.bones || []).map((item) => [item.id, scopedEvaluatedId(instance.id, item.id)]));
    const meshIds = new Map((sourceScene.meshes || []).map((item) => [item.id, scopedEvaluatedId(instance.id, item.id)]));
    const controlIds = new Map((sourceScene.controls || []).map((item) => [item.id, scopedEvaluatedId(instance.id, item.id)]));
    const constraintIds = new Map((sourceScene.constraints || []).map((item) => [item.id, scopedEvaluatedId(instance.id, item.id)]));
    const referenceMaps = {
      node: nodeIds,
      bone: boneIds,
      mesh: meshIds,
      control: controlIds,
      constraint: constraintIds,
    };

    for (const sourceNode of sourceScene.nodes) {
      const mappedWorld = multiplyMatrices(wrapper, sourceNode.worldMatrix);
      const sourceParentId = sourceNode.parent?.id || null;
      const hasMappedParent = Boolean(sourceParentId && nodeIds.has(sourceParentId));
      let parent = null;
      let localMatrix;
      if (hasMappedParent) {
        parent = { kind: 'node', id: nodeIds.get(sourceParentId) };
        localMatrix = cloneValue(sourceNode.localMatrix);
      } else if (instance.parent && parentWorld) {
        parent = cloneValue(instance.parent);
        const parentInverse = invertMatrix(parentWorld);
        localMatrix = parentInverse ? multiplyMatrices(parentInverse, mappedWorld) : mappedWorld;
      } else {
        localMatrix = mappedWorld;
      }
      const directSource = !sourceNode.componentInstanceRef;
      const sourceId = sourceNode.sourceRef?.id || sourceNode.id;
      const hasInstanceOverride = directSource && (instance.overrides || []).some(
        (override) => override.target.kind === 'node' && override.target.id === sourceId,
      );
      const hasRuntime = directSource && Object.keys(runtimeResult.overrides).some((address) => address.startsWith(`node:${sourceId}/`));
      output.nodes.push({
        ...cloneValue(sourceNode),
        id: nodeIds.get(sourceNode.id),
        parent,
        localMatrix,
        worldMatrix: mappedWorld,
        opacity: Math.max(0, Math.min(1, Number(sourceNode.opacity ?? 1) * (hasMappedParent ? 1 : instance.opacity))),
        ...evaluatedProvenance(sourceNode, 'node', component, instance, directSource),
        propertySource: directSource
          ? (hasInstanceOverride ? 'component-instance-override' : hasRuntime ? 'component-instance-runtime' : 'component-source')
          : sourceNode.propertySource,
      });
    }

    for (const sourceBone of sourceScene.bones || []) {
      const directSource = !sourceBone.componentInstanceRef;
      const parentId = sourceBone.parent?.id || null;
      const hasMappedParent = Boolean(parentId && boneIds.has(parentId));
      const mappedWorld = multiplyMatrices(wrapper, sourceBone.worldMatrix);
      output.bones.push({
        ...cloneValue(sourceBone),
        id: boneIds.get(sourceBone.id),
        parent: hasMappedParent ? { kind: 'bone', id: boneIds.get(parentId) } : null,
        localMatrix: hasMappedParent ? cloneValue(sourceBone.localMatrix) : mappedWorld,
        worldMatrix: mappedWorld,
        restWorldMatrix: multiplyMatrices(wrapper, sourceBone.restWorldMatrix),
        start: transformPoint(wrapper, sourceBone.start),
        end: transformPoint(wrapper, sourceBone.end),
        ...evaluatedProvenance(sourceBone, 'bone', component, instance, directSource),
      });
    }

    for (const sourceMesh of sourceScene.meshes || []) {
      const directSource = !sourceMesh.componentInstanceRef;
      const vertexIds = new Map((sourceMesh.vertices || []).map((vertex) => [vertex.id, scopedEvaluatedId(instance.id, vertex.id)]));
      const vertices = (sourceMesh.vertices || []).map((vertex) => ({
        ...cloneValue(vertex),
        id: vertexIds.get(vertex.id),
        weights: (vertex.weights || []).map((weight) => ({
          ...cloneValue(weight),
          bone: remapEvaluatedReference(weight.bone, referenceMaps),
        })),
      }));
      const deformedVertices = (sourceMesh.deformedVertices || []).map((vertex) => {
        const point = transformPoint(wrapper, vertex);
        return { ...cloneValue(vertex), id: vertexIds.get(vertex.id) || scopedEvaluatedId(instance.id, vertex.id), x: point.x, y: point.y };
      });
      const triangles = (sourceMesh.triangles || []).map((triangle) => triangle.map((reference) => (
        vertexIds.has(reference.id) ? { kind: reference.kind, id: vertexIds.get(reference.id) } : cloneValue(reference)
      )));
      output.meshes.push({
        ...cloneValue(sourceMesh),
        id: meshIds.get(sourceMesh.id),
        vertices,
        deformedVertices,
        triangles,
        opacity: Math.max(0, Math.min(1, Number(sourceMesh.opacity ?? 1) * instance.opacity)),
        ...evaluatedProvenance(sourceMesh, 'mesh', component, instance, directSource),
      });
    }

    for (const sourceControl of sourceScene.controls || []) {
      const directSource = !sourceControl.componentInstanceRef;
      const mappedPosition = sourceControl.kind === 'position' ? transformPoint(wrapper, sourceControl.position) : cloneValue(sourceControl.position);
      output.controls.push({
        ...cloneValue(sourceControl),
        id: controlIds.get(sourceControl.id),
        position: mappedPosition,
        ...evaluatedProvenance(sourceControl, 'control', component, instance, directSource),
      });
    }

    for (const sourceConstraint of sourceScene.constraints || []) {
      const directSource = !sourceConstraint.componentInstanceRef;
      const mapped = cloneValue(sourceConstraint);
      if (mapped.bone) mapped.bone = remapEvaluatedReference(mapped.bone, referenceMaps);
      if (mapped.bones) mapped.bones = mapped.bones.map((ref) => remapEvaluatedReference(ref, referenceMaps));
      if (mapped.target) mapped.target = remapEvaluatedReference(mapped.target, referenceMaps);
      if (mapped.path) mapped.path = remapEvaluatedReference(mapped.path, referenceMaps);
      output.constraints.push({
        ...mapped,
        id: constraintIds.get(sourceConstraint.id),
        ...evaluatedProvenance(sourceConstraint, 'constraint', component, instance, directSource),
      });
    }
  }
  return output;
}

// Preserve the public M6 helper's node-array shape while the evaluator consumes
// the richer content bundle internally.
export function evaluateComponentInstances(options) {
  return evaluateComponentContent(options).nodes;
}
'''
t = t[:eval_start] + eval_block + '\n'
write(p, t)

# ---------------------------------------------------------------------------
# Evaluator merges all supported instance-evaluated content into the host scene.
# ---------------------------------------------------------------------------
p = 'src/veyra/evaluation.js'
t = read(p)
t = replace_once(t, "import { evaluateComponentInstances } from './components.js';", "import { evaluateComponentContent } from './components.js';", 'evaluation component import')
old = """  if (options.includeComponents === false) return { ...baseScene, componentEvaluatedNodes: [] };\n  const componentEvaluatedNodes = evaluateComponentInstances({\n    document: evaluatedDocument,\n    artboardId,\n    baseScene,\n    runtimeRegistry: options.componentRuntime || null,\n    depth: Number(options.depth || 0),\n    componentPath: options.componentPath || [],\n    evaluateSource: (sourceDocument, sourceArtboardId, sourceLayers, nested = {}) => evaluateDocument(\n      sourceDocument, sourceLayers, null, {\n        ...options,\n        ...nested,\n        artboardId: sourceArtboardId,\n        componentRuntime: options.componentRuntime || null,\n        includeComponents: true,\n      },\n    ),\n  });\n  return {\n    ...baseScene,\n    nodes: [...baseNodes, ...componentEvaluatedNodes],\n    componentEvaluatedNodes,\n  };"""
new = """  if (options.includeComponents === false) return {\n    ...baseScene,\n    componentEvaluatedNodes: [],\n    componentEvaluatedBones: [],\n    componentEvaluatedMeshes: [],\n    componentEvaluatedControls: [],\n    componentEvaluatedConstraints: [],\n  };\n  const componentContent = evaluateComponentContent({\n    document: evaluatedDocument,\n    artboardId,\n    baseScene,\n    runtimeRegistry: options.componentRuntime || null,\n    depth: Number(options.depth || 0),\n    componentPath: options.componentPath || [],\n    evaluateSource: (sourceDocument, sourceArtboardId, sourceLayers, nested = {}) => evaluateDocument(\n      sourceDocument, sourceLayers, null, {\n        ...options,\n        ...nested,\n        artboardId: sourceArtboardId,\n        componentRuntime: options.componentRuntime || null,\n        includeComponents: true,\n      },\n    ),\n  });\n  return {\n    ...baseScene,\n    nodes: [...baseNodes, ...componentContent.nodes],\n    bones: [...baseScene.bones, ...componentContent.bones],\n    meshes: [...baseScene.meshes, ...componentContent.meshes],\n    controls: [...baseScene.controls, ...componentContent.controls],\n    constraints: [...baseScene.constraints, ...componentContent.constraints],\n    componentEvaluatedNodes: componentContent.nodes,\n    componentEvaluatedBones: componentContent.bones,\n    componentEvaluatedMeshes: componentContent.meshes,\n    componentEvaluatedControls: componentContent.controls,\n    componentEvaluatedConstraints: componentContent.constraints,\n  };"""
t = replace_once(t, old, new, 'evaluation content merge')
write(p, t)

# ---------------------------------------------------------------------------
# Project validation makes remap meaningful and capability claims exact.
# ---------------------------------------------------------------------------
p = 'src/veyra/projectGraph.js'
t = read(p)
old = """    for (const ref of [instance.runtime.timeline, instance.runtime.stateMachine, instance.runtime.remap.timeline, instance.runtime.remap.stateMachine].filter(Boolean)) {\n      if (entityArtboardId(document, ref) !== sourceOwner) {\n        throw new TypeError(`Component instance ${instance.id} runtime ref ${ref.kind}:${ref.id} is outside source artboard ${sourceOwner}.`);\n      }\n    }"""
new = """    if (instance.runtime.remap.timeline && !instance.runtime.timeline) {\n      throw new TypeError(`Component instance ${instance.id} runtime.remap.timeline requires runtime.timeline selection.`);\n    }\n    if (instance.runtime.remap.stateMachine && !instance.runtime.stateMachine) {\n      throw new TypeError(`Component instance ${instance.id} runtime.remap.stateMachine requires runtime.stateMachine selection.`);\n    }\n    for (const ref of [instance.runtime.timeline, instance.runtime.stateMachine, instance.runtime.remap.timeline, instance.runtime.remap.stateMachine].filter(Boolean)) {\n      if (entityArtboardId(document, ref) !== sourceOwner) {\n        throw new TypeError(`Component instance ${instance.id} runtime ref ${ref.kind}:${ref.id} is outside source artboard ${sourceOwner}.`);\n      }\n    }"""
t = replace_once(t, old, new, 'project runtime remap validation')
old = """    overrideTargets: ['node', 'bone', 'mesh', 'control', 'constraint'],\n    runtimeIsolation: 'per-component-instance',\n  };"""
new = """    overrideTargets: ['node', 'bone', 'mesh', 'control', 'constraint'],\n    runtimeIsolation: 'per-component-instance',\n    runtimeMapping: {\n      timelineSelection: 'authored selected source timeline; default runtime time is 0 seconds',\n      stateMachineSelection: 'authored selected source machine; default runtime state is its initial state',\n      remap: 'selected controller id remains the runtime slot; remap selects the source timeline/stateMachine actually evaluated',\n      mix: {\n        range: [0, 1],\n        numeric: 'linear authored-to-runtime interpolation',\n        discrete: 'authored below 0.5; runtime at or above 0.5',\n      },\n    },\n    componentEvaluatedContent: ['nodes', 'bones', 'weightedMeshes', 'controls', 'constraints'],\n  };"""
t = replace_once(t, old, new, 'project runtime/content capabilities')
write(p, t)

# Public internal seam for focused tests/hosts that need the full evaluated bundle.
p = 'src/index.js'
t = read(p)
t = replace_once(
    t,
    "  ComponentRuntimeRegistry, createComponentRuntimeRegistry, componentInstanceSourceMatrix, evaluateComponentInstances,",
    "  ComponentRuntimeRegistry, createComponentRuntimeRegistry, componentInstanceSourceMatrix, evaluateComponentContent, evaluateComponentInstances,",
    'index component content export',
)
write(p, t)

# ---------------------------------------------------------------------------
# Focused adversarial correction suite.
# ---------------------------------------------------------------------------
test = r'''import assert from 'node:assert/strict';
import {
  createBone, createConstraint, createControl, createDocument, createMesh, createNode,
  createStateMachine, createTimeline, normalizeDocument,
} from '../src/veyra/model.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import {
  createArtboardRef, createBoneRef, createComponentRef, createControlRef, createNodeRef,
  createStateMachineRef, createTimelineRef,
} from '../src/veyra/references.js';
import { createComponentRuntimeRegistry } from '../src/veyra/components.js';
import { multiplyMatrices, transformPoint } from '../src/veyra/contracts.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import { VeyraStore } from '../src/veyra/store.js';

function constantTimeline(id, artboardId, address, value) {
  const timeline = createTimeline({
    id, name: id, duration: 30, fps: 30,
    tracks: [{ id: `${id}-track`, address, keyframes: [
      { id: `${id}-0`, frame: 0, value, easing: 'linear' },
      { id: `${id}-30`, frame: 30, value, easing: 'linear' },
    ] }],
  });
  timeline.artboard = createArtboardRef(artboardId);
  return timeline;
}

function animationMachine(id, artboardId, timelineId) {
  const machine = createStateMachine({
    id, name: id, initial: { kind: 'machineState', id: `${id}-state` },
    states: [{ id: `${id}-state`, name: 'State', type: 'animation', timeline: createTimelineRef(timelineId) }],
  });
  machine.artboard = createArtboardRef(artboardId);
  return machine;
}

function runtimeProject() {
  const node = createNode('rectangle', {
    id: 'runtime-node', artboard: createArtboardRef('source'), transform: { x: 10, y: 40 },
    geometry: { width: 20, height: 20 }, paint: { fill: '#ff0000', stroke: 'none', strokeWidth: 0 },
  });
  const a = constantTimeline('timeline-a', 'source', 'node:runtime-node/transform/x', 20);
  const b = constantTimeline('timeline-b', 'source', 'node:runtime-node/transform/x', 110);
  const host = constantTimeline('host-timeline', 'host', 'node:runtime-node/transform/x', 999);
  const ma = animationMachine('machine-a', 'source', 'timeline-a');
  const mb = animationMachine('machine-b', 'source', 'timeline-b');
  return normalizeDocument(createDocument({
    id: 'm6-runtime-correction',
    artboards: [
      { id: 'source', name: 'Source', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 500, height: 300, background: '#eeeeee' },
    ],
    nodes: [node], timelines: [a, b, host], stateMachines: [ma, mb],
    components: [{ id: 'runtime-component', name: 'Runtime Component', source: createArtboardRef('source') }],
    componentInstances: [
      { id: 'remap-one', name: 'Remap One', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } },
      { id: 'remap-two', name: 'Remap Two', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } },
      { id: 'plain-selection', name: 'Plain', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: {} } },
      { id: 'machine-remap', name: 'Machine Remap', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: null, stateMachine: createStateMachineRef('machine-a'), mix: 1, remap: { timeline: null, stateMachine: createStateMachineRef('machine-b') } } },
      { id: 'mix-zero', name: 'Mix 0', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 0, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } },
      { id: 'mix-quarter', name: 'Mix .25', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 0.25, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } },
      { id: 'mix-one', name: 'Mix 1', artboard: createArtboardRef('host'), component: createComponentRef('runtime-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none', runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } },
    ],
  }));
}

// Persisted runtime selection/remap affects evaluation with a fresh reader and no imperative setup.
{
  const roundTrip = parseVeyra(serializeVeyra(runtimeProject()));
  const scene = evaluateDocument(roundTrip, {}, null, { artboardId: 'host' });
  const x = (instanceId) => scene.nodes.find((node) => node.componentInstanceRef?.id === instanceId && node.sourceRef?.id === 'runtime-node').worldMatrix[4];
  assert.equal(x('plain-selection'), 20, 'authored timeline selection evaluates at its deterministic default time');
  assert.equal(x('remap-one'), 110, 'persisted timeline remap changes the source timeline actually evaluated');
  assert.equal(x('machine-remap'), 110, 'persisted state-machine remap changes the source machine actually evaluated');
  assert.equal(x('mix-zero'), 10, 'mix 0 preserves authored value');
  assert.equal(x('mix-quarter'), 35, 'numeric mix interpolates linearly');
  assert.equal(x('mix-one'), 110, 'mix 1 uses runtime value');

  const registry = createComponentRuntimeRegistry(() => roundTrip);
  assert.equal(registry.machineRuntime('machine-remap', 'machine-a').machineId, 'machine-b', 'selected machine id is a runtime slot remapped to machine-b');
  registry.setTimelineTime('remap-one', 'timeline-a', 1);
  registry.setTimelineTime('remap-two', 'timeline-a', 0);
  const isolated = evaluateDocument(roundTrip, {}, null, { artboardId: 'host', componentRuntime: registry });
  const one = isolated.nodes.find((node) => node.componentInstanceRef?.id === 'remap-one' && node.sourceRef?.id === 'runtime-node');
  const two = isolated.nodes.find((node) => node.componentInstanceRef?.id === 'remap-two' && node.sourceRef?.id === 'runtime-node');
  assert.equal(one.worldMatrix[4], 110);
  assert.equal(two.worldMatrix[4], 110);
  assert.notEqual(registry.evaluate('remap-one').mappings.timeline[0].timeSeconds, registry.evaluate('remap-two').mappings.timeline[0].timeSeconds, 'runtime clocks remain per-instance even when both remap to one source timeline');

  const manifest = createProjectManifest(roundTrip);
  const runtimeCaps = manifest.authoring.projectGraph.runtimeMapping;
  assert.equal(runtimeCaps.remap, 'selected controller id remains the runtime slot; remap selects the source timeline/stateMachine actually evaluated');
  assert.deepEqual(runtimeCaps.mix.range, [0, 1]);
  assert.equal(manifest.authoring.projectGraph.componentEvaluatedContent.join(','), 'nodes,bones,weightedMeshes,controls,constraints');
}

// Cross-artboard/missing remap refs fail through the canonical command boundary without state/history/revision mutation.
{
  const store = new VeyraStore(runtimeProject());
  const control = createVeyraControlPlane(store);
  const before = serializeVeyra(store.document);
  const revision = store.revision;
  const history = store.commandHistory.length;
  const cross = control.dispatchCommand({ action: 'updateComponentInstance', args: { instanceId: 'remap-one', changes: { runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('host-timeline'), stateMachine: null } } } } });
  assert.equal(cross.ok, false);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.revision, revision);
  assert.equal(store.commandHistory.length, history);
  const missing = control.dispatchCommand({ action: 'updateComponentInstance', args: { instanceId: 'remap-one', changes: { runtime: { timeline: createTimelineRef('timeline-a'), stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('missing-timeline'), stateMachine: null } } } } });
  assert.equal(missing.ok, false);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.revision, revision);
  assert.equal(store.commandHistory.length, history);
  assert.throws(() => normalizeDocument({ ...JSON.parse(before), componentInstances: JSON.parse(before).componentInstances.map((item) => item.id === 'remap-one' ? { ...item, runtime: { timeline: null, stateMachine: null, mix: 1, remap: { timeline: createTimelineRef('timeline-b'), stateMachine: null } } } : item) }), /requires runtime.timeline selection/);
}

function nestedProject() {
  const outerParent = createNode('group', { id: 'outer-parent', artboard: createArtboardRef('outer-source'), transform: { x: 30, y: 0 } });
  const innerParent = createNode('group', { id: 'inner-parent', artboard: createArtboardRef('inner-source'), transform: { x: 10, y: 5 } });
  const innerChild = createNode('rectangle', { id: 'inner-child', artboard: createArtboardRef('inner-source'), parent: createNodeRef('inner-parent'), transform: { x: 20, y: 0 }, geometry: { width: 20, height: 20 }, paint: { fill: '#00ff00', stroke: 'none', strokeWidth: 0 } });
  return normalizeDocument(createDocument({
    id: 'nested-correction',
    artboards: [
      { id: 'inner-source', name: 'Inner', x: 0, y: 0, width: 100, height: 100, background: '#ffffff' },
      { id: 'outer-source', name: 'Outer', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 500, height: 300, background: '#eeeeee' },
    ],
    nodes: [outerParent, innerParent, innerChild],
    components: [
      { id: 'inner-component', name: 'Inner Component', source: createArtboardRef('inner-source') },
      { id: 'outer-component', name: 'Outer Component', source: createArtboardRef('outer-source') },
    ],
    componentInstances: [
      { id: 'inner-instance', name: 'Nested Inner', artboard: createArtboardRef('outer-source'), component: createComponentRef('inner-component'), parent: createNodeRef('outer-parent'), transform: { x: 40, y: 0 }, frame: { width: 100, height: 100 }, fit: 'none' },
      { id: 'outer-one', name: 'Outer One', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 100, y: 50 }, frame: { width: 200, height: 120 }, fit: 'none' },
      { id: 'outer-two', name: 'Outer Two', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 300, y: 50 }, frame: { width: 200, height: 120 }, fit: 'none' },
    ],
  }));
}

// Legal nesting keeps local matrices relative and applies the outer wrapper once.
{
  const doc = nestedProject();
  const scene = evaluateDocument(doc, {}, null, { artboardId: 'host' });
  const nestedChildren = scene.nodes.filter((node) => node.sourceRef?.id === 'inner-child');
  assert.equal(nestedChildren.length, 2);
  const first = nestedChildren.find((node) => node.outerComponentInstanceRef?.id === 'outer-one');
  const second = nestedChildren.find((node) => node.outerComponentInstanceRef?.id === 'outer-two');
  assert.ok(first && second);
  assert.equal(first.worldMatrix[4], 200, 'outer 100 + outer parent 30 + inner instance 40 + inner parent 10 + child 20');
  assert.equal(first.worldMatrix[5], 55);
  assert.equal(second.worldMatrix[4] - first.worldMatrix[4], 200, 'two outer instances remain independently scoped');
  const parent = scene.nodes.find((node) => node.id === first.parent.id);
  assert.deepEqual(multiplyMatrices(parent.worldMatrix, first.localMatrix), first.worldMatrix, 'parent.world * child.local equals child.world');
  assert.equal(first.localMatrix[4], 20, 'child local transform is not multiplied by the outer wrapper');

  const svg = renderSvgString(scene);
  assert.match(svg, new RegExp(`id=\\"${first.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\"`));
  assert.match(svg, new RegExp(`id=\\"${first.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\" transform=\\"matrix\\(1 0 0 1 20 0\\)\\"`));
  const viewport = { width: 500, height: 300, zoom: 1, centerX: 250, centerY: 150 };
  const screen = transformPoint(createSvgViewBoxScreenTransform(scene.artboard, viewport).matrix, { x: first.worldMatrix[4], y: first.worldMatrix[5] });
  assert.equal(hitTestPoint(screen, scene, viewport)?.id, first.id, 'hit testing agrees with rendered nested child location');

  const roundTrip = parseVeyra(serializeVeyra(doc));
  assert.equal(roundTrip.nodes.length, doc.nodes.length);
  assert.equal(roundTrip.nodes.some((node) => node.id.startsWith('componentEval:')), false, 'save/load never authors evaluated nested descendants');

  const cycle = JSON.parse(serializeVeyra(doc));
  cycle.componentInstances.push({ id: 'cycle-back', name: 'Cycle', artboard: createArtboardRef('inner-source'), component: createComponentRef('outer-component'), transform: {}, frame: { width: 200, height: 120 }, fit: 'none' });
  assert.throws(() => normalizeDocument(cycle), /Component cycle detected/);
}

function rigProject() {
  const bone = createBone({ id: 'rig-bone', name: 'Rig Bone', length: 80, rest: { x: 50, y: 50 } });
  bone.artboard = createArtboardRef('rig-source');
  const control = createControl({ id: 'rig-control', name: 'Rig Control', position: { x: 130, y: 50 } });
  control.artboard = createArtboardRef('rig-source');
  const vertices = [
    { id: 'rv0', x: 50, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv1', x: 90, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv2', x: 90, y: 60, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
  ];
  const mesh = createMesh({ id: 'rig-mesh', name: 'Rig Mesh', vertices, paint: { fill: '#3366ff', stroke: 'none', strokeWidth: 0 } });
  mesh.artboard = createArtboardRef('rig-source');
  const constraint = createConstraint('ik', { id: 'rig-constraint', name: 'Rig IK', enabled: false, bones: [createBoneRef('rig-bone')], target: createControlRef('rig-control') });
  constraint.artboard = createArtboardRef('rig-source');
  const timeline = createTimeline({
    id: 'rig-timeline', name: 'Rig Turn', duration: 30, fps: 30,
    tracks: [{ id: 'rig-track', address: 'bone:rig-bone/pose/rotation', keyframes: [
      { id: 'rig-k0', frame: 0, value: 0, easing: 'linear' },
      { id: 'rig-k1', frame: 30, value: Math.PI / 2, easing: 'linear' },
    ] }],
  });
  timeline.artboard = createArtboardRef('rig-source');
  return normalizeDocument(createDocument({
    id: 'rig-correction',
    artboards: [
      { id: 'rig-source', name: 'Rig Source', x: 0, y: 0, width: 200, height: 160, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 800, height: 300, background: '#eeeeee' },
    ],
    bones: [bone], controls: [control], meshes: [mesh], constraints: [constraint], timelines: [timeline],
    components: [{ id: 'rig-component', name: 'Rig Component', source: createArtboardRef('rig-source') }],
    componentInstances: [
      { id: 'rig-one', name: 'Rig One', artboard: createArtboardRef('host'), component: createComponentRef('rig-component'), transform: { x: 300, y: 0 }, frame: { width: 200, height: 160 }, fit: 'none' },
      { id: 'rig-two', name: 'Rig Two', artboard: createArtboardRef('host'), component: createComponentRef('rig-component'), transform: { x: 500, y: 0 }, frame: { width: 200, height: 160 }, fit: 'none' },
    ],
  }));
}

// Rigged Components carry evaluated bones/meshes/controls/constraints and keep runtime isolated.
{
  const doc = rigProject();
  const source = evaluateDocument(doc, {}, null, { artboardId: 'rig-source' });
  const registry = createComponentRuntimeRegistry(() => doc);
  registry.setTimelineTime('rig-one', 'rig-timeline', 1);
  const host = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry });
  const meshes = host.meshes.filter((mesh) => mesh.sourceRef?.id === 'rig-mesh');
  const bones = host.bones.filter((bone) => bone.sourceRef?.id === 'rig-bone');
  const controls = host.controls.filter((control) => control.sourceRef?.id === 'rig-control');
  const constraints = host.constraints.filter((constraint) => constraint.sourceRef?.id === 'rig-constraint');
  assert.equal(meshes.length, 2); assert.equal(bones.length, 2); assert.equal(controls.length, 2); assert.equal(constraints.length, 2);
  assert.notEqual(meshes[0].id, meshes[1].id);
  assert.notEqual(bones[0].id, bones[1].id);
  assert.equal(doc.meshes.length, 1); assert.equal(doc.bones.length, 1, 'instance evaluation never clones rig content into authored storage');
  const oneMesh = meshes.find((mesh) => mesh.componentInstanceRef?.id === 'rig-one');
  const twoMesh = meshes.find((mesh) => mesh.componentInstanceRef?.id === 'rig-two');
  const oneVertex = oneMesh.deformedVertices.find((vertex) => vertex.id.endsWith('rv0'));
  const twoVertex = twoMesh.deformedVertices.find((vertex) => vertex.id.endsWith('rv0'));
  assert.notDeepEqual({ x: oneVertex.x - 300, y: oneVertex.y }, { x: twoVertex.x - 500, y: twoVertex.y }, 'timeline runtime deforms only rig-one');
  assert.deepEqual(source.meshes[0].deformedVertices.map(({ x, y }) => ({ x, y })), [{ x: 50, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 60 }], 'source rig remains authored/rest-driven');
  const oneBone = bones.find((bone) => bone.componentInstanceRef?.id === 'rig-one');
  assert.equal(Math.round(oneBone.start.x), 350, 'instance transform maps bone output consistently with node/mesh mapping');
  const oneConstraint = constraints.find((constraint) => constraint.componentInstanceRef?.id === 'rig-one');
  assert.equal(oneConstraint.bones[0].id, oneBone.id, 'instance constraint references instance-scoped evaluated bone');
  assert.ok(controls.find((control) => control.componentInstanceRef?.id === 'rig-one').position.x > 300);
  const svg = renderSvgString(host);
  assert.match(svg, new RegExp(`id=\\"${oneMesh.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\"`), 'renderer consumes evaluated instance mesh output');

  const roundTrip = parseVeyra(serializeVeyra(doc));
  assert.equal(roundTrip.meshes.length, 1); assert.equal(roundTrip.bones.length, 1);
  assert.equal(roundTrip.meshes.some((mesh) => mesh.id.startsWith('componentEval:')), false);
  assert.equal(roundTrip.bones.some((bone) => bone.id.startsWith('componentEval:')), false);
}

console.log('veyra M6 component runtime/evaluation correction tests passed');
'''
write('tests/veyra-m6-component-corrections.test.mjs', test)

print('M6 Component correction patch applied')
