// Canonical M3 service metadata. Adding/removing an operation here must stay
// mechanically aligned with createVeyraControlPlane, manifest declarations,
// and browser adapter tests; this registry is metadata, not a second service implementation.
export const VEYRA_SERVICE_DEFINITIONS = Object.freeze({
  getManifest: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Return the canonical bounded project manifest.' }),
  queryEntities: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Query stable entities through the canonical semantic index.' }),
  resolveSemantic: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Resolve semantic intent to stable typed refs with evidence.' }),
  read: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Read an entity or property with authored/evaluated source context.' }),
  previewCommand: Object.freeze({ mode: 'preview', deterministic: true, mutates: false, summary: 'Dry-run one real command against an isolated Store clone.' }),
  dispatchCommand: Object.freeze({ mode: 'write', deterministic: true, mutates: true, summary: 'Dispatch one validated JSON-safe command through the canonical command bus.' }),
  dispatchPlan: Object.freeze({ mode: 'write', deterministic: true, mutates: true, atomic: true, summary: 'Preflight and atomically commit an ordered command plan.' }),
  validateDocument: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Validate/normalize the current document without mutation.' }),
  verifyChange: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Evaluate structured post-change assertions with evidence.' }),
  getDependencyGraph: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Inspect bounded forward/reverse dependency and ownership edges.' }),
  getOwnership: Object.freeze({ mode: 'read', deterministic: true, mutates: false, summary: 'Inspect authored/evaluated ownership and potential controllers.' }),
});

export const VEYRA_SERVICE_NAMES = Object.freeze(Object.keys(VEYRA_SERVICE_DEFINITIONS).sort());

// Machine-readable contract for persistent/global browser mutation helpers.
// Command-backed helpers must route through controlPlane.dispatchCommand;
// direct Store/runtime seams are explicit and must carry a reason.
export const VEYRA_BROWSER_MUTATION_COMPATIBILITY = Object.freeze({
  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),
  createTimeline: Object.freeze({ transport: 'command', action: 'addTimeline' }),
  setKeyframe: Object.freeze({ transport: 'command', action: 'setKeyframe' }),
  removeKeyframe: Object.freeze({ transport: 'command', action: 'removeKeyframe' }),
  moveKeyframe: Object.freeze({ transport: 'command', action: 'moveKeyframe' }),
  createMachine: Object.freeze({ transport: 'command', action: 'addStateMachine' }),
  deleteMachine: Object.freeze({ transport: 'command', action: 'removeStateMachine' }),
  addMachineInput: Object.freeze({ transport: 'command', action: 'addMachineInput' }),
  addMachineState: Object.freeze({ transport: 'command', action: 'addMachineState' }),
  removeMachineState: Object.freeze({ transport: 'command', action: 'removeMachineState' }),
  addMachineTransition: Object.freeze({ transport: 'command', action: 'addMachineTransition' }),
  removeMachineTransition: Object.freeze({ transport: 'command', action: 'removeMachineTransition' }),
  updateMachineState: Object.freeze({ transport: 'command', action: 'updateMachineState' }),
  updateMachineInput: Object.freeze({ transport: 'command', action: 'updateMachineInput' }),
  removeMachineInput: Object.freeze({ transport: 'command', action: 'removeMachineInput' }),
  updateMachineTransition: Object.freeze({ transport: 'command', action: 'updateMachineTransition' }),
  setMeshVertexWeights: Object.freeze({
    transport: 'direct-store',
    reason: 'No current VEYRA_COMMAND_TABLE action represents bulk mesh-vertex weight replacement.',
    followUp: 'future-command-surface',
  }),
  playTimeline: Object.freeze({ transport: 'runtime', reason: 'Playback state is runtime-only, not authored Store state.' }),
  stopPlayback: Object.freeze({ transport: 'runtime', reason: 'Playback state is runtime-only, not authored Store state.' }),
  setMachineInput: Object.freeze({ transport: 'runtime', reason: 'Machine runtime inputs are ephemeral runtime state.' }),
  fireMachineInput: Object.freeze({ transport: 'runtime', reason: 'Machine trigger firing is ephemeral runtime state.' }),
  stepMachine: Object.freeze({ transport: 'runtime', reason: 'Machine stepping advances ephemeral runtime state.' }),
  resetMachine: Object.freeze({ transport: 'runtime', reason: 'Machine reset changes ephemeral runtime state.' }),
  scrubMachine: Object.freeze({ transport: 'runtime', reason: 'Machine scrub changes ephemeral runtime state.' }),
});

// Machine-readable audit of remaining human-editor mutation seams. These are
// intentionally explicit so future work can converge them instead of hiding
// direct Store paths behind a cosmetic AI wrapper.
export const VEYRA_UI_MUTATION_PARITY_AUDIT = Object.freeze([
  Object.freeze({
    surface: 'globalThis.veyra canonical AI surface',
    status: 'canonical-control-plane',
    path: 'createVeyraControlPlane',
    note: 'Canonical reads/query/resolution and command-backed compatibility mutations are thin control-plane adapters.',
  }),
  Object.freeze({
    surface: 'globalThis.veyra command-backed compatibility mutations',
    status: 'canonical-control-plane',
    path: 'dispatchCompatibilityCommand -> controlPlane.dispatchCommand',
    helpers: Object.freeze(Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY)
      .filter(([, metadata]) => metadata.transport === 'command')
      .map(([name]) => name)
      .sort()),
    note: 'Every listed persistent compatibility helper has a VEYRA_COMMAND_TABLE equivalent and must use the canonical dispatcher.',
  }),
  Object.freeze({
    surface: 'globalThis.veyra direct Store compatibility mutations',
    status: 'explicit-direct-store-no-command-equivalent',
    helpers: Object.freeze(Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY)
      .filter(([, metadata]) => metadata.transport === 'direct-store')
      .map(([name]) => name)
      .sort()),
    note: 'These helpers have no current command-table equivalent; each is explicitly reasoned in VEYRA_BROWSER_MUTATION_COMPATIBILITY.',
  }),
  Object.freeze({
    surface: 'globalThis.veyra runtime-only mutation helpers',
    status: 'runtime-only-not-authored',
    helpers: Object.freeze(Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY)
      .filter(([, metadata]) => metadata.transport === 'runtime')
      .map(([name]) => name)
      .sort()),
    note: 'Runtime-only playback/machine state is intentionally outside persistent Store command history.',
  }),
  Object.freeze({
    surface: 'continuous canvas gestures',
    status: 'canonical-store-transaction-port',
    path: 'VeyraStore.begin/mutate/commit/cancel',
    note: 'Continuous pointer previews require the existing transaction port; committed authored state still crosses Store validation/normalization.',
  }),
  Object.freeze({
    surface: 'timeline and rig editor controls',
    status: 'canonical-store-direct-with-command-equivalent',
    path: 'VeyraStore public CRUD/property methods',
    note: 'Current UI still calls several Store methods directly; matching command-table actions exist and are mechanically audited by M3 tests.',
  }),
  Object.freeze({
    surface: 'document new/open/rename shell actions',
    status: 'temporary-direct-store',
    path: 'VeyraStore.replaceDocument/execute',
    note: 'Host/file lifecycle remains a browser concern. replaceDocument is command-backed; arbitrary rename helper remains a Store transaction until document property addressing is expanded.',
  }),
]);
