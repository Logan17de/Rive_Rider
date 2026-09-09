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
// is CSS pixels per world unit; the authored artboard frame has persistent
// x/y/width/height while panel/theme/navigation state remains editor-only.
export {
  VEYRA_ARTBOARD_RESIZE_TOLERANCE_PX,
  VEYRA_MIN_NODE_SCALE,
  VEYRA_RIG_OVERLAY_MIN_ZOOM,
  VEYRA_PAN_DRAG_THRESHOLD_PX,
  VEYRA_UI_THEMES,
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  VEYRA_WORKSPACE_PANEL_LIMITS,
  VEYRA_ZOOM_MAX,
  VEYRA_ZOOM_MIN,
  artboardResizeCursor,
  clampZoom,
  classifyArtboardResizeZone,
  compensateViewportForClientRect,
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
  shouldShowDetailedRigOverlay,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
  zoomViewportAtScreen,
} from './veyra/workspace.js';

// M6 project graph and Component primitives share the same authored model and runtime evaluation seams.
export {
  VEYRA_PROJECT_VERSION, VEYRA_COMPONENT_FIT_MODES, VEYRA_COMPONENT_ALIGN_X, VEYRA_COMPONENT_ALIGN_Y, VEYRA_COMPONENT_MAX_DEPTH,
  createArtboard, createComponent, createComponentInstance, artboardById, componentById, componentInstanceById,
  entityArtboardId, duplicateArtboardIntoDocument, projectGraphCapabilities,
} from './veyra/projectGraph.js';
export {
  VEYRA_COMPONENT_RUNTIME_SCOPE_KIND, ComponentRuntimeRegistry, createComponentRuntimeRegistry, createComponentRuntimeScope, componentRuntimeScopeKey, componentInstanceSourceMatrix, evaluateComponentContent, evaluateComponentInstances,
} from './veyra/components.js';


// M7 editor-authoring primitives are DOM-free. Draft/selection/marquee state is
// editor-only; persistent topology/grouping mutations are shared by Store commands.
// Stable pathVertex identity remains authored, while corner-radius rendering/export
// and hit testing share one derived canonical path compiler rather than a second model.
export {
  VEYRA_EDITOR_COMMAND_IDS,
  VEYRA_MARQUEE_MODES,
  VEYRA_DEFAULT_OVERLAY_VISIBILITY,
  EditorSelectionState,
  createPenDraft,
  penVertexFromGesture,
  appendPenDraftVertex,
  penDraftCanFinish,
  finalizePenDraftGeometry,
  pathVertexById,
  pathVertexDependencyEvidence,
  addVertexToDocument,
  removeVertexFromDocument,
  moveVertexInDocument,
  moveBezierHandleInDocument,
  setVertexHandleModeInDocument,
  setVertexCornerRadiusInDocument,
  setPathClosedInDocument,
  reversePathInDocument,
  nodeWorldMatrix,
  affineMatrixToTransform,
  groupNodesInDocument,
  ungroupNodeInDocument,
  marqueeNodeRefs,
  selectionWorldBounds,
  worldRectFromPoints,
  normalizeOverlayVisibility,
  createEditorCommandDispatcher,
  editorCommandForKeyEvent,
  coordinateReadout,
} from './veyra/editorAuthoring.js';


// M8 View Models/Data Binding keeps authored definitions separate from runtime values.
// Binding validation/evaluation share one capability contract; trigger queues,
// subscriptions, dirty caches and reverse-write scope stay DOM-free runtime state.
export {
  VEYRA_DATA_VERSION, VEYRA_DATA_PROPERTY_TYPES, VEYRA_BINDING_MODES, VEYRA_CONVERTER_TYPES,
  VEYRA_DATA_RUNTIME_SCOPE_KIND, VEYRA_BINDING_CONFLICT_POLICY, VEYRA_DATA_EVALUATION_COMPLEXITY,
  createDataProperty, createViewModel, createViewModelInstance, createEnum, createEnumValue,
  createConverter, createPropertyGroup, createPropertyGroupProperty, createList, createListItem, createBinding,
  normalizeBindingEndpoint, normalizeDataGraphDocument, validateDataGraphDocument,
  viewModelById, viewModelInstanceById, dataPropertyById, enumById, enumValueById, converterById,
  propertyGroupById, propertyGroupPropertyById, listById, listItemById, bindingById,
  bindingEndpointKey, bindingEndpointType, bindingControllersForAddress,
  createDataRuntimeScope, VeyraDataRuntime, createVeyraDataRuntime,
  bindingDependencyRecords, bindingComplexityEnvelope,
} from './veyra/dataGraph.js';