import { nodeCapabilities, rigCapabilities, VEYRA_SEMANTIC_CAPABILITIES } from './capabilities.js';
import { cloneValue, semanticFor } from './model.js';
import { VEYRA_MACHINE_CAPABILITIES } from './stateMachine.js';
import {
  createDocumentRef,
  createArtboardRef,
  createComponentRef,
  createComponentInstanceRef,
  createComponentOverrideRef,
  createGradientStopRef,
  createMachineConditionRef,
  createMachineInputRef,
  createMachineStateRef,
  createMachineTransitionRef,
  createListenerRef,
  createMeshVertexRef,
  createNodeRef,
  createPathVertexRef,
  createPaintRef,
  createStateMachineRef,
  createTimelineRef,
  createSemanticRecordRef,
  referenceId,
} from './references.js';

function paintSummary(paint, ownerKind, ownerId) {
  const stops = paint?.fill?.stops || [];
  return {
    ref: createPaintRef(ownerKind, ownerId),
    fillType: paint?.fill?.type || 'solid',
    gradientStops: stops.map((stop) => ({
      ref: createGradientStopRef(stop.id),
      offset: stop.offset,
      color: stop.color,
      opacity: stop.opacity,
    })),
  };
}


function semanticSummary(record) {
  return {
    ref: createSemanticRecordRef(record.id),
    target: cloneValue(record.target),
    namespace: record.namespace,
    canonicalRole: record.canonicalRole,
    description: record.description,
    tags: [...record.tags],
    aliases: cloneValue(record.aliases),
    relations: cloneValue(record.relations),
    provenance: cloneValue(record.provenance),
    status: record.status,
    capabilities: cloneValue(VEYRA_SEMANTIC_CAPABILITIES),
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
      artboards: document.artboards.map((artboard) => ({ ref: createArtboardRef(artboard.id), ...cloneValue(artboard) })),
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
    data: {
      viewModels: (document.viewModels || []).map((model) => ({ ref: { kind: 'viewModel', id: model.id }, name: model.name, properties: model.properties.map((property) => ({ ref: { kind: 'dataProperty', id: property.id }, name: property.name, type: property.type, readable: property.readable, writable: property.writable, bindable: property.bindable, ...(property.defaultValue !== undefined ? { defaultValue: cloneValue(property.defaultValue) } : {}) })) })),
      instances: (document.viewModelInstances || []).map((instance) => ({ ref: { kind: 'viewModelInstance', id: instance.id }, name: instance.name, viewModel: cloneValue(instance.viewModel), artboard: cloneValue(instance.artboard), initialValues: cloneValue(instance.initialValues) })),
      enums: cloneValue(document.enums || []),
      converters: cloneValue(document.converters || []),
      propertyGroups: cloneValue(document.propertyGroups || []),
      lists: cloneValue(document.lists || []),
      bindings: cloneValue(document.bindings || []),
      runtimeStateSerialized: false,
    },
    semantics: document.semantics.map(semanticSummary),
    components: (document.components || []).map((component) => ({
      ref: createComponentRef(component.id),
      name: component.name,
      displayNameAdvisory: true,
      source: cloneValue(component.source),
      semantics: document.semantics.filter((record) => record.target.kind === 'component' && record.target.id === component.id).map(semanticSummary),
    })),
    componentInstances: (document.componentInstances || []).map((instance) => ({
      ref: createComponentInstanceRef(instance.id),
      name: instance.name,
      artboard: cloneValue(instance.artboard),
      component: cloneValue(instance.component),
      parent: cloneValue(instance.parent),
      transform: cloneValue(instance.transform),
      frame: cloneValue(instance.frame),
      fit: instance.fit, alignX: instance.alignX, alignY: instance.alignY, clip: instance.clip,
      opacity: instance.opacity, visible: instance.visible,
      overrides: instance.overrides.map((override) => ({ ref: createComponentOverrideRef(override.id), ...cloneValue(override) })),
      runtime: cloneValue(instance.runtime),
      semantics: document.semantics.filter((record) => record.target.kind === 'componentInstance' && record.target.id === instance.id).map(semanticSummary),
    })),
    objects: document.nodes.map((node) => {
      const semantic = semanticFor(document, node.id);
      const summary = {
        ref: { kind: 'node', id: node.id },
        type: node.type,
        name: node.name,
        parent: cloneValue(node.parent),
        artboard: cloneValue(node.artboard),
        paint: paintSummary(node.paint, 'node', node.id),
        visible: node.visible,
        locked: node.locked,
        semantics: semantic
          ? { ...semanticSummary(semantic), role: semantic.canonicalRole, target: createNodeRef(node.id) }
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
        artboard: cloneValue(bone.artboard),
        length: bone.length,
        capabilities: rigCapabilities('bone', bone),
      })),
      meshes: document.meshes.map((mesh) => ({
        ref: { kind: 'mesh', id: mesh.id },
        name: mesh.name,
        artboard: cloneValue(mesh.artboard),
        paint: paintSummary(mesh.paint, 'mesh', mesh.id),
        vertexRefs: mesh.vertices.map((vertex) => createMeshVertexRef(vertex.id)),
        vertexCount: mesh.vertices.length,
        triangleCount: mesh.triangles.length,
        capabilities: rigCapabilities('mesh', mesh),
        ...(includeGeometry ? { vertices: cloneValue(mesh.vertices), triangles: cloneValue(mesh.triangles) } : {}),
      })),
      controls: document.controls.map((control) => ({
        ref: { kind: 'control', id: control.id },
        kind: control.kind,
        artboard: cloneValue(control.artboard),
        name: control.name,
        position: cloneValue(control.position),
        capabilities: rigCapabilities('control', control),
      })),
      constraints: document.constraints.map((constraint) => ({
        ref: { kind: 'constraint', id: constraint.id },
        type: constraint.type,
        artboard: cloneValue(constraint.artboard),
        name: constraint.name,
        enabled: constraint.enabled,
        strength: constraint.strength,
        capabilities: rigCapabilities('constraint', constraint),
      })),
    },
    stateMachines: (document.stateMachines || []).map((machine) => ({
      ref: createStateMachineRef(machine.id),
      name: machine.name,
      artboard: cloneValue(machine.artboard),
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
      artboard: cloneValue(listener.artboard),
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
