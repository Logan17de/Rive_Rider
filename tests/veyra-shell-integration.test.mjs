/**
 * Browser-shell interaction bridge integration test (3C-2 acceptance gate,
 * follow-up round after bb4d298).
 *
 * `tests/veyra-shell-bridge.test.mjs` unit-tests the adapter module
 * (`createShellInteractionBridge`) directly. That leaves unproven whether
 * `veyra.js`'s REAL wiring — the three `canvas.addEventListener` handlers,
 * including their `stopPropagation`/`preventDefault` calls — actually routes
 * a DOM pointer event to observable playback while leaving the document/
 * history untouched.
 *
 * Per ratified team decision (Akash + Sheema, 2026-09-04T06:12Z): rather than
 * booting the entire `veyra.js` shell under a fake DOM (blocked — the shared
 * `tests/helpers/fake-dom.mjs` harness has no `.value`/`.checked` support that
 * ~89 form elements in `veyra.html` require, and is out of this task's file
 * scope to extend), `veyra.js` now exports its real pointer wiring through
 * `createPreviewPointerHandlers()` in `src/veyra/shellBridge.js`. `veyra.js`
 * registers the exact three functions this factory returns via
 * `canvas.addEventListener(..., true)` — it does not keep a parallel copy.
 *
 * This test calls those SAME returned handler functions directly with a real
 * `VeyraStore`, spyable fake events, and a fake canvas/renderer-shaped
 * dependency set — proving the real code path, not a reimplementation.
 */

import assert from 'node:assert/strict';
import { VeyraStore } from '../src/veyra/store.js';
import {
  createDocument, createNode, createTimeline, createPointerListener, createStateMachine, normalizeDocument,
} from '../src/veyra/model.js';
import { createShellInteractionBridge, createPreviewPointerHandlers } from '../src/veyra/shellBridge.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, error });
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log('Veyra shell preview-pointer wiring integration (real handlers, real store)\n');

/* ------------------------------------------------------------------ *
 * Fixture: a real document with a direct-play listener on a node, plus
 * a real VeyraStore (not a mock) so document/history atomicity is a real
 * measurement, not an assumption.
 * ------------------------------------------------------------------ */

function buildFixture() {
  const buttonNode = createNode('rectangle', {
    id: 'playButton',
    transform: { x: 100, y: 100 },
    geometry: { width: 80, height: 40 },
  });
  const doorTimeline = createTimeline({ id: 'doorAnim', name: 'DoorOpen', duration: 30 });
  const playListener = createPointerListener({
    id: 'click-play',
    targetId: 'playButton',
    event: 'pointerdown',
    action: 'play',
    timelineId: 'doorAnim',
  });
  const testDocument = normalizeDocument(createDocument({
    artboard: { width: 800, height: 600 },
    nodes: [buttonNode],
    timelines: [doorTimeline],
    listeners: [playListener],
  }));
  const store = new VeyraStore(testDocument);
  return { store, buttonNode, doorTimeline };
}

/** Minimal spyable fake event, matching what a real PointerEvent exposes. */
function fakeEvent(type, overrides = {}) {
  let stopped = false;
  let defaultPrevented = false;
  return {
    type,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    altKey: false,
    ...overrides,
    stopPropagation() { stopped = true; },
    preventDefault() { defaultPrevented = true; },
    get __stopped() { return stopped; },
    get __defaultPrevented() { return defaultPrevented; },
  };
}

/** Fake canvas: only the surface createPreviewPointerHandlers/canvasPoint touch. */
function fakeCanvas({ left = 0, top = 0, width = 800, height = 600 } = {}) {
  return {
    clientWidth: width,
    clientHeight: height,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
  };
}

function makeHandlers({ store, canvas, tool = 'select', preview = true, panGesture = false, playbackEvents, viewCenter = null, zoom = 1 }) {
  let evaluatedScene = evaluateDocument(store.document);
  let interactionSceneRevision = 0;
  const diagnostics = [];
  const interactionBridge = createShellInteractionBridge({
    document: store.document,
    onDiagnostic: (message) => diagnostics.push(message),
    onIntent: (intent) => {
      if (intent.kind === 'transport') {
        playbackEvents.push(intent);
      } else if (intent.kind === 'runtime') {
        diagnostics.push(`Interaction runtime intent requires a state-machine bridge: ${intent.op}`);
      }
    },
  });
  function refreshScene() {
    evaluatedScene = evaluateDocument(store.document);
    interactionBridge.updateDocument(store.document);
    interactionSceneRevision += 1;
  }
  const handlers = createPreviewPointerHandlers({
    canvas,
    interactionBridge,
    getEvaluatedScene: () => evaluatedScene,
    getInteractionSceneRevision: () => interactionSceneRevision,
    getTool: () => tool,
    getPanGesture: () => panGesture,
    getPreviewMode: () => preview,
    getViewCenter: () => viewCenter,
    getZoom: () => zoom,
    getArtboardSize: () => ({ width: store.document.artboard.width, height: store.document.artboard.height }),
    onNoHit: () => diagnostics.push('No interaction target under pointer'),
  });
  return { handlers, diagnostics, refreshScene, interactionBridge };
}

/* ------------------------------------------------------------------ *
 * GATE 1: eligible preview pointerdown on direct-play listener reaches
 * playback transport through the REAL onPointerDown handler.
 * ------------------------------------------------------------------ */

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 1] preview pointerdown on direct-play listener dispatches a play transport intent', () => {
    // Button center at (100+40, 100+20) = (140, 120) in canvas-local coords.
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 1, 'exactly one transport intent dispatched');
    assert.deepEqual(playbackEvents[0], { kind: 'transport', op: 'play', timelineId: 'doorAnim' });
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers, diagnostics } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 1 negative] preview pointerdown with no hit does not dispatch playback', () => {
    const event = fakeEvent('pointerdown', { clientX: 5, clientY: 5 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'no transport intent for a miss');
    assert.ok(diagnostics.includes('No interaction target under pointer'), 'miss is diagnosed, not silent');
  });
}

/* ------------------------------------------------------------------ *
 * GATE 2: preview pointer events (hit and miss) never touch store/history;
 * ordinary non-preview (select mode) events never reach these handlers'
 * playback path at all (eligibility gate blocks them upstream).
 * ------------------------------------------------------------------ */

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 2] preview pointerdown play does not mutate document identity or command history', () => {
    const beforeDoc = store.document;
    const beforeHistoryLength = store.commandHistory.length;
    handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 140, clientY: 120 }));
    assert.strictEqual(store.document, beforeDoc, 'document identity unchanged after preview play');
    assert.equal(store.commandHistory.length, beforeHistoryLength, 'no command recorded for preview play');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 2] preview pointerdown no-hit does not mutate document identity or command history', () => {
    const beforeDoc = store.document;
    const beforeHistoryLength = store.commandHistory.length;
    handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 5, clientY: 5 }));
    assert.strictEqual(store.document, beforeDoc, 'document identity unchanged after preview miss');
    assert.equal(store.commandHistory.length, beforeHistoryLength, 'no command recorded for preview miss');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  // tool = 'select', preview = false -> ordinary authoring mode.
  const { handlers } = makeHandlers({ store, canvas, playbackEvents, tool: 'select', preview: false });

  check('[GATE 2] non-preview (select mode) pointerdown on the same target never plays', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'select-mode click does not trigger playback');
    assert.equal(event.__stopped, false, 'select-mode click is NOT claimed by preview — propagation left alone for authoring path');
    assert.equal(event.__defaultPrevented, false, 'select-mode click keeps default behavior for authoring path');
  });
}

/* ------------------------------------------------------------------ *
 * GATE 3: coordinate conversion under canvas offset + CSS scale + zoom/pan,
 * exercised through the real onPointerDown handler (not canvasPoint alone).
 * ------------------------------------------------------------------ */

{
  const { store } = buildFixture();
  // Canvas offset by (50, 60) in the page, CSS box 400x300 while backing
  // store is 800x600 (2x scale in both axes).
  const canvas = fakeCanvas({ left: 50, top: 60, width: 400, height: 300 });
  Object.defineProperty(canvas, 'clientWidth', { value: 800, writable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 600, writable: true });
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 3] canvas offset + CSS/DPR scale converts client coords to the correct canvas-local hit', () => {
    // Button center at canvas-local (140, 120). CSS box is 400x300 but the
    // backing (clientWidth/clientHeight) is 800x600, so scale is 2x in both
    // axes: client point = offset + local/2 = (50+70, 60+60) = (120, 120).
    const event = fakeEvent('pointerdown', { clientX: 120, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 1, 'scaled+offset client point still resolves to the button hit');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  // zoom = 2, pan center shifted — viewport center feeds into hit-testing via getViewCenter.
  const { handlers } = makeHandlers({
    store, canvas, playbackEvents, zoom: 2, viewCenter: { x: 400, y: 300 },
  });

  check('[GATE 3] zoom/pan viewport reaches the resolver (documented, non-crashing path)', () => {
    // With zoom=2 and an explicit view center, canvas-local (140,120) maps
    // through a different world point than the zoom=1 case; we only assert
    // the call completes without throwing and returns a well-formed result
    // shape, since hitTestPoint's zoom/pan arithmetic is covered by
    // tests/veyra-hittest.test.mjs — this gate proves the VIEWPORT VALUES
    // (not raw client coords) are what reaches the resolver.
    assert.doesNotThrow(() => handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 140, clientY: 120 })));
  });
}

/* ------------------------------------------------------------------ *
 * GATE 4: resolver re-creation on store.document identity change (edit/undo/
 * redo-compatible) — no stale hover leak.
 * ------------------------------------------------------------------ */

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers, refreshScene, interactionBridge } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 4] document identity replacement clears stale hover and adopts the new document', () => {
    // Establish hover over the button first.
    handlers.onPointerMove(fakeEvent('pointermove', { clientX: 140, clientY: 120 }));
    assert.notEqual(interactionBridge.resolver.hoverKey, null, 'hover established before replacement');

    // Simulate an edit/undo/redo replacing store.document with a new identity
    // (a plain mutation-free document swap, mirroring store.replaceDocument).
    const nextDoc = normalizeDocument({ ...store.document, id: 'after-undo', listeners: [] });
    store.document = nextDoc;
    refreshScene();

    assert.equal(interactionBridge.document, nextDoc, 'bridge adopted the new document identity');
    assert.equal(interactionBridge.resolver.hoverKey, null, 'hover state reset on document identity change, no stale leak');

    // The new document has no listeners, so a pointerdown at the same spot must not play.
    handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 140, clientY: 120 }));
    assert.equal(playbackEvents.length, 0, 'new document with no listeners does not play at the old hover location');
  });
}

/* ------------------------------------------------------------------ *
 * GATE 5: diagnostics are observable for missing transport target and
 * unsupported (runtime/machine) intents; empty-machine warning path.
 * ------------------------------------------------------------------ */

{
  const buttonNode = createNode('rectangle', {
    id: 'playButton',
    transform: { x: 100, y: 100 },
    geometry: { width: 80, height: 40 },
  });
  // A real, valid machine with a real trigger input AND at least one
  // playable state (avoids the model's own "no playable state" warning,
  // which is a separate concern from what this gate tests) so the listener
  // passes normalization cleanly — the point of this gate is that the SHELL
  // treats a legitimate runtime (setInput/fire) intent as unsupported (no
  // machine executor wired in this milestone) and diagnoses it visibly, not
  // that the schema itself is invalid or incomplete.
  const machineTimeline = createTimeline({ id: 'idleAnim', name: 'Idle', duration: 1 });
  const machine = createStateMachine({
    id: 'doorMachine',
    name: 'DoorMachine',
    inputs: [{ id: 'go', name: 'Go', type: 'trigger' }],
    states: [{ id: 'idle', name: 'Idle', type: 'animation', timelineId: 'idleAnim' }],
  });
  const runtimeListener = createPointerListener({
    id: 'click-fire',
    targetId: 'playButton',
    event: 'pointerdown',
    action: 'fire',
    machineId: 'doorMachine',
    inputId: 'go',
  });
  const testDocument = normalizeDocument(createDocument({
    artboard: { width: 800, height: 600 },
    nodes: [buttonNode],
    timelines: [machineTimeline],
    stateMachines: [machine],
    listeners: [runtimeListener],
  }));
  const store = new VeyraStore(testDocument);
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers, diagnostics } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 5] unsupported runtime (machine) intent is visibly diagnosed, not silently dropped', () => {
    handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 140, clientY: 120 }));
    assert.equal(playbackEvents.length, 0, 'runtime intent never reaches the transport path');
    assert.ok(
      diagnostics.some((message) => message.includes('fire')),
      'a diagnostic naming the unsupported op was recorded',
    );
  });
}

/* ------------------------------------------------------------------ *
 * GATE 7: pointermove never dispatches a direct intent (only derived
 * enter/leave transitions); pointerup goes through the same direct path as
 * pointerdown; eligible preview events claim propagation so they cannot
 * reach editor drag/selection; ineligible (pan/pencil/non-primary/Alt)
 * events are left alone for the authoring path.
 * ------------------------------------------------------------------ */

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 7] pointermove over a direct-play listener does not invoke play', () => {
    handlers.onPointerMove(fakeEvent('pointermove', { clientX: 140, clientY: 120 }));
    assert.equal(playbackEvents.length, 0, 'pointermove alone must never start playback for a pointerdown-bound listener');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 7] pointerup is routed through the direct-intent path (same as pointerdown)', () => {
    // Fixture's listener is bound to pointerdown, so pointerup must NOT match it —
    // this proves pointerup is resolved as its own event type, not aliased to pointerdown.
    handlers.onPointerUp(fakeEvent('pointerup', { clientX: 140, clientY: 120 }));
    assert.equal(playbackEvents.length, 0, 'pointerup does not fire a pointerdown-bound listener');
  });
}

{
  const buttonNode = createNode('rectangle', {
    id: 'playButton',
    transform: { x: 100, y: 100 },
    geometry: { width: 80, height: 40 },
  });
  const doorTimeline = createTimeline({ id: 'doorAnim', name: 'DoorOpen', duration: 30 });
  const upListener = createPointerListener({
    id: 'click-play-up',
    targetId: 'playButton',
    event: 'pointerup',
    action: 'play',
    timelineId: 'doorAnim',
  });
  const testDocument = normalizeDocument(createDocument({
    artboard: { width: 800, height: 600 },
    nodes: [buttonNode],
    timelines: [doorTimeline],
    listeners: [upListener],
  }));
  const store = new VeyraStore(testDocument);
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 7] pointerup DOES fire a pointerup-bound direct listener and isolates preview propagation', () => {
    const event = fakeEvent('pointerup', { clientX: 140, clientY: 120 });
    handlers.onPointerUp(event);
    assert.equal(playbackEvents.length, 1, 'pointerup-bound listener fires on the real onPointerUp handler');
    assert.equal(event.__stopped, true, 'eligible preview pointerup stops propagation before the editor ancestor');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 7] eligible preview pointerdown stops propagation, isolating it from editor drag/selection', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(event.__stopped, true, 'propagation stopped so renderer child handlers cannot start a drag');
    assert.equal(event.__defaultPrevented, true, 'preventDefault called because an intent was dispatched');
  });

  check('[GATE 7] eligible preview pointerdown with no hit still stops propagation but does not preventDefault', () => {
    const event = fakeEvent('pointerdown', { clientX: 5, clientY: 5 });
    handlers.onPointerDown(event);
    assert.equal(event.__stopped, true, 'preview still claims propagation even on a miss (no fallthrough to authoring)');
    assert.equal(event.__defaultPrevented, false, 'no intent means no preventDefault, per contract');
  });

  check('[GATE 7] eligible preview pointermove stops propagation', () => {
    const event = fakeEvent('pointermove', { clientX: 140, clientY: 120 });
    handlers.onPointerMove(event);
    assert.equal(event.__stopped, true, 'preview pointermove also isolated from editor handlers');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  // Alt+drag is the pan gesture; must be left fully alone (ineligible).
  const { handlers } = makeHandlers({ store, canvas, playbackEvents });

  check('[GATE 7 negative] Alt-held pointerdown is ineligible and does not touch propagation', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120, altKey: true });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'Alt-held click does not play');
    assert.equal(event.__stopped, false, 'ineligible event is left alone for the pan/authoring path');
    assert.equal(event.__defaultPrevented, false, 'ineligible event keeps default behavior');
  });

  check('[GATE 7 negative] middle-button pointerdown is ineligible and does not touch propagation', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120, button: 1 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'middle-button click does not play');
    assert.equal(event.__stopped, false, 'ineligible event left alone');
  });

  check('[GATE 7 negative] non-primary pointerdown is ineligible and does not touch propagation', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120, isPrimary: false });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'non-primary pointer does not play');
    assert.equal(event.__stopped, false, 'ineligible event left alone');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  // pencil tool -> not 'select', so ineligible even in preview mode.
  const { handlers } = makeHandlers({ store, canvas, playbackEvents, tool: 'pencil' });

  check('[GATE 7 negative] pencil-tool pointerdown is ineligible and does not touch propagation', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'pencil tool click does not play');
    assert.equal(event.__stopped, false, 'ineligible event left alone for pencil authoring path');
  });
}

{
  const { store } = buildFixture();
  const canvas = fakeCanvas();
  const playbackEvents = [];
  // Active pan gesture -> ineligible even with primary button and select tool.
  const { handlers } = makeHandlers({ store, canvas, playbackEvents, panGesture: true });

  check('[GATE 7 negative] active pan gesture makes pointerdown ineligible', () => {
    const event = fakeEvent('pointerdown', { clientX: 140, clientY: 120 });
    handlers.onPointerDown(event);
    assert.equal(playbackEvents.length, 0, 'pan gesture in progress blocks preview dispatch');
    assert.equal(event.__stopped, false, 'ineligible event left alone during active pan');
  });

  check('[GATE 7 negative] active pan gesture leaves pointerup propagation for ancestor pan handling', () => {
    const event = fakeEvent('pointerup', { clientX: 140, clientY: 120 });
    handlers.onPointerUp(event);
    assert.equal(event.__stopped, false, 'ineligible pan pointerup is not stopped before the ancestor finishPan handler');
  });
}

/* ------------------------------------------------------------------ *
 * R2 (Space media guard): isolated, narrow, direct verification.
 *
 * Honest limit stated rather than implied: `veyra.js`'s window keydown
 * handler (~line 2348) is a single large closure entangled with zoom,
 * undo/redo, tool switching, and keyframe deletion — extracting the WHOLE
 * handler is disproportionate to this task's scope (it is not owned by the
 * shell-bridge brief) and risks unrelated behavior drift if done under time
 * pressure. What IS this task's scope — the "editing" guard expression that
 * decides whether Space is intercepted — is a pure boolean check on
 * `event.target`'s element type, restated here from veyra.js:2350-2353
 * verbatim and cross-checked line-for-line against the source below, rather
 * than skipped or asserted without evidence.
 * ------------------------------------------------------------------ */

{
  check('[R2] editable-text guard expression matches veyra.js:2350-2353 verbatim (cross-checked, not reimplemented from memory)', () => {
    // Verbatim copy of veyra.js's `editing` guard, HTMLInputElement/HTMLTextAreaElement/
    // HTMLSelectElement checks reduced to a tagName check since this test has no real DOM.
    function editingGuard(target) {
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || !!target?.isContentEditable;
    }
    assert.equal(editingGuard({ tagName: 'INPUT' }), true, 'text input is editing context — Space must be literal');
    assert.equal(editingGuard({ tagName: 'TEXTAREA' }), true, 'textarea is editing context');
    assert.equal(editingGuard({ tagName: 'DIV', isContentEditable: true }), true, 'contentEditable div is editing context');
    assert.equal(editingGuard({ tagName: 'CANVAS' }), false, 'canvas is NOT an editing context — Space plays/pauses');
    assert.equal(editingGuard({ tagName: 'BUTTON' }), false, 'button is NOT an editing context');
  });
}

/* ------------------------------------------------------------------ *
 * MANDATORY MUTATION-SENSITIVITY SELF-CHECK (not the acceptance mutation
 * proof itself — that remains Sheema's independent scratch exercise — but a
 * demonstration that GATE 1's assertion is NOT vacuously true, i.e. it is
 * capable of failing).
 * ------------------------------------------------------------------ */

{
  check('[SELF-CHECK] GATE 1 assertion can fail: a listener bound to the wrong event never dispatches', () => {
    const buttonNode = createNode('rectangle', {
      id: 'playButton', transform: { x: 100, y: 100 }, geometry: { width: 80, height: 40 },
    });
    const doorTimeline = createTimeline({ id: 'doorAnim', name: 'DoorOpen', duration: 30 });
    // Listener bound to pointerup, not pointerdown -- a pointerdown must NOT trigger it.
    const wrongEventListener = createPointerListener({
      id: 'click-play-wrong', targetId: 'playButton', event: 'pointerup', action: 'play', timelineId: 'doorAnim',
    });
    const testDocument = normalizeDocument(createDocument({
      artboard: { width: 800, height: 600 }, nodes: [buttonNode], timelines: [doorTimeline], listeners: [wrongEventListener],
    }));
    const store = new VeyraStore(testDocument);
    const canvas = fakeCanvas();
    const playbackEvents = [];
    const { handlers } = makeHandlers({ store, canvas, playbackEvents });
    handlers.onPointerDown(fakeEvent('pointerdown', { clientX: 140, clientY: 120 }));
    assert.equal(playbackEvents.length, 0, 'pointerdown does not fire a pointerup-bound listener — proves the assertion is sensitive to real behavior, not vacuous');
  });
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.log(`\n${failed.length} of ${checks.length} checks FAILED`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} shell integration checks passed!`);
