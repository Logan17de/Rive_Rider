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
