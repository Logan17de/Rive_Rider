// Temporary critic probe — NOT part of the suite. Deleted after review.
import { createTimeline, normalizeDocument, createDocument } from '../src/veyra/model.js';
import { normalizeFrame, evaluateTimeline, AnimationPlayback } from '../src/veyra/animation.js';
import { VeyraStore } from '../src/veyra/store.js';

const results = [];
const probe = (name, fn) => {
  try { results.push([name, 'OK', String(fn())]); }
  catch (e) { results.push([name, 'THROW', `${e.constructor.name}: ${e.message}`]); }
};

// 1. Shrink duration below an existing workEnd via the store.
probe('shrink duration below workEnd', () => {
  const store = new VeyraStore(createDocument());
  const tl = createTimeline({ duration: 60, workStart: 10, workEnd: 60 });
  store.execute({ label: 'add', source: 'script' }, (doc) => { doc.timelines.push(tl); });
  store.updateTimeline(tl.id, { duration: 30 }, 'shrink');
  const after = store.document.timelines[0];
  return `duration=${after.duration} work=[${after.workStart},${after.workEnd}]`;
});

// 2. Shrink duration below workSTART too.
probe('shrink duration below workStart', () => {
  const store = new VeyraStore(createDocument());
  const tl = createTimeline({ duration: 60, workStart: 40, workEnd: 60 });
  store.execute({ label: 'add', source: 'script' }, (doc) => { doc.timelines.push(tl); });
  store.updateTimeline(tl.id, { duration: 20 }, 'shrink');
  const after = store.document.timelines[0];
  return `duration=${after.duration} work=[${after.workStart},${after.workEnd}]`;
});

// 3. Negative frame under 'none' with a work area.
probe('normalizeFrame none, frame=-5, work=[10,50]', () =>
  normalizeFrame(-5, 60, 'none', 10, 50));

// 4. Non-integer (sub-frame) time under loop — playback feeds fractional frames.
probe('normalizeFrame loop, frame=50.5, work=[10,50]', () =>
  normalizeFrame(50.5, 60, 'loop', 10, 50));

// 5. pingpong fractional at the turn.
probe('normalizeFrame pingpong, frame=50.5, work=[10,50]', () =>
  normalizeFrame(50.5, 60, 'pingpong', 10, 50));

// 6. Unknown loop mode fallthrough (returns raw frame, unclamped).
probe('normalizeFrame unknown mode', () => normalizeFrame(9999, 60, 'bogus', 10, 50));

// 7. evaluateTimeline with a legacy timeline lacking work fields entirely.
probe('legacy timeline without work fields', () => {
  const legacy = { id: 't', name: 'n', duration: 60, fps: 30, loop: 'loop', tracks: [] };
  return JSON.stringify(evaluateTimeline(legacy, 3));
});

// 8. normalizeDocument on a legacy doc: are work fields backfilled?
probe('normalizeDocument backfills work area', () => {
  const doc = createDocument();
  doc.timelines = [{ id: 'timeline_x', name: 'T', duration: 90, fps: 30, loop: 'none', tracks: [] }];
  const n = normalizeDocument(doc);
  return `work=[${n.timelines[0].workStart},${n.timelines[0].workEnd}]`;
});

// 9. setSpeed while PAUSED, then resume — is the frozen time preserved?
probe('setSpeed while paused then resume', () => {
  let t = 0;
  const doc = createDocument();
  const tl = createTimeline({ id: 'timeline_a', duration: 600, fps: 30, loop: 'loop' });
  doc.timelines = [tl];
  const pb = new AnimationPlayback(doc, { now: () => t });
  pb.play('timeline_a');
  t = 2;                      // 2s elapsed at speed 1
  pb.pause();
  const atPause = pb.getCurrentTime();
  t = 100;                    // long pause
  pb.setSpeed(2);
  const afterSpeed = pb.getCurrentTime();
  pb.resume();
  t = 101;                    // 1s at speed 2 => +2
  return `pause=${atPause} afterSetSpeed=${afterSpeed} afterResume=${pb.getCurrentTime()}`;
});

// 10. isPlaying/isPaused when one timeline runs and one is frozen.
probe('mixed playing+paused flags', () => {
  let t = 0;
  const doc = createDocument();
  doc.timelines = [
    createTimeline({ id: 'timeline_a', duration: 600, loop: 'loop' }),
    createTimeline({ id: 'timeline_b', duration: 600, loop: 'loop' }),
  ];
  const pb = new AnimationPlayback(doc, { now: () => t });
  pb.play('timeline_a');
  pb.pause();          // a frozen
  pb.play('timeline_b'); // b running
  return `isPlaying=${pb.isPlaying} isPaused=${pb.isPaused}`;
});

for (const [n, s, v] of results) {
  console.log(`${s.padEnd(5)} | ${n.padEnd(45)} | ${v}`);
}
