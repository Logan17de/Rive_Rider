// Temporary critic probe 3 — deleted after review.
import { normalizeFrame } from '../src/veyra/animation.js';

// Work area [30,60] on a 60-frame timeline. Playback local time starts at 0,
// so the engine feeds frames 0,1,2,... into normalizeFrame.
console.log('loop=none  (frames fed 0..60):');
for (const f of [0, 10, 20, 29, 30, 45, 60]) {
  console.log(`  fed ${String(f).padEnd(3)} -> ${normalizeFrame(f, 60, 'none', 30, 60)}`);
}

console.log('\nloop=pingpong (frames fed 0..60):');
for (const f of [0, 5, 15, 30, 45, 60]) {
  console.log(`  fed ${String(f).padEnd(3)} -> ${normalizeFrame(f, 60, 'pingpong', 30, 60)}`);
}

console.log('\nloop=loop (frames fed 0..60):');
for (const f of [0, 5, 15, 30, 60]) {
  console.log(`  fed ${String(f).padEnd(3)} -> ${normalizeFrame(f, 60, 'loop', 30, 60)}`);
}
