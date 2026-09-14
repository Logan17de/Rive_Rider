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
// M8-C2 keeps warm caches generation-aware, nested invalidation stable-ref based,
// and two-way Property Group interaction scoped/ephemeral unless persistence is explicit.
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
export { createVeyraRuntimeHost } from './veyra/runtimeHost.js';
export { VEYRA_DATA_RUNTIME_PORTS, VEYRA_DATA_RUNTIME_CONTRACT } from './veyra/runtimePorts.js';

// Core document/evaluation APIs are intentionally public.  The browser editor
// is one adapter over these primitives; embedders, exporters and AI agents can
// construct, normalize, inspect, evaluate and serialize the same document
// without importing internal module paths.
export {
  VEYRA_FORMAT,
  VEYRA_VERSION,
  VEYRA_SUPPORTED_VERSIONS,
  VEYRA_LISTENER_VERSION,
  VEYRA_LISTENER_KINDS,
  VEYRA_LISTENER_EVENTS,
  VEYRA_LISTENER_ACTIONS,
  VEYRA_MIME,
  VEYRA_ASSET_TYPES,
  VEYRA_CONSTRAINT_TYPES,
  VEYRA_NODE_TYPES,
  VEYRA_VERTEX_HANDLE_MODES,
  VEYRA_EASING_TYPES,
  VEYRA_LOOP_MODES,
  VEYRA_FILL_TYPES,
  VEYRA_MACHINE_INPUT_TYPES,
  VEYRA_CONDITION_OPS,
  VEYRA_MACHINE_BUILTIN_ARTBOARD_VALUES,
  VEYRA_MACHINE_BUILTIN_RUNTIME_VALUES,
  VEYRA_MACHINE_ORDERING_OPS,
  VEYRA_PROPERTY_BOUNDS,
  createId,
  cloneValue,
  createGradientStop,
  createSolidFill,
  createLinearGradient,
  createRadialGradient,
  createNode,
  createSemanticRecord,
  createAsset,
  createBone,
  createControl,
  createMesh,
  createConstraint,
  createKeyframe,
  createTimeline,
  createTrack,
  createMachineInput,
  createStateMachine,
  createPointerListener,
  createDocument,
  createStarterDocument,
  normalizeDocument,
  semanticsFor,
  semanticFor,
  semanticRecordById,
  nodeById,
  boneById,
  meshById,
  controlById,
  constraintById,
  assetById,
  meshVertexById,
  gradientStopById,
  trackById,
  keyframeById,
  machineById,
  machineStateById,
  machineInputById,
  machineTransitionById,
  machineConditionById,
  listenerById,
  timelineById,
  trackByAddress,
  childrenOf,
  descendantIds,
} from './veyra/model.js';
export {
  OBSERVED_EVALUATION_CONTEXT,
  VEYRA_EVALUATION_ORDER,
  evaluateDocument,
  propertySource,
} from './veyra/evaluation.js';
export {
  transformAttribute,
  regularPolygonPoints,
  starPoints,
  pointsAttribute,
  pathSegments,
  pathData,
  localBounds,
  geometryDescriptor,
  paintServerId,
  gradientDescriptor,
  fillPaintValue,
  renderSvgString,
} from './veyra/geometry.js';
export { VeyraRenderer } from './veyra/renderer.js';
export { VEYRA_COMMAND_SOURCES, VeyraStore } from './veyra/store.js';
export {
  canonicalVeyraValue,
  serializeVeyra,
  parseVeyra,
  safeFilename,
  downloadBlob,
  downloadVeyra,
  downloadSvg,
} from './veyra/io.js';

// M9 layered state-machine schema primitives and the canonical runtime. Every
// graph operation is also present in the command registry consumed by the UI
// and AI/browser adapters.
export {
  VEYRA_DOCUMENT_LIMITS,
  VEYRA_MACHINE_LAYER_VERSION,
  VEYRA_MACHINE_ACTION_PHASES,
  VEYRA_MACHINE_ACTION_TYPES,
  VEYRA_MACHINE_STATE_TYPES,
  createMachineLayer,
  createMachineBlendChild,
  createMachineAction,
  createMachineCondition,
  createMachineState,
  createMachineTransition,
  machineLayerById,
  machineLayers,
  machineStates,
  machineTransitions,
  machineLayerForState,
  machineLayerForTransition,
} from './veyra/model.js';
export { createMachineLayerRef, createMachineBlendChildRef, createMachineActionRef, createMachineConditionRef } from './veyra/references.js';
export { VEYRA_MACHINE_CAPABILITIES, MachineRuntime, createMachineRuntime } from './veyra/stateMachine.js';
export { VEYRA_LAYOUT_EVALUATION_MODES, evaluateLayouts } from './veyra/layout.js';
export {
  VEYRA_COMMAND_ACTIONS,
  VEYRA_COMMAND_TABLE,
  VEYRA_EXTENDED_COMMAND_ACTIONS,
  VEYRA_EXTENDED_COMMAND_TABLE,
  VEYRA_ALL_COMMAND_TABLE,
  dispatchVeyraCommand,
} from './veyra/commands.js';

// M10 feature graph: text/layout/event/accessibility/script/shader/render and
// interchange records all use the same stable typed-reference contract.
export {
  VEYRA_FEATURE_VERSION,
  VEYRA_FEATURE_KINDS,
  VEYRA_FEATURE_COLLECTIONS,
  VEYRA_TEXT_MODIFIER_TYPES,
  VEYRA_LAYOUT_MODES,
  VEYRA_LAYOUT_ALIGN,
  VEYRA_EVENT_TYPES,
  VEYRA_EVENT_ACTION_TYPES,
  VEYRA_ACCESSIBILITY_ROLES,
  VEYRA_SCRIPT_LANGUAGES,
  VEYRA_SHADER_LANGUAGES,
  VEYRA_RENDER_FORMATS,
  createFeatureRecord,
  createText,
  createLayout,
  createEvent,
  createAccessibility,
  createScript,
  createShader,
  createRenderPreset,
  createInterchangeAsset,
  featureRef,
  featureCollections,
  featureRecords,
  featureById,
  featureGraphSummary,
  featureCollectionForKind,
  normalizeFeatureGraphDocument,
  validateFeatureGraph,
} from './veyra/featureGraph.js';
export {
  createTextRef, createTextRunRef, createTextModifierRef, createLayoutRef,
  createLayoutItemRef, createEventRef, createEventActionRef,
  createAccessibilityRef, createScriptRef, createShaderRef,
  createRenderPresetRef, createInterchangeAssetRef,
} from './veyra/references.js';
export {
  VEYRA_LOTTIE_FORMAT,
  VEYRA_DOTLOTTIE_FORMAT,
  VEYRA_LOTTIE_VERSION,
  importLottie,
  exportLottie,
  serializeLottie,
  importDotLottie,
  exportDotLottie,
} from './veyra/lottie.js';
export { VEYRA_PLAYER_EVENTS, VeyraPlayer, createVeyraPlayer, registerVeyraPlayerElement } from './veyra/player.js';
export {
  VEYRA_GRAPH_NODE_WIDTH,
  VEYRA_GRAPH_NODE_HEIGHT,
  VEYRA_GRAPH_SNAP,
  GraphEditorState,
  createGraphEditorState,
  createGraphEditorController,
  snapGraphPoint,
  graphNodePoint,
  graphNodeBounds,
  renderMachineGraphSvg,
} from './veyra/graphEditor.js';
