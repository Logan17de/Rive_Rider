from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Correction 1: deterministic implicit ids use the current stable-id snapshot.
# ---------------------------------------------------------------------------
control = read('src/veyra/controlPlane.js')
control = replace_once(
    control,
    """function deterministicId(prefix, seed, suffix = '') {
  return `${prefix}_m3_${deterministicHash(`${seed}:${suffix}`)}`;
}

function withId(value, prefix, seed, suffix) {
""",
    """function deterministicId(prefix, seed, suffix = '') {
  return `${prefix}_m3_${deterministicHash(`${seed}:${suffix}`)}`;
}

// Snapshot generation is derived only from stable ids and their structural
// locations. Human names, timestamps, authored numeric values, and array order
// do not participate. A successful create changes the stable-id set, while a
// failed preview/dispatch does not, so repeated legitimate creates advance
// deterministically without a mutable counter or wall clock.
function stableIdGeneration(document) {
  const entries = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, path);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id) entries.push(`${path}:${value.id}`);
    for (const key of Object.keys(value).sort()) {
      if (['id', 'name', 'createdAt', 'updatedAt'].includes(key)) continue;
      const child = value[key];
      if (Array.isArray(child)) visit(child, `${path}.${key}`);
      else if (child && typeof child === 'object' && typeof child.id === 'string') visit(child, `${path}.${key}`);
    }
  };
  visit(document, 'document');
  entries.sort();
  return deterministicHash(stableString(entries));
}

function withId(value, prefix, seed, suffix) {
""",
    'stable-id generation helper',
)
control = replace_once(
    control,
    "const seed = stableString({ documentId: document.id, descriptor: next, salt });",
    "const seed = stableString({ documentId: document.id, generation: stableIdGeneration(document), descriptor: next, salt });",
    'prepared-command state generation seed',
)
write('src/veyra/controlPlane.js', control)


# ---------------------------------------------------------------------------
# Correction 2: Store add/remove paths preserve supplied command provenance.
# ---------------------------------------------------------------------------
store = read('src/veyra/store.js')
store = replace_once(
    store,
    """  if (descriptor.planSteps !== undefined) normalized.planSteps = cloneValue(descriptor.planSteps);
  return normalized;
""",
    """  if (descriptor.planSteps !== undefined) normalized.planSteps = cloneValue(descriptor.planSteps);
  if (descriptor.metadata !== undefined) normalized.metadata = cloneValue(descriptor.metadata);
  return normalized;
""",
    'supported command metadata preservation',
)
store = replace_once(
    store,
    """  add(type, options = {}) {
    const node = createNode(type, options);
    this.execute(`Add ${type}`, (document) => {
      document.nodes.push(node);
    });
    this.select(node.id);
    return node;
  }

  remove(nodeId) {
    const node = nodeById(this.document, nodeId);
    if (!node) return false;
    const removed = new Set([nodeId, ...descendantIds(this.document, nodeId)]);
    this.execute(`Delete ${node.name}`, (document) => {
      document.nodes = document.nodes.filter((candidate) => !removed.has(candidate.id));
      document.semantics = document.semantics.filter((record) => !removed.has(referenceId(record.target, 'node')));
      document.constraints = document.constraints.filter((constraint) => !removed.has(referenceId(constraint.path, 'node')));
    });
    this.selectedId = null;
    this.selectedKind = null;
    this.#emit('selection');
    return true;
  }
""",
    """  add(type, options = {}, commandDescriptor = {}) {
    const node = createNode(type, options);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add ${type}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.nodes.push(node);
    });
    this.select(node.id);
    return node;
  }

  remove(nodeId, commandDescriptor = {}) {
    const node = nodeById(this.document, nodeId);
    if (!node) return false;
    const removed = new Set([nodeId, ...descendantIds(this.document, nodeId)]);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete ${node.name}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.nodes = document.nodes.filter((candidate) => !removed.has(candidate.id));
      document.semantics = document.semantics.filter((record) => !removed.has(referenceId(record.target, 'node')));
      document.constraints = document.constraints.filter((constraint) => !removed.has(referenceId(constraint.path, 'node')));
    });
    this.selectedId = null;
    this.selectedKind = null;
    this.#emit('selection');
    return true;
  }
""",
    'node add/remove provenance forwarding',
)
store = replace_once(
    store,
    """  removeSelection() {
    const reference = this.selectedRef;
    const object = this.selectedObject;
    if (!reference || !object) return false;
    if (reference.kind === 'node') return this.remove(reference.id);
    const descriptor = { label: `Delete ${object.name}` };
    if (reference.kind === 'bone') return this.removeBone(reference.id, descriptor);
    if (reference.kind === 'mesh') return this.removeMesh(reference.id, descriptor);
    if (reference.kind === 'control') return this.removeControl(reference.id, descriptor);
    if (reference.kind === 'constraint') return this.removeConstraint(reference.id, descriptor);
    return false;
  }
""",
    """  removeSelection(commandDescriptor = {}) {
    const reference = this.selectedRef;
    const object = this.selectedObject;
    if (!reference || !object) return false;
    if (reference.kind === 'node') return this.remove(reference.id, commandDescriptor);
    if (reference.kind === 'bone') return this.removeBone(reference.id, commandDescriptor);
    if (reference.kind === 'mesh') return this.removeMesh(reference.id, commandDescriptor);
    if (reference.kind === 'control') return this.removeControl(reference.id, commandDescriptor);
    if (reference.kind === 'constraint') return this.removeConstraint(reference.id, commandDescriptor);
    return false;
  }
""",
    'selection removal provenance forwarding',
)
write('src/veyra/store.js', store)

commands = read('src/veyra/commands.js')
commands = replace_once(
    commands,
    "run: (store, args) => store.add(args.type, args.options ?? {}),",
    "run: (store, args, command) => store.add(args.type, args.options ?? {}, command ?? {}),",
    'add command provenance forwarding',
)
commands = replace_once(
    commands,
    "run: (store, args) => store.remove(args.nodeId),",
    "run: (store, args, command) => store.remove(args.nodeId, command ?? {}),",
    'remove command provenance forwarding',
)
commands = replace_once(
    commands,
    "run: (store) => store.removeSelection(),",
    "run: (store, args, command) => store.removeSelection(command ?? {}),",
    'removeSelection command provenance forwarding',
)
commands = replace_once(
    commands,
    """function genericManifestParameters(entry) {
  return entry.params.map((spec) => manifestParameter(
    spec.name,
    spec.type === 'string' && spec.name === 'type' ? 'string' : spec.type,
    spec.required,
    `${titleCase(spec.name)} for this command.`,
  ));
}

for (const [commandName, entry] of Object.entries(COMMAND_TABLE)) {
""",
    """function genericManifestParameters(entry) {
  return entry.params.map((spec) => manifestParameter(
    spec.name,
    spec.type === 'string' && spec.name === 'type' ? 'string' : spec.type,
    spec.required,
    `${titleCase(spec.name)} for this command.`,
  ));
}

function provenanceAuditValue(type) {
  return {
    string: 'audit',
    number: 0,
    boolean: false,
    array: [],
    reference: { kind: 'node', id: 'audit' },
    object: {},
    document: {},
    any: null,
  }[type];
}

function auditCommandProvenance(commandName, entry) {
  if (!entry.capabilities.includes('undoable')) {
    return Object.freeze({ status: 'not-history-mutation', reason: 'command does not advertise an undoable committed Store history mutation' });
  }
  const marker = Object.freeze({ __veyraProvenanceAudit: commandName });
  let forwarded = false;
  const fakeStore = new Proxy({}, {
    get: () => (...args) => {
      if (args.includes(marker)) forwarded = true;
      return null;
    },
  });
  const args = Object.fromEntries(entry.params.map((spec) => [spec.name, provenanceAuditValue(spec.type)]));
  try {
    entry.run(fakeStore, args, marker);
  } catch (error) {
    throw new TypeError(`Command provenance audit could not exercise ${commandName}: ${error?.message || error}`);
  }
  if (!forwarded) {
    throw new TypeError(`Undoable command ${commandName} does not forward canonical command provenance to its Store method.`);
  }
  return Object.freeze({
    status: 'preserved',
    fields: Object.freeze(['source', 'label', 'propertyAddresses', 'metadata']),
  });
}

for (const [commandName, entry] of Object.entries(COMMAND_TABLE)) {
""",
    'mechanical command provenance audit helper',
)
commands = replace_once(
    commands,
    """    hostAvailability: 'available',
  });
}

for (const action of VEYRA_SEMANTIC_COMMAND_ACTIONS) {
""",
    """    hostAvailability: 'available',
  });
  entry.provenance = auditCommandProvenance(commandName, entry);
}

for (const action of VEYRA_SEMANTIC_COMMAND_ACTIONS) {
""",
    'attach provenance audit to every command',
)
commands = replace_once(
    commands,
    """export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);

export const VEYRA_COMMAND_ACTIONS = Object.freeze(Object.keys(COMMAND_TABLE).sort());
""",
    """export const VEYRA_COMMAND_TABLE = Object.freeze(COMMAND_TABLE);

export const VEYRA_COMMAND_ACTIONS = Object.freeze(Object.keys(COMMAND_TABLE).sort());

export const VEYRA_COMMAND_PROVENANCE_AUDIT = Object.freeze(Object.fromEntries(
  VEYRA_COMMAND_ACTIONS.map((action) => [action, VEYRA_COMMAND_TABLE[action].provenance]),
));
""",
    'export command provenance audit',
)
write('src/veyra/commands.js', commands)


# ---------------------------------------------------------------------------
# Correction 3: browser compatibility mutations converge on controlPlane.
# ---------------------------------------------------------------------------
registry = read('src/veyra/serviceRegistry.js')
registry = replace_once(
    registry,
    """export const VEYRA_SERVICE_NAMES = Object.freeze(Object.keys(VEYRA_SERVICE_DEFINITIONS).sort());

// Machine-readable audit of remaining human-editor mutation seams. These are
""",
    """export const VEYRA_SERVICE_NAMES = Object.freeze(Object.keys(VEYRA_SERVICE_DEFINITIONS).sort());

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
""",
    'browser mutation compatibility registry',
)
registry = replace_once(
    registry,
    """  Object.freeze({
    surface: 'globalThis.veyra canonical AI surface',
    status: 'canonical-control-plane',
    path: 'createVeyraControlPlane',
    note: 'M3 canonical read/preview/dispatch/plan/verify/dependency/ownership operations are thin service adapters.',
  }),
""",
    """  Object.freeze({
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
""",
    'expand mutation parity audit to browser seams',
)
write('src/veyra/serviceRegistry.js', registry)

manifest = read('src/veyra/manifest.js')
manifest = replace_once(
    manifest,
    "import { VEYRA_COMMAND_ACTIONS, VEYRA_COMMAND_TABLE } from './commands.js';",
    "import { VEYRA_COMMAND_ACTIONS, VEYRA_COMMAND_PROVENANCE_AUDIT, VEYRA_COMMAND_TABLE } from './commands.js';",
    'manifest command provenance import',
)
manifest = replace_once(
    manifest,
    "import { VEYRA_SERVICE_DEFINITIONS, VEYRA_UI_MUTATION_PARITY_AUDIT } from './serviceRegistry.js';",
    "import { VEYRA_BROWSER_MUTATION_COMPATIBILITY, VEYRA_SERVICE_DEFINITIONS, VEYRA_UI_MUTATION_PARITY_AUDIT } from './serviceRegistry.js';",
    'manifest browser mutation audit import',
)
manifest = replace_once(
    manifest,
    """      commandActions: [...VEYRA_COMMAND_ACTIONS],
      uiMutationParityAudit: cloneValue(VEYRA_UI_MUTATION_PARITY_AUDIT),
""",
    """      commandActions: [...VEYRA_COMMAND_ACTIONS],
      commandProvenanceAudit: cloneValue(VEYRA_COMMAND_PROVENANCE_AUDIT),
      browserMutationCompatibility: cloneValue(VEYRA_BROWSER_MUTATION_COMPATIBILITY),
      uiMutationParityAudit: cloneValue(VEYRA_UI_MUTATION_PARITY_AUDIT),
""",
    'manifest control-plane audits',
)
write('src/veyra/manifest.js', manifest)

index = read('src/index.js')
index = replace_once(
    index,
    """  VEYRA_SERVICE_DEFINITIONS,
  VEYRA_SERVICE_NAMES,
  VEYRA_UI_MUTATION_PARITY_AUDIT,
""",
    """  VEYRA_BROWSER_MUTATION_COMPATIBILITY,
  VEYRA_SERVICE_DEFINITIONS,
  VEYRA_SERVICE_NAMES,
  VEYRA_UI_MUTATION_PARITY_AUDIT,
""",
    'public browser mutation compatibility export',
)
write('src/index.js', index)

browser = read('veyra.js')
browser = replace_once(
    browser,
    "import { buildSemanticIndex, queryEntities, resolveSemantic } from './src/veyra/resolver.js';",
    "import { buildSemanticIndex } from './src/veyra/resolver.js';",
    'remove direct browser resolver imports',
)
browser = replace_once(
    browser,
    """const controlPlane = createVeyraControlPlane(store);

globalThis.veyra = Object.freeze({
  getManifest: (options = {}) => controlPlane.getManifest(options),
  queryEntities: (query = {}, options = {}) => queryEntities(store.document, query, options),
  resolveSemantic: (intent, options = {}) => resolveSemantic(store.document, intent, options),
""",
    """const controlPlane = createVeyraControlPlane(store);

function compactJson(value) {
  if (Array.isArray(value)) return value.map(compactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compactJson(item)]));
  }
  return value;
}

function dispatchCompatibilityCommand(action, args, command) {
  const result = controlPlane.dispatchCommand(compactJson({ action, args, command }));
  if (!result.ok) throw new TypeError(result.error);
  return result.result;
}

globalThis.veyra = Object.freeze({
  getManifest: (options = {}) => controlPlane.getManifest(options),
  queryEntities: (query = {}, options = {}) => controlPlane.queryEntities(query, options),
  resolveSemantic: (intent, options = {}) => controlPlane.resolveSemantic(intent, options),
""",
    'browser canonical resolver/control-plane adapters',
)
browser = replace_once(
    browser,
    """  createTimeline: ({ name = 'Timeline', duration = 60, fps = 30, loop = 'none' } = {}) => {
    return store.addTimeline({ name, duration, fps, loop }, { label: `Create timeline ${name}`, source: 'script' });
  },
  setKeyframe: ({ timelineId, address, frame, value, easing = 'ease-in-out', easingParams }) => {
    store.setKeyframe({ timelineId, address, frame, value, easing, easingParams }, { label: 'Set keyframe', source: 'script' });
    return true;
  },
  removeKeyframe: ({ timelineId, address, frame }) => {
    return store.removeKeyframe({ timelineId, address, frame }, { label: 'Remove keyframe', source: 'script' });
  },
""",
    """  createTimeline: ({ name = 'Timeline', duration = 60, fps = 30, loop = 'none' } = {}) => {
    return dispatchCompatibilityCommand('addTimeline', { overrides: { name, duration, fps, loop } }, {
      label: `Create timeline ${name}`,
      source: 'script',
    });
  },
  setKeyframe: ({ timelineId, address, frame, value, easing = 'ease-in-out', easingParams }) => {
    return Boolean(dispatchCompatibilityCommand('setKeyframe', {
      timelineId, address, frame, value, easing, easingParams,
    }, { label: 'Set keyframe', source: 'script' }));
  },
  removeKeyframe: ({ timelineId, address, frame }) => {
    return Boolean(dispatchCompatibilityCommand('removeKeyframe', {
      timelineId, address, frame,
    }, { label: 'Remove keyframe', source: 'script' }));
  },
  moveKeyframe: ({ timelineId, address, fromFrame, toFrame }) => {
    return Boolean(dispatchCompatibilityCommand('moveKeyframe', {
      timelineId, address, fromFrame, toFrame,
    }, { label: 'Move keyframe', source: 'script' }));
  },
""",
    'timeline/keyframe browser compatibility dispatch',
)
browser = replace_once(
    browser,
    """  createMachine: ({ name = 'State Machine', inputs = [], states = [], transitions = [], initial } = {}) => {
    return store.addStateMachine({ name, inputs, states, transitions, initial }, {
      label: `Create state machine ${name}`,
      source: 'script',
    });
  },
  deleteMachine: (machineId) => {
    const machine = machineById(store.document, machineId);
    if (!machine) return false;
    machineRuntimes.delete(machineId);
    return store.removeStateMachine(machineId, { label: `Delete state machine ${machine.name}`, source: 'script' });
  },
  addMachineInput: (machineId, { name = 'Value', type = 'number', value }) => {
    return store.addMachineInput(machineId, { name, type, value }, {
      label: `Add machine input ${name}`,
      source: 'script',
    });
  },
  addMachineState: (machineId, { name = 'State', timelineId, type = 'animation' }) => {
    return store.addMachineState(machineId, { name, type, timeline: createTimelineRef(timelineId) }, {
      label: `Add state ${name}`,
      source: 'script',
    });
  },
  removeMachineState: (machineId, stateId) => {
    return store.removeMachineState(machineId, stateId, { label: 'Delete machine state', source: 'script' });
  },
  addMachineTransition: (machineId, { from, to, duration = 0, after, conditions = [] }) => {
    return store.addMachineTransition(machineId, {
      from: createMachineStateRef(from),
      to: createMachineStateRef(to),
      duration,
      after,
      conditions: conditions.map((condition) => ({
        input: createMachineInputRef(condition.input),
        op: condition.op,
        value: condition.value,
      })),
    }, { label: 'Add machine transition', source: 'script' });
  },
  removeMachineTransition: (machineId, transitionId) => {
    return store.removeMachineTransition(machineId, transitionId, { label: 'Delete machine transition', source: 'script' });
  },
  updateMachineState: (machineId, stateId, changes) => {
    return store.updateMachineState(machineId, stateId, changes, { label: `Update machine state ${stateId}`, source: 'script' });
  },
  updateMachineInput: (machineId, inputId, changes) => {
    return store.updateMachineInput(machineId, inputId, changes, { label: `Update machine input ${inputId}`, source: 'script' });
  },
  removeMachineInput: (machineId, inputId) => {
    return store.removeMachineInput(machineId, inputId, { label: `Delete machine input ${inputId}`, source: 'script' });
  },
  updateMachineTransition: (machineId, transitionId, changes) => {
    return store.updateMachineTransition(machineId, transitionId, changes, { label: `Update machine transition ${transitionId}`, source: 'script' });
  },
""",
    """  createMachine: ({ name = 'State Machine', inputs = [], states = [], transitions = [], initial } = {}) => {
    return dispatchCompatibilityCommand('addStateMachine', { overrides: { name, inputs, states, transitions, initial } }, {
      label: `Create state machine ${name}`,
      source: 'script',
    });
  },
  deleteMachine: (machineId) => {
    const machine = machineById(store.document, machineId);
    if (!machine) return false;
    const removed = Boolean(dispatchCompatibilityCommand('removeStateMachine', { machineId }, {
      label: `Delete state machine ${machine.name}`,
      source: 'script',
    }));
    if (removed) machineRuntimes.delete(machineId);
    return removed;
  },
  addMachineInput: (machineId, { name = 'Value', type = 'number', value }) => {
    return dispatchCompatibilityCommand('addMachineInput', { machineId, overrides: { name, type, value } }, {
      label: `Add machine input ${name}`,
      source: 'script',
    });
  },
  addMachineState: (machineId, { name = 'State', timelineId, type = 'animation' }) => {
    return dispatchCompatibilityCommand('addMachineState', { machineId, overrides: { name, type, timelineId } }, {
      label: `Add state ${name}`,
      source: 'script',
    });
  },
  removeMachineState: (machineId, stateId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineState', { machineId, stateId }, {
      label: 'Delete machine state', source: 'script',
    }));
  },
  addMachineTransition: (machineId, { from, to, duration = 0, after, conditions = [] }) => {
    return dispatchCompatibilityCommand('addMachineTransition', {
      machineId,
      overrides: {
        from, to, duration, after,
        conditions: conditions.map((condition) => ({ input: condition.input, op: condition.op, value: condition.value })),
      },
    }, { label: 'Add machine transition', source: 'script' });
  },
  removeMachineTransition: (machineId, transitionId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineTransition', { machineId, transitionId }, {
      label: 'Delete machine transition', source: 'script',
    }));
  },
  updateMachineState: (machineId, stateId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineState', { machineId, stateId, changes }, {
      label: `Update machine state ${stateId}`, source: 'script',
    }));
  },
  updateMachineInput: (machineId, inputId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineInput', { machineId, inputId, changes }, {
      label: `Update machine input ${inputId}`, source: 'script',
    }));
  },
  removeMachineInput: (machineId, inputId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineInput', { machineId, inputId }, {
      label: `Delete machine input ${inputId}`, source: 'script',
    }));
  },
  updateMachineTransition: (machineId, transitionId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineTransition', { machineId, transitionId, changes }, {
      label: `Update machine transition ${transitionId}`, source: 'script',
    }));
  },
""",
    'state-machine browser compatibility dispatch',
)
write('veyra.js', browser)


# ---------------------------------------------------------------------------
# Replace brittle M2 source-contract check with stronger control-plane parity.
# ---------------------------------------------------------------------------
resolver_test = read('tests/veyra-resolver.test.mjs')
resolver_test = replace_once(
    resolver_test,
    "import { buildSemanticIndex, queryEntities, resolveSemantic } from '../src/veyra/resolver.js';",
    "import { buildSemanticIndex, queryEntities, resolveSemantic } from '../src/veyra/resolver.js';\nimport { createVeyraControlPlane } from '../src/veyra/controlPlane.js';",
    'M2 control-plane import',
)
resolver_test = replace_once(
    resolver_test,
    """const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
assert.match(browserSource, /queryEntities:\\s*\\(query = \\{\\}, options = \\{\\}\\) => queryEntities\\(store\\.document, query, options\\)/);
assert.match(browserSource, /resolveSemantic:\\s*\\(intent, options = \\{\\}\\) => resolveSemantic\\(store\\.document, intent, options\\)/);
assert.match(browserSource, /getSemanticIndex:\\s*\\(options = \\{\\}\\) => buildSemanticIndex\\(store\\.document, options\\)/);
""",
    """const resolverPlane = createVeyraControlPlane(store);
assert.deepEqual(
  resolverPlane.queryEntities({ semantic: { tag: 'eye' } }),
  queryEntities(store.document, { semantic: { tag: 'eye' } }),
  'control-plane query must reuse canonical resolver behavior',
);
assert.deepEqual(
  resolverPlane.resolveSemantic('right_eye'),
  resolveSemantic(store.document, 'right_eye'),
  'control-plane resolution must reuse canonical resolver behavior',
);
const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
assert.match(browserSource, /queryEntities:\\s*\\(query = \\{\\}, options = \\{\\}\\) => controlPlane\\.queryEntities\\(query, options\\)/);
assert.match(browserSource, /resolveSemantic:\\s*\\(intent, options = \\{\\}\\) => controlPlane\\.resolveSemantic\\(intent, options\\)/);
assert.match(browserSource, /getSemanticIndex:\\s*\\(options = \\{\\}\\) => buildSemanticIndex\\(store\\.document, options\\)/);
""",
    'M2 browser resolver behavior/identity contract',
)
write('tests/veyra-resolver.test.mjs', resolver_test)


# ---------------------------------------------------------------------------
# Dedicated correction regression suite.
# ---------------------------------------------------------------------------
correction_test = r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDocument,
  createNode,
  normalizeDocument,
} from '../src/veyra/model.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  VEYRA_COMMAND_PROVENANCE_AUDIT,
  VEYRA_COMMAND_TABLE,
} from '../src/veyra/commands.js';
import { createProjectManifest } from '../src/veyra/manifest.js';
import { queryEntities, resolveSemantic } from '../src/veyra/resolver.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import {
  VEYRA_BROWSER_MUTATION_COMPATIBILITY,
  VEYRA_UI_MUTATION_PARITY_AUDIT,
} from '../src/veyra/serviceRegistry.js';

function fixture() {
  return normalizeDocument(createDocument({
    id: 'm3_correction_doc',
    name: 'Correction fixture',
    nodes: [createNode('ellipse', {
      id: 'base_node',
      name: 'Display only',
      transform: { x: 10, y: 20 },
      geometry: { width: 80, height: 50 },
    })],
  }));
}

function implicitNodeId(preview) {
  return preview.preparedCommand?.args?.options?.id;
}

function implicitTimelineId(preview) {
  return preview.preparedCommand?.args?.overrides?.id;
}

const createCommand = {
  action: 'add',
  args: { type: 'ellipse', options: { name: 'Repeated create' } },
  command: { label: 'AI repeated create', source: 'ai' },
};

// Correction 1. Preview/dispatch align for one snapshot, then the changed
// snapshot deterministically advances the implicit id instead of colliding.
const repeatStore = new VeyraStore(fixture());
const repeatPlane = createVeyraControlPlane(repeatStore);
const firstPreview = repeatPlane.previewCommand(createCommand);
assert.equal(firstPreview.ok, true);
const firstId = implicitNodeId(firstPreview);
assert.ok(firstId);
const firstDispatch = repeatPlane.dispatchCommand(createCommand);
assert.equal(firstDispatch.ok, true);
assert.equal(firstDispatch.result.id, firstId);

const secondPreview = repeatPlane.previewCommand(createCommand);
assert.equal(secondPreview.ok, true);
const secondId = implicitNodeId(secondPreview);
assert.ok(secondId);
assert.notEqual(secondId, firstId, 'same create after a successful mutation must get a new implicit id');
const secondDispatch = repeatPlane.dispatchCommand(createCommand);
assert.equal(secondDispatch.ok, true);
assert.equal(secondDispatch.result.id, secondId, 'second preview must predict second dispatch id');

// Non-node registry repeats obey the same snapshot-generation contract.
const timelineCommand = {
  action: 'addTimeline',
  args: { overrides: { name: 'Repeated timeline', duration: 30, fps: 30 } },
  command: { label: 'AI timeline', source: 'ai' },
};
const timelinePreview1 = repeatPlane.previewCommand(timelineCommand);
const timelineId1 = implicitTimelineId(timelinePreview1);
assert.ok(timelineId1);
assert.equal(repeatPlane.dispatchCommand(timelineCommand).result, timelineId1);
const timelinePreview2 = repeatPlane.previewCommand(timelineCommand);
const timelineId2 = implicitTimelineId(timelinePreview2);
assert.notEqual(timelineId2, timelineId1);
assert.equal(repeatPlane.dispatchCommand(timelineCommand).result, timelineId2);

// Failed preview/dispatch does not consume or perturb the next implicit id.
const nextBeforeFailure = implicitNodeId(repeatPlane.previewCommand(createCommand));
const failedPreview = repeatPlane.previewCommand({
  action: 'add',
  args: { type: 'definitely-not-a-node', options: {} },
  command: { label: 'Invalid preview', source: 'ai' },
});
assert.equal(failedPreview.ok, false);
assert.equal(implicitNodeId(repeatPlane.previewCommand(createCommand)), nextBeforeFailure);
const beforeDuplicateDocument = serializeVeyra(repeatStore.document);
const beforeDuplicateRevision = repeatStore.revision;
const beforeDuplicateHistory = JSON.stringify(repeatStore.commandHistory);
const duplicate = repeatPlane.dispatchCommand({
  action: 'add',
  args: { type: 'ellipse', options: { id: 'base_node', name: 'Duplicate explicit id' } },
  command: { label: 'Explicit duplicate', source: 'ai' },
});
assert.equal(duplicate.ok, false, 'explicit duplicate ids must still fail precisely');
assert.equal(serializeVeyra(repeatStore.document), beforeDuplicateDocument);
assert.equal(repeatStore.revision, beforeDuplicateRevision);
assert.equal(JSON.stringify(repeatStore.commandHistory), beforeDuplicateHistory);
assert.equal(implicitNodeId(repeatPlane.previewCommand(createCommand)), nextBeforeFailure);

// Undo restores the prior stable-id snapshot, so the undone id is reused only
// while absent. Redo restores that id, so the next create advances again.
const undoStore = new VeyraStore(fixture());
const undoPlane = createVeyraControlPlane(undoStore);
const undoCreated = undoPlane.dispatchCommand(createCommand);
const undoneId = undoCreated.result.id;
assert.equal(undoStore.undo(), true);
assert.equal(implicitNodeId(undoPlane.previewCommand(createCommand)), undoneId);
assert.equal(undoPlane.dispatchCommand(createCommand).result.id, undoneId);

const redoStore = new VeyraStore(fixture());
const redoPlane = createVeyraControlPlane(redoStore);
const redoCreated = redoPlane.dispatchCommand(createCommand);
const redoneId = redoCreated.result.id;
assert.equal(redoStore.undo(), true);
assert.equal(redoStore.redo(), true);
const afterRedoId = implicitNodeId(redoPlane.previewCommand(createCommand));
assert.notEqual(afterRedoId, redoneId);
assert.equal(redoPlane.dispatchCommand(createCommand).result.id, afterRedoId);

// Correction 2. Canonical command provenance survives all the way to history.
const provenanceStore = new VeyraStore(fixture());
const provenancePlane = createVeyraControlPlane(provenanceStore);
const aiAdd = provenancePlane.dispatchCommand({
  action: 'add',
  args: { type: 'rectangle', options: { name: 'AI object' } },
  command: {
    label: 'AI create object',
    source: 'ai',
    propertyAddresses: ['node:base_node/opacity'],
    metadata: { requestId: 'req-1' },
  },
});
assert.equal(aiAdd.ok, true);
let history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'ai');
assert.equal(history.label, 'AI create object');
assert.deepEqual(history.propertyAddresses, ['node:base_node/opacity']);
assert.deepEqual(history.metadata, { requestId: 'req-1' });

const scriptedDelete = provenancePlane.dispatchCommand({
  action: 'remove',
  args: { nodeId: aiAdd.result.id },
  command: { label: 'Script delete object', source: 'script' },
});
assert.equal(scriptedDelete.ok, true);
history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'script');
assert.equal(history.label, 'Script delete object');

const aiTimeline = provenancePlane.dispatchCommand({
  action: 'addTimeline',
  args: { overrides: { name: 'AI authored timeline' } },
  command: { label: 'AI create timeline', source: 'ai' },
});
assert.equal(aiTimeline.ok, true);
history = provenanceStore.commandHistory.at(-1);
assert.equal(history.source, 'ai');
assert.equal(history.label, 'AI create timeline');

const historyBeforeInvalid = JSON.stringify(provenanceStore.commandHistory);
assert.equal(provenancePlane.dispatchCommand({
  action: 'setProperty',
  args: { address: 'node:missing/opacity', value: 0.5 },
  command: { label: 'Invalid AI command', source: 'ai' },
}).ok, false);
assert.equal(JSON.stringify(provenanceStore.commandHistory), historyBeforeInvalid);

for (const [action, entry] of Object.entries(VEYRA_COMMAND_TABLE)) {
  const audit = VEYRA_COMMAND_PROVENANCE_AUDIT[action];
  assert.deepEqual(entry.provenance, audit);
  if (entry.capabilities.includes('undoable')) {
    assert.equal(audit.status, 'preserved', `undoable ${action} must mechanically prove provenance forwarding`);
  }
}

// Correction 3. Browser compatibility mutation map is explicit and every
// command-backed helper is statically tied to the canonical dispatcher.
const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
function helperSource(name) {
  const matcher = new RegExp(`^  ${name}:([\\s\\S]*?)(?=^  [A-Za-z][A-Za-z0-9]*:|^\\}\\);)`, 'm');
  const match = browserSource.match(matcher);
  assert.ok(match, `globalThis.veyra helper ${name} must exist`);
  return match[0];
}

const mutatingStoreCall = /\\bstore\\.(?:execute|add|remove|update|set)[A-Za-z0-9_]*/;
for (const [helper, metadata] of Object.entries(VEYRA_BROWSER_MUTATION_COMPATIBILITY)) {
  const source = helperSource(helper);
  if (metadata.transport === 'command') {
    assert.ok(VEYRA_COMMAND_TABLE[metadata.action], `${helper} must map to a real command action`);
    assert.match(source, new RegExp(`dispatchCompatibilityCommand\\('${metadata.action}'`));
    assert.doesNotMatch(source, mutatingStoreCall, `${helper} must not bypass canonical dispatcher`);
  } else if (metadata.transport === 'direct-store') {
    assert.ok(metadata.reason && metadata.followUp, `${helper} direct Store seam must be reasoned and categorized`);
    assert.match(source, mutatingStoreCall, `${helper} audit says direct Store, so source must expose that seam`);
  } else if (metadata.transport === 'runtime') {
    assert.ok(metadata.reason, `${helper} runtime seam must explain why it is outside Store commands`);
    assert.doesNotMatch(source, mutatingStoreCall, `${helper} runtime helper must not secretly mutate authored Store state`);
  } else {
    assert.fail(`Unsupported browser mutation transport for ${helper}: ${metadata.transport}`);
  }
}

assert.match(browserSource, /queryEntities:\\s*\\(query = \\{\\}, options = \\{\\}\\) => controlPlane\\.queryEntities\\(query, options\\)/);
assert.match(browserSource, /resolveSemantic:\\s*\\(intent, options = \\{\\}\\) => controlPlane\\.resolveSemantic\\(intent, options\\)/);
const parityPlane = createVeyraControlPlane(new VeyraStore(fixture()));
assert.deepEqual(parityPlane.queryEntities({ kinds: ['node'] }), queryEntities(parityPlane.read({ kind: 'document', id: 'm3_correction_doc' }).status === 'ok' ? fixture() : fixture(), { kinds: ['node'] }));
assert.deepEqual(parityPlane.resolveSemantic({ ref: { kind: 'node', id: 'base_node' } }), resolveSemantic(fixture(), { ref: { kind: 'node', id: 'base_node' } }));

const manifest = createProjectManifest(fixture());
assert.deepEqual(manifest.authoring.controlPlane.commandProvenanceAudit, VEYRA_COMMAND_PROVENANCE_AUDIT);
assert.deepEqual(manifest.authoring.controlPlane.browserMutationCompatibility, VEYRA_BROWSER_MUTATION_COMPATIBILITY);
assert.deepEqual(manifest.authoring.controlPlane.uiMutationParityAudit, VEYRA_UI_MUTATION_PARITY_AUDIT);
assert.ok(VEYRA_UI_MUTATION_PARITY_AUDIT.some((item) => item.surface === 'globalThis.veyra direct Store compatibility mutations'));

console.log('veyra M3 correction-pass tests passed');
'''
write('tests/veyra-control-plane-corrections.test.mjs', correction_test)


# ---------------------------------------------------------------------------
# Milestone handoff is committed only if workflow gates pass.
# ---------------------------------------------------------------------------
milestone = read('milestone.md')
milestone = replace_once(
    milestone,
    '**Status:** `CORRECTIONS REQUIRED`',
    '**Status:** `AWAITING VERIFICATION`',
    'milestone correction status',
)
start = milestone.index('```text\nHandoff\n')
end = milestone.index('\n```', start) + len('\n```')
new_handoff = '''```text
Handoff
- Status: AWAITING VERIFICATION
- Correction commits: workflow-gated M3 correction implementation; final SHA to be recorded after CI commit
- Changed files: src/veyra/controlPlane.js, src/veyra/store.js, src/veyra/commands.js, src/veyra/serviceRegistry.js, src/veyra/manifest.js, src/index.js, veyra.js, tests/veyra-resolver.test.mjs, tests/veyra-control-plane-corrections.test.mjs, milestone.md
- Tests added/changed: dedicated M3 correction suite for repeated implicit creates, snapshot preview/dispatch alignment, failed-command seed stability, undo/redo generation behavior, provenance preservation/mechanical audit, browser canonical-dispatch mapping/direct-seam audit; M2 browser resolver test strengthened from brittle direct-wrapper regex to control-plane behavioral parity + thin-adapter check
- npm test: PASS in correction workflow gate
- npm run check: PASS in correction workflow gate
- Repeated-create deterministic-id proof: implicit ids seed from a deterministic stable-id generation snapshot; successful creates alter the snapshot, failed attempts do not, explicit ids remain authoritative
- Preview/dispatch id-alignment proof: preview and standalone dispatch prepare from the same current snapshot + canonical salt; repeated create after mutation gets a new id; undo reuses an absent undone id deterministically and redo advances because the id exists again
- Command provenance audit proof: node add/remove/removeSelection now forward descriptors; Store records metadata; every undoable VEYRA_COMMAND_TABLE action is mechanically exercised with a marker and module initialization fails if provenance is not forwarded
- Browser canonical-dispatch proof: command-backed globalThis.veyra compatibility helpers route through dispatchCompatibilityCommand -> controlPlane.dispatchCommand; query/resolve are thin control-plane adapters
- Remaining direct mutation seams: setMeshVertexWeights has no current command equivalent and is explicitly audited; playback/machine runtime helpers are marked runtime-only; human continuous gestures and document-shell seams remain explicitly audited
- Dependency/ownership regression proof: original M3 suite remains unchanged and green
- Name-independence proof: original M2/M3 name-randomization/reorder suites remain green
- Suggestions added to `suggestions`: none
- Known limitations: bulk mesh-vertex weight replacement still lacks a command-table action and remains an explicit audited direct Store seam; runtime-only playback/machine state remains outside persistent Store history by design
```'''
milestone = milestone[:start] + new_handoff + milestone[end:]
write('milestone.md', milestone)
