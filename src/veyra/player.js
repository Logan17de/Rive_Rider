/* Deterministic Veyra player for editor previews and embeddable hosts. */
import { cloneValue, normalizeDocument, timelineById } from './model.js';
import { evaluateDocument } from './evaluation.js';
import { evaluateTimeline, normalizeFrame } from './animation.js';
import { createMachineRuntime } from './stateMachine.js';
import { createVeyraDataRuntime } from './dataGraph.js';
import { renderSvgString } from './geometry.js';
import { propertyTargetStatus } from './properties.js';
import { normalizeCanonicalPropertyValue } from './propertyBinding.js';

export const VEYRA_PLAYER_EVENTS = Object.freeze([
  'load', 'play', 'pause', 'stop', 'seek', 'frame', 'complete', 'marker',
  'transition-start', 'transition-end', 'machine-action', 'error', 'render',
  'event', 'navigate', 'script-request',
]);

function asDocument(source) {
  const value = typeof source === 'function' ? source() : source;
  if (!value || typeof value !== 'object') throw new TypeError('VeyraPlayer requires a document or document getter.');
  return normalizeDocument(value);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value))); }
function loopTime(time, duration, loop) {
  if (!(duration > 0)) return 0;
  if (loop === 'loop') return ((time % duration) + duration) % duration;
  if (loop === 'pingpong') {
    const cycle = duration * 2;
    const position = ((time % cycle) + cycle) % cycle;
    return position <= duration ? position : cycle - position;
  }
  return clamp(time, 0, duration);
}

function markerEventsBetween(document, previousTime, nextTime, duration, loop, fps, speed) {
  if (!(duration > 0) || !Array.isArray(document?.events) || !fps) return [];
  const markers = document.events
    .filter((event) => event.type === 'marker' && Number.isFinite(Number(event.payload?.frame)))
    .map((event) => ({ event, time: Number(event.payload.frame) / fps }))
    .sort((left, right) => left.time - right.time || left.event.id.localeCompare(right.event.id));
  if (!markers.length || speed === 0) return [];
  const hits = [];
  const emit = (marker, time) => hits.push({
    type: 'marker', marker: marker.event.marker || marker.event.name,
    eventId: marker.event.id, time, payload: cloneValue(marker.event.payload || {}),
  });
  if (speed > 0) {
    if (loop === 'loop' && nextTime < previousTime) {
      markers.filter((marker) => marker.time > previousTime && marker.time <= duration).forEach((marker) => emit(marker, marker.time));
      markers.filter((marker) => marker.time >= 0 && marker.time <= nextTime).forEach((marker) => emit(marker, marker.time));
    } else {
      markers.filter((marker) => (previousTime === 0 ? marker.time >= previousTime : marker.time > previousTime) && marker.time <= nextTime).forEach((marker) => emit(marker, marker.time));
    }
  } else if (loop !== 'loop' || nextTime <= previousTime) {
    markers.filter((marker) => marker.time >= nextTime && marker.time < previousTime).reverse().forEach((marker) => emit(marker, marker.time));
  } else {
    markers.filter((marker) => marker.time >= 0 && marker.time < previousTime).reverse().forEach((marker) => emit(marker, marker.time));
    markers.filter((marker) => marker.time >= nextTime && marker.time <= duration).reverse().forEach((marker) => emit(marker, marker.time));
  }
  return hits;
}

export class VeyraPlayer {
  #source;
  #document;
  #dataRuntime;
  #machineRuntime = null;
  #timelineId = null;
  #machineId = null;
  #time = 0;
  #speed = 1;
  #loop = 'none';
  #playing = false;
  #raf = null;
  #lastNow = null;
  #listeners = new Map();
  #options;
  #lastFrame = null;
  #runtimeOverrides = new Map();
  #onceActions = new Set();

  constructor(documentOrGetter, options = {}) {
    this.#source = documentOrGetter;
    this.#options = { artboardId: options.artboardId || null, runtimeScopePath: options.runtimeScopePath || [], ...options };
    this.#document = asDocument(documentOrGetter);
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(() => this.#document);
    this.#timelineId = options.timelineId || this.#document.timelines[0]?.id || null;
    this.#machineId = options.machineId || this.#document.stateMachines[0]?.id || null;
    this.#loop = options.loop || timelineById(this.#document, this.#timelineId)?.loop || 'none';
    this.#speed = Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1;
    this.#createMachineRuntime();
  }

  #createMachineRuntime() {
    this.#machineRuntime = this.#machineId && this.#document.stateMachines.some((machine) => machine.id === this.#machineId)
      ? createMachineRuntime(() => this.#document, this.#machineId, { dataRuntime: this.#dataRuntime, runtimeScopePath: this.#options.runtimeScopePath, randomSeed: this.#options.randomSeed })
      : null;
  }

  get document() { return this.#document; }
  get timelineId() { return this.#timelineId; }
  get machineId() { return this.#machineId; }
  get currentTime() { return this.#time; }
  get duration() {
    const timeline = timelineById(this.#document, this.#timelineId);
    return timeline ? Number(timeline.workEnd ?? timeline.duration) / Number(timeline.fps || 1) : 0;
  }
  get frame() { const timeline = timelineById(this.#document, this.#timelineId); return timeline ? this.#time * Number(timeline.fps || 1) : 0; }
  get speed() { return this.#speed; }
  get loop() { return this.#loop; }
  get isPlaying() { return this.#playing; }
  get isPaused() { return !this.#playing && this.#time > 0; }

  on(type, listener) {
    if (typeof listener !== 'function') throw new TypeError('Player listener must be a function.');
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(listener);
    return () => this.off(type, listener);
  }
  off(type, listener) { return this.#listeners.get(type)?.delete(listener) || false; }
  addEventListener(type, listener) { return this.on(type, listener); }
  removeEventListener(type, listener) { return this.off(type, listener); }
  #emit(type, detail = {}) {
    const event = { type, player: this, ...cloneValue(detail) };
    for (const listener of [...(this.#listeners.get(type) || []), ...(type !== '*' ? this.#listeners.get('*') || [] : [])]) {
      try { listener(event); } catch (error) { if (type !== 'error') this.#emit('error', { error: String(error?.message || error) }); }
    }
    return event;
  }

  load(documentOrGetter, options = {}) {
    this.pause();
    this.#source = documentOrGetter;
    this.#document = asDocument(documentOrGetter);
    this.#options = { ...this.#options, ...options };
    this.#dataRuntime = options.dataRuntime || createVeyraDataRuntime(() => this.#document);
    this.#runtimeOverrides.clear();
    this.#onceActions.clear();
    const hasTimeline = Object.prototype.hasOwnProperty.call(options, 'timelineId');
    const hasMachine = Object.prototype.hasOwnProperty.call(options, 'machineId');
    const currentTimeline = !hasTimeline && this.#document.timelines.some((timeline) => timeline.id === this.#timelineId) ? this.#timelineId : null;
    const currentMachine = !hasMachine && this.#document.stateMachines.some((machine) => machine.id === this.#machineId) ? this.#machineId : null;
    this.#timelineId = hasTimeline ? (options.timelineId || null) : (currentTimeline || this.#document.timelines[0]?.id || null);
    this.#machineId = hasMachine ? (options.machineId || null) : (currentMachine || this.#document.stateMachines[0]?.id || null);
    this.#loop = options.loop || timelineById(this.#document, this.#timelineId)?.loop || 'none';
    if (options.speed !== undefined) this.setSpeed(options.speed);
    this.#time = 0;
    this.#createMachineRuntime();
    const detail = { documentId: this.#document.id };
    this.#runFeatureEvents('load', detail);
    this.#emit('load', detail);
    return this;
  }

  setTimeline(timelineId) {
    const timeline = timelineById(this.#document, timelineId);
    if (!timeline) throw new TypeError(`Timeline ${timelineId} does not exist.`);
    this.#timelineId = timeline.id;
    this.#loop = timeline.loop;
    this.#time = 0;
    this.#emit('seek', { time: 0, timelineId: timeline.id });
    return this;
  }
  setMachine(machineId) {
    if (machineId != null && !this.#document.stateMachines.some((machine) => machine.id === machineId)) throw new TypeError(`State machine ${machineId} does not exist.`);
    this.#machineId = machineId || null;
    this.#createMachineRuntime();
    return this;
  }
  setSpeed(speed) {
    const next = Number(speed);
    if (!Number.isFinite(next) || next < -16 || next > 16) throw new RangeError('Player speed must be between -16 and 16.');
    this.#speed = next;
    return next;
  }
  setLoop(loop) {
    if (!['none', 'loop', 'pingpong'].includes(loop)) throw new TypeError('Player loop must be none, loop, or pingpong.');
    this.#loop = loop;
    return loop;
  }

  play() {
    if (this.#playing) return this;
    this.#playing = true;
    this.#lastNow = null;
    this.#emit('play', { time: this.#time });
    this.#schedule();
    return this;
  }
  pause() {
    if (!this.#playing) return this;
    this.#playing = false;
    this.#cancelSchedule();
    this.#emit('pause', { time: this.#time });
    return this;
  }
  stop() {
    this.#playing = false;
    this.#cancelSchedule();
    this.#time = 0;
    this.#machineRuntime?.reset();
    this.#runtimeOverrides.clear();
    this.#onceActions.clear();
    this.#emit('stop', { time: 0 });
    this.#render();
    return this;
  }
  reset() { return this.stop(); }
  seek(seconds) {
    const next = Number(seconds);
    if (!Number.isFinite(next) || next < 0) throw new TypeError('Player seek time must be a finite non-negative number.');
    this.#time = loopTime(next, this.duration, this.#loop);
    if (this.#machineRuntime) this.#machineRuntime.scrub(this.#time);
    this.#emit('seek', { time: this.#time, frame: this.frame });
    this.#render();
    return this.#time;
  }
  setInput(nameOrId, value) { if (!this.#machineRuntime) throw new TypeError('Player has no state machine.'); return this.#machineRuntime.setInput(nameOrId, value); }
  fire(nameOrId) { if (!this.#machineRuntime) throw new TypeError('Player has no state machine.'); return this.#machineRuntime.fire(nameOrId); }
  setRuntimeValue(name, value) { if (!this.#machineRuntime) throw new TypeError('Player has no state machine.'); return this.#machineRuntime.setRuntimeValue(name, value); }
  getRuntimeValue(name) { return this.#machineRuntime?.getRuntimeValue(name); }

  #actionTarget(action, key) {
    const target = action?.target ?? action?.params?.[key] ?? action?.params?.target;
    if (target && typeof target === 'object' && target.address) return target.address;
    return target;
  }

  #inputTarget(action) {
    const target = this.#actionTarget(action, 'input');
    return target && typeof target === 'object' ? (target.id || target.name) : target;
  }

  #executeFeatureAction(action, detail, depth) {
    const value = action.value !== null && action.value !== undefined ? action.value : action.params?.value;
    switch (action.type) {
      case 'setProperty': {
        const address = this.#actionTarget(action, 'address');
        if (!address || propertyTargetStatus(this.#document, String(address)) !== 'animatable') {
          throw new TypeError(`Event action ${action.id} requires an animatable property address.`);
        }
        const normalizedValue = normalizeCanonicalPropertyValue(
          this.#document,
          String(address),
          value,
          `Event action ${action.id}`,
        );
        this.#runtimeOverrides.set(String(address), cloneValue(normalizedValue));
        return { kind: 'setProperty', address: String(address), value: cloneValue(normalizedValue), mutation: 'runtime-only' };
      }
      case 'setData': {
        const endpoint = this.#actionTarget(action, 'endpoint');
        if (!endpoint || endpoint.kind !== 'data') throw new TypeError(`Event action ${action.id} requires a data endpoint.`);
        const resolved = this.#dataRuntime.resolveDataEndpoint(endpoint, { scopePath: this.#options.runtimeScopePath || [] });
        const changed = this.#dataRuntime.setValue(resolved.instance.id, resolved.property.id, cloneValue(value), { scopePath: this.#options.runtimeScopePath || [], source: 'player-event' });
        return { kind: 'setData', target: cloneValue(endpoint), changed: Boolean(changed), value: cloneValue(value), mutation: 'runtime-only' };
      }
      case 'fireTrigger': {
        const input = this.#inputTarget(action);
        this.fire(input);
        return { kind: 'fireTrigger', input: cloneValue(input), mutation: 'runtime-only' };
      }
      case 'play': this.play(); return { kind: 'play' };
      case 'pause': this.pause(); return { kind: 'pause' };
      case 'stop': this.stop(); return { kind: 'stop' };
      case 'seek': this.seek(Number(value ?? action.params?.time ?? 0)); return { kind: 'seek', time: this.#time };
      case 'setInput': {
        const input = this.#inputTarget(action);
        const normalized = this.setInput(input, value);
        return { kind: 'setInput', input: cloneValue(input), value: cloneValue(normalized), mutation: 'runtime-only' };
      }
      case 'emit': {
        const eventType = String(action.params?.event || action.params?.type || action.value || '');
        if (!eventType) throw new TypeError(`Event action ${action.id} requires an emitted event name.`);
        const payload = cloneValue(action.params?.payload ?? action.params?.detail ?? detail ?? null);
        this.#emit(eventType, { detail: payload, sourceEvent: detail?.eventId || null });
        if (depth < 8) this.#runFeatureEvents(eventType, payload, depth + 1);
        return { kind: 'emit', event: eventType, payload };
      }
      case 'navigate': {
        const destination = cloneValue(action.params?.url ?? action.params?.path ?? value ?? action.target ?? null);
        this.#emit('navigate', { destination, detail: cloneValue(detail) });
        return { kind: 'navigate', destination };
      }
      case 'script': {
        const request = { script: cloneValue(action.params?.script ?? action.target ?? value ?? null), detail: cloneValue(detail) };
        this.#emit('script-request', request);
        return { kind: 'script-request', ...request, executed: false };
      }
      default: throw new TypeError(`Unsupported event action type ${action.type}.`);
    }
  }

  #runFeatureEvents(type, detail = {}, depth = 0) {
    if (depth > 8) return { type: String(type), matched: 0, actions: [], errors: [{ error: 'Event dispatch recursion limit exceeded.' }] };
    const eventType = String(type || 'custom');
    const records = (this.#document.events || []).filter((record) => {
      if (record.enabled === false) return false;
      if (eventType === 'marker') {
        return record.type === 'marker' && (!record.marker || record.marker === detail?.marker);
      }
      if (record.type === eventType) return true;
      if (record.type === 'custom' && record.event === eventType) return true;
      return false;
    });
    const actions = [];
    const errors = [];
    for (const record of records) {
      if (record.target?.id && detail?.targetId && record.target.id !== detail.targetId) continue;
      for (const action of record.actions || []) {
        if (action.enabled === false || (action.once && this.#onceActions.has(action.id))) continue;
        try {
          const effect = this.#executeFeatureAction(action, detail, depth);
          actions.push({ eventId: record.id, actionId: action.id, type: action.type, effect });
          if (action.once) this.#onceActions.add(action.id);
        } catch (error) {
          const failure = { eventId: record.id, actionId: action.id, type: action.type, error: String(error?.message || error) };
          errors.push(failure);
          this.#emit('error', failure);
        }
      }
    }
    return { type: eventType, matched: records.length, actions, errors };
  }

  /** Dispatch an authored feature-graph event and execute its runtime-only actions. */
  dispatchEvent(type, detail = {}) {
    const eventType = typeof type === 'string' ? type : type?.type;
    if (!eventType) throw new TypeError('Player dispatchEvent requires an event type.');
    const result = this.#runFeatureEvents(eventType, detail);
    this.#emit('event', { eventType, detail: cloneValue(detail), result: cloneValue(result) });
    return result;
  }

  dispatch(type, detail = {}) { return this.dispatchEvent(type, detail); }
  emit(type, detail = {}) { return this.dispatchEvent(type, detail); }

  advance(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta < 0) throw new TypeError('Player advance delta must be finite and non-negative.');
    const previousTime = this.#time;
    const signed = delta * this.#speed;
    let events = [];
    if (this.#machineRuntime && signed >= 0) events = this.#machineRuntime.step(signed);
    if (this.#machineRuntime && signed < 0) {
      this.#time = Math.max(0, this.#time + signed);
      this.#machineRuntime.scrub(this.#time);
    } else this.#time += signed;
    const duration = this.duration;
    const reachedEnd = duration > 0 && ((this.#speed >= 0 && this.#time >= duration) || (this.#speed < 0 && this.#time <= 0));
    if (reachedEnd && this.#loop === 'none') {
      this.#time = this.#speed >= 0 ? duration : 0;
      if (this.#playing) { this.#playing = false; this.#cancelSchedule(); }
      const completeDetail = { time: this.#time };
      this.#runFeatureEvents('complete', completeDetail);
      this.#emit('complete', completeDetail);
    } else if (duration > 0) this.#time = loopTime(this.#time, duration, this.#loop);
    events = [...events, ...markerEventsBetween(
      this.#document,
      previousTime,
      this.#time,
      duration,
      this.#loop,
      Number(timelineById(this.#document, this.#timelineId)?.fps || 1),
      this.#speed,
    )];
    for (const event of events) {
      if (event.type === 'marker') this.#runFeatureEvents('marker', event);
      this.#emit(event.type, event);
    }
    this.#emit('frame', { time: this.#time, frame: this.frame, events });
    this.#render();
    return { time: this.#time, frame: this.frame, events, scene: this.evaluate() };
  }

  evaluate() {
    const timeline = timelineById(this.#document, this.#timelineId);
    const animation = timeline ? evaluateTimeline(timeline, this.#time, { loop: this.#loop }) : {};
    const machine = this.#machineRuntime?.evaluate() || null;
    const overrides = { ...(machine?.overrides || {}), ...animation, ...Object.fromEntries(this.#runtimeOverrides) };
    return evaluateDocument(this.#document, { animation: overrides }, null, {
      dataRuntime: this.#dataRuntime,
      artboardId: this.#options.artboardId || this.#document.artboards[0]?.id,
      runtimeScopePath: this.#options.runtimeScopePath || [],
    });
  }
  snapshot() {
    return {
      format: 'veyra-player-snapshot', version: 1, documentId: this.#document.id,
      timelineId: this.#timelineId, machineId: this.#machineId, time: this.#time,
      frame: this.frame, duration: this.duration, speed: this.#speed, loop: this.#loop,
      playing: this.#playing, machine: this.#machineRuntime ? cloneValue(this.#machineRuntime.evaluate()) : null,
    };
  }
  render() { return this.#render(); }
  #render() {
    let scene;
    try { scene = this.evaluate(); } catch (error) { this.#emit('error', { error: String(error?.message || error) }); return null; }
    this.#lastFrame = scene;
    this.#emit('render', { scene });
    return scene;
  }
  get lastScene() { return this.#lastFrame; }
  #schedule() {
    if (!this.#playing || typeof globalThis.requestAnimationFrame !== 'function') return;
    this.#raf = globalThis.requestAnimationFrame((now) => {
      const seconds = this.#lastNow == null ? 0 : Math.max(0, (now - this.#lastNow) / 1000);
      this.#lastNow = now;
      if (seconds) this.advance(seconds);
      if (this.#playing) this.#schedule();
    });
  }
  #cancelSchedule() { if (this.#raf != null && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(this.#raf); this.#raf = null; this.#lastNow = null; }
}

export function createVeyraPlayer(documentOrGetter, options = {}) { return new VeyraPlayer(documentOrGetter, options); }

export function registerVeyraPlayerElement(tagName = 'veyra-player') {
  if (typeof globalThis.customElements === 'undefined' || typeof globalThis.HTMLElement === 'undefined') return false;
  if (globalThis.customElements.get(tagName)) return true;
  class VeyraPlayerElement extends HTMLElement {
    #player = null;
    #svg = null;
    connectedCallback() {
      this.setAttribute('role', 'img');
      this.#svg = this.querySelector('svg') || document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (!this.#svg.parentNode) this.appendChild(this.#svg);
      this.#svg.setAttribute('width', this.getAttribute('width') || '100%');
      this.#svg.setAttribute('height', this.getAttribute('height') || '100%');
      this.#svg.setAttribute('aria-label', this.getAttribute('aria-label') || 'Veyra animation');
      this.#svg.style.display = 'block';
      if (this.documentModel) this.#attach(this.documentModel);
    }
    #attach(value) {
      this.#player?.pause();
      this.#player = createVeyraPlayer(value, { timelineId: this.getAttribute('timeline') || undefined, machineId: this.getAttribute('machine') || undefined });
      this.#player.on('render', ({ scene }) => { try { const rendered = renderSvgString(scene); const inner = rendered.replace(/^<svg[^>]*>|<\/svg>$/g, ''); this.#svg.innerHTML = inner; } catch { /* host can still use lastScene */ } });
      this.#player.render();
    }
    set documentModel(value) { this.#attach(value); }
    get documentModel() { return this.#player?.document || null; }
    get player() { return this.#player; }
    play() { this.#player?.play(); return this; }
    pause() { this.#player?.pause(); return this; }
    stop() { this.#player?.stop(); return this; }
    seek(time) { this.#player?.seek(time); return this; }
    setInput(nameOrId, value) { this.#player?.setInput(nameOrId, value); return this; }
    fire(nameOrId) { this.#player?.fire(nameOrId); return this; }
    setRuntimeValue(name, value) { this.#player?.setRuntimeValue(name, value); return this; }
    getRuntimeValue(name) { return this.#player?.getRuntimeValue(name); }
    dispatchEvent(type, detail) {
      if (type && typeof type === 'object' && typeof type.type === 'string') {
        const nativeResult = super.dispatchEvent(type);
        this.#player?.dispatchEvent(type.type, type.detail ?? detail ?? {});
        return nativeResult;
      }
      return this.#player?.dispatchEvent(type, detail) || null;
    }
  }
  globalThis.customElements.define(tagName, VeyraPlayerElement);
  return true;
}

if (typeof globalThis.window !== 'undefined') registerVeyraPlayerElement();
