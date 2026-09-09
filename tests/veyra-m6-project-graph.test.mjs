import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { createArtboardResizeGesture } from '../src/veyra/gestures.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import {
  createDocument, createNode, createTimeline, createStateMachine, normalizeDocument,
} from '../src/veyra/model.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { getDependencyGraph } from '../src/veyra/dependencyGraph.js';
import { buildSemanticIndex, resolveSemantic } from '../src/veyra/resolver.js';
import {
  createArtboardRef, createComponentRef, createNodeRef, createTimelineRef,
} from '../src/veyra/references.js';
import {
  VEYRA_PROJECT_VERSION, componentInstanceSourceMatrix, createComponentRuntimeRegistry,
} from '../src/index.js';
import { VeyraStore } from '../src/veyra/store.js';
import { transformPoint } from '../src/veyra/contracts.js';
import { fitArtboardViewport } from '../src/veyra/workspace.js';

const legacy = {
  ...createDocument({ id: 'doc-m6-legacy', name: 'Legacy', artboard: { x: 40, y: 25, width: 800, height: 600, background: '#ffffff' } }),
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  nodes: [createNode('rectangle', { id: 'legacy-node', name: 'Legacy Node', transform: { x: 200, y: 150 }, geometry: { width: 80, height: 50 } })],
};
const migrated = normalizeDocument(legacy);
assert.equal(migrated.version, VEYRA_PROJECT_VERSION);
assert.equal(migrated.artboards.length, 1);
assert.equal(migrated.artboard, migrated.artboards[0], 'compatibility alias points at canonical first frame object');
assert.deepEqual({ x: migrated.artboards[0].x, y: migrated.artboards[0].y }, { x: 40, y: 25 }, 'M5 frame origin migrates exactly');
assert.equal(migrated.nodes[0].id, 'legacy-node', 'migration preserves existing stable ids');
assert.equal(migrated.nodes[0].artboard.id, migrated.artboards[0].id, 'legacy scene content gains explicit owner');
const migratedText = serializeVeyra(migrated);
assert.equal(JSON.parse(migratedText).artboard, undefined, 'v5 persistence has no singular artboard source of truth');
assert.deepEqual(parseVeyra(migratedText), migrated, 'migrated v5 round-trip is canonical');

assert.throws(() => normalizeDocument(createDocument({
  id: 'ambiguous-owner',
  artboards: [
    { id: 'a', name: 'A', x: 0, y: 0, width: 100, height: 100, background: '#ffffff' },
    { id: 'b', name: 'B', x: 200, y: 0, width: 100, height: 100, background: '#ffffff' },
  ],
  nodes: [createNode('rectangle', { id: 'unowned' })],
})), /artboard is required/, 'multi-artboard content cannot rely on implicit ownership');

function baseProject() {
  const sourceNode = createNode('rectangle', {
    id: 'source-node', name: 'Display Source', artboard: createArtboardRef('source'),
    transform: { x: 50, y: 60 }, geometry: { width: 40, height: 30 },
    paint: { fill: '#ff0000', stroke: 'none', strokeWidth: 0 },
  });
  const timeline = createTimeline({
    id: 'source-timeline', name: 'Pulse', duration: 30, fps: 30,
    tracks: [{ id: 'source-track', address: 'node:source-node/transform/x', keyframes: [
      { id: 'kf0', frame: 0, value: 50, easing: 'linear' },
      { id: 'kf1', frame: 30, value: 150, easing: 'linear' },
    ] }],
  });
  timeline.artboard = createArtboardRef('source');
  const idle = { id: 'idle', name: 'Idle', type: 'animation', timeline: createTimelineRef('source-timeline') };
  const active = { id: 'active', name: 'Active', type: 'animation', timeline: createTimelineRef('source-timeline') };
  const machine = createStateMachine({
    id: 'source-machine', name: 'Local Machine', initial: { kind: 'machineState', id: 'idle' },
    inputs: [{ id: 'enabled', name: 'Enabled', type: 'bool', value: false }],
    states: [idle, active],
    transitions: [{ id: 'go', from: { kind: 'machineState', id: 'idle' }, to: { kind: 'machineState', id: 'active' }, duration: 0, conditions: [{ id: 'cond', input: { kind: 'machineInput', id: 'enabled' }, op: '==', value: true }] }],
  });
  machine.artboard = createArtboardRef('source');
  return normalizeDocument(createDocument({
    id: 'project-m6', name: 'M6 Project',
    artboards: [
      { id: 'source', name: 'Source', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 400, y: 20, width: 600, height: 400, background: '#eeeeee' },
      { id: 'other', name: 'Other', x: 1100, y: 20, width: 300, height: 300, background: '#dddddd' },
    ],
    nodes: [sourceNode], timelines: [timeline], stateMachines: [machine],
    semantics: [{ id: 'semantic-source', target: createNodeRef('source-node'), canonicalRole: 'hero-shape', tags: ['source'], provenance: { source: 'user' }, status: 'confirmed' }],
  }));
}

let store = new VeyraStore(baseProject());
const control = createVeyraControlPlane(store);
const originalSource = JSON.stringify(store.document.nodes.find((node) => node.id === 'source-node'));

const previewComponent = control.previewCommand({ action: 'createComponent', args: { artboardId: 'source', overrides: { name: 'Badge' } }, command: { source: 'ai', label: 'Preview badge component' } });
assert.equal(previewComponent.ok, true);
assert.equal(store.document.components.length, 0, 'preview never mutates project graph');
const createComponentResult = control.dispatchCommand({ action: 'createComponent', args: { artboardId: 'source', overrides: { name: 'Badge' } }, command: { source: 'ai', label: 'Create badge component' } });
assert.equal(createComponentResult.ok, true);
assert.equal(createComponentResult.result, previewComponent.result, 'same snapshot preview/dispatch use the same implicit stable component id');
const componentId = createComponentResult.result;
assert.equal(store.document.artboards.find((item) => item.id === 'source').componentSource.id, componentId);

const firstInstancePreview = control.previewCommand({ action: 'addComponentInstance', args: { componentId, overrides: { name: 'One', artboard: createArtboardRef('host'), transform: { x: 450, y: 80 }, fit: 'none' } } });
assert.equal(firstInstancePreview.ok, true);
const firstInstanceDispatch = control.dispatchCommand({ action: 'addComponentInstance', args: { componentId, overrides: { name: 'One', artboard: createArtboardRef('host'), transform: { x: 450, y: 80 }, fit: 'none' } } });
assert.equal(firstInstanceDispatch.result, firstInstancePreview.result);
const instance1 = firstInstanceDispatch.result;
const instance2 = control.dispatchCommand({ action: 'addComponentInstance', args: { componentId, overrides: { name: 'Two', artboard: createArtboardRef('host'), transform: { x: 700, y: 80 }, fit: 'none' } } }).result;
assert.notEqual(instance2, instance1, 'repeated successful implicit create gets a fresh deterministic id');
assert.equal(JSON.stringify(store.document.nodes.find((node) => node.id === 'source-node')), originalSource, 'instance creation never clones/mutates source authored node');

const sourceBeforeOverride = store.document.nodes.find((node) => node.id === 'source-node').transform.x;
const overridePreview = control.previewCommand({ action: 'setComponentOverride', args: { instanceId: instance1, override: { target: createNodeRef('source-node'), address: 'node:source-node/transform/x', value: 90 } } });
assert.equal(overridePreview.ok, true);
const overrideDispatch = control.dispatchCommand({ action: 'setComponentOverride', args: { instanceId: instance1, override: { target: createNodeRef('source-node'), address: 'node:source-node/transform/x', value: 90 } } });
assert.equal(overrideDispatch.result, overridePreview.result);
assert.equal(store.document.nodes.find((node) => node.id === 'source-node').transform.x, sourceBeforeOverride, 'instance override cannot mutate source');

const hostScene = evaluateDocument(store.document, {}, null, { artboardId: 'host' });
const instanceNode = hostScene.nodes.find((node) => node.componentInstanceRef?.id === instance1 && node.sourceRef?.id === 'source-node');
assert.ok(instanceNode, 'component source expands only in evaluated host scene');
assert.match(instanceNode.id, new RegExp(`^componentEval:${instance1}:`));
assert.equal(store.document.nodes.some((node) => node.id === instanceNode.id), false, 'evaluated descendant identity is never authored');
assert.equal(Math.round(instanceNode.worldMatrix[4]), 540, 'override participates in evaluated instance transform');
assert.equal(evaluateDocument(store.document, {}, null, { artboardId: 'source' }).nodes.find((node) => node.id === 'source-node').worldMatrix[4], 50, 'source render remains unchanged');

const registry = createComponentRuntimeRegistry(() => store.document);
registry.setTimelineTime(instance1, 'source-timeline', 0.5);
registry.setTimelineTime(instance2, 'source-timeline', 1.0);
const runtimeScene = evaluateDocument(store.document, {}, null, { artboardId: 'host', componentRuntime: registry });
const r1 = runtimeScene.nodes.find((node) => node.componentInstanceRef?.id === instance1 && node.sourceRef?.id === 'source-node');
const r2 = runtimeScene.nodes.find((node) => node.componentInstanceRef?.id === instance2 && node.sourceRef?.id === 'source-node');
assert.notEqual(Math.round(r1.worldMatrix[4]), Math.round(r2.worldMatrix[4]), 'two instances keep independent timeline runtime state');
registry.setMachineInput(instance1, 'source-machine', 'enabled', true);
registry.stepMachine(instance1, 'source-machine', 1 / 60);
assert.equal(registry.machineRuntime(instance1, 'source-machine').evaluate().stateId, 'active');
assert.equal(registry.machineRuntime(instance2, 'source-machine').evaluate().stateId, 'idle', 'machine runtime is isolated per instance');

const i1 = store.document.componentInstances.find((item) => item.id === instance1);
const fitMatrix = componentInstanceSourceMatrix(store.document, { ...i1, fit: 'contain', frame: { width: 400, height: 400 }, alignX: 'center', alignY: 'end' });
assert.ok(fitMatrix.every(Number.isFinite), 'fit/alignment mapping is deterministic and finite');

const dependency = getDependencyGraph(store.document, { kind: 'componentInstance', id: instance1 }, { depth: 3, maxNodes: 200, maxEdges: 500 });
assert.equal(dependency.status, 'ok');
assert.ok(dependency.edges.some((edge) => edge.type === 'dependsOn' && edge.to?.ref?.kind === 'component' && edge.to.ref.id === componentId), 'instance dependency points to source component');
assert.ok(dependency.edges.some((edge) => edge.type === 'writes' && edge.to?.address === 'node:source-node/transform/x'), 'override property write is explicit');

control.dispatchCommand({ action: 'addSemantic', args: { target: { kind: 'component', id: componentId }, overrides: { canonicalRole: 'reusable-badge', provenance: { source: 'user' }, status: 'confirmed' } } });
control.dispatchCommand({ action: 'addSemantic', args: { target: { kind: 'componentInstance', id: instance1 }, overrides: { canonicalRole: 'primary-badge-instance', provenance: { source: 'user' }, status: 'confirmed' } } });
let resolved = resolveSemantic(store.document, { kind: 'component', semantic: { role: 'reusable-badge' } });
assert.equal(resolved.status, 'resolved'); assert.equal(resolved.target.id, componentId);
control.dispatchCommand({ action: 'updateArtboard', args: { artboardId: 'source', changes: { name: 'Misleading Screen' } } });
control.dispatchCommand({ action: 'updateComponentInstance', args: { instanceId: instance1, changes: { name: 'Totally Different Name' } } });
resolved = resolveSemantic(store.document, { kind: 'componentInstance', semantic: { role: 'primary-badge-instance' } });
assert.equal(resolved.target.id, instance1, 'component resolution is independent of display names');

const manifest = createProjectManifest(store.document);
assert.equal(manifest.document.counts.artboards, 3);
assert.equal(manifest.document.counts.components, 1);
assert.equal(manifest.document.counts.componentInstances, 2);
assert.ok(manifest.capabilities.includes('components.independent-runtime'));
assert.ok(manifest.actions.some((action) => action.command === 'addArtboard'));
const index = buildSemanticIndex(store.document);
assert.ok(index.entities.some((entity) => entity.ref.kind === 'artboard' && entity.ref.id === 'host'));
assert.ok(index.entities.some((entity) => entity.ref.kind === 'component' && entity.ref.id === componentId));
assert.ok(index.entities.some((entity) => entity.ref.kind === 'componentInstance' && entity.ref.id === instance1));

assert.equal(control.dispatchCommand({ action: 'removeComponent', args: { componentId, options: {} } }).ok, false, 'live component instance blocks source deletion');
assert.equal(control.dispatchCommand({ action: 'removeArtboard', args: { artboardId: 'source', options: {} } }).ok, false, 'live source artboard deletion fails closed');

const duplicatePreview = control.previewCommand({ action: 'duplicateArtboard', args: { artboardId: 'source', options: { name: 'Source Copy' } } });
assert.equal(duplicatePreview.ok, true);
const duplicateDispatch = control.dispatchCommand({ action: 'duplicateArtboard', args: { artboardId: 'source', options: { name: 'Source Copy' } } });
assert.equal(duplicateDispatch.result.artboardId, duplicatePreview.result.artboardId);
const duplicatedNodeId = duplicateDispatch.result.idMap['node:source-node'];
assert.ok(duplicatedNodeId && duplicatedNodeId !== 'source-node');
assert.equal(store.document.nodes.find((node) => node.id === duplicatedNodeId).artboard.id, duplicateDispatch.result.artboardId);
assert.equal(store.document.semantics.find((record) => record.target.id === duplicatedNodeId)?.canonicalRole, 'hero-shape', 'artboard duplication remaps semantic target identity');

// Cross-artboard hierarchy and animation references are structurally invalid.
assert.throws(() => normalizeDocument({
  ...serializeRoundTrip(store.document),
  nodes: [...store.document.nodes, createNode('group', { id: 'cross-parent', artboard: createArtboardRef('other') }), createNode('rectangle', { id: 'cross-child', artboard: createArtboardRef('host'), parent: createNodeRef('cross-parent') })],
}), /crosses artboards/);

// Deterministic component cycles are rejected with evidence instead of recursing forever.
const cycleDoc = serializeRoundTrip(store.document);
cycleDoc.components.push({ id: 'host-component', name: 'Host Component', source: createArtboardRef('host') });
cycleDoc.componentInstances.push({ id: 'nested-back', name: 'Nested Back', artboard: createArtboardRef('source'), component: createComponentRef('host-component'), transform: {}, frame: { width: 100, height: 100 }, fit: 'contain', alignX: 'center', alignY: 'center', clip: false, overrides: [], runtime: { mix: 1, remap: {} } });
assert.throws(() => normalizeDocument(cycleDoc), /Component cycle detected/);

// Hit testing sees evaluated instance geometry, not authored clones.
const viewport = { width: 800, height: 600, zoom: 1, centerX: 700, centerY: 220 };
const hitScene = evaluateDocument(store.document, {}, null, { artboardId: 'host' });
const hitNode = hitScene.nodes.find((node) => node.componentInstanceRef?.id === instance1 && node.sourceRef?.id === 'source-node');
const hitScreen = transformPoint((await import('../src/veyra/viewport.js')).createSvgViewBoxScreenTransform(hitScene.artboard, viewport).matrix, { x: hitNode.worldMatrix[4], y: hitNode.worldMatrix[5] });
assert.equal(hitTestPoint(hitScreen, hitScene, viewport)?.id, hitNode.id);
assert.match(renderSvgString(hitScene), new RegExp(`id=\\"${hitNode.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`), 'SVG render includes evaluated instance geometry');

// Active-artboard frame resize modifies only that frame and leaves other camera/world data alone.
{
  const resizeStore = new VeyraStore(store.document);
  const hostBefore = structuredClone(resizeStore.document.artboards.find((item) => item.id === 'host'));
  const otherBefore = structuredClone(resizeStore.document.artboards.find((item) => item.id === 'other'));
  const g = createArtboardResizeGesture({ store: resizeStore, artboardId: 'host', start: { x: 0, y: 0 }, startArtboard: hostBefore, direction: 'left', scaleX: 1, scaleY: 1 });
  g.move({ clientX: 20, clientY: 0 }); g.end();
  assert.equal(resizeStore.document.artboards.find((item) => item.id === 'host').x, hostBefore.x + 20);
  assert.deepEqual(resizeStore.document.artboards.find((item) => item.id === 'other'), otherBefore);
}
const fit = fitArtboardViewport(store.document.artboards.find((item) => item.id === 'other'), { width: 700, height: 500 }, { padding: 32 });
assert.equal(fit.centerX, 1250); assert.equal(fit.centerY, 170, 'Fit Artboard uses selected non-zero frame origin');

const browser = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
assert.match(browser, /let activeArtboardId = null/);
assert.match(browser, /evaluateDocument\(store\.document, layers, null, \{[\s\S]*artboardId: activeArtboard\(\)\.id,[\s\S]*componentRuntime: componentRuntimeRegistry,[\s\S]*dataRuntime,[\s\S]*\}\);/);
for (const action of ['addArtboard','updateArtboard','duplicateArtboard','removeArtboard','createComponent','removeComponent','addComponentInstance','updateComponentInstance','removeComponentInstance','setComponentOverride','removeComponentOverride']) {
  assert.match(browser, new RegExp(`dispatchCompatibilityCommand\\('${action}'`), `${action} human/script mutation must route through canonical dispatcher`);
}

// Undo/redo project graph transaction remains exact.
const beforeUndo = serializeVeyra(store.document);
const addedArtboard = control.dispatchCommand({ action: 'addArtboard', args: { overrides: { name: 'Undo Board', x: 1500, y: 0, width: 200, height: 200, background: '#ffffff' } } }).result;
assert.ok(store.document.artboards.some((item) => item.id === addedArtboard));
assert.equal(store.undo(), true); assert.equal(serializeVeyra(store.document), beforeUndo);
assert.equal(store.redo(), true); assert.ok(store.document.artboards.some((item) => item.id === addedArtboard));

function serializeRoundTrip(document) { return JSON.parse(serializeVeyra(document)); }

console.log('veyra M6 multi-artboard/components/project-graph tests passed');
