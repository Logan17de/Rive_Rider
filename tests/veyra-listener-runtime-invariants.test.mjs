import assert from 'node:assert/strict';
import {
  createDocument,
  createMachineInput,
  createNode,
  createPointerListener,
  createStateMachine,
  createTimeline,
  normalizeDocument,
  cloneValue,
} from '../src/veyra/model.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';
import { VeyraStore } from '../src/veyra/store.js';

// This file is deliberately authored before the runtime implementation.  The
// runner must not include it until the two intentional DEFECTs are retired and
// Asha's schema cut is accepted.  Until then the cap is a bounded, visible debt
// allowance, never a conditional guard that can hide a missing feature.
const EXPECTED_DEFECT_DEBT = 3;
const defects = [];
const guards = [];
const deferred = [];

function check(kind, subject, assertion) {
  try {
    assertion();
    console.log(`PASS ${kind}: ${subject}`);
  } catch (error) {
    const record = { subject, error };
    (kind === 'DEFECT' ? defects : guards).push(record);
    console.error(`${kind} ${subject}: ${error.message}`);
  }
}

function defer(subject, reason) {
  deferred.push({ subject, reason });
  console.log(`DEFERRED: ${subject} (${reason})`);
}

function idOf(value) {
  if (typeof value === 'string') return value;
  return value?.id || value?.ref?.id || value?.target?.id || null;
}

function intentsOf(result) {
  const intents = Array.isArray(result) ? result : result?.intents;
  assert.ok(Array.isArray(intents), 'resolver result exposes an intents array');
  return intents;
}

function emittedIntents(result) {
  return [
    ...intentsOf(result),
    ...(Array.isArray(result?.transitions) ? result.transitions.map((transition) => transition.intent) : []),
  ];
}

function nextHoverKey(result) {
  const key = result?.hoverKey ?? result?.nextHoverKey;
  return key === undefined ? null : key;
}

function hoverTargetId(result) {
  const key = nextHoverKey(result);
  if (typeof key === 'string') return key.split(':')[0] || null;
  return key?.id || null;
}

function resolveEvent(
  listenerApi,
  document,
  scene,
  event,
  hoverKey = null,
  sceneRevision = 0,
  viewport = { width: 400, height: 300, zoom: 1, centerX: 0, centerY: 0 },
) {
  const resolve = listenerApi.resolveListenerIntents
    || listenerApi.resolvePointerEvent
    || listenerApi.resolveListenerEvent;
  assert.equal(
    typeof resolve,
    'function',
    'listener runtime exports resolveListenerIntents/resolvePointerEvent/resolveListenerEvent',
  );
  return resolve({
    event,
    scene,
    document,
    viewport,
    hoverKey,
    sceneRevision,
  });
}

function makeSceneDocument(extra = {}) {
  const back = createNode('rectangle', {
    id: 'node_back',
    name: 'Back',
    geometry: { width: 100, height: 100, cornerRadius: 0 },
  });
  const front = createNode('rectangle', {
    id: 'node_front',
    name: 'Front',
    geometry: { width: 80, height: 80, cornerRadius: 0 },
  });
  return normalizeDocument(createDocument({
    id: 'document_listener_runtime',
    name: 'Listener Runtime Fixture',
    artboard: { width: 400, height: 300 },
    nodes: [back, front],
    ...extra,
  }));
}

const hitModule = await import('../src/veyra/hitTest.js').catch(() => null);
const listenerModule = await import('../src/veyra/listenersRuntime.js').catch(() => null);

// --- S2: hit-test contract ----------------------------------------------------
check('DEFECT', 'hitTestPoint is exported from the hit-test runtime seam', () => {
  assert.equal(typeof hitModule?.hitTestPoint, 'function', 'hitTestPoint export exists');
});

if (typeof hitModule?.hitTestPoint !== 'function') {
  defer('hit-test geometry matrix', 'hitTestPoint implementation is not present yet');
} else {
  check('GUARD', 'hit-test resolves the stable topmost node under zoom and pan', () => {
    const document = makeSceneDocument();
    const scene = evaluateDocument(document);
    const viewport = {
      width: 400,
      height: 300,
      zoom: 2,
      centerX: 20,
      centerY: 10,
      panX: 20,
      panY: 10,
    };
    const hit = hitModule.hitTestPoint({ x: 200, y: 150 }, scene, viewport);
    assert.equal(idOf(hit), 'node_front', 'topmost front node wins an overlap');
    const outside = hitModule.hitTestPoint(
      { x: 0, y: 0 },
      scene,
      { width: 400, height: 300, zoom: 1, centerX: 0, centerY: 0 },
    );
    assert.equal(idOf(outside), null, 'outside point resolves to no node');
  });

  check('GUARD', 'hit-test skips invisible nodes and falls back to the next topmost node', () => {
    const document = makeSceneDocument();
    const hidden = cloneValue(document);
    hidden.nodes.find((node) => node.id === 'node_front').visible = false;
    const scene = evaluateDocument(hidden);
    const hit = hitModule.hitTestPoint(
      { x: 200, y: 150 },
      scene,
      { width: 400, height: 300, zoom: 1, centerX: 0, centerY: 0 },
    );
    assert.equal(idOf(hit), 'node_back', 'hidden front node cannot capture a hit');
  });

  check('GUARD', 'hit-test rejects degenerate geometry instead of manufacturing a hit', () => {
    const scene = {
      kind: 'veyra-evaluated-scene',
      artboard: { width: 100, height: 100 },
      nodes: [{
        id: 'node_degenerate',
        type: 'rectangle',
        visible: true,
        geometry: { width: 0, height: 0 },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        worldMatrix: [1, 0, 0, 1, 0, 0],
      }],
    };
    const hit = hitModule.hitTestPoint(
      { x: 200, y: 150 },
      scene,
      { width: 400, height: 300, zoom: 1, centerX: 0, centerY: 0 },
    );
    assert.equal(idOf(hit), null, 'zero-area geometry has no hit region');
  });
}

// --- S1/C5: conditional listener schema contract ------------------------------
const timeline = createTimeline({ id: 'timeline_door', name: 'Door Open', duration: 30 });
const machineInput = createMachineInput({ id: 'input_trigger', name: 'Trigger', type: 'trigger' });
const machine = createStateMachine({
  id: 'machine_button',
  name: 'Button Machine',
  inputs: [machineInput],
  states: [],
});
const schemaBase = createDocument({
  id: 'document_listener_schema',
  nodes: [createNode('rectangle', { id: 'node_button', geometry: { width: 40, height: 40, cornerRadius: 0 } })],
  timelines: [timeline],
  stateMachines: [machine],
});

check('DEFECT', 'listener schema allows a direct play action without a machine', () => {
  const listener = createPointerListener({
    id: 'listener_play',
    targetId: 'node_button',
    event: 'pointerdown',
    action: 'play',
    timelineId: 'timeline_door',
  });
  const normalized = normalizeDocument({ ...schemaBase, listeners: [listener] });
  assert.equal(normalized.listeners[0].action, 'play', 'machine-free play listener survives normalization');
  assert.equal(idOf(normalized.listeners[0].timeline), 'timeline_door', 'play listener persists its timeline reference');
});

check('GUARD', 'listener schema rejects play combined with a state machine', () => {
  const listener = {
    id: 'listener_invalid_play_machine',
    kind: 'pointer',
    target: { kind: 'node', id: 'node_button' },
    event: 'pointerdown',
    action: 'play',
    machine: 'machine_button',
    timeline: { kind: 'timeline', id: 'timeline_door' },
  };
  assert.throws(
    () => normalizeDocument({ ...schemaBase, listeners: [listener] }),
    /machine|combination|play/i,
    'play plus machine is an unknown combination shape',
  );
});

check('GUARD', 'listener schema requires machine and input for machine-family actions', () => {
  const listener = {
    id: 'listener_missing_machine',
    kind: 'pointer',
    target: { kind: 'node', id: 'node_button' },
    event: 'pointerdown',
    action: 'fire',
  };
  assert.throws(
    () => normalizeDocument({ ...schemaBase, listeners: [listener] }),
    /machine|input|required/i,
    'fire without machine/input is refused loudly',
  );
});

check('GUARD', 'listener schema refuses a transport action with a missing timeline reference', () => {
  const listener = {
    id: 'listener_bad_timeline',
    kind: 'pointer',
    target: { kind: 'node', id: 'node_button' },
    event: 'pointerdown',
    action: 'play',
    timeline: { kind: 'timeline', id: 'timeline_missing' },
  };
  assert.throws(
    () => normalizeDocument({ ...schemaBase, listeners: [listener] }),
    /timeline.*missing|missing.*timeline/i,
    'play with a bad timeline reference is refused loudly',
  );
});

check('GUARD', 'empty machine listener warns but remains loadable', () => {
  const listener = createPointerListener({
    id: 'listener_empty_machine',
    targetId: 'node_button',
    event: 'pointerdown',
    action: 'fire',
    machineId: 'machine_button',
    inputId: 'input_trigger',
  });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let normalized;
  try {
    normalized = normalizeDocument({ ...schemaBase, listeners: [listener] });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(normalized.listeners.length, 1, 'warning-tier target still loads and remains editable');
  assert.ok(warnings.some((message) => (
    message.includes('listeners[0]') && message.includes('machine_button')
  )), 'warning names the listener address and offending machine');
});

// --- S3: pure listener event -> intent union ----------------------------------
if (typeof listenerModule?.resolveListenerIntents !== 'function'
  && typeof listenerModule?.resolvePointerEvent !== 'function'
  && typeof listenerModule?.resolveListenerEvent !== 'function') {
  check('DEFECT', 'listener runtime exports a pure pointer resolver', () => {
    assert.fail('resolvePointerEvent/resolveListenerEvent export is absent');
  });
  defer('listener event and hover guards', 'listener resolver implementation is not present yet');
} else {
  const runtimeTimeline = createTimeline({ id: 'timeline_runtime', name: 'Runtime Play', duration: 30 });
  const runtimeMachine = createStateMachine({
    id: 'machine_runtime',
    inputs: [createMachineInput({ id: 'input_fire', type: 'trigger' })],
    states: [],
  });
  const runtimeDocument = normalizeDocument(createDocument({
    id: 'document_runtime_intents',
    nodes: [createNode('rectangle', {
      id: 'node_target',
      geometry: { width: 100, height: 100, cornerRadius: 0 },
    })],
    timelines: [runtimeTimeline],
    stateMachines: [runtimeMachine],
    listeners: [
      createPointerListener({
        id: 'listener_machine_fire', targetId: 'node_target', event: 'pointerdown',
        action: 'fire', machineId: 'machine_runtime', inputId: 'input_fire',
      }),
      createPointerListener({
        id: 'listener_direct_play', targetId: 'node_target', event: 'pointerdown',
        action: 'play', timelineId: 'timeline_runtime',
      }),
      createPointerListener({
        id: 'listener_enter', targetId: 'node_target', event: 'pointerenter',
        action: 'fire', machineId: 'machine_runtime', inputId: 'input_fire',
      }),
      createPointerListener({
        id: 'listener_leave', targetId: 'node_target', event: 'pointerleave',
        action: 'fire', machineId: 'machine_runtime', inputId: 'input_fire',
      }),
    ],
  }));
  const runtimeScene = evaluateDocument(runtimeDocument);

  check('GUARD', 'pointerdown emits both runtime and transport intents with discriminated shapes', () => {
    const store = new VeyraStore(runtimeDocument);
    const beforeBytes = serializeVeyra(store.document);
    const beforeHistory = store.commandHistory.length;
    const result = resolveEvent(listenerModule, runtimeDocument, runtimeScene, {
      type: 'pointerdown', x: 200, y: 150,
    });
    const intents = intentsOf(result);
    const runtime = intents.find((intent) => intent.kind === 'runtime');
    const transport = intents.find((intent) => intent.kind === 'transport');
    assert.ok(runtime, 'machine-family listener emits a runtime intent');
    assert.equal(runtime.op, 'fire', 'fire listener keeps its runtime operation');
    assert.equal(runtime.machineId, 'machine_runtime', 'runtime intent names its machine');
    assert.equal(runtime.inputId, 'input_fire', 'runtime intent names its input');
    assert.ok(transport, 'direct-play listener emits a transport intent');
    assert.equal(transport.op, 'play', 'transport intent keeps play operation');
    assert.equal(transport.timelineId, 'timeline_runtime', 'transport intent names its timeline');
    assert.equal(intents.some((intent) => intent.kind === 'edit'), false, 'pointer path emits no store-edit intent');
    assert.equal(serializeVeyra(store.document), beforeBytes, 'pure resolver leaves document bytes unchanged');
    assert.equal(store.commandHistory.length, beforeHistory, 'pure resolver leaves store history unchanged');
  });

  check('GUARD', 'hover resolver emits enter/leave only when the stable hover key changes', () => {
    const point = { x: 200, y: 150 };
    const entered = resolveEvent(listenerModule, runtimeDocument, runtimeScene, {
      type: 'pointermove', x: point.x, y: point.y,
    }, null, 1);
    const key = nextHoverKey(entered);
    const enteredIntents = emittedIntents(entered);
    assert.ok(key, 'pointer entering a target creates a stable hover key');
    assert.ok(enteredIntents.length > 0, 'pointer entering a target emits pointerenter work');

    let hover = key;
    let churn = 0;
    for (let index = 0; index < 100; index += 1) {
      const stable = resolveEvent(listenerModule, runtimeDocument, runtimeScene, {
        type: 'pointermove', x: point.x, y: point.y,
      }, hover, 1);
      hover = nextHoverKey(stable);
      churn += intentsOf(stable).filter((intent) => intent.kind === 'runtime').length;
    }
    assert.equal(churn, 0, '100 unchanged pointermoves emit zero enter/leave intents');

    const movedDocument = cloneValue(runtimeDocument);
    for (const node of movedDocument.nodes) node.transform.x = 1000;
    const movedScene = evaluateDocument(movedDocument);
    const left = resolveEvent(listenerModule, runtimeDocument, movedScene, {
      type: 'pointermove', x: point.x, y: point.y,
    }, hover, 2);
    assert.equal(hoverTargetId(left), null, 'scene revision change reconciles a static cursor immediately');
    assert.ok(emittedIntents(left).length > 0, 'hover-key change emits pointerleave work');
  });

  check('GUARD', 'runtime pointer paths remain pure even when a target is refused', () => {
    const store = new VeyraStore(runtimeDocument);
    const beforeBytes = serializeVeyra(store.document);
    const beforeHistory = store.commandHistory.length;
    const result = resolveEvent(listenerModule, runtimeDocument, runtimeScene, {
      type: 'pointerdown', x: 10000, y: 10000,
    });
    const intents = intentsOf(result);
    assert.equal(intents.length, 0, 'refused/outside target produces no edit fallback');
    assert.equal(serializeVeyra(store.document), beforeBytes, 'refusal does not rewind or mutate live document');
    assert.equal(store.commandHistory.length, beforeHistory, 'refusal does not create an undo entry');
  });
}

// --- Store refusal and transaction observability -------------------------------
check('GUARD', 'store transaction refusal preserves live preview and exposes inTransaction', () => {
  const document = normalizeDocument(createDocument({
    id: 'document_transaction_guard',
    nodes: [createNode('rectangle', { id: 'node_transaction', geometry: { width: 40, height: 40, cornerRadius: 0 } })],
  }));
  const store = new VeyraStore(document);
  const initialBytes = serializeVeyra(store.document);
  const initialHistory = store.commandHistory.length;
  assert.equal(store.inTransaction, false, 'store starts without an open transaction');
  store.begin({ label: 'Live pointer gesture', source: 'user' });
  assert.equal(store.inTransaction, true, 'begin exposes an open transaction');
  store.mutate((current) => { current.nodes[0].name = 'Live preview'; });
  const liveBytes = serializeVeyra(store.document);
  assert.notEqual(liveBytes, initialBytes, 'positive control observes the live preview mutation');
  assert.throws(
    () => store.execute({ label: 'Refused nested command', source: 'runtime' }, () => {}),
    /open transaction/i,
    'refused command names the open transaction boundary',
  );
  assert.equal(store.inTransaction, true, 'refusal does not strand or silently close the transaction');
  assert.equal(serializeVeyra(store.document), liveBytes, 'refusal does not rewind the live preview');
  assert.equal(store.commandHistory.length, initialHistory, 'refusal does not add history');
  assert.equal(store.cancel(), true, 'caller can cancel the live transaction deliberately');
  assert.equal(store.inTransaction, false, 'cancel closes the transaction');
  assert.equal(serializeVeyra(store.document), initialBytes, 'cancel restores the pre-gesture document');
});

check('GUARD', 'store execute refusal is byte- and history-atomic outside a transaction', () => {
  const document = normalizeDocument(createDocument({
    id: 'document_execute_refusal',
    nodes: [createNode('rectangle', { id: 'node_execute', geometry: { width: 40, height: 40, cornerRadius: 0 } })],
  }));
  const store = new VeyraStore(document);
  const beforeBytes = serializeVeyra(store.document);
  const beforeHistory = store.commandHistory.length;
  assert.throws(() => store.execute(
    { label: 'Refused mutation', source: 'user' },
    (current) => {
      current.nodes[0].name = 'must roll back';
      throw new Error('intentional refusal');
    },
  ), /intentional refusal/, 'mutation refusal remains observable to the caller');
  assert.equal(serializeVeyra(store.document), beforeBytes, 'failed command restores document bytes');
  assert.equal(store.commandHistory.length, beforeHistory, 'failed command creates no history entry');
});

if (guards.length > 0) {
  console.error(`\n${guards.length} GUARD assertion(s) failed; the arbiter blocks acceptance.`);
  process.exitCode = 1;
} else if (defects.length > EXPECTED_DEFECT_DEBT) {
  console.error(`\nDEFECT debt ${defects.length} exceeds cap ${EXPECTED_DEFECT_DEBT}; add implementation rather than softening the arbiter.`);
  process.exitCode = 1;
} else {
  console.log(`\nArbiter debt ${defects.length}/${EXPECTED_DEFECT_DEBT}; ${deferred.length} dependent checks deferred. Guards are strict.`);
}
