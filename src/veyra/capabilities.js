import {
  VEYRA_SEMANTIC_COMMAND_ACTIONS,
  VEYRA_SEMANTIC_SOURCES,
  VEYRA_SEMANTIC_STATUSES,
  VEYRA_SEMANTIC_TARGET_KINDS,
} from './semantics.js';

export { nodeCapabilities, supportsNodeProperty, rigCapabilities, supportsRigProperty } from './propertyCapabilities.js';


export const VEYRA_SEMANTIC_CAPABILITIES = Object.freeze({
  targetKinds: Object.freeze([...VEYRA_SEMANTIC_TARGET_KINDS]),
  readable: Object.freeze(['id', 'target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  writable: Object.freeze(['target', 'namespace', 'canonicalRole', 'description', 'tags', 'aliases', 'relations', 'provenance', 'status']),
  actions: Object.freeze([...VEYRA_SEMANTIC_COMMAND_ACTIONS]),
  statuses: Object.freeze([...VEYRA_SEMANTIC_STATUSES]),
  provenanceSources: Object.freeze([...VEYRA_SEMANTIC_SOURCES]),
});
