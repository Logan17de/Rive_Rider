import { nodeCapabilities, rigCapabilities } from './capabilities.js';
import { cloneValue, semanticFor } from './model.js';
import { referenceId } from './references.js';

export function createSceneSummary(document, options = {}) {
  const includeGeometry = Boolean(options.includeGeometry);
  return {
    format: 'veyra-scene-summary',
    version: 1,
    document: {
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
        visible: node.visible,
        locked: node.locked,
        semantics: semantic
          ? { role: semantic.role, description: semantic.description, tags: [...semantic.tags] }
          : null,
        capabilities: nodeCapabilities(node),
      };
      if (includeGeometry) summary.geometry = cloneValue(node.geometry);
      else if (node.type === 'path') summary.geometrySummary = { kind: 'authored-path', vertexCount: node.geometry.vertices.length, closed: node.geometry.closed };
      else if (node.geometry) summary.geometrySummary = { kind: node.type, parameters: Object.keys(node.geometry) };
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
      ref: { kind: 'machine', id: machine.id },
      name: machine.name,
      initial: machine.initial
        ? { kind: 'machineState', id: referenceId(machine.initial, 'machineState') }
        : null,
      inputs: machine.inputs.map((input) => ({
        ref: { kind: 'machineInput', id: input.id },
        name: input.name,
        type: input.type,
        value: input.value,
      })),
      states: machine.states.map((state) => ({
        ref: { kind: 'machineState', id: state.id },
        name: state.name,
        type: state.type,
        timeline: state.timeline
          ? { kind: 'timeline', id: referenceId(state.timeline, 'timeline') }
          : null,
      })),
      transitions: machine.transitions.map((transition) => ({
        ref: { kind: 'machineTransition', id: transition.id },
        from: { kind: 'machineState', id: referenceId(transition.from, 'machineState') },
        to: { kind: 'machineState', id: referenceId(transition.to, 'machineState') },
        duration: transition.duration,
        after: transition.after,
        conditions: transition.conditions.map((condition) => ({
          id: condition.id,
          input: { kind: 'machineInput', id: referenceId(condition.input, 'machineInput') },
          op: condition.op,
          ...(condition.value !== undefined ? { value: condition.value } : {}),
        })),
      })),
    })),
  };
}
