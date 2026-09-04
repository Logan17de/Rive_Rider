import { createListenerResolver } from './listenersRuntime.js';

function report(message, onDiagnostic) {
  if (onDiagnostic) onDiagnostic(message);
  else console.warn(message);
}

/** Preview routing gate shared by shell and deterministic tests. */
export function isPreviewPointerEligible({ event, tool = 'select', preview = false, panGesture = false } = {}) {
  return !!event && event.isPrimary !== false && event.button !== 1 && !event.altKey
    && !panGesture && tool === 'select' && preview === true;
}

/** Convert a DOM client point into the canvas-local viewport coordinates. */
export function canvasPoint(event, canvas, viewport = {}) {
  const rect = canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: viewport.width || 0, height: viewport.height || 0 };
  const scaleX = rect.width ? (viewport.cssWidth || rect.width) / rect.width : 1;
  const scaleY = rect.height ? (viewport.cssHeight || rect.height) / rect.height : 1;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

/** Pure adapter owning one stateful resolver per document identity. */
export function createShellInteractionBridge({ document = null, onIntent = null, onDiagnostic = null } = {}) {
  let currentDocument = document;
  let resolver = createListenerResolver({ document: currentDocument });
  let revision = 0;

  function updateDocument(nextDocument) {
    if (nextDocument !== currentDocument) {
      currentDocument = nextDocument;
      resolver = createListenerResolver({ document: currentDocument });
      revision += 1;
    }
    return resolver;
  }

  function resolve(event, scene = currentDocument, sceneRevision = revision, viewport = {}) {
    resolver.setViewport(viewport);
    const result = resolver.resolve(event, scene, sceneRevision);
    if (event.type !== 'pointermove') {
      for (const intent of result.intents || []) {
        if (onIntent) onIntent(intent);
        else report(`Interaction intent has no transport: ${intent.op}`, onDiagnostic);
      }
    }
    if (event.type === 'pointermove') {
      for (const transition of result.transitions || []) {
        if (transition.intent && onIntent) onIntent(transition.intent);
      }
    }
    return result;
  }

  return {
    resolve,
    updateDocument,
    get document() { return currentDocument; },
    get revision() { return revision; },
    get resolver() { return resolver; },
    reset() { resolver.reset(); },
  };
}
