import assert from 'node:assert/strict';
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
  const hostNode = createNode('rectangle', {
    id: 'host-node', artboard: createArtboardRef('host'), transform: { x: 5, y: 5 },
    geometry: { width: 10, height: 10 }, paint: { fill: '#000000', stroke: 'none', strokeWidth: 0 },
  });
  const a = constantTimeline('timeline-a', 'source', 'node:runtime-node/transform/x', 20);
  const b = createTimeline({
    id: 'timeline-b', name: 'timeline-b', duration: 30, fps: 30,
    tracks: [{ id: 'timeline-b-track', address: 'node:runtime-node/transform/x', keyframes: [
      { id: 'timeline-b-0', frame: 0, value: 110, easing: 'linear' },
      { id: 'timeline-b-30', frame: 30, value: 210, easing: 'linear' },
    ] }],
  });
  b.artboard = createArtboardRef('source');
  const host = constantTimeline('host-timeline', 'host', 'node:host-node/transform/x', 999);
  const ma = animationMachine('machine-a', 'source', 'timeline-a');
  const mb = animationMachine('machine-b', 'source', 'timeline-b');
  return normalizeDocument(createDocument({
    id: 'm6-runtime-correction',
    artboards: [
      { id: 'source', name: 'Source', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 500, height: 300, background: '#eeeeee' },
    ],
    nodes: [node, hostNode], timelines: [a, b, host], stateMachines: [ma, mb],
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
  assert.equal(one.worldMatrix[4], 210, 'instance one uses its own remapped runtime clock');
  assert.equal(two.worldMatrix[4], 110, 'instance two keeps its own remapped runtime clock');
  assert.notEqual(one.worldMatrix[4], two.worldMatrix[4], 'runtime clocks are observably isolated even when both remap to one source timeline');
  assert.notEqual(registry.evaluate('remap-one').mappings.timeline[0].timeSeconds, registry.evaluate('remap-two').mappings.timeline[0].timeSeconds);

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
    { id: 'rv3', x: 50, y: 60, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
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
  assert.deepEqual(source.meshes[0].deformedVertices.map(({ x, y }) => ({ x, y })), [{ x: 50, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 60 }, { x: 50, y: 60 }], 'source rig remains authored/rest-driven');
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
