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

// Machine-readable audit of remaining human-editor mutation seams. These are
// intentionally explicit so future work can converge them instead of hiding
// direct Store paths behind a cosmetic AI wrapper.
export const VEYRA_UI_MUTATION_PARITY_AUDIT = Object.freeze([
  Object.freeze({
    surface: 'globalThis.veyra canonical AI surface',
    status: 'canonical-control-plane',
    path: 'createVeyraControlPlane',
    note: 'M3 canonical read/preview/dispatch/plan/verify/dependency/ownership operations are thin service adapters.',
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
