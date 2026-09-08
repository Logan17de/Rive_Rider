import { evaluateTimeline } from './animation.js';
import { invertMatrix, multiplyMatrices, transformMatrix, transformPoint } from './contracts.js';
import { createMachineRuntime } from './stateMachine.js';
import { readProperty, writeProperty } from './properties.js';
import {
  artboardById,
  componentById,
  componentInstanceById,
  entityArtboardId,
  VEYRA_COMPONENT_MAX_DEPTH,
} from './projectGraph.js';

function cloneValue(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function translation(x, y) {
  return [1, 0, 0, 1, Number(x) || 0, Number(y) || 0];
}

function scaleMatrix(x, y) {
  return [Number(x) || 0, 0, 0, Number(y) || 0, 0, 0];
}

function alignOffset(mode, available) {
  if (mode === 'start') return 0;
  if (mode === 'end') return available;
  return available / 2;
}

export function componentInstanceSourceMatrix(document, instance, parentWorldMatrix = null) {
  const component = componentById(document, instance.component.id);
  if (!component) throw new TypeError(`Component instance ${instance.id} references missing component ${instance.component.id}.`);
  const source = artboardById(document, component.source.id);
  if (!source) throw new TypeError(`Component ${component.id} references missing artboard ${component.source.id}.`);
  const targetWidth = Number(instance.frame.width);
  const targetHeight = Number(instance.frame.height);
  let sx = 1;
  let sy = 1;
  if (instance.fit === 'stretch') {
    sx = targetWidth / source.width;
    sy = targetHeight / source.height;
  } else if (instance.fit === 'contain' || instance.fit === 'cover') {
    const ratio = instance.fit === 'contain'
      ? Math.min(targetWidth / source.width, targetHeight / source.height)
      : Math.max(targetWidth / source.width, targetHeight / source.height);
    sx = ratio;
    sy = ratio;
  }
  const renderedWidth = source.width * sx;
  const renderedHeight = source.height * sy;
  const offsetX = alignOffset(instance.alignX, targetWidth - renderedWidth);
  const offsetY = alignOffset(instance.alignY, targetHeight - renderedHeight);
  const local = multiplyMatrices(
    transformMatrix(instance.transform),
    multiplyMatrices(
      translation(offsetX, offsetY),
      multiplyMatrices(scaleMatrix(sx, sy), translation(-source.x, -source.y)),
    ),
  );
  return parentWorldMatrix ? multiplyMatrices(parentWorldMatrix, local) : local;
}

function blendValue(authored, runtime, mix) {
  if (mix >= 1) return cloneValue(runtime);
  if (mix <= 0) return cloneValue(authored);
  if (typeof authored === 'number' && typeof runtime === 'number') return authored + (runtime - authored) * mix;
  return mix >= 0.5 ? cloneValue(runtime) : cloneValue(authored);
}

function mixedRuntimeOverrides(document, overrides, mix) {
  if (mix >= 1) return cloneValue(overrides || {});
  const output = {};
  for (const [address, runtime] of Object.entries(overrides || {})) {
    let authored;
    try { authored = readProperty(document, address); } catch { continue; }
    output[address] = blendValue(authored, runtime, mix);
  }
  return output;
}

function effectiveTimelineId(instance, controllerId) {
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

function applyInstanceOverrides(document, instance) {
  const next = cloneValue(document);
  for (const override of instance.overrides || []) writeProperty(next, override.address, cloneValue(override.value));
  return next;
}

function scopedEvaluatedId(instanceId, sourceId) {
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

