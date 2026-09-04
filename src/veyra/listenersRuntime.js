import { hitTestPoint } from './hitTest.js';
import { referenceId } from './references.js';

function pointOf(event) {
  return { x: Number(event?.x ?? event?.clientX ?? event?.offsetX ?? 0), y: Number(event?.y ?? event?.clientY ?? event?.offsetY ?? 0) };
}

function targetId(listener) {
  return referenceId(listener.target ?? listener.targetId, 'node');
}

function listenerRevision(document) {
  return (document?.listeners || []).map((listener) => `${listener.id}:${targetId(listener)}:${listener.event}:${listener.action}`).join('|');
}

function intentFor(listener) {
  if (listener.action === 'setInput' || listener.action === 'fire') {
    return { kind: 'runtime', op: listener.action, machineId: listener.machine, inputId: referenceId(listener.input, 'machineInput'), ...(listener.value !== undefined ? { value: listener.value } : {}) };
  }
  return { kind: 'transport', op: listener.action, timelineId: referenceId(listener.timeline, 'timeline'), ...(listener.value !== undefined ? { value: listener.value } : {}) };
}

/** Resolve one plain event into pure runtime intents and hover transitions. */
export function resolveListenerIntents({ event, scene, document = scene, viewport = {}, hoverKey = null, sceneRevision = 0 } = {}) {
  if (!event || !document) return { hoverKey: null, listenerRevision: listenerRevision(document), transitions: [], intents: [] };
  const type = String(event.type || event.event || '');
  const pointerEvent = type.startsWith('pointer');
  const hit = pointerEvent ? hitTestPoint(pointOf(event), scene || document, viewport) : null;
  const revision = listenerRevision(document);
  const nextHoverKey = hit ? `${hit.id}:${revision}:${sceneRevision}` : null;
  const previousId = typeof hoverKey === 'string' ? hoverKey.split(':')[0] : (hoverKey?.id || null);
  const nextId = hit?.id || null;
  const transitions = [];
  if (pointerEvent && previousId !== nextId) {
    if (previousId) {
      for (const listener of document.listeners || []) {
        if (listener.event !== 'pointerleave' || targetId(listener) !== previousId) continue;
        transitions.push({ phase: 'leave', listenerId: listener.id, intent: intentFor(listener) });
      }
    }
    if (nextId) {
      for (const listener of document.listeners || []) {
        if (listener.event !== 'pointerenter' || targetId(listener) !== nextId) continue;
        transitions.push({ phase: 'enter', listenerId: listener.id, intent: intentFor(listener) });
      }
    }
  }
  const intents = [];
  if (hit) {
    for (const listener of document.listeners || []) {
      if (listener.event === type && targetId(listener) === hit.id) intents.push(intentFor(listener));
    }
  }
  return { hoverKey: nextHoverKey, listenerRevision: revision, transitions, intents, hit };
}

/** Create a deterministic resolver retaining only the current hover key. */
export function createListenerResolver({ document, viewport = {} } = {}) {
  let hoverKey = null;
  let sceneRevision = 0;
  let currentViewport = viewport;
  return {
    setViewport(nextViewport = {}) {
      currentViewport = nextViewport;
      return currentViewport;
    },
    resolve(event, scene = document, revision = sceneRevision) {
      sceneRevision = revision;
      const result = resolveListenerIntents({ event, scene, document, viewport: currentViewport, hoverKey, sceneRevision });
      hoverKey = result.hoverKey;
      return result;
    },
    get hoverKey() { return hoverKey; },
    setSceneRevision(revision) { sceneRevision = revision; return sceneRevision; },
    reset() { hoverKey = null; },
  };
}

export function runtimeIntentForListener(listener) {
  return intentFor(listener);
}

// Compatibility aliases keep the pure seam discoverable to existing callers.
export const resolvePointerEvent = resolveListenerIntents;
export const resolveListenerEvent = resolveListenerIntents;
