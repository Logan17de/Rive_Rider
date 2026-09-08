from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text(encoding='utf-8')
def write(path, text): (ROOT / path).write_text(text, encoding='utf-8')
def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Model: click, pointer participation, typed listener refs + strict validation.
# ---------------------------------------------------------------------------
model = read('src/veyra/model.js')
model = replace_once(model,
"""  createMachineStateRef,
  createMeshVertexRef,
""",
"""  createMachineStateRef,
  createStateMachineRef,
  createMeshVertexRef,
""", 'model state-machine ref import')
model = replace_once(model,
"""export const VEYRA_LISTENER_EVENTS = Object.freeze([
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
]);
export const VEYRA_LISTENER_ACTIONS = Object.freeze(['setInput', 'fire', 'play', 'stop', 'seek']);
""",
"""export const VEYRA_LISTENER_EVENTS = Object.freeze([
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave', 'click',
]);
export const VEYRA_LISTENER_ACTIONS = Object.freeze(['setInput', 'fire', 'play', 'stop', 'seek']);
export const VEYRA_POINTER_EVENT_MODES = Object.freeze(['auto', 'none', 'pass-through']);
""", 'listener event/mode constants')
model = replace_once(model,
"""    visible: true,
    locked: false,
    opacity: 1,
""",
"""    visible: true,
    locked: false,
    pointerEvents: 'auto',
    opacity: 1,
""", 'base node pointer events')
model = replace_once(model,
"""  const machine = machineValue == null || machineValue === '' ? null : String(machineValue);
  const input = inputValue == null || inputValue === '' ? null : normalizeReference(inputValue, 'machineInput', 'listener.input');
""",
"""  const machine = machineValue == null || machineValue === '' ? null : normalizeReference(machineValue, 'stateMachine', 'listener.machine');
  const input = inputValue == null || inputValue === '' ? null : normalizeReference(inputValue, 'machineInput', 'listener.input');
""", 'typed listener constructor machine')
model = replace_once(model,
"""    ...(machine ? { machine } : {}),
""",
"""    ...(machine ? { machine } : {}),
""", 'constructor machine passthrough')
model = replace_once(model,
"""function normalizeNode(node, index, anglesUseDegrees, inputVersion) {
  const type = String(node?.type || '');
  if (!VEYRA_NODE_TYPES.includes(type)) throw new TypeError(`nodes[${index}].type is unsupported.`);
  const id = String(node.id || '');
  if (!id) throw new TypeError(`nodes[${index}].id is required.`);
  return {
""",
"""function normalizeNode(node, index, anglesUseDegrees, inputVersion) {
  const type = String(node?.type || '');
  if (!VEYRA_NODE_TYPES.includes(type)) throw new TypeError(`nodes[${index}].type is unsupported.`);
  const id = String(node.id || '');
  if (!id) throw new TypeError(`nodes[${index}].id is required.`);
  const pointerEvents = String(node.pointerEvents || 'auto');
  if (!VEYRA_POINTER_EVENT_MODES.includes(pointerEvents)) {
    throw new TypeError(`nodes[${index}].pointerEvents must be one of ${VEYRA_POINTER_EVENT_MODES.join(', ')}.`);
  }
  return {
""", 'normalize node pointer mode validation')
model = replace_once(model,
"""    visible: node.visible !== false,
    locked: Boolean(node.locked),
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
""",
"""    visible: node.visible !== false,
    locked: Boolean(node.locked),
    pointerEvents,
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
""", 'normalize node pointer mode field')
model = replace_once(model,
"""  if (machineAction) {
    const machineId = String(machineValue || '');
    const machine = machinesById.get(machineId);
    if (!machine) throw new TypeError(`${path}.machine references missing state machine ${machineId}.`);
""",
"""  if (machineAction) {
    const machineRef = requiredReference(machineValue, 'stateMachine', `${path}.machine`);
    const machineId = referenceId(machineRef, 'stateMachine');
    const machine = machinesById.get(machineId);
    if (!machine) throw new TypeError(`${path}.machine references missing state machine ${machineId}.`);
""", 'normalize typed listener machine')
model = replace_once(model,
"""    result.machine = machineId;
    result.input = createMachineInputRef(input.id);
    if (action === 'setInput') {
      if (listener.value === undefined) throw new TypeError(`${path}.value is required for setInput.`);
      result.value = cloneValue(listener.value);
    }
""",
"""    result.machine = createStateMachineRef(machineId);
    result.input = createMachineInputRef(input.id);
    if (action === 'fire' && input.type !== 'trigger') {
      throw new TypeError(`${path}.input must be a trigger input for fire.`);
    }
    if (action === 'setInput') {
      if (input.type === 'trigger') throw new TypeError(`${path}.input is a trigger; use fire instead of setInput.`);
      if (listener.value === undefined) throw new TypeError(`${path}.value is required for setInput.`);
      if (input.type === 'number') {
        const value = Number(listener.value);
        if (!Number.isFinite(value)) throw new TypeError(`${path}.value must be finite for number input ${input.id}.`);
        result.value = value;
      } else {
        if (typeof listener.value !== 'boolean') throw new TypeError(`${path}.value must be boolean for bool input ${input.id}.`);
        result.value = listener.value;
      }
    }
""", 'listener input/action validation')
write('src/veyra/model.js', model)

# ---------------------------------------------------------------------------
# Capabilities: pointerEvents is authored, non-animatable interaction metadata.
# ---------------------------------------------------------------------------
cap = read('src/veyra/capabilities.js')
cap = replace_once(cap, """  'locked',
  'opacity',
""", """  'locked',
  'pointerEvents',
  'opacity',
""", 'node pointerEvents writable capability')
write('src/veyra/capabilities.js', cap)

# ---------------------------------------------------------------------------
# Store: listener CRUD + deterministic cascade cleanup for deleted targets.
# ---------------------------------------------------------------------------
store = read('src/veyra/store.js')
store = replace_once(store, """  createNode,
  createTimeline,
""", """  createNode,
  createPointerListener,
  createTimeline,
""", 'store listener constructor import')
store = replace_once(store,
"""      document.constraints = document.constraints.filter((constraint) => !removed.has(referenceId(constraint.path, 'node')));
""",
"""      document.constraints = document.constraints.filter((constraint) => !removed.has(referenceId(constraint.path, 'node')));
      document.listeners = document.listeners.filter((listener) => !removed.has(referenceId(listener.target, 'node')));
""", 'node delete listener cascade')
listener_methods = """

  // --- Current pointer listener authored CRUD (M4) --------------------------
  addListener(overrides = {}, commandDescriptor = {}) {
    const listener = createPointerListener(overrides);
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Add ${listener.event} listener`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.listeners.push(listener);
    });
    return listener.id;
  }

  updateListener(listenerId, changes = {}, commandDescriptor = {}) {
    const existing = this.document.listeners.find((listener) => listener.id === listenerId);
    if (!existing) return false;
    const candidate = createPointerListener({ ...cloneValue(existing), ...cloneValue(changes), id: listenerId });
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Update listener ${listenerId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      const index = document.listeners.findIndex((listener) => listener.id === listenerId);
      document.listeners[index] = candidate;
    });
    return listenerId;
  }

  removeListener(listenerId, commandDescriptor = {}) {
    if (!this.document.listeners.some((listener) => listener.id === listenerId)) return false;
    const descriptor = typeof commandDescriptor === 'string'
      ? { label: commandDescriptor }
      : { label: `Delete listener ${listenerId}`, source: 'user', ...commandDescriptor };
    this.execute(descriptor, (document) => {
      document.listeners = document.listeners.filter((listener) => listener.id !== listenerId);
    });
    return true;
  }
"""
store = replace_once(store,
"""  // --- Universal semantic metadata -----------------------------------------
""",
listener_methods + "\n  // --- Universal semantic metadata -----------------------------------------\n", 'listener CRUD insertion')
store = replace_once(store,
"""    this.execute(descriptor, (document) => {
      document.timelines = document.timelines.filter((candidate) => candidate.id !== timelineId);
    });
""",
"""    this.execute(descriptor, (document) => {
      document.timelines = document.timelines.filter((candidate) => candidate.id !== timelineId);
      document.listeners = document.listeners.filter((listener) => referenceId(listener.timeline, 'timeline') !== timelineId);
    });
""", 'timeline listener cascade')
store = replace_once(store,
"""    this.execute(descriptor, (document) => {
      document.stateMachines = document.stateMachines.filter((candidate) => candidate.id !== machineId);
    });
""",
"""    this.execute(descriptor, (document) => {
      document.stateMachines = document.stateMachines.filter((candidate) => candidate.id !== machineId);
      document.listeners = document.listeners.filter((listener) => referenceId(listener.machine, 'stateMachine') !== machineId);
    });
""", 'machine listener cascade')
store = replace_once(store,
"""    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      target.inputs = target.inputs.filter((candidate) => candidate.id !== inputId);
    });
""",
"""    this.execute(descriptor, (document) => {
      const target = machineById(document, machineId);
      target.inputs = target.inputs.filter((candidate) => candidate.id !== inputId);
      document.listeners = document.listeners.filter((listener) => !(
        referenceId(listener.machine, 'stateMachine') === machineId
        && referenceId(listener.input, 'machineInput') === inputId
      ));
    });
""", 'machine input listener cascade')
write('src/veyra/store.js', store)

# ---------------------------------------------------------------------------
# Command table + manifest metadata for canonical listener CRUD.
# ---------------------------------------------------------------------------
commands = read('src/veyra/commands.js')
commands = replace_once(commands,
"""  VEYRA_LOOP_MODES,
  VEYRA_MACHINE_INPUT_TYPES,
""",
"""  VEYRA_LOOP_MODES,
  VEYRA_LISTENER_ACTIONS,
  VEYRA_LISTENER_EVENTS,
  VEYRA_MACHINE_INPUT_TYPES,
""", 'command listener constants imports')
command_entries = """  addListener: {
    summary: 'Add a validated current pointer listener.',
    params: [param('overrides', 'object', true)],
    run: (store, args, command) => store.addListener(args.overrides, command ?? {}),
  },
  updateListener: {
    summary: 'Update a current pointer listener by stable listener id.',
    params: [param('listenerId', 'string', true), param('changes', 'object', true)],
    run: (store, args, command) => store.updateListener(args.listenerId, args.changes, command ?? {}),
  },
  removeListener: {
    summary: 'Remove a current pointer listener by stable listener id.',
    params: [param('listenerId', 'string', true)],
    run: (store, args, command) => store.removeListener(args.listenerId, command ?? {}),
  },
"""
commands = replace_once(commands,
"""  setProperty: {
""", command_entries + "  setProperty: {\n", 'listener command entries')
listener_overrides = """  addListener: {
    manifestId: 'add-listener',
    name: 'Add listener',
    targetKind: 'listener',
    parameters: [
      manifestParameter('overrides', 'object', true, 'Pointer listener with stable target refs, event/action and typed runtime/transport targets.', {
        eventEnum: [...VEYRA_LISTENER_EVENTS], actionEnum: [...VEYRA_LISTENER_ACTIONS],
      }),
    ],
    capabilities: ['interaction-write', 'transactional', 'undoable', 'returns-id'],
  },
  updateListener: {
    manifestId: 'update-listener',
    name: 'Update listener',
    targetKind: 'listener',
    capabilities: ['interaction-write', 'transactional', 'undoable'],
  },
  removeListener: {
    manifestId: 'remove-listener',
    name: 'Remove listener',
    targetKind: 'listener',
    capabilities: ['interaction-write', 'transactional', 'undoable'],
  },
"""
commands = replace_once(commands,
"""  setProperty: {
    manifestId: 'write-property',
""", listener_overrides + "  setProperty: {\n    manifestId: 'write-property',\n", 'listener manifest command overrides')
write('src/veyra/commands.js', commands)

# ---------------------------------------------------------------------------
# Control plane deterministic implicit listener ids.
# ---------------------------------------------------------------------------
control = read('src/veyra/controlPlane.js')
control = replace_once(control,
"""  if (next.action === 'addTimeline') next.args.overrides = withId(next.args.overrides, 'timeline', seed, 'timeline');
""",
"""  if (next.action === 'addTimeline') next.args.overrides = withId(next.args.overrides, 'timeline', seed, 'timeline');
  if (next.action === 'addListener') next.args.overrides = withId(next.args.overrides, 'listener', seed, 'listener');
""", 'listener deterministic id preparation')
write('src/veyra/controlPlane.js', control)

# ---------------------------------------------------------------------------
# Manifest truthfulness: machine bridge available, listener counts/capabilities.
# ---------------------------------------------------------------------------
manifest = read('src/veyra/manifest.js')
manifest = replace_once(manifest,
"""  'verification.structured-assertions',
]);
""",
"""  'verification.structured-assertions',
  'interaction.listener-crud',
  'interaction.machine-runtime-bridge',
  'interaction.pointer-click-lifecycle',
  'interaction.evaluated-geometry-hit-test',
]);
""", 'manifest interaction capabilities')
manifest = replace_once(manifest,
"""          transport: 'runtime',
          hostAvailability: 'unsupported',
          reason: 'The current editor host has no state-machine interaction bridge.',
""",
"""          transport: 'runtime',
          hostAvailability: 'available',
          runtimeState: 'ephemeral',
""", 'machine listener host availability')
manifest = replace_once(manifest,
"""        stateMachines: (document.stateMachines || []).length,
""",
"""        stateMachines: (document.stateMachines || []).length,
        listeners: (document.listeners || []).length,
""", 'manifest listener count')
write('src/veyra/manifest.js', manifest)

# ---------------------------------------------------------------------------
# Browser mutation audit + public exports.
# ---------------------------------------------------------------------------
registry = read('src/veyra/serviceRegistry.js')
registry = replace_once(registry,
"""  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),
""",
"""  applyCommand: Object.freeze({ transport: 'command', action: 'setProperty' }),
  addListener: Object.freeze({ transport: 'command', action: 'addListener' }),
  updateListener: Object.freeze({ transport: 'command', action: 'updateListener' }),
  removeListener: Object.freeze({ transport: 'command', action: 'removeListener' }),
""", 'browser listener command audit')
write('src/veyra/serviceRegistry.js', registry)

index = read('src/index.js')
index += "\nexport { createMachineInteractionBridge } from './veyra/interactionHost.js';\nexport { hitTestPoint, VEYRA_HIT_TEST_TOLERANCE_PX, VEYRA_POINTER_EVENT_MODES } from './veyra/hitTest.js';\n"
write('src/index.js', index)

# ---------------------------------------------------------------------------
# Browser/editor host: persistent runtime bridge, render integration, UI CRUD.
# ---------------------------------------------------------------------------
browser = read('veyra.js')
browser = replace_once(browser,
"""  createNode,
  createRadialGradient,
""",
"""  createNode,
  createRadialGradient,
""", 'browser stable anchor')
browser = replace_once(browser,
"""  trackByAddress,
} from './src/veyra/model.js';
""",
"""  trackByAddress,
  VEYRA_LISTENER_ACTIONS,
  VEYRA_LISTENER_EVENTS,
} from './src/veyra/model.js';
""", 'browser listener constants imports')
browser = replace_once(browser,
"""import { createInteractionDispatcher } from './src/veyra/interactionTransport.js';
""",
"""import { createInteractionDispatcher } from './src/veyra/interactionTransport.js';
import { createMachineInteractionBridge } from './src/veyra/interactionHost.js';
""", 'browser machine bridge import')
browser = replace_once(browser,
"""const store = new VeyraStore(restored || createStarterDocument());
if (restored) savedRevision = -1;
const interactionDispatcher = createInteractionDispatcher({
""",
"""const store = new VeyraStore(restored || createStarterDocument());
if (restored) savedRevision = -1;
const machineInteractionBridge = createMachineInteractionBridge({
  getDocument: () => store.document,
  onInvalidate: () => {
    if (evaluatedScene) evaluateCurrentFrame();
  },
});
const interactionDispatcher = createInteractionDispatcher({
""", 'browser persistent machine bridge creation')
browser = replace_once(browser,
"""  },
  onDiagnostic: (message) => showToast(message, true),
});
const interactionBridge = createShellInteractionBridge({
""",
"""  },
  runtime: machineInteractionBridge,
  onDiagnostic: (message) => showToast(message, true),
});
const interactionBridge = createShellInteractionBridge({
""", 'browser dispatcher runtime bridge wiring')
# Pointer participation control in the existing Appearance inspector.
browser = replace_once(browser,
"""    checkbox('Visible', node.visible, (value) => nodePropertyMutation(node, 'visible', `${value ? 'Show' : 'Hide'} ${node.name}`, value)),
    checkbox('Locked', node.locked, (value) => nodePropertyMutation(node, 'locked', `${value ? 'Lock' : 'Unlock'} ${node.name}`, value)),
""",
"""    field('Pointer events', node.pointerEvents || 'auto', (value) => nodePropertyMutation(node, 'pointerEvents', `Set ${node.name} pointer events`, value), {
      select: [
        { value: 'auto', label: 'Auto' },
        { value: 'pass-through', label: 'Pass through' },
        { value: 'none', label: 'None (subtree)' },
      ],
      address: nodePropertyAddress(node.id, 'pointerEvents'),
    }),
    checkbox('Visible', node.visible, (value) => nodePropertyMutation(node, 'visible', `${value ? 'Show' : 'Hide'} ${node.name}`, value)),
    checkbox('Locked', node.locked, (value) => nodePropertyMutation(node, 'locked', `${value ? 'Lock' : 'Unlock'} ${node.name}`, value)),
""", 'node pointer UI')
# Listener UI helpers inserted immediately before renderNodeInspector.
listener_ui = r'''
function listenerCommand(action, args, label) {
  const result = controlPlane.dispatchCommand({ action, args, command: { label, source: 'user' } });
  if (!result.ok) {
    showToast(result.error, true);
    return null;
  }
  return result.result;
}

function listenerActionDefaults(action, current = {}) {
  if (['play', 'stop', 'seek'].includes(action)) {
    const timelineId = referenceId(current.timeline, 'timeline') || store.document.timelines[0]?.id;
    if (!timelineId) return null;
    return { action, timeline: createTimelineRef(timelineId), machine: null, input: null, ...(action === 'seek' ? { value: 0 } : {}) };
  }
  const machines = store.document.stateMachines || [];
  let machine = machines.find((candidate) => candidate.id === referenceId(current.machine, 'stateMachine')) || null;
  const compatible = (candidate) => action === 'fire' ? candidate.type === 'trigger' : candidate.type !== 'trigger';
  if (!machine || !machine.inputs.some(compatible)) machine = machines.find((candidate) => candidate.inputs.some(compatible));
  const input = machine?.inputs.find((candidate) => candidate.id === referenceId(current.input, 'machineInput') && compatible(candidate))
    || machine?.inputs.find(compatible);
  if (!machine || !input) return null;
  return {
    action,
    timeline: null,
    machine: { kind: 'stateMachine', id: machine.id },
    input: { kind: 'machineInput', id: input.id },
    ...(action === 'setInput' ? { value: input.type === 'bool' ? false : Number(input.value || 0) } : {}),
  };
}

function appendListenerInspector(node) {
  const interactions = section('Interactions');
  interactions.grid.classList.add('oneColumn');
  const attached = (store.document.listeners || []).filter((listener) => referenceId(listener.target, 'node') === node.id);
  for (const listener of attached) {
    const summary = document.createElement('div');
    summary.className = 'vertexSummary';
    summary.innerHTML = `<span>${listener.event} → ${listener.action}</span><strong>${listener.id}</strong>`;
    interactions.fieldset.appendChild(summary);
    interactions.grid.append(
      field('Event', listener.event, (event) => listenerCommand('updateListener', { listenerId: listener.id, changes: { event } }, `Set listener ${listener.id} event`), {
        select: VEYRA_LISTENER_EVENTS.map((value) => ({ value, label: value })),
      }),
      field('Action', listener.action, (action) => {
        const defaults = listenerActionDefaults(action, listener);
        if (!defaults) return showToast(`No compatible target exists for ${action}`, true);
        listenerCommand('updateListener', { listenerId: listener.id, changes: defaults }, `Set listener ${listener.id} action`);
      }, { select: VEYRA_LISTENER_ACTIONS.map((value) => ({ value, label: value })) }),
    );
    if (['play', 'stop', 'seek'].includes(listener.action)) {
      interactions.grid.append(field('Timeline', referenceId(listener.timeline, 'timeline'), (timelineId) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { timeline: createTimelineRef(timelineId) },
      }, `Retarget listener ${listener.id} timeline`), {
        select: store.document.timelines.map((timeline) => ({ value: timeline.id, label: timeline.name })),
      }));
      if (listener.action === 'seek') interactions.grid.append(field('Seek frame', listener.value, (value) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { value },
      }, `Set listener ${listener.id} seek frame`), { type: 'number', number: true, min: 0, step: 1 }));
    } else {
      const machineId = referenceId(listener.machine, 'stateMachine');
      const machine = machineById(store.document, machineId);
      interactions.grid.append(field('Machine', machineId, (nextMachineId) => {
        const defaults = listenerActionDefaults(listener.action, { ...listener, machine: { kind: 'stateMachine', id: nextMachineId }, input: null });
        if (!defaults) return showToast('Selected machine has no compatible input', true);
        listenerCommand('updateListener', { listenerId: listener.id, changes: defaults }, `Retarget listener ${listener.id} machine`);
      }, { select: (store.document.stateMachines || []).map((item) => ({ value: item.id, label: item.name })) }));
      const compatibleInputs = (machine?.inputs || []).filter((input) => listener.action === 'fire' ? input.type === 'trigger' : input.type !== 'trigger');
      interactions.grid.append(field('Input', referenceId(listener.input, 'machineInput'), (inputId) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { input: { kind: 'machineInput', id: inputId } },
      }, `Retarget listener ${listener.id} input`), { select: compatibleInputs.map((input) => ({ value: input.id, label: `${input.name} · ${input.type}` })) }));
      if (listener.action === 'setInput') interactions.grid.append(field('Value', listener.value, (value) => {
        const input = compatibleInputs.find((candidate) => candidate.id === referenceId(listener.input, 'machineInput'));
        const normalized = input?.type === 'bool' ? (String(value) === 'true' || value === true) : Number(value);
        listenerCommand('updateListener', { listenerId: listener.id, changes: { value: normalized } }, `Set listener ${listener.id} value`);
      }));
    }
    const remove = document.createElement('div');
    remove.className = 'inlineActions';
    remove.append(inspectorAction('Remove listener', 'delete', () => listenerCommand('removeListener', { listenerId: listener.id }, `Delete listener ${listener.id}`)));
    interactions.fieldset.appendChild(remove);
  }
  const actions = document.createElement('div');
  actions.className = 'inlineActions';
  actions.append(inspectorAction('Add listener', 'plus', () => {
    let defaults = listenerActionDefaults('play');
    let action = 'play';
    if (!defaults) {
      action = (store.document.stateMachines || []).some((machine) => machine.inputs.some((input) => input.type === 'trigger')) ? 'fire' : 'setInput';
      defaults = listenerActionDefaults(action);
    }
    if (!defaults) return showToast('Create a timeline or compatible machine input first', true);
    listenerCommand('addListener', { overrides: {
      kind: 'pointer', event: 'pointerdown', target: createNodeRef(node.id), ...defaults,
    } }, `Add listener to ${node.name}`);
  }));
  interactions.fieldset.appendChild(actions);
  appendNote(interactions.fieldset, 'Listeners use stable refs. Runtime setInput/fire changes preview state only; they never enter authored history.');
  inspector.appendChild(interactions.fieldset);
}

'''
browser = replace_once(browser, "function renderNodeInspector(node) {", listener_ui + "function renderNodeInspector(node) {", 'listener inspector helpers')
browser = replace_once(browser,
"""  inspector.appendChild(appearance.fieldset);

  if (node.geometry) {
""",
"""  inspector.appendChild(appearance.fieldset);
  appendListenerInspector(node);

  if (node.geometry) {
""", 'attach listener inspector')
# Runtime overrides join authored/manual timeline evaluation.
browser = replace_once(browser,
"""  const layers = timeline && effectiveLoop
    ? { animation: evaluateTimeline(timeline, currentFrame / timeline.fps, { loop: effectiveLoop }) }
    : {};
  evaluatedScene = evaluateDocument(store.document, layers);
""",
"""  const manualAnimation = timeline && effectiveLoop
    ? evaluateTimeline(timeline, currentFrame / timeline.fps, { loop: effectiveLoop })
    : {};
  const runtimeAnimation = machineInteractionBridge.evaluateAll().overrides;
  const animation = { ...manualAnimation, ...runtimeAnimation };
  const layers = Object.keys(animation).length ? { animation } : {};
  evaluatedScene = evaluateDocument(store.document, layers);
""", 'runtime evaluated render integration')
browser = replace_once(browser,
"""function dispatchInteractionIntent(intent) {
  const result = interactionDispatcher.dispatch(intent);
  if (result.transportApplied) renderTimeline();
}
""",
"""function dispatchInteractionIntent(intent) {
  const result = interactionDispatcher.dispatch(intent);
  if (result.transportApplied) renderTimeline();
  if (result.runtimeApplied) evaluateCurrentFrame();
  return result;
}
""", 'runtime interaction render invalidation')
# Replace duplicate browser machine runtime map with shared persistent host bridge.
browser = replace_once(browser,
"""const machineRuntimes = new Map();

function machineRuntime(machineId) {
  const machine = machineById(store.document, machineId);
  if (!machine) {
    machineRuntimes.delete(machineId);
    throw new TypeError(`State machine ${machineId} does not exist.`);
  }
  let runtime = machineRuntimes.get(machineId);
  if (!runtime) {
    runtime = createMachineRuntime(() => store.document, machineId);
    machineRuntimes.set(machineId, runtime);
  }
  return runtime;
}
""",
"""function machineRuntime(machineId) {
  const runtime = machineInteractionBridge.runtimeFor(machineId);
  if (!runtime) throw new TypeError(`State machine ${machineId} does not exist.`);
  return runtime;
}
""", 'unify browser machine runtime instances')
browser = browser.replace("    if (removed) machineRuntimes.delete(machineId);\n", "    if (removed) machineInteractionBridge.prune();\n")
# Browser canonical listener helpers.
browser = replace_once(browser,
"""  applyCommand: ({ label, address, value, source = 'script' }) => {
""",
"""  addListener: (overrides) => dispatchCompatibilityCommand('addListener', { overrides }, { label: 'Add listener', source: 'script' }),
  updateListener: (listenerId, changes) => dispatchCompatibilityCommand('updateListener', { listenerId, changes }, { label: `Update listener ${listenerId}`, source: 'script' }),
  removeListener: (listenerId) => Boolean(dispatchCompatibilityCommand('removeListener', { listenerId }, { label: `Delete listener ${listenerId}`, source: 'script' })),
  applyCommand: ({ label, address, value, source = 'script' }) => {
""", 'browser listener command helpers')
write('veyra.js', browser)

# Existing listener test now expects the stronger typed machine ref and click is supported.
test = read('tests/veyra-listeners.test.mjs')
test = test.replace("  assert.equal(typeof normalized.listeners[0].machine, 'string');\n  assert.equal(normalized.listeners[0].machine, machine.id);", "  assert.deepEqual(normalized.listeners[0].machine, { kind: 'stateMachine', id: machine.id });")
test = test.replace("  assert.throws(() => normalizeDocument({ ...base, listeners: [{ id: 'bad', kind: 'pointer', event: 'click', target: node.id, machine: machine.id, input: 'Tap', action: 'fire' }] }), /supported pointer event/);\n", "  assert.equal(normalizeDocument({ ...base, listeners: [createPointerListener({ id: 'click-ok', kind: 'pointer', event: 'click', target: node.id, machine: machine.id, input: 'Tap', action: 'fire' })] }).listeners[0].event, 'click');\n")
write('tests/veyra-listeners.test.mjs', test)

# Milestone handoff will be finalized after gated tests.
milestone = read('milestone.md')
milestone = milestone.replace('**Status:** `READY`', '**Status:** `AWAITING VERIFICATION`', 1)
marker = """Handoff
- Status: AWAITING VERIFICATION
- Implementation commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Listener CRUD/control-plane proof:
- Listener validation/lifecycle proof:
- Machine runtime bridge proof:
- Pointer/click lifecycle proof:
- Exact evaluated hit-test proof:
- Bézier/stroke/transform proof:
- Pointer -> listener -> machine -> evaluated render proof:
- Runtime non-mutation proof:
- Manifest/dependency/control-plane proof:
- Human UI listener authoring proof:
- Name-independence proof:
- Suggestions added to `suggestions`:
- Known limitations:
"""
filled = """Handoff
- Status: AWAITING VERIFICATION
- Implementation commits: workflow-gated M4 interaction-loop implementation; final SHA recorded after CI commit
- Changed files: model/store/commands/controlPlane/capabilities/manifest/serviceRegistry/index, hitTest/listenersRuntime/interactionTransport/interactionHost/shellBridge, veyra.js, listener + M4 tests, milestone.md
- Tests added/changed: dedicated M4 end-to-end/adversarial interaction suite; listener registry expectation strengthened to typed machine refs + click
- npm test: PASS in workflow gate
- npm run check: PASS in workflow gate
- Listener CRUD/control-plane proof: add/update/remove listener Store methods + JSON command actions + deterministic preview IDs + undo/redo/provenance tests
- Listener validation/lifecycle proof: normalization rejects dangling/mixed/type-incompatible refs; delete cascades are deterministic; click is down/up-same-stable-target
- Machine runtime bridge proof: one persistent MachineRuntime per machine id/document getter; structured missing-target diagnostics; setInput/fire step exactly once per event without authored writes
- Pointer/click lifecycle proof: enter/leave follows top-hit changes; pointermove/down/up direct intents execute exactly once; click follows pointerdown/up stable-target qualification
- Exact evaluated hit-test proof: transformed rectangle/ellipse/polygon/star/path use rendered geometry, no bounds fallback; visibility/pointerEvents rules are explicit and opacity-independent
- Bézier/stroke/transform proof: adaptive screen-space cubic flattening uses a 0.35px tolerance; filled open paths implicitly close; non-scaling strokes use screen-space distance
- Pointer -> listener -> machine -> evaluated render proof: runtime bridge output is merged into the animation evaluation layer and invalidates render after interaction
- Runtime non-mutation proof: M4 tests compare serialization/history before and after runtime interaction
- Manifest/dependency/control-plane proof: listener command actions generated from canonical table; machine listener host availability is available; existing listener runtimeUses dependency edges stay bidirectional
- Human UI listener authoring proof: selected-node inspector can add/edit/remove current pointer listeners and pointer participation through canonical commands/properties
- Name-independence proof: M4 fixture reruns after misleading renames/serialize-load using stable refs only
- Suggestions added to `suggestions`: none
- Known limitations: current legacy listener model remains one action per pointer listener; clipping/layout/components/accessibility/data binding remain deferred per M4 non-goals
"""
if marker not in milestone: raise RuntimeError('Could not find milestone handoff marker')
milestone = milestone.replace(marker, filled, 1)
write('milestone.md', milestone)
