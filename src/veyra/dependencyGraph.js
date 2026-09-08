import { cloneValue, normalizeDocument } from './model.js';
import { parsePropertyAddress, readProperty } from './properties.js';
import { buildSemanticIndex } from './resolver.js';

export const VEYRA_DEPENDENCY_EDGE_TYPES = Object.freeze([
  'dependsOn',
  'usedBy',
  'owns',
  'ownedBy',
  'reads',
  'writes',
  'controls',
  'animates',
  'animatedBy',
  'references',
  'referencedBy',
  'runtimeUses',
  'semanticRelation',
]);

const DEFAULT_DEPTH = 2;
const DEFAULT_MAX_NODES = 500;
const DEFAULT_MAX_EDGES = 1500;

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return Object.is(value, -0) ? 0 : value;
}

function stableString(value) {
  return JSON.stringify(stableObject(value));
}

function refKey(ref) {
  return `ref:${ref.kind}:${ref.id}`;
}

function addressKey(address) {
  return `address:${address}`;
}

function targetKey(target) {
  if (typeof target === 'string') return addressKey(target);
  if (target?.address) return addressKey(target.address);
  const ref = target?.ref || target;
  if (ref?.kind && ref?.id) return refKey(ref);
  throw new TypeError('Dependency target must be a property address or { kind, id } typed reference.');
}

function publicTarget(target) {
  if (typeof target === 'string') return { address: target };
  if (target?.address) return { address: String(target.address) };
  const ref = target?.ref || target;
  return { ref: { kind: String(ref.kind), id: String(ref.id) } };
}

function edgeKey(edge) {
  return `${edge.type}\u0000${targetKey(edge.from)}\u0000${targetKey(edge.to)}\u0000${edge.source}\u0000${stableString(edge.detail || null)}`;
}

function graphData(input, explicitAddress = null) {
  const document = normalizeDocument(input);
  const semanticIndex = buildSemanticIndex(document, {
    maxEntities: 5000,
    maxRelationshipsPerEntity: 512,
    maxSemanticsPerEntity: 256,
  });
  const nodes = new Map();
  const edges = new Map();

  const addNode = (node) => {
    const key = targetKey(node.target);
    if (!nodes.has(key)) nodes.set(key, { key, ...node });
    return nodes.get(key);
  };

  const addEntityNode = (entity) => addNode({
    kind: 'entity',
    target: { ref: cloneValue(entity.ref) },
    entityKind: entity.kind,
    entityType: entity.type,
  });

  const addAddressNode = (address) => {
    const parsed = parsePropertyAddress(address);
    addNode({
      kind: 'propertyAddress',
      target: { address },
      reference: cloneValue(parsed.reference),
      path: parsed.path,
    });
    const ownerTarget = { ref: cloneValue(parsed.reference) };
    if (nodes.has(refKey(parsed.reference))) {
      addPair('ownedBy', 'owns', { address }, ownerTarget, { relation: 'property-owner', path: parsed.path }, 'property');
    }
  };

  const addEdge = (type, inverseType, from, to, detail = {}, source = 'structural') => {
    if (!VEYRA_DEPENDENCY_EDGE_TYPES.includes(type)) throw new TypeError(`Unsupported dependency edge type: ${type}`);
    const edge = {
      type,
      inverseType,
      from: publicTarget(from),
      to: publicTarget(to),
      source,
      detail: cloneValue(detail),
    };
    const key = edgeKey(edge);
    if (!edges.has(key)) edges.set(key, edge);
  };

  const addPair = (forwardType, reverseType, from, to, detail = {}, source = 'structural') => {
    addEdge(forwardType, reverseType, from, to, detail, source);
    addEdge(reverseType, forwardType, to, from, detail, source);
  };

  for (const entity of semanticIndex.entities) addEntityNode(entity);

  for (const entity of semanticIndex.entities) {
    const from = { ref: entity.ref };
    for (const relationship of entity.relationships) {
      const to = { ref: relationship.target };
      const detail = { relation: relationship.relation, ...(relationship.detail ? cloneValue(relationship.detail) : {}) };

      if (relationship.relation === 'owner') {
        addPair('ownedBy', 'owns', from, to, detail, relationship.source || 'structural');
        continue;
      }
      if (relationship.relation === 'parent') {
        addPair('dependsOn', 'usedBy', from, to, detail, relationship.source || 'structural');
        continue;
      }
      if (relationship.relation === 'animates' && relationship.detail?.address) {
        const address = relationship.detail.address;
        addAddressNode(address);
        addPair('animates', 'animatedBy', from, { address }, detail, 'animation');
        addPair('writes', 'usedBy', from, { address }, detail, 'animation');
        continue;
      }
      if (relationship.source === 'semantic' && relationship.relation !== 'semantic_relation_from') {
        addPair('semanticRelation', 'semanticRelation', from, to, detail, 'semantic');
        continue;
      }
      if (relationship.relation === 'describes') {
        addPair('references', 'referencedBy', from, to, detail, 'semantic-lifecycle');
        continue;
      }
      if (entity.kind === 'component' && relationship.relation === 'source_artboard') {
        addPair('dependsOn', 'usedBy', from, to, detail, 'component');
        continue;
      }
      if (entity.kind === 'componentInstance' && relationship.relation === 'instance_of') {
        addPair('dependsOn', 'usedBy', from, to, detail, 'component');
        continue;
      }
      if (entity.kind === 'componentInstance' && ['runtime_timeline','runtime_machine','remap_timeline','remap_machine'].includes(relationship.relation)) {
        addPair('runtimeUses', 'usedBy', from, to, detail, 'component-runtime');
        continue;
      }
      if (entity.kind === 'componentOverride' && relationship.relation === 'override_target') {
        if (relationship.detail?.address) {
          addAddressNode(relationship.detail.address);
          addPair('writes', 'usedBy', from, { address: relationship.detail.address }, detail, 'component-override');
        }
        addPair('references', 'referencedBy', from, to, detail, 'component-override');
        continue;
      }
      if (entity.kind === 'listener' && ['targets', 'uses_timeline', 'uses_machine', 'uses_input'].includes(relationship.relation)) {
        addPair('runtimeUses', 'usedBy', from, to, detail, 'runtime');
        continue;
      }
      if (entity.kind === 'constraint') {
        if (relationship.relation === 'uses_bone') {
          addPair('controls', 'usedBy', from, to, detail, 'constraint');
          continue;
        }
        if (relationship.relation === 'targets' || relationship.relation === 'uses_path') {
          addPair('reads', 'usedBy', from, to, detail, 'constraint');
          continue;
        }
      }
      if (entity.kind === 'mesh' && relationship.relation === 'influenced_by') {
        addPair('dependsOn', 'usedBy', from, to, detail, 'rig');
        continue;
      }
      if (entity.kind === 'meshVertex' && relationship.relation === 'weighted_by') {
        addPair('reads', 'usedBy', from, to, detail, 'rig');
        continue;
      }
      if (entity.kind === 'machineCondition' && relationship.relation === 'uses_input') {
        addPair('reads', 'usedBy', from, to, detail, 'state-machine');
        continue;
      }
      if (['uses_timeline', 'from_state', 'to_state', 'uses_input', 'uses_machine', 'weighted_by', 'influenced_by', 'uses_bone', 'targets', 'uses_path'].includes(relationship.relation)) {
        addPair('dependsOn', 'usedBy', from, to, detail, relationship.source || 'structural');
      }
    }
  }

  if (explicitAddress) addAddressNode(explicitAddress);

  const sortedNodes = [...nodes.values()].sort((left, right) => left.key.localeCompare(right.key));
  const sortedEdges = [...edges.values()].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
  return { document, nodes: new Map(sortedNodes.map((node) => [node.key, node])), edges: sortedEdges };
}

function validateTarget(document, data, refOrAddress) {
  if (refOrAddress == null) return null;
  if (typeof refOrAddress === 'string' || refOrAddress?.address) {
    const address = typeof refOrAddress === 'string' ? refOrAddress : String(refOrAddress.address);
    try {
      parsePropertyAddress(address);
      readProperty(document, address);
    } catch (error) {
      return { error: String(error?.message || error), key: addressKey(address), target: { address } };
    }
    return { key: addressKey(address), target: { address } };
  }
  const ref = refOrAddress?.ref || refOrAddress;
  if (!ref || typeof ref.kind !== 'string' || !ref.kind || typeof ref.id !== 'string' || !ref.id) {
    return { error: 'Dependency target must contain non-empty kind and id strings.', key: null, target: null };
  }
  const key = refKey(ref);
  if (!data.nodes.has(key)) return { error: `Typed reference ${ref.kind}:${ref.id} does not exist.`, key, target: { ref: cloneValue(ref) } };
  return { key, target: { ref: cloneValue(ref) } };
}

export function getDependencyGraph(input, refOrAddress = null, options = {}) {
  let explicitAddress = null;
  if (typeof refOrAddress === 'string') explicitAddress = refOrAddress;
  else if (refOrAddress?.address) explicitAddress = String(refOrAddress.address);
  const data = graphData(input, explicitAddress);
  const target = validateTarget(data.document, data, refOrAddress);
  if (target?.error) {
    return {
      format: 'veyra-dependency-graph',
      version: 1,
      status: 'notFound',
      target: target.target,
      reason: target.error,
      nodes: [],
      edges: [],
    };
  }

  const maxNodes = clampInteger(options.maxNodes, DEFAULT_MAX_NODES, 1, 5000);
  const maxEdges = clampInteger(options.maxEdges, DEFAULT_MAX_EDGES, 1, 10000);
  const depth = clampInteger(options.depth, target ? DEFAULT_DEPTH : 32, 0, 32);
  let selectedKeys;

  if (!target) {
    selectedKeys = new Set(data.nodes.keys());
  } else {
    selectedKeys = new Set([target.key]);
    let frontier = new Set([target.key]);
    for (let level = 0; level < depth && frontier.size; level += 1) {
      const next = new Set();
      for (const edge of data.edges) {
        const fromKey = targetKey(edge.from);
        const toKey = targetKey(edge.to);
        if (frontier.has(fromKey) && !selectedKeys.has(toKey)) next.add(toKey);
        if (frontier.has(toKey) && !selectedKeys.has(fromKey)) next.add(fromKey);
      }
      for (const key of [...next].sort()) selectedKeys.add(key);
      frontier = next;
    }
  }

  const availableNodes = [...selectedKeys]
    .map((key) => data.nodes.get(key))
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key));
  const returnedNodes = availableNodes.slice(0, maxNodes);
  const returnedNodeKeys = new Set(returnedNodes.map((node) => node.key));
  const availableEdges = data.edges.filter((edge) => returnedNodeKeys.has(targetKey(edge.from)) && returnedNodeKeys.has(targetKey(edge.to)));
  const returnedEdges = availableEdges.slice(0, maxEdges);

  return {
    format: 'veyra-dependency-graph',
    version: 1,
    status: 'ok',
    target: target?.target || null,
    depth,
    nodeCount: availableNodes.length,
    edgeCount: availableEdges.length,
    returnedNodeCount: returnedNodes.length,
    returnedEdgeCount: returnedEdges.length,
    truncated: returnedNodes.length < availableNodes.length || returnedEdges.length < availableEdges.length,
    nodes: returnedNodes.map((node) => cloneValue(node)),
    edges: returnedEdges.map((edge) => cloneValue(edge)),
  };
}
