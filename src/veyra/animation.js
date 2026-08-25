import { cloneValue, timelineById, trackByAddress } from './model.js';
import { parsePropertyAddress } from './properties.js';

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

export function normalizeFrame(frame, duration, loop) {
  if (loop === 'none') {
    return Math.max(0, Math.min(frame, duration));
  }
  if (loop === 'loop') {
    return ((frame % duration) + duration) % duration;
  }
  if (loop === 'pingpong') {
    const cycle = duration * 2;
    const t = ((frame % cycle) + cycle) % cycle;
    return t < duration ? t : cycle - t;
  }
  return frame;
}

export function evaluateTimeline(timeline, time) {
  if (!timeline || !timeline.tracks) return {};

  const frame = time * timeline.fps;
  const normalizedFrame = normalizeFrame(frame, timeline.duration, timeline.loop);

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

    const weight = state.weight ?? 1;
    const overrides = evaluateTimeline(timeline, state.time);

    for (const [address, value] of Object.entries(overrides)) {
      if (weight >= 1) {
        combined[address] = value;
      } else if (combined[address] !== undefined) {
        combined[address] = interpolateValue(combined[address], value, weight);
      } else {
        combined[address] = value;
      }
    }
  }

  return combined;
}

export class AnimationPlayback {
  #document = null;
  #activeTimelines = new Map();
  #startTime = null;
  #pausedAt = null;
  #speed = 1;

  constructor(document) {
    this.#document = document;
  }

  play(timelineId, options = {}) {
    const timeline = timelineById(this.#document, timelineId);
    if (!timeline) throw new Error(`Timeline ${timelineId} not found.`);

    const state = {
      timelineId,
      startTime: Date.now() / 1000,
      weight: options.weight ?? 1,
      loop: options.loop ?? timeline.loop,
      speed: options.speed ?? 1,
    };

    this.#activeTimelines.set(timelineId, state);
    if (this.#startTime === null) {
      this.#startTime = Date.now() / 1000;
    }
  }

  stop(timelineId) {
    if (timelineId) {
      this.#activeTimelines.delete(timelineId);
    } else {
      this.#activeTimelines.clear();
    }

    if (this.#activeTimelines.size === 0) {
      this.#startTime = null;
      this.#pausedAt = null;
    }
  }

  pause() {
    if (this.#pausedAt === null && this.#startTime !== null) {
      this.#pausedAt = Date.now() / 1000;
    }
  }

  resume() {
    if (this.#pausedAt !== null) {
      const pauseDuration = (Date.now() / 1000) - this.#pausedAt;
      this.#startTime += pauseDuration;
      this.#pausedAt = null;
    }
  }

  setSpeed(speed) {
    this.#speed = Math.max(0.01, Math.min(speed, 10));
  }

  get isPlaying() {
    return this.#activeTimelines.size > 0 && this.#pausedAt === null;
  }

  get isPaused() {
    return this.#activeTimelines.size > 0 && this.#pausedAt !== null;
  }

  getCurrentTime() {
    if (this.#startTime === null) return 0;
    if (this.#pausedAt !== null) return (this.#pausedAt - this.#startTime) * this.#speed;
    return ((Date.now() / 1000) - this.#startTime) * this.#speed;
  }

  getActiveStates() {
    if (this.#activeTimelines.size === 0) return [];

    const currentTime = this.getCurrentTime();
    const states = [];

    for (const [timelineId, state] of this.#activeTimelines) {
      const timeline = timelineById(this.#document, timelineId);
      if (!timeline) continue;

      const elapsed = (currentTime - (state.startTime - this.#startTime)) * state.speed;

      // Check if timeline should stop (if not looping and past duration)
      if (state.loop === 'none' && elapsed > timeline.duration / timeline.fps) {
        this.#activeTimelines.delete(timelineId);
        continue;
      }

      states.push({
        timelineId,
        time: elapsed,
        weight: state.weight,
      });
    }

    return states;
  }

  evaluate() {
    return evaluateTimelines(this.#document, this.getActiveStates());
  }
}
