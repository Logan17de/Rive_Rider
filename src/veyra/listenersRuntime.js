import { hitTestPoint } from './hitTest.js';
import { referenceId } from './references.js';

function pointOf(event) {
  return {
    x: Number(event?.x ?? event?.clientX ?? event?.offsetX ?? 0),
    y: Number(event?.y ?? event?.clientY ?? event?.offsetY ?? 0),
  };
}

function pointerIdOf(event) {
  return String(event?.pointerId ?? 'primary');
}

function targetId(listener) {
  return referenceId(listener.target ?? listener.targetId, 'node');
}

function listenerRevision(document) {
  // Revision metadata is opaque and never reparsed into identity. JSON tuples
  // avoid delimiter collisions for otherwise-valid punctuation in stable IDs.
  return JSON.stringify((document?.listeners || []).map((listener) => [
    listener.id,
    targetId(listener),
    listener.event,
    listener.action,
    referenceId(listener.timeline, 'timeline') || '',
    referenceId(listener.machine, 'stateMachine') || '',
    referenceId(listener.input, 'machineInput') || '',
  ]));
}

function intentFor(listener) {
  if (listener.action === 'setInput' || listener.action === 'fire') {
    return {
      kind: 'runtime',
      op: listener.action,
      machineId: referenceId(listener.machine, 'stateMachine'),
      inputId: referenceId(listener.input, 'machineInput'),
      ...(listener.value !== undefined ? { value: listener.value } : {}),
    };
  }
  return {
    kind: 'transport',
    op: listener.action,
    timelineId: referenceId(listener.timeline, 'timeline'),
    ...(listener.value !== undefined ? { value: listener.value } : {}),
  };
}

function intentsFor(document, event, nodeId) {
  if (!nodeId) return [];
  return (document.listeners || [])
    .filter((listener) => listener.event === event && targetId(listener) === nodeId)
    .map((listener) => ({ listenerId: listener.id, intent: intentFor(listener) }));
}

function lifecycleTargetId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return referenceId(value.target ?? value, 'node') || null;
}

function lifecycleTargetRef(hit) {
  return hit?.id ? { kind: 'node', id: hit.id } : null;
}

function hoverState(hit, revision, sceneRevision) {
  if (!hit?.id) return null;
  return {
    kind: 'node',
    id: hit.id,
    listenerRevision: revision,
    sceneRevision,
  };
}

const RESOLVE_LISTENER_OPTION_KEYS = Object.freeze([
  'event', 'scene', 'document', 'viewport', 'hoverKey', 'sceneRevision',
]);
const RESOLVER_OPTION_KEYS = Object.freeze(['document', 'viewport']);

function assertKnownOptions(options, functionName, acceptedKeys) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`${functionName} options must be an object`);
  }
  const unknownKeys = Object.keys(options).filter((key) => !acceptedKeys.includes(key));
  if (unknownKeys.length) {
    throw new TypeError(`Unknown ${functionName} option key(s): ${unknownKeys.join(', ')}. Accepted keys: ${acceptedKeys.join(', ')}`);
  }
}

/**
 * Resolve one plain event into pure runtime intents and hover transitions.
 * Hover enter/leave is defined by top-hit changes observed on pointermove.
 * Lifecycle identity is a structured stable node ref plus revision metadata;
 * node IDs are never split or parsed by punctuation delimiters.
 */
export function resolveListenerIntents(options = {}) {
  assertKnownOptions(options, 'resolveListenerIntents', RESOLVE_LISTENER_OPTION_KEYS);
  const {
    event, scene, document = scene, viewport = {}, hoverKey = null, sceneRevision = 0,
  } = options;
  if (!event || !document) return { hoverKey: null, listenerRevision: listenerRevision(document), transitions: [], intents: [] };
  const type = String(event.type || event.event || '');
  const hitTestable = type.startsWith('pointer') || type === 'click';
  const hit = hitTestable ? hitTestPoint(pointOf(event), scene || document, viewport) : null;
  const revision = listenerRevision(document);
  const nextHoverKey = hoverState(hit, revision, sceneRevision);
  const previousId = lifecycleTargetId(hoverKey);
  const nextId = hit?.id || null;
  const transitions = [];
  if (type === 'pointermove' && previousId !== nextId) {
    if (previousId) {
      for (const { listenerId, intent } of intentsFor(document, 'pointerleave', previousId)) {
        transitions.push({ phase: 'leave', listenerId, intent });
      }
    }
    if (nextId) {
      for (const { listenerId, intent } of intentsFor(document, 'pointerenter', nextId)) {
        transitions.push({ phase: 'enter', listenerId, intent });
      }
    }
  }
  const intents = intentsFor(document, type, nextId).map((item) => item.intent);
  return { hoverKey: nextHoverKey, listenerRevision: revision, transitions, intents, hit };
}

/**
 * Deterministic pointer lifecycle resolver.
 *
 * Veyra click rule: one primary pointerdown records the evaluated top target;
 * pointer movement may enter/leave other targets, but click fires only when the
 * matching pointerup's evaluated top target is the same full stable node id.
 * The pointerup listener intents are emitted first, then click intents.
 */
export function createListenerResolver(options = {}) {
  assertKnownOptions(options, 'createListenerResolver', RESOLVER_OPTION_KEYS);
  const { document, viewport = {} } = options;
  let currentDocument = document;
  let hoverKey = null;
  let sceneRevision = 0;
  let currentViewport = viewport;
  const downTargets = new Map();
  return {
    setViewport(nextViewport = {}) {
      currentViewport = nextViewport;
      return currentViewport;
    },
    setDocument(nextDocument) {
      if (nextDocument !== currentDocument) {
        currentDocument = nextDocument;
        hoverKey = null;
        downTargets.clear();
      }
      return currentDocument;
    },
    resolve(event, scene = currentDocument, revision = sceneRevision) {
      sceneRevision = revision;
      const result = resolveListenerIntents({ event, scene, document: currentDocument, viewport: currentViewport, hoverKey, sceneRevision });
      hoverKey = result.hoverKey;
      const type = String(event?.type || event?.event || '');
      const pointerId = pointerIdOf(event);
      if (type === 'pointerdown') {
        downTargets.set(pointerId, lifecycleTargetRef(result.hit));
        return { ...result, clickQualified: false };
      }
      if (type === 'pointerup') {
        const downTarget = downTargets.get(pointerId) || null;
        downTargets.delete(pointerId);
        const upTarget = lifecycleTargetRef(result.hit);
        const downId = lifecycleTargetId(downTarget);
        const upId = lifecycleTargetId(upTarget);
        const clickQualified = Boolean(downId && downId === upId);
        if (clickQualified) {
          result.intents.push(...intentsFor(currentDocument, 'click', upId).map((item) => item.intent));
        }
        return { ...result, clickQualified };
      }
      if (type === 'pointercancel') downTargets.delete(pointerId);
      return { ...result, clickQualified: false };
    },
    get hoverKey() { return hoverKey; },
    get downTargets() { return new Map(downTargets); },
    setSceneRevision(revision) { sceneRevision = revision; return sceneRevision; },
    reset() { hoverKey = null; downTargets.clear(); },
  };
}

export function runtimeIntentForListener(listener) {
  return intentFor(listener);
}

export const resolvePointerEvent = resolveListenerIntents;
export const resolveListenerEvent = resolveListenerIntents;
