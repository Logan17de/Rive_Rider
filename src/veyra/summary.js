import { nodeCapabilities, rigCapabilities } from './capabilities.js';
import { cloneValue, semanticFor } from './model.js';
import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';
import {
  createDocumentRef,
  createGradientStopRef,
  createMachineConditionRef,
  createMachineInputRef,
  createMachineStateRef,
  createMachineTransitionRef,
  createListenerRef,
  createMeshVertexRef,
  createNodeRef,
  createPathVertexRef,
  createStateMachineRef,
  createTimelineRef,
  referenceId,
} from './references.js';

function paintSummary(paint) {
  const stops = paint?.fill?.stops || [];
  return {
    fillType: paint?.fill?.type || 'solid',
    gradientStops: stops.map((stop) => ({
      ref: createGradientStopRef(stop.id),
      offset: stop.offset,
      color: stop.color,
      opacity: stop.opacity,
    })),
  };
}

export function createSceneSummary(document, options = {}) {
  const includeGeometry = Boolean(options.includeGeometry);
  return {
    format: 'veyra-scene-summary',
    version: 1,
    document: {
      ref: createDocumentRef(document.id),
      id: document.id,
      name: document.name,
      artboard: cloneValue(document.artboard),
      conventions: cloneValue(document.conventions),
      assetCount: document.assets.length,
      objectCount: document.nodes.length,
      rig: {
        boneCount: document.bones.length,
        meshCount: document.meshes.length,
        controlCount: document.controls.length,
        constraintCount: document.constraints.length,
      },
    },
    objects: document.nodes.map((node) => {
      const semantic = semanticFor(document, node.id);
      const summary = {
        ref: { kind: 'node', id: node.id },
        type: node.type,
        name: node.name,
        parent: cloneValue(node.parent),
        paint: paintSummary(node.paint),
        visible: node.visible,
        locked: node.locked,
        semantics: semantic
          ? { target: createNodeRef(node.id), role: semantic.role, description: semantic.description, tags: [...semantic.tags] }
          : null,
        capabilities: nodeCapabilities(node),
      };
      if (includeGeometry) summary.geometry = cloneValue(node.geometry);
      if (node.type === 'path') summary.geometryRefs = {
        vertices: node.geometry.vertices.map((vertex) => createPathVertexRef(vertex.id)),
      };
      if (!includeGeometry && node.type === 'path') summary.geometrySummary = { kind: 'authored-path', vertexCount: node.geometry.vertices.length, closed: node.geometry.closed };
      else if (node.geometry && node.type !== 'path') summary.geometrySummary = { kind: node.type, parameters: Object.keys(node.geometry) };
      return summary;
    }),
    rig: {
      bones: document.bones.map((bone) => ({
        ref: { kind: 'bone', id: bone.id },
        name: bone.name,
        parent: cloneValue(bone.parent),
        length: bone.length,
        capabilities: rigCapabilities('bone', bone),
      })),
      meshes: document.meshes.map((mesh) => ({
        ref: { kind: 'mesh', id: mesh.id },
        name: mesh.name,
        paint: paintSummary(mesh.paint),
        vertexRefs: mesh.vertices.map((vertex) => createMeshVertexRef(vertex.id)),
        vertexCount: mesh.vertices.length,
        triangleCount: mesh.triangles.length,
        capabilities: rigCapabilities('mesh', mesh),
        ...(includeGeometry ? { vertices: cloneValue(mesh.vertices), triangles: cloneValue(mesh.triangles) } : {}),
      })),
      controls: document.controls.map((control) => ({
        ref: { kind: 'control', id: control.id },
        kind: control.kind,
        name: control.name,
        position: cloneValue(control.position),
        capabilities: rigCapabilities('control', control),
      })),
      constraints: document.constraints.map((constraint) => ({
        ref: { kind: 'constraint', id: constraint.id },
        type: constraint.type,
        name: constraint.name,
        enabled: constraint.enabled,
        strength: constraint.strength,
        capabilities: rigCapabilities('constraint', constraint),
      })),
    },
    stateMachines: (document.stateMachines || []).map((machine) => ({
      ref: createStateMachineRef(machine.id),
      name: machine.name,
      capabilities: cloneValue(VEYRA_MACHINE_CAPABILITIES),
      initial: machine.initial
        ? createMachineStateRef(referenceId(machine.initial, 'machineState'))
        : null,
      inputs: machine.inputs.map((input) => ({
        ref: createMachineInputRef(input.id),
        name: input.name,
        type: input.type,
        value: input.value,
      })),
      states: machine.states.map((state) => ({
        ref: createMachineStateRef(state.id),
        name: state.name,
        type: state.type,
        timeline: state.timeline
          ? createTimelineRef(referenceId(state.timeline, 'timeline'))
          : null,
      })),
      transitions: machine.transitions.map((transition) => ({
        ref: createMachineTransitionRef(transition.id),
        from: createMachineStateRef(referenceId(transition.from, 'machineState')),
        to: createMachineStateRef(referenceId(transition.to, 'machineState')),
        duration: transition.duration,
        after: transition.after,
        conditions: transition.conditions.map((condition) => ({
          ref: createMachineConditionRef(condition.id),
          input: createMachineInputRef(referenceId(condition.input, 'machineInput')),
          op: condition.op,
          ...(condition.value !== undefined ? { value: condition.value } : {}),
        })),
      })),
    })),
    listeners: (document.listeners || []).map((listener) => ({
      ref: createListenerRef(listener.id),
      kind: listener.kind,
      event: listener.event,
      target: cloneValue(listener.target),
      action: listener.action,
      ...(listener.machine ? { machine: createStateMachineRef(referenceId(listener.machine, 'stateMachine')) } : {}),
      ...(listener.input ? { input: createMachineInputRef(referenceId(listener.input, 'machineInput')) } : {}),
      ...(listener.timeline ? { timeline: createTimelineRef(referenceId(listener.timeline, 'timeline')) } : {}),
      ...(listener.value !== undefined ? { value: cloneValue(listener.value) } : {}),
    })),
  };
}
