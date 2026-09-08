import {
  cloneValue,
  machineById,
  normalizeDocument,
  timelineById,
} from './model.js';
import { evaluateDocument, propertySource } from './evaluation.js';
import { evaluateTimeline } from './animation.js';
import {
  parsePropertyAddress,
  propertyTargetStatus,
  readProperty,
} from './properties.js';
import { referenceId, referencesEqual } from './references.js';
import { buildSemanticIndex, queryEntities, resolveSemantic } from './resolver.js';
import { getDependencyGraph } from './dependencyGraph.js';
import { createProjectManifest } from './manifest.js';
import {
  VEYRA_COMMAND_TABLE,
  dispatchVeyraCommand,
} from './commands.js';
import { VeyraStore } from './store.js';
import { VEYRA_SERVICE_NAMES } from './serviceRegistry.js';

const PLAN_FORBIDDEN_ACTIONS = new Set([
  'select', 'removeSelection', 'replaceDocument', 'begin', 'commit', 'cancel', 'undo', 'redo',
]);

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return Object.is(value, -0) ? 0 : value;
}

function stableString(value) {
  return JSON.stringify(stableObject(value));
}

function sameValue(left, right) {
  return stableString(left) === stableString(right);
}

function targetRef(refOrAddress) {
  if (typeof refOrAddress === 'string' || refOrAddress?.address) return null;
  const ref = refOrAddress?.ref || refOrAddress;
  return ref?.kind && ref?.id ? { kind: String(ref.kind), id: String(ref.id) } : null;
}

function targetAddress(refOrAddress) {
  if (typeof refOrAddress === 'string') return refOrAddress;
  return refOrAddress?.address ? String(refOrAddress.address) : null;
}

function deterministicHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicId(prefix, seed, suffix = '') {
  return `${prefix}_m3_${deterministicHash(`${seed}:${suffix}`)}`;
}

// Snapshot generation is derived only from stable ids and their structural
// locations. Human names, timestamps, authored numeric values, and array order
// do not participate. A successful create changes the stable-id set, while a
// failed preview/dispatch does not, so repeated legitimate creates advance
// deterministically without a mutable counter or wall clock.
function stableIdGeneration(document) {
  const entries = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, path);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id) entries.push(`${path}:${value.id}`);
    for (const key of Object.keys(value).sort()) {
      if (['id', 'name', 'createdAt', 'updatedAt'].includes(key)) continue;
      const child = value[key];
      if (Array.isArray(child)) visit(child, `${path}.${key}`);
      else if (child && typeof child === 'object' && typeof child.id === 'string') visit(child, `${path}.${key}`);
    }
  };
  visit(document, 'document');
  entries.sort();
  return deterministicHash(stableString(entries));
}

function withId(value, prefix, seed, suffix) {
  const next = { ...(value || {}) };
  if (!next.id) next.id = deterministicId(prefix, seed, suffix);
  return next;
}

function prepareCommandDescriptor(document, descriptor, salt = '0') {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return descriptor;
  const next = cloneValue(descriptor);
  next.args = next.args || {};
  const seed = stableString({ documentId: document.id, generation: stableIdGeneration(document), descriptor: next, salt });

  if (next.action === 'add') next.args.options = withId(next.args.options, next.args.type || 'node', seed, 'node');
  if (next.action === 'addSemantic') next.args.overrides = withId(next.args.overrides, 'semantic', seed, 'semantic');
  if (next.action === 'addTimeline') next.args.overrides = withId(next.args.overrides, 'timeline', seed, 'timeline');
  if (next.action === 'addListener') next.args.overrides = withId(next.args.overrides, 'listener', seed, 'listener');
  if (next.action === 'addBone') next.args.overrides = withId(next.args.overrides, 'bone', seed, 'bone');
  if (next.action === 'addMesh') next.args.overrides = withId(next.args.overrides, 'mesh', seed, 'mesh');
  if (next.action === 'addControl') next.args.overrides = withId(next.args.overrides, 'control', seed, 'control');
  if (next.action === 'addConstraint') next.args.overrides = withId(next.args.overrides, 'constraint', seed, 'constraint');
  if (next.action === 'addAsset') next.args.overrides = withId(next.args.overrides, 'asset', seed, 'asset');
  if (next.action === 'addMachineInput') next.args.overrides = withId(next.args.overrides, 'machineInput', seed, 'machineInput');
  if (next.action === 'addMachineState') next.args.overrides = withId(next.args.overrides, 'machineState', seed, 'machineState');
  if (next.action === 'addMachineTransition') {
    next.args.overrides = withId(next.args.overrides, 'machineTransition', seed, 'machineTransition');
    if (Array.isArray(next.args.overrides.conditions)) {
      next.args.overrides.conditions = next.args.overrides.conditions.map((condition, index) => withId(condition, 'machineCondition', seed, `condition:${index}`));
    }
  }
  if (next.action === 'addStateMachine') {
    next.args.overrides = withId(next.args.overrides, 'machine', seed, 'machine');
    if (Array.isArray(next.args.overrides.inputs)) {
      next.args.overrides.inputs = next.args.overrides.inputs.map((input, index) => withId(input, 'machineInput', seed, `input:${index}`));
    }
    if (Array.isArray(next.args.overrides.states)) {
      next.args.overrides.states = next.args.overrides.states.map((state, index) => withId(state, 'machineState', seed, `state:${index}`));
    }
    if (Array.isArray(next.args.overrides.transitions)) {
      next.args.overrides.transitions = next.args.overrides.transitions.map((transition, index) => {
        const prepared = withId(transition, 'machineTransition', seed, `transition:${index}`);
        if (Array.isArray(prepared.conditions)) {
          prepared.conditions = prepared.conditions.map((condition, conditionIndex) => withId(condition, 'machineCondition', seed, `transition:${index}:condition:${conditionIndex}`));
        }
        return prepared;
      });
    }
  }
  if (next.action === 'setKeyframe') {
    if (!next.args.trackId) next.args.trackId = deterministicId('track', seed, 'track');
    if (!next.args.keyframeId) next.args.keyframeId = deterministicId('keyframe', seed, 'keyframe');
  }
  return next;
}

function validationResult(document) {
  try {
    const normalized = normalizeDocument(document);
    return {
      ok: true,
      status: 'valid',
      documentId: normalized.id,
      version: normalized.version,
      errors: [],
    };
  } catch (error) {
    return {
      ok: false,
      status: 'invalid',
      errors: [{ message: String(error?.message || error) }],
    };
  }
}

function runtimeTimelineContext(document, runtimeContext) {
  if (!runtimeContext || typeof runtimeContext !== 'object') return null;
  let timelineId = runtimeContext.timelineId ? String(runtimeContext.timelineId) : null;
  let evidence = null;
  if (!timelineId && runtimeContext.machineId && runtimeContext.stateId) {
    const machine = machineById(document, String(runtimeContext.machineId));
    const state = machine?.states.find((candidate) => candidate.id === String(runtimeContext.stateId));
    timelineId = referenceId(state?.timeline, 'timeline');
    if (timelineId) evidence = { machineId: machine.id, stateId: state.id };
  }
  if (!timelineId) return null;
  const timeline = timelineById(document, timelineId);
  if (!timeline) return { error: `Runtime timeline ${timelineId} does not exist.`, timelineId };
  const timeSeconds = runtimeContext.timeSeconds !== undefined
    ? Number(runtimeContext.timeSeconds)
    : runtimeContext.frame !== undefined
      ? Number(runtimeContext.frame) / timeline.fps
      : 0;
  if (!Number.isFinite(timeSeconds)) return { error: 'runtimeContext time/frame must be finite.', timelineId };
  return {
    timelineId,
    timeSeconds,
    overrides: evaluateTimeline(timeline, timeSeconds, runtimeContext.loop === undefined ? {} : { loop: runtimeContext.loop }),
    evidence,
  };
}

function evaluatedContext(document, options = {}) {
  const layers = cloneValue(options.evaluationLayers || {});
  const runtime = runtimeTimelineContext(document, options.runtimeContext);
  if (runtime?.error) return { error: runtime.error, runtime, scene: null };
  if (runtime?.overrides) layers.animation = { ...(layers.animation || {}), ...runtime.overrides };
  const scene = evaluateDocument(document, layers);
  return { scene, runtime, layers };
}

function trackControllers(document, address) {
  const controllers = [];
  for (const timeline of document.timelines || []) {
    for (const track of timeline.tracks || []) {
      if (track.address !== address) continue;
      const machineStates = (document.stateMachines || []).flatMap((machine) => machine.states
        .filter((state) => referenceId(state.timeline, 'timeline') === timeline.id)
        .map((state) => ({ machine: { kind: 'stateMachine', id: machine.id }, state: { kind: 'machineState', id: state.id } })));
      controllers.push({
        kind: 'animation-track',
        ref: { kind: 'track', id: track.id },
        timeline: { kind: 'timeline', id: timeline.id },
        machineStates,
        evidence: [{ kind: 'track-address', address }],
      });
    }
  }
  return controllers.sort((left, right) => left.ref.id.localeCompare(right.ref.id));
}

function constraintControllers(document, ref) {
  if (!ref || ref.kind !== 'bone') return [];
  const controllers = [];
  for (const constraint of document.constraints || []) {
    const controlledBoneIds = constraint.type === 'ik'
      ? (constraint.bones || []).map((item) => referenceId(item, 'bone'))
      : [referenceId(constraint.bone, 'bone')];
    if (!controlledBoneIds.includes(ref.id)) continue;
    controllers.push({
      kind: 'constraint',
      ref: { kind: 'constraint', id: constraint.id },
      constraintType: constraint.type,
      evidence: [{ kind: 'constraint-controls-bone', ref: cloneValue(ref) }],
    });
  }
  return controllers.sort((left, right) => left.ref.id.localeCompare(right.ref.id));
}

export function getOwnership(documentInput, refOrAddress, options = {}) {
  const document = normalizeDocument(documentInput);
  const address = targetAddress(refOrAddress);
  if (!address) {
    const ref = targetRef(refOrAddress);
    if (!ref) return { status: 'unsupported', reason: 'Ownership target must be a property address or typed reference.' };
    const graph = getDependencyGraph(document, ref, { depth: 1, maxNodes: 200, maxEdges: 500 });
    if (graph.status !== 'ok') return { status: graph.status, target: { ref }, reason: graph.reason };
    const potentialControllers = graph.edges
      .filter((edge) => referencesEqual(edge.to?.ref, ref) && ['controls', 'writes', 'animates', 'runtimeUses'].includes(edge.type))
      .map((edge) => ({ kind: edge.type, source: edge.source, target: cloneValue(edge.from), evidence: [cloneValue(edge.detail)] }));
    return {
      status: 'ok',
      target: { ref },
      authoredValue: null,
      evaluatedValue: null,
      activeOwner: null,
      ownerStack: [],
      potentialControllers,
      writableSource: { kind: 'entity-command-surface', ref: cloneValue(ref) },
      warnings: ['Property-level ownership requires a property address.'],
    };
  }

  let parsed;
  let authoredValue;
  try {
    parsed = parsePropertyAddress(address);
    authoredValue = readProperty(document, address);
  } catch (error) {
    return { status: 'notFound', target: { address }, reason: String(error?.message || error) };
  }

  const evaluation = evaluatedContext(document, options);
  if (evaluation.error) return { status: 'runtime-context-required', target: { address }, reason: evaluation.error };
  let evaluatedValue;
  try {
    evaluatedValue = readProperty(evaluation.scene, address);
  } catch (error) {
    return { status: 'unsupported', target: { address }, reason: String(error?.message || error) };
  }

  const source = propertySource(evaluation.scene, address);
  const tracks = trackControllers(document, address);
  const constraints = constraintControllers(document, parsed.reference);
  const potentialControllers = [
    ...tracks,
    ...constraints,
  ];
  const warnings = [];
  let activeOwner;

  if (source === 'animation' || source === 'playback') {
    const activeTrack = tracks.find((controller) => controller.timeline.id === evaluation.runtime?.timelineId) || (tracks.length === 1 ? tracks[0] : null);
    activeOwner = activeTrack
      ? { kind: 'animation-track', ref: cloneValue(activeTrack.ref), source, evidence: cloneValue(activeTrack.evidence) }
      : { kind: 'runtime-context-required', source, evidence: [{ kind: 'multiple-or-unknown-animation-controller', count: tracks.length }] };
  } else if (source === 'constraints') {
    activeOwner = {
      kind: 'constraint-system',
      source,
      refs: constraints.map((controller) => cloneValue(controller.ref)),
      evidence: constraints.flatMap((controller) => cloneValue(controller.evidence)),
    };
  } else if (source === 'interactive') {
    activeOwner = { kind: 'runtime-override', source, evidence: [{ kind: 'evaluation-layer', layer: 'interactive' }] };
  } else {
    const stateDriven = tracks.some((controller) => controller.machineStates.length > 0);
    if (stateDriven && !options.runtimeContext) {
      activeOwner = {
        kind: 'runtime-context-required',
        source: 'unknown',
        evidence: [{ kind: 'state-machine-may-activate-track', tracks: tracks.map((controller) => cloneValue(controller.ref)) }],
      };
      warnings.push('A state machine can activate an animation track for this property; runtime context is required to identify current ownership.');
    } else {
      activeOwner = { kind: 'authored-property', source: 'authored', address, evidence: [{ kind: 'authored-source' }] };
    }
  }

  let writableSource;
  if (activeOwner.kind === 'animation-track') {
    writableSource = { kind: 'animation-track', ref: cloneValue(activeOwner.ref), address, edit: 'keyframes' };
    warnings.push('Direct authored edits may be overwritten while this animation track is active; edit the track/keyframes for the visible animated value.');
  } else if (activeOwner.kind === 'constraint-system') {
    writableSource = { kind: 'constraint-inputs', refs: activeOwner.refs, edit: 'controller-or-constraint-authored-properties' };
    warnings.push('The evaluated value is constraint-derived. Edit the authored constraint/controller inputs rather than the derived evaluated output.');
  } else if (activeOwner.kind === 'runtime-override') {
    writableSource = { kind: 'runtime-context', writable: false };
    warnings.push('The evaluated value is runtime-derived and is not a persistent authored write target.');
  } else {
    writableSource = { kind: 'authored-property', address, writable: true };
    if (activeOwner.kind === 'runtime-context-required') warnings.push('A direct authored edit is persistent but may be overridden by an active runtime controller.');
  }

  return {
    status: 'ok',
    target: { address, ref: cloneValue(parsed.reference), path: parsed.path },
    authoredValue: cloneValue(authoredValue),
    evaluatedValue: cloneValue(evaluatedValue),
    evaluatedSource: source,
    activeOwner,
    ownerStack: [
      { kind: 'authored-property', address, active: activeOwner.kind === 'authored-property' },
      ...potentialControllers.map((controller) => ({ ...cloneValue(controller), active: activeOwner.ref ? referencesEqual(activeOwner.ref, controller.ref) : false })),
    ],
    potentialControllers,
    writableSource,
    warnings,
  };
}

function entityView(document, ref, options = {}) {
  const index = buildSemanticIndex(document, {
    maxEntities: 5000,
    maxRelationshipsPerEntity: options.maxRelationshipsPerEntity ?? 64,
    maxSemanticsPerEntity: options.maxSemanticsPerEntity ?? 32,
  });
  const entity = index.entities.find((candidate) => referencesEqual(candidate.ref, ref));
  if (!entity) return { status: 'notFound', target: { ref }, reason: `Typed reference ${ref.kind}:${ref.id} does not exist.` };
  const graph = getDependencyGraph(document, ref, { depth: options.dependencyDepth ?? 1, maxNodes: options.maxDependencyNodes ?? 100, maxEdges: options.maxDependencyEdges ?? 250 });
  return {
    status: 'ok',
    target: { ref: cloneValue(ref) },
    ref: cloneValue(entity.ref),
    kind: entity.kind,
    type: entity.type,
    display: cloneValue(entity.displayName),
    semantics: cloneValue(entity.semantics),
    capabilities: cloneValue(entity.capabilities),
    dependencySummary: graph.status === 'ok'
      ? { nodeCount: graph.nodeCount, edgeCount: graph.edgeCount, edges: options.includeDependencies ? cloneValue(graph.edges) : undefined }
      : { status: graph.status, reason: graph.reason },
    ownership: options.includeOwnership === false ? undefined : getOwnership(document, ref, options),
  };
}

export function readVeyra(documentInput, refOrAddress, options = {}) {
  const document = normalizeDocument(documentInput);
  const address = targetAddress(refOrAddress);
  if (!address) {
    const ref = targetRef(refOrAddress);
    if (!ref) return { status: 'unsupported', reason: 'read requires a property address or typed reference.' };
    return entityView(document, ref, options);
  }
  const ownership = getOwnership(document, address, options);
  if (ownership.status !== 'ok') return ownership;
  const targetStatus = propertyTargetStatus(document, address);
  const result = {
    status: 'ok',
    target: cloneValue(ownership.target),
    authoredValue: cloneValue(ownership.authoredValue),
    evaluatedValue: cloneValue(ownership.evaluatedValue),
    evaluatedSource: ownership.evaluatedSource,
    capabilities: {
      readable: true,
      writable: true,
      animatable: targetStatus === 'animatable',
    },
    ownership,
  };
  if (options.includeDependencies) {
    result.dependencies = getDependencyGraph(document, address, {
      depth: options.dependencyDepth ?? 1,
      maxNodes: options.maxDependencyNodes ?? 100,
      maxEdges: options.maxDependencyEdges ?? 250,
    });
  }
  return result;
}

function safeRead(document, address) {
  try { return { ok: true, value: readProperty(document, address) }; }
  catch (error) { return { ok: false, error: String(error?.message || error) }; }
}

function entityMap(document) {
  const index = buildSemanticIndex(document, { maxEntities: 5000, maxRelationshipsPerEntity: 512, maxSemanticsPerEntity: 256 });
  return new Map(index.entities.map((entity) => [`${entity.ref.kind}:${entity.ref.id}`, entity]));
}

function documentDiff(before, after) {
  const beforeMap = entityMap(before);
  const afterMap = entityMap(after);
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  for (const key of keys) {
    const left = beforeMap.get(key);
    const right = afterMap.get(key);
    if (!left) added.push(cloneValue(right.ref));
    else if (!right) removed.push(cloneValue(left.ref));
    else if (!sameValue(left, right)) changed.push(cloneValue(right.ref));
  }
  return { added, removed, changed };
}

function commandAddresses(descriptor) {
  const addresses = new Set();
  if (typeof descriptor?.args?.address === 'string') addresses.add(descriptor.args.address);
  for (const address of descriptor?.command?.propertyAddresses || []) addresses.add(String(address));
  return [...addresses].sort();
}

export function previewVeyraCommand(store, descriptor, options = {}) {
  if (!store || typeof store !== 'object' || !store.document) {
    return { ok: false, error: 'previewCommand requires a VeyraStore.' };
  }
  const preparedCommand = prepareCommandDescriptor(store.document, descriptor, 'canonical');
  const before = cloneValue(store.document);
  const sandbox = new VeyraStore(before);
  const addresses = commandAddresses(preparedCommand);
  const beforeValues = Object.fromEntries(addresses.map((address) => [address, safeRead(before, address)]));
  const dispatch = dispatchVeyraCommand(sandbox, preparedCommand);
  if (!dispatch.ok) {
    return {
      ok: false,
      action: dispatch.action,
      error: dispatch.error,
      preparedCommand,
      sideEffects: false,
      validation: validationResult(before),
      changes: { added: [], removed: [], changed: [], properties: [] },
    };
  }
  const after = cloneValue(sandbox.document);
  const validation = validationResult(after);
  if (!validation.ok) {
    return { ok: false, action: dispatch.action, error: validation.errors[0]?.message || 'Preview result is invalid.', preparedCommand, sideEffects: false, validation };
  }
  const diff = documentDiff(before, after);
  const properties = addresses.map((address) => {
    const afterValue = safeRead(after, address);
    const beforeOwnership = getOwnership(before, address, options);
    const afterOwnership = getOwnership(after, address, options);
    return {
      address,
      authoredBefore: beforeValues[address].ok ? cloneValue(beforeValues[address].value) : undefined,
      authoredAfter: afterValue.ok ? cloneValue(afterValue.value) : undefined,
      changed: beforeValues[address].ok && afterValue.ok ? !sameValue(beforeValues[address].value, afterValue.value) : null,
      evaluatedBefore: beforeOwnership.status === 'ok' ? cloneValue(beforeOwnership.evaluatedValue) : undefined,
      evaluatedAfter: afterOwnership.status === 'ok' ? cloneValue(afterOwnership.evaluatedValue) : undefined,
      ownershipBefore: beforeOwnership.status === 'ok' ? cloneValue(beforeOwnership.activeOwner) : null,
      ownershipAfter: afterOwnership.status === 'ok' ? cloneValue(afterOwnership.activeOwner) : null,
      warnings: [...new Set([...(beforeOwnership.warnings || []), ...(afterOwnership.warnings || [])])],
    };
  });
  const dependencyTargets = [...properties.map((item) => item.address), ...diff.changed.map((ref) => ({ ref })), ...diff.added.map((ref) => ({ ref }))].slice(0, 12);
  const dependencyImpact = options.includeDependencies === false ? [] : dependencyTargets.map((target) => getDependencyGraph(after, target, { depth: 1, maxNodes: 80, maxEdges: 160 }));
  const capabilities = VEYRA_COMMAND_TABLE[preparedCommand?.action]?.capabilities || [];
  return {
    ok: true,
    action: dispatch.action,
    result: cloneValue(dispatch.result),
    preparedCommand,
    sideEffects: false,
    wouldChange: diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0 || properties.some((item) => item.changed),
    reversible: capabilities.includes('undoable'),
    undoable: capabilities.includes('undoable'),
    validation,
    changes: { ...diff, properties },
    lifecycleCascades: { removedRefs: cloneValue(diff.removed) },
    dependencyImpact,
  };
}

function replaceDocumentContents(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, cloneValue(source));
}

export function dispatchVeyraPlan(store, commands, policy = {}) {
  if (!store || typeof store !== 'object' || typeof store.execute !== 'function') {
    return { ok: false, applied: false, error: 'dispatchPlan requires a VeyraStore.' };
  }
  if (!Array.isArray(commands) || commands.length === 0) {
    return { ok: false, applied: false, error: 'dispatchPlan commands must be a non-empty array.' };
  }
  const beforeDocument = cloneValue(store.document);
  const sandbox = new VeyraStore(beforeDocument);
  const steps = [];
  const preparedCommands = [];
  for (let index = 0; index < commands.length; index += 1) {
    const prepared = prepareCommandDescriptor(sandbox.document, commands[index], `plan:${index}`);
    if (PLAN_FORBIDDEN_ACTIONS.has(prepared?.action)) {
      return {
        ok: false,
        applied: false,
        failedStep: index,
        error: `Command ${prepared.action} is not supported inside an atomic document plan.`,
        steps,
        rollback: { sourceStoreUnchanged: true, reason: 'preflight sandbox rejected a non-document plan action' },
        stableResultBindings: { placeholdersSupported: false, mode: 'explicit-stable-ids-only' },
      };
    }
    const result = dispatchVeyraCommand(sandbox, prepared);
    preparedCommands.push(prepared);
    steps.push({ index, command: cloneValue(prepared), outcome: cloneValue(result) });
    if (!result.ok) {
      return {
        ok: false,
        applied: false,
        failedStep: index,
        error: result.error,
        steps,
        rollback: { sourceStoreUnchanged: true, reason: 'all commands were preflighted against an isolated sandbox' },
        stableResultBindings: { placeholdersSupported: false, mode: 'explicit-stable-ids-only' },
      };
    }
  }
  const validation = validationResult(sandbox.document);
  if (!validation.ok) {
    return {
      ok: false,
      applied: false,
      error: validation.errors[0]?.message || 'Preflight plan produced an invalid document.',
      steps,
      validation,
      rollback: { sourceStoreUnchanged: true, reason: 'invalid sandbox result was never committed' },
      stableResultBindings: { placeholdersSupported: false, mode: 'explicit-stable-ids-only' },
    };
  }
  const preview = {
    diff: documentDiff(beforeDocument, sandbox.document),
    validation,
  };
  if (policy.dryRun) {
    return {
      ok: true,
      applied: false,
      dryRun: true,
      steps,
      preview,
      stableResultBindings: { placeholdersSupported: false, mode: 'explicit-stable-ids-only' },
    };
  }
  try {
    store.execute({
      label: String(policy.label || `Atomic plan (${commands.length} commands)`),
      source: policy.source || 'ai',
      planSteps: preparedCommands,
      propertyAddresses: [...new Set(preparedCommands.flatMap(commandAddresses))],
    }, (document) => replaceDocumentContents(document, sandbox.document));
  } catch (error) {
    return {
      ok: false,
      applied: false,
      error: String(error?.message || error),
      steps,
      rollback: { sourceStoreUnchanged: true, reason: 'VeyraStore.execute rolled back the atomic commit' },
      stableResultBindings: { placeholdersSupported: false, mode: 'explicit-stable-ids-only' },
    };
  }
  return {
    ok: true,
    applied: true,
    steps,
    preview,
    revision: store.revision,
    historyEntry: store.commandHistory.at(-1) || null,
    stableResultBindings: {
      placeholdersSupported: false,
      mode: 'explicit-stable-ids-only',
      note: 'Later steps may reference stable ids supplied explicitly by earlier descriptors; implicit result placeholders are intentionally unsupported.',
    },
  };
}

function assertionList(expected) {
  if (Array.isArray(expected)) return expected;
  if (expected?.assertions && Array.isArray(expected.assertions)) return expected.assertions;
  if (expected && typeof expected === 'object') return [expected];
  throw new TypeError('verifyChange expected must be an assertion object or array.');
}

function dependencyTargetEqual(left, right) {
  if (left?.address || right?.address) return left?.address === right?.address;
  return referencesEqual(left?.ref, right?.ref);
}

function evaluateAssertion(document, assertion, options) {
  const type = assertion.type;
  if (type === 'entityExists' || type === 'entityMissing') {
    const ref = assertion.ref;
    const index = buildSemanticIndex(document, { maxEntities: 5000 });
    const exists = index.entities.some((entity) => referencesEqual(entity.ref, ref));
    const pass = type === 'entityExists' ? exists : !exists;
    return { type, pass, evidence: { ref: cloneValue(ref), exists } };
  }
  if (type === 'authoredEquals' || type === 'evaluatedEquals') {
    const read = readVeyra(document, assertion.address, options);
    const actual = type === 'authoredEquals' ? read.authoredValue : read.evaluatedValue;
    const pass = read.status === 'ok' && sameValue(actual, assertion.value);
    return { type, pass, evidence: { address: assertion.address, expected: cloneValue(assertion.value), actual: cloneValue(actual), status: read.status } };
  }
  if (type === 'semanticExists') {
    const records = document.semantics || [];
    const record = records.find((candidate) => {
      if (assertion.semanticId && candidate.id !== assertion.semanticId) return false;
      if (assertion.target && !referencesEqual(candidate.target, assertion.target)) return false;
      if (assertion.predicate) {
        return candidate.relations.some((relation) => relation.predicate === assertion.predicate
          && (!assertion.relationTarget || referencesEqual(relation.target, assertion.relationTarget)));
      }
      return true;
    });
    return { type, pass: Boolean(record), evidence: record ? { semanticId: record.id, target: cloneValue(record.target) } : { semanticId: assertion.semanticId || null } };
  }
  if (type === 'dependencyEdge') {
    const graph = getDependencyGraph(document, null, { maxNodes: 5000, maxEdges: 10000, depth: 32 });
    const exists = graph.status === 'ok' && graph.edges.some((edge) => edge.type === assertion.edgeType
      && dependencyTargetEqual(edge.from, assertion.from)
      && dependencyTargetEqual(edge.to, assertion.to));
    const expectedExists = assertion.exists !== false;
    return { type, pass: exists === expectedExists, evidence: { edgeType: assertion.edgeType, from: cloneValue(assertion.from), to: cloneValue(assertion.to), exists } };
  }
  if (type === 'ownership') {
    const ownership = getOwnership(document, assertion.address || assertion.ref, options);
    let pass = ownership.status === 'ok';
    if (assertion.ownerKind !== undefined) pass = pass && ownership.activeOwner?.kind === assertion.ownerKind;
    if (assertion.ownerRef !== undefined) pass = pass && referencesEqual(ownership.activeOwner?.ref, assertion.ownerRef);
    if (assertion.source !== undefined) pass = pass && ownership.evaluatedSource === assertion.source;
    return { type, pass, evidence: { target: cloneValue(ownership.target), activeOwner: cloneValue(ownership.activeOwner), evaluatedSource: ownership.evaluatedSource, status: ownership.status } };
  }
  if (type === 'validDocument' || type === 'noDanglingRefs') {
    const validation = validationResult(document);
    return { type, pass: validation.ok, evidence: validation };
  }
  return { type: type || 'unknown', pass: false, evidence: { reason: `Unsupported verification assertion type: ${type}` } };
}

export function verifyVeyraChange(documentInput, expected, options = {}) {
  const document = normalizeDocument(documentInput);
  const assertions = assertionList(expected).map((assertion, index) => ({ index, ...evaluateAssertion(document, assertion, options) }));
  const validation = validationResult(document);
  return {
    status: assertions.every((assertion) => assertion.pass) && validation.ok ? 'passed' : 'failed',
    ok: assertions.every((assertion) => assertion.pass) && validation.ok,
    assertions,
    validation,
  };
}

export function createVeyraControlPlane(store) {
  if (!store || typeof store !== 'object' || typeof store.execute !== 'function') {
    throw new TypeError('createVeyraControlPlane requires a VeyraStore.');
  }
  const services = {
    getManifest: (options = {}) => createProjectManifest(store.document, options),
    queryEntities: (query = {}, options = {}) => queryEntities(store.document, query, options),
    resolveSemantic: (intent, options = {}) => resolveSemantic(store.document, intent, options),
    read: (refOrAddress, options = {}) => readVeyra(store.document, refOrAddress, options),
    previewCommand: (command, options = {}) => previewVeyraCommand(store, command, options),
    dispatchCommand: (command) => dispatchVeyraCommand(store, prepareCommandDescriptor(store.document, command, 'canonical')),
    dispatchPlan: (commands, policy = {}) => dispatchVeyraPlan(store, commands, policy),
    validateDocument: () => validationResult(store.document),
    verifyChange: (expected, options = {}) => verifyVeyraChange(store.document, expected, options),
    getDependencyGraph: (refOrAddress = null, options = {}) => getDependencyGraph(store.document, refOrAddress, options),
    getOwnership: (refOrAddress, options = {}) => getOwnership(store.document, refOrAddress, options),
  };
  const actualNames = Object.keys(services).sort();
  if (!sameValue(actualNames, VEYRA_SERVICE_NAMES)) {
    throw new TypeError(`Canonical service registry drift: metadata=${VEYRA_SERVICE_NAMES.join(',')} callable=${actualNames.join(',')}`);
  }
  return Object.freeze(services);
}
