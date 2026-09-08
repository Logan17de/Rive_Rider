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

  function emit(intent) {
    if (onIntent) onIntent(intent);
    else report(`Interaction intent has no transport: ${intent.op}`, onDiagnostic);
  }

  function resolve(event, scene = currentDocument, sceneRevision = revision, viewport = {}) {
    resolver.setViewport(viewport);
    const result = resolver.resolve(event, scene, sceneRevision);
    // Resolver owns lifecycle semantics. The shell executes each returned
    // transition/direct intent exactly once; it does not independently observe
    // the same browser event through another interaction path.
    for (const transition of result.transitions || []) {
      if (transition.intent) emit(transition.intent);
    }
    for (const intent of result.intents || []) emit(intent);
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

/**
 * Factory returning the ACTUAL preview pointer event handlers the shell
 * registers via `canvas.addEventListener`. This exists so integration tests
 * can call the real handler functions directly — including their
 * `stopPropagation`/`preventDefault` calls — instead of a parallel
 * reimplementation that could drift from what `veyra.js` really wires up.
 */
export function createPreviewPointerHandlers({
  canvas,
  interactionBridge,
  getEvaluatedScene,
  getInteractionSceneRevision,
  getTool,
  getPanGesture,
  getPreviewMode,
  getViewCenter,
  getZoom,
  getArtboardSize,
  isAuthoringEvent = null,
  onNoHit = null,
} = {}) {
  function previewPointerEligible(event) {
    if (isAuthoringEvent?.(event)) return false;
    return isPreviewPointerEligible({
      event,
      tool: getTool ? getTool() : 'select',
      panGesture: getPanGesture ? getPanGesture() : false,
      preview: getPreviewMode ? getPreviewMode() : false,
    });
  }

  function resolvePreviewPointer(event) {
    const evaluatedScene = getEvaluatedScene ? getEvaluatedScene() : null;
    if (!previewPointerEligible(event) || !evaluatedScene) return null;
    const point = canvasPoint(event, canvas, { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight });
    const fallback = getArtboardSize ? getArtboardSize() : { width: 0, height: 0 };
    const center = (getViewCenter && getViewCenter()) || { x: fallback.width / 2, y: fallback.height / 2 };
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
    const viewportWidth = canvas.clientWidth || rect.width;
    const viewportHeight = canvas.clientHeight || rect.height;
    const sceneRevision = getInteractionSceneRevision ? getInteractionSceneRevision() : 0;
    const result = interactionBridge.resolve({
      type: event.type,
      x: point.x,
      y: point.y,
      pointerId: event.pointerId,
    }, evaluatedScene, sceneRevision, {
      width: viewportWidth,
      height: viewportHeight,
      centerX: center.x,
      centerY: center.y,
      zoom: getZoom ? getZoom() : 1,
    });
    if (event.type === 'pointerdown' && !result.hit && onNoHit) onNoHit();
    return result;
  }

  function onPointerMove(event) {
    if (!previewPointerEligible(event)) return;
    resolvePreviewPointer(event);
    event.stopPropagation();
  }

  function onPointerUp(event) {
    const result = resolvePreviewPointer(event);
    if (previewPointerEligible(event)) event.stopPropagation();
    return result;
  }

  function onPointerDown(event) {
    if (!previewPointerEligible(event)) return;
    const result = resolvePreviewPointer(event);
    event.stopPropagation();
    if (result?.intents?.length || result?.transitions?.length) event.preventDefault();
  }

  return { onPointerMove, onPointerUp, onPointerDown, previewPointerEligible, resolvePreviewPointer };
}
