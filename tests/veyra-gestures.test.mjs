import assert from 'node:assert/strict';
import { createArtboardResizeGesture } from '../src/veyra/gestures.js';

function recorder({ failCommit = false } = {}) {
  const calls = [];
  const document = { artboard: { width: 100, height: 80 } };
  return {
    calls, document,
    begin(label) { calls.push(['begin', label]); },
    mutate(fn, reason) { calls.push(['mutate', reason]); fn(document); },
    commit() { calls.push(['commit']); if (failCommit) throw new Error('validation failure'); },
    cancel() { calls.push(['cancel']); },
  };
}

const start = { x: 10, y: 20 };
const base = { width: 100, height: 80 };
const store = recorder();
const gesture = createArtboardResizeGesture({ store, start, startArtboard: base, mode: 'resize', scaleX: 2, scaleY: 3 });
assert.equal(gesture.move({ clientX: 11, clientY: 20 }).started, false, 'gesture threshold avoids begin before movement');
assert.equal(store.calls.length, 0, 'threshold move has no store effects');
for (const point of [{ clientX: 13, clientY: 22 }, { clientX: 14, clientY: 23 }, { clientX: 16, clientY: 24 }]) gesture.move(point);
const begins = store.calls.filter(([name]) => name === 'begin');
assert.equal(begins.length, 1, 'gesture structurally begins exactly once');
assert.equal(store.calls.filter(([name]) => name === 'mutate').length, 3, 'each active move mutates once');
assert.deepEqual(store.document.artboard, { width: 112, height: 92, x: 0, y: 0 }, 'scaled resize deltas reach store data with default origin');
assert.equal(gesture.end().committed, true, 'successful gesture commits');
assert.equal(store.calls.filter(([name]) => name === 'commit').length, 1, 'gesture commits exactly once');

const failing = recorder({ failCommit: true });
const failedGesture = createArtboardResizeGesture({ store: failing, start, startArtboard: base, mode: 'resize' });
failedGesture.move({ clientX: 20, clientY: 30 });
const result = failedGesture.end();
assert.equal(result.error.message, 'validation failure', 'commit failure is reported to caller');
assert.equal(failing.calls.at(-1)[0], 'cancel', 'commit failure cancels the transaction');
assert.equal(failedGesture.active, false, 'failed gesture closes its active state');
assert.equal(failing.calls.filter(([name]) => name === 'begin').length, 1, 'failure path positive control began once');
assert.equal(failing.calls.filter(([name]) => name === 'cancel').length, 1, 'failure path recovery positive control cancels once');

console.log('veyra gesture tests passed');
