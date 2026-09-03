// Temporary critic probe 2 — deleted after review.
import { createTimeline, createDocument } from '../src/veyra/model.js';
import { AnimationPlayback } from '../src/veyra/animation.js';

let t = 0;
const doc = createDocument();
// 60-frame timeline @30fps, work area [30,60] => the work span is 1.0s.
doc.timelines = [createTimeline({ id: 'timeline_a', duration: 60, fps: 30, loop: 'none', workStart: 30, workEnd: 60 })];
const pb = new AnimationPlayback(doc, { now: () => t });
pb.play('timeline_a');

for (const mark of [0.5, 1.0, 1.01, 1.5, 2.0, 2.01]) {
  t = mark;
  const states = pb.getActiveStates();
  console.log(`t=${String(mark).padEnd(5)} active=${states.length} time=${states[0]?.time ?? '-'}`);
}
console.log('\nExpected: a [30,60] work area spans 1.0s, so it should finish just after t=1.0.');
