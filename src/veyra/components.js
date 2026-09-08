import { evaluateTimeline } from './animation.js';
import { invertMatrix, multiplyMatrices, transformMatrix } from './contracts.js';
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
    return { document, instance, component: componentById(document, instance.component.id) };
  }

  #bucket(instanceId) {
    const { document, instance } = this.#instance(instanceId);
    let bucket = this.#buckets.get(instanceId);
    if (!bucket) {
      bucket = { timelineTimes: new Map(), machines: new Map(), documentId: document.id };
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

  setTimelineTime(instanceId, timelineId, timeSeconds) {
    const { document, instance, bucket } = this.#bucket(instanceId);
    const ref = { kind: 'timeline', id: String(timelineId) };
    this.#validateSourceRef(document, instance, ref);
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
    const ref = { kind: 'stateMachine', id: String(machineId) };
    this.#validateSourceRef(document, instance, ref);
    if (!bucket.machines.has(ref.id)) bucket.machines.set(ref.id, createMachineRuntime(() => this.#getDocument(), ref.id));
    return bucket.machines.get(ref.id);
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
    for (const [timelineId, timeSeconds] of [...bucket.timelineTimes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const timeline = document.timelines.find((item) => item.id === timelineId);
      if (timeline) Object.assign(overrides, evaluateTimeline(timeline, timeSeconds));
    }
    for (const [machineId, runtime] of [...bucket.machines.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      void machineId;
      Object.assign(overrides, runtime.evaluate().overrides);
    }
    return {
      instanceId,
      overrides: mixedRuntimeOverrides(document, overrides, instance.runtime?.mix ?? 1),
      timelineIds: [...bucket.timelineTimes.keys()].sort(),
      machineIds: [...bucket.machines.keys()].sort(),
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

function opacityProduct(node, byId) {
  let opacity = Number(node.opacity ?? 1);
  let current = node;
  const seen = new Set([node.id]);
  while (current.parent?.id) {
    current = byId.get(current.parent.id);
    if (!current || seen.has(current.id)) break;
    seen.add(current.id);
    opacity *= Number(current.opacity ?? 1);
  }
  return opacity;
}

/**
 * Expand authored component instances into evaluated descendants. Source ids
 * stay persistent source ids; evaluated ids are scoped to the instance and are
 * never written back to authored storage.
 */
export function evaluateComponentInstances({
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
  const output = [];
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
    const runtime = runtimeRegistry ? runtimeRegistry.evaluate(instance.id).overrides : {};
    const sourceScene = evaluateSource(sourceDocument, component.source.id, { animation: runtime }, {
      depth: depth + 1,
      componentPath: [...componentPath, component.id],
    });
    const directSourceNodes = sourceScene.nodes.filter((node) => !node.componentInstanceRef);
    const sourceById = new Map(directSourceNodes.map((node) => [node.id, node]));
    const evaluatedId = (sourceId) => `componentEval:${instance.id}:${sourceId}`;
    for (const sourceNode of directSourceNodes) {
      const mappedWorld = multiplyMatrices(wrapper, sourceNode.worldMatrix);
      const sourceParentId = sourceNode.parent?.id;
      let localMatrix;
      let parent = null;
      if (sourceParentId && sourceById.has(sourceParentId)) {
        parent = { kind: 'node', id: evaluatedId(sourceParentId) };
        localMatrix = cloneValue(sourceNode.localMatrix);
      } else if (instance.parent && parentWorld) {
        parent = cloneValue(instance.parent);
        const parentInverse = invertMatrix(parentWorld);
        localMatrix = parentInverse ? multiplyMatrices(parentInverse, mappedWorld) : mappedWorld;
      } else {
        localMatrix = mappedWorld;
      }
      output.push({
        ...cloneValue(sourceNode),
        id: evaluatedId(sourceNode.id),
        name: sourceNode.name,
        parent,
        localMatrix,
        worldMatrix: mappedWorld,
        opacity: Math.max(0, Math.min(1, Number(sourceNode.opacity ?? 1) * (sourceNode.parent?.id ? 1 : instance.opacity))),
        sourceRef: { kind: 'node', id: sourceNode.sourceRef?.id || sourceNode.id },
        componentRef: { kind: 'component', id: component.id },
        componentInstanceRef: { kind: 'componentInstance', id: instance.id },
        evaluatedIdentity: {
          kind: 'component-instance-descendant',
          persistent: false,
          source: { kind: 'node', id: sourceNode.sourceRef?.id || sourceNode.id },
          instance: { kind: 'componentInstance', id: instance.id },
        },
        propertySource: (instance.overrides || []).some((override) => override.target.kind === 'node' && override.target.id === (sourceNode.sourceRef?.id || sourceNode.id))
          ? 'component-instance-override'
          : runtimeRegistry ? 'component-instance-runtime' : 'component-source',
      });
    }
    output.push(...(sourceScene.componentEvaluatedNodes || []).map((nested) => ({
      ...cloneValue(nested),
      id: `componentEval:${instance.id}:${nested.id}`,
      parent: nested.parent?.id ? { kind: 'node', id: `componentEval:${instance.id}:${nested.parent.id}` } : null,
      localMatrix: multiplyMatrices(wrapper, nested.localMatrix),
      worldMatrix: multiplyMatrices(wrapper, nested.worldMatrix),
      outerComponentInstanceRef: { kind: 'componentInstance', id: instance.id },
    })));
  }
  return output;
}
