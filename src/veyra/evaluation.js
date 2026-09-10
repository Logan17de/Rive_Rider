import { IDENTITY_MATRIX, multiplyMatrices, transformMatrix } from './contracts.js';
import { cloneValue, normalizeDocument } from './model.js';
import { propertyTargetStatus, writeProperty } from './properties.js';
import { referenceId } from './references.js';
import { evaluateRig } from './rigging.js';
import { artboardById } from './projectGraph.js';
import { evaluateComponentContent } from './components.js';
import { createVeyraDataRuntime } from './dataGraph.js';

// Internal observation handoff. JSON options cannot spoof an evaluated context.
export const OBSERVED_EVALUATION_CONTEXT = Symbol('veyra-observed-evaluation-context');

export const VEYRA_EVALUATION_ORDER = Object.freeze([
  'authored',
  'animation',
  'playback',
  'data-binding',
  'constraints',
  'interactive',
]);

function layerEntries(layer) {
  if (!layer) return [];
  if (layer instanceof Map) return [...layer.entries()];
  if (Array.isArray(layer)) return layer.map((entry) => [entry.address, entry.value]);
  if (typeof layer === 'object') return Object.entries(layer);
  throw new TypeError('Evaluation layers must be a Map, record, or address/value array.');
}

function applyLayer(document, layer, source, sources) {
  for (const [address, value] of layerEntries(layer)) {
    const status = propertyTargetStatus(document, address);
    if (status === 'missing-target') {
      throw new TypeError(`${source} property target ${address} does not exist.`);
    }
    if (status !== 'animatable') {
      throw new TypeError(`${source} cannot drive non-animatable property ${address}.`);
    }
    writeProperty(document, address, value);
    sources[address] = source;
  }
}

function evaluateNodes(document) {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const localMatrices = new Map();
  const worldMatrices = new Map();
  const worldMatrixFor = (node) => {
    if (worldMatrices.has(node.id)) return worldMatrices.get(node.id);
    const local = transformMatrix(node.transform);
    localMatrices.set(node.id, local);
    const parentId = referenceId(node.parent, 'node');
    const parent = parentId ? byId.get(parentId) : null;
    const world = parent
      ? multiplyMatrices(worldMatrixFor(parent), local)
      : multiplyMatrices(IDENTITY_MATRIX, local);
    worldMatrices.set(node.id, world);
    return world;
  };
  const nodes = document.nodes.map((node) => ({
    ...cloneValue(node),
    localMatrix: [...(localMatrices.get(node.id) || transformMatrix(node.transform))],
    worldMatrix: [...worldMatrixFor(node)],
  }));
  return { nodes, worldMatrices };
}

export function evaluateDocument(authoredDocument, layers = {}, animationPlayback = null, options = {}) {
  if (options.observe) {
    return evaluateDocument(authoredDocument, layers, animationPlayback, { ...options, observe: false,
      dataRuntime: options.dataRuntime?.fork() || createVeyraDataRuntime(authoredDocument),
      componentRuntime: options.componentRuntime?.fork() || null,
    });
  }
  let evaluatedDocument = normalizeDocument(authoredDocument);
  const sources = {};
  const diagnostics = { collisions: [] };

  // Apply machine animation first, then playback, preserving today's
  // playback-wins precedence while retaining both contributors long enough to
  // report contested addresses and attribute playback errors correctly.
  const animationLayer = layers.animation || {};
  let playbackOverrides = null;
  if (animationPlayback && typeof animationPlayback.evaluate === 'function') {
    playbackOverrides = animationPlayback.evaluate();
    const animationAddresses = new Set(layerEntries(animationLayer).map(([address]) => address));
    for (const [address] of layerEntries(playbackOverrides)) {
      if (animationAddresses.has(address)) {
        diagnostics.collisions.push({ address, sources: ['animation', 'playback'] });
      }
    }
  }

  applyLayer(evaluatedDocument, animationLayer, 'animation', sources);
  applyLayer(evaluatedDocument, playbackOverrides, 'playback', sources);
  evaluatedDocument = normalizeDocument(evaluatedDocument);
  const dataRuntime = options.dataRuntime || createVeyraDataRuntime(evaluatedDocument);
  const dataResult = dataRuntime.evaluateBindings(evaluatedDocument, {
    artboardId: String(options.artboardId || evaluatedDocument.artboards[0]?.id || ''),
    scopePath: options.runtimeScopePath || [],
  });
  applyLayer(evaluatedDocument, dataResult.overrides, 'data-binding', sources);
  applyLayer(evaluatedDocument, layers.constraints, 'constraints', sources);
  // Position controls need to reach the solver before it runs. The same
  // interactive layer is reapplied after solving so direct bone overrides win.
  applyLayer(evaluatedDocument, layers.interactive, 'interactive', sources);
  evaluatedDocument = normalizeDocument(evaluatedDocument);

  let nodeResult = evaluateNodes(evaluatedDocument);
  const solvedRig = evaluateRig(evaluatedDocument, nodeResult.worldMatrices);
  for (const address of solvedRig.drivenProperties) {
    if (sources[address] !== 'interactive') sources[address] = 'constraints';
  }

  applyLayer(evaluatedDocument, layers.interactive, 'interactive', sources);
  evaluatedDocument = normalizeDocument(evaluatedDocument);
  nodeResult = evaluateNodes(evaluatedDocument);
  const rig = evaluateRig(evaluatedDocument, nodeResult.worldMatrices, {
    solve: false,
    constraintDiagnostics: solvedRig.diagnostics.constraints,
  });

  const artboardId = String(options.artboardId || evaluatedDocument.artboards[0]?.id || '');
  const activeArtboard = artboardById(evaluatedDocument, artboardId);
  if (!activeArtboard) throw new TypeError(`Evaluation artboard ${artboardId} does not exist.`);
  const owned = (item) => item.artboard?.id === artboardId;
  const baseNodes = nodeResult.nodes.filter(owned);
  const baseScene = {
    kind: 'veyra-evaluated-scene',
    documentId: evaluatedDocument.id,
    name: evaluatedDocument.name,
    version: evaluatedDocument.version,
    conventions: cloneValue(evaluatedDocument.conventions),
    artboard: cloneValue(activeArtboard),
    artboards: cloneValue(evaluatedDocument.artboards),
    components: cloneValue(evaluatedDocument.components),
    componentInstances: cloneValue(evaluatedDocument.componentInstances.filter(owned)),
    assets: cloneValue(evaluatedDocument.assets),
    propertyGroups: cloneValue(evaluatedDocument.propertyGroups.filter(owned)),
    semantics: cloneValue(evaluatedDocument.semantics),
    nodes: baseNodes,
    bones: cloneValue(rig.bones.filter(owned)),
    meshes: cloneValue(rig.meshes.filter(owned)),
    controls: cloneValue(rig.controls.filter(owned)),
    constraints: cloneValue(rig.constraints.filter(owned)),
    diagnostics: cloneValue({
      ...rig.diagnostics,
      collisions: [
        ...(rig.diagnostics?.collisions || []),
        ...diagnostics.collisions,
      ],
    }),
    evaluationOrder: [...VEYRA_EVALUATION_ORDER],
    ...(options.componentContext ? { componentContext: cloneValue(options.componentContext) } : {}),
    sources,
    data: cloneValue({
      bindingOwnership: dataResult.ownership,
      virtualValues: dataResult.virtualValues || {},
      diagnostics: dataResult.diagnostics,
      stats: dataResult.stats,
      runtimeScopePath: options.runtimeScopePath || [],
    }),
  };
  const finish = scene => {
    options.onEvaluatedScope?.({ scene, sourceDocument: authoredDocument, layers, componentContext: options.componentContext || null,
      runtimeScopePath: options.runtimeScopePath || [], dataRuntime, componentRuntime: options.componentRuntime || null });
    return scene;
  };
  if (options.includeComponents === false) return finish({
    ...baseScene,
    componentEvaluatedNodes: [],
    componentEvaluatedBones: [],
    componentEvaluatedMeshes: [],
    componentEvaluatedControls: [],
    componentEvaluatedConstraints: [],
  });
  const componentContent = evaluateComponentContent({
    document: evaluatedDocument,
    artboardId,
    baseScene,
    runtimeRegistry: options.componentRuntime || null,
    depth: Number(options.depth || 0),
    componentPath: options.componentPath || [],
    runtimeScopePath: options.runtimeScopePath || [],
    evaluateSource: (sourceDocument, sourceArtboardId, sourceLayers, nested = {}) => evaluateDocument(
      sourceDocument, sourceLayers, null, {
        ...options,
        ...nested,
        artboardId: sourceArtboardId,
        componentRuntime: options.componentRuntime || null,
        includeComponents: true,
      },
    ),
  });
  return finish({
    ...baseScene,
    nodes: [...baseNodes, ...componentContent.nodes],
    bones: [...baseScene.bones, ...componentContent.bones],
    meshes: [...baseScene.meshes, ...componentContent.meshes],
    controls: [...baseScene.controls, ...componentContent.controls],
    constraints: [...baseScene.constraints, ...componentContent.constraints],
    componentEvaluatedNodes: componentContent.nodes,
    componentEvaluatedBones: componentContent.bones,
    componentEvaluatedMeshes: componentContent.meshes,
    componentEvaluatedControls: componentContent.controls,
    componentEvaluatedConstraints: componentContent.constraints,
  });
}

export function propertySource(scene, address) {
  if (scene?.kind !== 'veyra-evaluated-scene') throw new TypeError('propertySource requires an evaluated Veyra scene.');
  return scene.sources[address] || 'authored';
}
