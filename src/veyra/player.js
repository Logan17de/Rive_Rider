/* Deterministic Veyra player for editor previews and embeddable hosts. */
import { cloneValue, normalizeDocument, timelineById } from './model.js';
import { evaluateDocument } from './evaluation.js';
import { evaluateTimeline, normalizeFrame } from './animation.js';
import { createMachineRuntime } from './stateMachine.js';
import { createVeyraDataRuntime } from './dataGraph.js';
import { renderSvgString } from './geometry.js';

export const VEYRA_PLAYER_EVENTS = Object.freeze([
  'load', 'play', 'pause', 'stop', 'seek', 'frame', 'complete', 'marker',
  'transition-start', 'transition-end', 'machine-action', 'error', 'render',
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
    this.#emit('load', { documentId: this.#document.id });
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
      this.#emit('complete', { time: this.#time });
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
    for (const event of events) this.#emit(event.type, event);
    this.#emit('frame', { time: this.#time, frame: this.frame, events });
    this.#render();
    return { time: this.#time, frame: this.frame, events, scene: this.evaluate() };
  }

  evaluate() {
    const timeline = timelineById(this.#document, this.#timelineId);
    const animation = timeline ? evaluateTimeline(timeline, this.#time, { loop: this.#loop }) : {};
    const machine = this.#machineRuntime?.evaluate() || null;
    const overrides = { ...(machine?.overrides || {}), ...animation };
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
  }
  globalThis.customElements.define(tagName, VeyraPlayerElement);
  return true;
}

if (typeof globalThis.window !== 'undefined') registerVeyraPlayerElement();
