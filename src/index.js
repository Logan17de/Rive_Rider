export { RiveBridge, geometryBridgeMethods } from './bridge/rive-bridge.js';
export { buildSceneModel } from './scene/scene-model.js';
export {
  ControlKind,
  controlPriority,
  preferredControl,
  rankAvailableControls,
} from './control/control-policy.js';
export { SemanticMetadataStore } from './semantic/semantic-metadata.js';
export { CommandSystem } from './commands/command-system.js';
export {
  VEYRA_MANIFEST_FORMAT,
  VEYRA_MANIFEST_VERSION,
  createProjectManifest,
  serializeProjectManifest,
} from './veyra/manifest.js';

export {
  VEYRA_RESOLVER_CAPABILITIES,
  VEYRA_RESOLVER_SCORING,
  buildSemanticIndex,
  queryEntities,
  resolveSemantic,
} from './veyra/resolver.js';


export {
  VEYRA_BROWSER_MUTATION_COMPATIBILITY,
  VEYRA_SERVICE_DEFINITIONS,
  VEYRA_SERVICE_NAMES,
  VEYRA_UI_MUTATION_PARITY_AUDIT,
} from './veyra/serviceRegistry.js';
export {
  VEYRA_DEPENDENCY_EDGE_TYPES,
  getDependencyGraph,
} from './veyra/dependencyGraph.js';
export {
  createVeyraControlPlane,
  dispatchVeyraPlan,
  getOwnership,
  previewVeyraCommand,
  readVeyra,
  verifyVeyraChange,
} from './veyra/controlPlane.js';

// M4 interaction runtime seams stay DOM-free so hosts and adversarial tests
// exercise the same persistent machine bridge and evaluated hit-test contract.
export { createMachineInteractionBridge } from './veyra/interactionHost.js';
export { hitTestPoint, VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX, VEYRA_HIT_TEST_TOLERANCE_PX, VEYRA_POINTER_EVENT_MODES } from './veyra/hitTest.js';
export { createSvgViewBox, createSvgViewBoxScreenTransform, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './veyra/viewport.js';
// M5 workspace helpers are deterministic editor-state primitives. Camera zoom
// is CSS pixels per world unit, and panel/theme/navigation state never authors
// document content, so browser behavior and tests share one stable contract.
export {
  VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX,
  VEYRA_MIN_NODE_SCALE,
  VEYRA_PAN_DRAG_THRESHOLD_PX,
  VEYRA_UI_THEMES,
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  VEYRA_WORKSPACE_PANEL_LIMITS,
  VEYRA_ZOOM_MAX,
  VEYRA_ZOOM_MIN,
  artboardResizeCursor,
  clampZoom,
  classifyArtboardResizeZone,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
  normalizeTheme,
  normalizeWheelDelta,
  normalizeWorkspaceLayout,
  panGestureMoved,
  panViewportByScreen,
  resizeNodeTransform,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
  zoomViewportAtScreen,
} from './veyra/workspace.js';
