import { cloneValue, timelineById, trackByAddress, VEYRA_LOOP_MODES } from './model.js';
import { parsePropertyAddress, readProperty } from './properties.js';

// Easing functions following standard CSS timing function definitions
function linear(t) {
  return t;
}

function easeIn(t) {
  return t * t;
}

function easeOut(t) {
  return t * (2 - t);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function cubicBezier(t, [x1, y1, x2, y2]) {
  // Simplified cubic bezier evaluation for 0-1 range
  // Uses Newton-Raphson iteration to solve for t given x
  const epsilon = 0.001;
  let t2 = t;
  for (let i = 0; i < 8; i++) {
    const x = (3 * (1 - t2) * (1 - t2) * t2 * x1) + (3 * (1 - t2) * t2 * t2 * x2) + (t2 * t2 * t2);
    const dx = x - t;
    if (Math.abs(dx) < epsilon) break;
    const derivative = (3 * (1 - t2) * (1 - t2) * x1) + (6 * (1 - t2) * t2 * (x2 - x1)) + (3 * t2 * t2 * (1 - x2));
    if (Math.abs(derivative) < epsilon) break;
    t2 -= dx / derivative;
  }
  return (3 * (1 - t2) * (1 - t2) * t2 * y1) + (3 * (1 - t2) * t2 * t2 * y2) + (t2 * t2 * t2);
}

function step(t) {
  return t < 1 ? 0 : 1;
}

function hold(t) {
  return 0;
}

export function applyEasing(t, easing, easingParams) {
  switch (easing) {
    case 'linear': return linear(t);
    case 'ease-in': return easeIn(t);
    case 'ease-out': return easeOut(t);
    case 'ease-in-out': return easeInOut(t);
    case 'cubic-bezier': return cubicBezier(t, easingParams || [0.42, 0, 0.58, 1]);
    case 'step': return step(t);
    case 'hold': return hold(t);
    default: return t;
  }
}

function interpolateValue(valueA, valueB, t) {
  if (typeof valueA === 'number' && typeof valueB === 'number') {
    return valueA + (valueB - valueA) * t;
  }
  if (typeof valueA === 'boolean') {
    return t < 0.5 ? valueA : valueB;
  }
  if (typeof valueA === 'string') {
    // For colors, try to interpolate if both are hex colors
    if (valueA.startsWith('#') && valueB.startsWith('#') && valueA.length === 7 && valueB.length === 7) {
      const rA = parseInt(valueA.slice(1, 3), 16);
      const gA = parseInt(valueA.slice(3, 5), 16);
      const bA = parseInt(valueA.slice(5, 7), 16);
      const rB = parseInt(valueB.slice(1, 3), 16);
      const gB = parseInt(valueB.slice(3, 5), 16);
      const bB = parseInt(valueB.slice(5, 7), 16);
      const r = Math.round(rA + (rB - rA) * t);
      const g = Math.round(gA + (gB - gA) * t);
      const b = Math.round(bA + (bB - bA) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return t < 0.5 ? valueA : valueB;
  }
  if (Array.isArray(valueA) && Array.isArray(valueB) && valueA.length === valueB.length) {
    const byId = valueB.every((value) => value && typeof value === 'object' && value.id)
      ? new Map(valueB.map((value) => [value.id, value]))
      : null;
    return valueA.map((value, index) => interpolateValue(value, byId?.get(value?.id) ?? valueB[index], t));
  }
  if (valueA && valueB && typeof valueA === 'object' && typeof valueB === 'object'
    && !Array.isArray(valueA) && !Array.isArray(valueB)
    && (!valueA.type || valueA.type === valueB.type)) {
    const result = {};
    for (const key of new Set([...Object.keys(valueA), ...Object.keys(valueB)])) {
      if (!(key in valueA) || !(key in valueB) || key === 'id' || key === 'type') {
        result[key] = cloneValue(t < 0.5 ? valueA[key] : valueB[key]);
      } else {
        result[key] = interpolateValue(valueA[key], valueB[key], t);
      }
    }
    return result;
  }
  return t < 0.5 ? cloneValue(valueA) : cloneValue(valueB);
}

export function evaluateTrack(track, frame) {
  if (!track.keyframes || track.keyframes.length === 0) return null;

  // If before first keyframe, return first keyframe value
  if (frame <= track.keyframes[0].frame) {
    return cloneValue(track.keyframes[0].value);
  }

  // If after last keyframe, return last keyframe value
  const lastKf = track.keyframes[track.keyframes.length - 1];
  if (frame >= lastKf.frame) {
    return cloneValue(lastKf.value);
  }

  // Find surrounding keyframes
  let kfA = track.keyframes[0];
  let kfB = track.keyframes[1];
  for (let i = 0; i < track.keyframes.length - 1; i++) {
    if (track.keyframes[i].frame <= frame && track.keyframes[i + 1].frame >= frame) {
      kfA = track.keyframes[i];
      kfB = track.keyframes[i + 1];
      break;
    }
  }

  // If keyframes are at the same frame (shouldn't happen with normalized data)
  if (kfA.frame === kfB.frame) {
    return cloneValue(kfB.value);
  }

  // Hold easing returns the first keyframe value
  if (kfA.easing === 'hold') {
    return cloneValue(kfA.value);
  }

  // Calculate normalized time between keyframes
  const t = (frame - kfA.frame) / (kfB.frame - kfA.frame);
  const easedT = applyEasing(t, kfA.easing, kfA.easingParams);

  return interpolateValue(kfA.value, kfB.value, easedT);
}

// The work area is the inclusive frame range [workStart, workEnd]. The
// defaults reproduce the legacy full-duration behaviour exactly, so the
// original three-argument calls are unchanged; 'loop' wraps within the span
// (workEnd samples workStart, mirroring how frame duration sampled 0) and
// 'pingpong' reflects within the same span with workEnd reachable at the turn.
export function normalizeFrame(frame, duration, loop, workStart = 0, workEnd = duration) {
  if (loop === 'none') {
    return Math.max(workStart, Math.min(frame, workEnd));
  }
  if (loop === 'loop') {
    const span = workEnd - workStart;
    return workStart + (((frame - workStart) % span + span) % span);
  }
  if (loop === 'pingpong') {
    const span = workEnd - workStart;
    const cycle = span * 2;
    const t = (((frame - workStart) % cycle + cycle) % cycle);
    return workStart + (t < span ? t : cycle - t);
  }
  return frame;
}

export function evaluateTimeline(timeline, time, options = {}) {
  if (!timeline || !timeline.tracks) return {};

  // An explicit loop option overrides the authored value; it is validated,
  // while the two-argument call keeps the authored timeline.loop.
  let loop = timeline.loop;
  if (options.loop !== undefined) {
    if (!VEYRA_LOOP_MODES.includes(options.loop)) {
      throw new TypeError(`Unsupported loop mode: ${options.loop}`);
    }
    loop = options.loop;
  }

  const frame = time * timeline.fps;
  const normalizedFrame = normalizeFrame(
    frame,
    timeline.duration,
    loop,
    timeline.workStart ?? 0,
    timeline.workEnd ?? timeline.duration,
  );

  const overrides = {};
  for (const track of timeline.tracks) {
    const value = evaluateTrack(track, normalizedFrame);
    if (value !== null) {
      overrides[track.address] = value;
    }
  }

  return overrides;
}

export function evaluateTimelines(document, timelineStates) {
  const combined = {};

  for (const state of timelineStates) {
    const timeline = timelineById(document, state.timelineId);
    if (!timeline) continue;

    // Missing weights stay fully authoritative; clamp defensively to [0, 1].
    const weight = Math.max(0, Math.min(1, state.weight ?? 1));
    const overrides = evaluateTimeline(timeline, state.time, { loop: state.loop });

    for (const [address, value] of Object.entries(overrides)) {
      if (weight >= 1) {
        combined[address] = value;
      } else if (combined[address] !== undefined) {
        combined[address] = interpolateValue(combined[address], value, weight);
      } else {
        // The first contributor to an address blends against the value
        // authored in the document, so partial weights partially drive the
        // property and a zero weight leaves it authored.
        try {
          combined[address] = interpolateValue(readProperty(document, address), value, weight);
        } catch {
          // readProperty throws on unresolvable addresses (deleted node,
          // malformed address). Keep the previous behaviour: assign the
          // animated value directly so evaluation never throws.
          combined[address] = value;
        }
      }
    }
  }

  return combined;
}

export class AnimationPlayback {
  #document = null;
  #activeTimelines = new Map();
  #speed = 1;
  #now = () => Date.now() / 1000;

  constructor(document, { now } = {}) {
    this.#document = document;
    this.#now = now ?? (() => Date.now() / 1000);
  }

  get document() {
    return this.#document;
  }

  setDocument(document) {
    this.#document = document;
  }

  // The single place where the effective rate is applied:
  // local time = frozen elapsed + (now - origin) * timelineSpeed * globalSpeed.
  #localTime(state, now = this.#now()) {
    if (state.origin === null) return state.elapsed;
    return state.elapsed + (now - state.origin) * state.speed * this.#speed;
  }

  play(timelineId, options = {}) {
    const timeline = timelineById(this.#document, timelineId);
    if (!timeline) throw new Error(`Timeline ${timelineId} not found.`);

    // Playing an already-active timeline restarts it at local time 0.
    this.#activeTimelines.set(timelineId, {
      timelineId,
      elapsed: 0,
      origin: this.#now(),
      weight: options.weight ?? 1,
      loop: options.loop ?? timeline.loop,
      speed: options.speed ?? 1,
    });
  }

  stop(timelineId) {
    if (timelineId) {
      this.#activeTimelines.delete(timelineId);
    } else {
      // Every clock lives on a state, so clearing the set fully resets them.
      this.#activeTimelines.clear();
    }
  }

  pause() {
    const now = this.#now();
    for (const state of this.#activeTimelines.values()) {
      if (state.origin !== null) {
        // Fold the running segment into elapsed and freeze it.
        state.elapsed = this.#localTime(state, now);
        state.origin = null;
      }
    }
  }

  resume() {
    const now = this.#now();
    for (const state of this.#activeTimelines.values()) {
      if (state.origin === null) {
        // Continue each timeline exactly where it stopped.
        state.origin = now;
      }
    }
  }

  setSpeed(speed) {
    const now = this.#now();
    // Fold every running segment into elapsed at the current speed first,
    // so the new speed only affects future advancement.
    for (const state of this.#activeTimelines.values()) {
      if (state.origin !== null) {
        state.elapsed = this.#localTime(state, now);
      }
    }
    this.#speed = Math.max(0.01, Math.min(speed, 10));
    for (const state of this.#activeTimelines.values()) {
      if (state.origin !== null) {
        state.origin = now;
      }
    }
  }

  get isPlaying() {
    for (const state of this.#activeTimelines.values()) {
      if (state.origin !== null) return true;
    }
    return false;
  }

  get isPaused() {
    for (const state of this.#activeTimelines.values()) {
      if (state.origin === null) return true;
    }
    return false;
  }

  getCurrentTime() {
    // The maximum local elapsed time across active timelines; 0 when idle.
    const now = this.#now();
    let max = 0;
    for (const state of this.#activeTimelines.values()) {
      max = Math.max(max, this.#localTime(state, now));
    }
    return max;
  }

  getActiveStates() {
    if (this.#activeTimelines.size === 0) return [];

    const now = this.#now();
    const states = [];
    const finished = [];

    for (const [timelineId, state] of this.#activeTimelines) {
      const timeline = timelineById(this.#document, timelineId);
      if (!timeline) continue;

      const time = this.#localTime(state, now);

      // Check if timeline should stop: an effective 'none' loop finishes
      // when its local time passes the work area end, which equals the old
      // duration threshold for full-length work areas.
      if (state.loop === 'none' && time > (timeline.workEnd ?? timeline.duration) / timeline.fps) {
        finished.push(timelineId);
        continue;
      }

      states.push({
        timelineId,
        time,
        weight: state.weight,
        loop: state.loop,
      });
    }

    // Never delete from the Map while iterating it.
    for (const timelineId of finished) {
      this.#activeTimelines.delete(timelineId);
    }

    return states;
  }

  evaluate() {
    return evaluateTimelines(this.#document, this.getActiveStates());
  }
}
