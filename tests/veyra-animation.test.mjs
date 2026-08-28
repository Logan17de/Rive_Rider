import assert from 'node:assert';
import {
  createDocument,
  createGradientStop,
  createLinearGradient,
  createTimeline,
  createTrack,
  createKeyframe,
  createNode,
  normalizeDocument,
  VEYRA_EASING_TYPES,
  VEYRA_LOOP_MODES,
} from '../src/veyra/model.js';
import {
  applyEasing,
  evaluateTrack,
  evaluateTimeline,
  evaluateTimelines,
  normalizeFrame,
  AnimationPlayback,
} from '../src/veyra/animation.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

console.log('Testing Veyra animation system...');

// Test: createTimeline and createKeyframe
{
  const timeline = createTimeline({ name: 'Test Timeline', duration: 120, fps: 60 });
  assert.strictEqual(timeline.name, 'Test Timeline');
  assert.strictEqual(timeline.duration, 120);
  assert.strictEqual(timeline.fps, 60);
  assert.strictEqual(timeline.loop, 'none');
  assert(Array.isArray(timeline.tracks));

  const keyframe = createKeyframe({ frame: 10, value: 100, easing: 'ease-in' });
  assert.strictEqual(keyframe.frame, 10);
  assert.strictEqual(keyframe.value, 100);
  assert.strictEqual(keyframe.easing, 'ease-in');

  const bezierKf = createKeyframe({ frame: 20, value: 200, easing: 'cubic-bezier', easingParams: [0.1, 0.2, 0.3, 0.4] });
  assert.strictEqual(bezierKf.easing, 'cubic-bezier');
  assert.deepStrictEqual(bezierKf.easingParams, [0.1, 0.2, 0.3, 0.4]);

  console.log('✓ createTimeline and createKeyframe');
}

// Test: normalize timeline with validation
{
  const node = createNode('rectangle', { name: 'Box' });
  const doc = createDocument({
    nodes: [node],
    timelines: [
      createTimeline({
        name: 'Width Animation',
        duration: 60,
        fps: 30,
        loop: 'loop',
        tracks: [
          createTrack(nodePropertyAddress(node.id, 'geometry/width'), {
            keyframes: [
              createKeyframe({ frame: 0, value: 100, easing: 'linear' }),
              createKeyframe({ frame: 30, value: 200, easing: 'ease-out' }),
              createKeyframe({ frame: 60, value: 100, easing: 'linear' }),
            ],
          }),
        ],
      }),
    ],
  });

  const normalized = normalizeDocument(doc);
  assert.strictEqual(normalized.timelines.length, 1);
  assert.strictEqual(normalized.timelines[0].name, 'Width Animation');
  assert.strictEqual(normalized.timelines[0].tracks.length, 1);
  assert.strictEqual(normalized.timelines[0].tracks[0].keyframes.length, 3);

  console.log('✓ normalize timeline with validation');
}

// Test: easing functions
{
  assert.strictEqual(applyEasing(0.5, 'linear'), 0.5);
  assert(applyEasing(0.5, 'ease-in') < 0.5);
  assert(applyEasing(0.5, 'ease-out') > 0.5);
  assert.strictEqual(applyEasing(0.3, 'step'), 0);
  assert.strictEqual(applyEasing(1.0, 'step'), 1);
  assert.strictEqual(applyEasing(0.5, 'hold'), 0);

  const bezier = applyEasing(0.5, 'cubic-bezier', [0.42, 0, 0.58, 1]);
  assert(bezier > 0 && bezier < 1);

  console.log('✓ easing functions');
}

// Test: evaluateTrack with linear interpolation
{
  const track = createTrack('test/property', {
    keyframes: [
      createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
      createKeyframe({ frame: 10, value: 100, easing: 'linear' }),
      createKeyframe({ frame: 20, value: 50, easing: 'linear' }),
    ],
  });

  assert.strictEqual(evaluateTrack(track, -5), 0); // Before first keyframe
  assert.strictEqual(evaluateTrack(track, 0), 0);
  assert.strictEqual(evaluateTrack(track, 5), 50);
  assert.strictEqual(evaluateTrack(track, 10), 100);
  assert.strictEqual(evaluateTrack(track, 15), 75);
  assert.strictEqual(evaluateTrack(track, 20), 50);
  assert.strictEqual(evaluateTrack(track, 25), 50); // After last keyframe

  console.log('✓ evaluateTrack with linear interpolation');
}

// Test: evaluateTrack with ease-in
{
  const track = createTrack('test/property', {
    keyframes: [
      createKeyframe({ frame: 0, value: 0, easing: 'ease-in' }),
      createKeyframe({ frame: 10, value: 100, easing: 'linear' }),
    ],
  });

  const midValue = evaluateTrack(track, 5);
  assert(midValue < 50, 'ease-in should produce values less than linear at t=0.5');

  console.log('✓ evaluateTrack with ease-in');
}

// Test: evaluateTrack with hold easing
{
  const track = createTrack('test/property', {
    keyframes: [
      createKeyframe({ frame: 0, value: 100, easing: 'hold' }),
      createKeyframe({ frame: 10, value: 200, easing: 'linear' }),
    ],
  });

  assert.strictEqual(evaluateTrack(track, 5), 100); // Hold keeps first value
  assert.strictEqual(evaluateTrack(track, 9), 100);
  assert.strictEqual(evaluateTrack(track, 10), 200);

  console.log('✓ evaluateTrack with hold easing');
}

// Test: evaluateTrack with color interpolation
{
  const track = createTrack('test/color', {
    keyframes: [
      createKeyframe({ frame: 0, value: '#000000', easing: 'linear' }),
      createKeyframe({ frame: 10, value: '#ffffff', easing: 'linear' }),
    ],
  });

  const midColor = evaluateTrack(track, 5);
  assert(midColor.startsWith('#'));
  assert.strictEqual(midColor.length, 7);
  // Halfway between black (#000000) and white (#ffffff) is mid-gray (#808080)
  assert.strictEqual(midColor, '#808080');

  console.log('✓ evaluateTrack with color interpolation');
}

// Test: evaluateTrack with tagged gradient interpolation
{
  const start = createLinearGradient({
    x2: 1,
    stops: [
      createGradientStop({ id: 'stop_a', offset: 0, color: '#000000' }),
      createGradientStop({ id: 'stop_b', offset: 1, color: '#ffffff' }),
    ],
  });
  const end = createLinearGradient({
    x2: 0.5,
    stops: [
      createGradientStop({ id: 'stop_a', offset: 0.2, color: '#ffffff' }),
      createGradientStop({ id: 'stop_b', offset: 0.8, color: '#000000' }),
    ],
  });
  const track = createTrack('test/fill', {
    keyframes: [
      createKeyframe({ frame: 0, value: start, easing: 'linear' }),
      createKeyframe({ frame: 10, value: end, easing: 'linear' }),
    ],
  });
  const middle = evaluateTrack(track, 5);
  assert.strictEqual(middle.type, 'linearGradient');
  assert.strictEqual(middle.x2, 0.75);
  assert.strictEqual(middle.stops[0].id, 'stop_a');
  assert.strictEqual(middle.stops[0].offset, 0.1);
  assert.strictEqual(middle.stops[0].color, '#808080');

  console.log('✓ evaluateTrack with tagged gradient interpolation');
}

// Test: normalizeFrame with loop modes
{
  assert.strictEqual(normalizeFrame(10, 60, 'none'), 10);
  assert.strictEqual(normalizeFrame(70, 60, 'none'), 60); // Clamps to duration
  assert.strictEqual(normalizeFrame(-5, 60, 'none'), 0); // Clamps to 0

  assert.strictEqual(normalizeFrame(10, 60, 'loop'), 10);
  assert.strictEqual(normalizeFrame(70, 60, 'loop'), 10); // Wraps around
  assert.strictEqual(normalizeFrame(130, 60, 'loop'), 10);

  assert.strictEqual(normalizeFrame(10, 60, 'pingpong'), 10);
  assert.strictEqual(normalizeFrame(70, 60, 'pingpong'), 50); // Bounces back
  assert.strictEqual(normalizeFrame(120, 60, 'pingpong'), 0); // Full cycle

  console.log('✓ normalizeFrame with loop modes');
}

// Test: evaluateTimeline
{
  const node = createNode('rectangle', { name: 'Box' });
  const timeline = createTimeline({
    name: 'Position Animation',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 300, easing: 'linear' }),
        ],
      }),
      createTrack(nodePropertyAddress(node.id, 'transform/y'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 150, easing: 'linear' }),
        ],
      }),
    ],
  });

  const overrides0 = evaluateTimeline(timeline, 0);
  assert.strictEqual(overrides0[nodePropertyAddress(node.id, 'transform/x')], 0);
  assert.strictEqual(overrides0[nodePropertyAddress(node.id, 'transform/y')], 0);

  const overrides05 = evaluateTimeline(timeline, 0.5);
  assert.strictEqual(overrides05[nodePropertyAddress(node.id, 'transform/x')], 150);
  assert.strictEqual(overrides05[nodePropertyAddress(node.id, 'transform/y')], 75);

  const overrides1 = evaluateTimeline(timeline, 1);
  assert.strictEqual(overrides1[nodePropertyAddress(node.id, 'transform/x')], 300);
  assert.strictEqual(overrides1[nodePropertyAddress(node.id, 'transform/y')], 150);

  console.log('✓ evaluateTimeline');
}

// Test: evaluateTimelines with multiple timelines and weights
{
  const node = createNode('ellipse', { name: 'Circle' });
  const timeline1 = createTimeline({
    id: 'timeline1',
    name: 'Scale Up',
    duration: 60,
    fps: 60,
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/scaleX'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 1, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 2, easing: 'linear' }),
        ],
      }),
    ],
  });

  const timeline2 = createTimeline({
    id: 'timeline2',
    name: 'Rotate',
    duration: 60,
    fps: 60,
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/rotation'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: Math.PI * 2, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline1, timeline2] });

  const states = [
    { timelineId: 'timeline1', time: 0.5, weight: 1 },
    { timelineId: 'timeline2', time: 0.25, weight: 1 },
  ];

  const combined = evaluateTimelines(doc, states);
  assert.strictEqual(combined[nodePropertyAddress(node.id, 'transform/scaleX')], 1.5);
  assert(Math.abs(combined[nodePropertyAddress(node.id, 'transform/rotation')] - Math.PI / 2) < 0.01);

  console.log('✓ evaluateTimelines with multiple timelines');
}

// Test: AnimationPlayback class
{
  const node = createNode('star', { name: 'Star' });
  const timeline = createTimeline({
    id: 'spin',
    name: 'Spin',
    duration: 60,
    fps: 60,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/rotation'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: Math.PI * 2, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  const playback = new AnimationPlayback(doc);
  assert.strictEqual(playback.document, doc);
  const replacement = createDocument({ nodes: [node], timelines: [timeline] });
  playback.setDocument(replacement);
  assert.strictEqual(playback.document, replacement);

  assert.strictEqual(playback.isPlaying, false);
  assert.strictEqual(playback.isPaused, false);

  playback.play('spin');
  assert.strictEqual(playback.isPlaying, true);

  playback.pause();
  assert.strictEqual(playback.isPaused, true);
  assert.strictEqual(playback.isPlaying, false);

  playback.resume();
  assert.strictEqual(playback.isPlaying, true);

  playback.stop();
  assert.strictEqual(playback.isPlaying, false);

  console.log('✓ AnimationPlayback class');
}

// Test: integration with evaluateDocument
{
  const node = createNode('polygon', { name: 'Hex', geometry: { radius: 50, sides: 6 } });
  const timeline = createTimeline({
    id: 'grow',
    name: 'Grow',
    duration: 30,
    fps: 30,
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'geometry/radius'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 50, easing: 'ease-out' }),
          createKeyframe({ frame: 30, value: 150, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  const playback = new AnimationPlayback(doc);
  playback.play('grow');

  // Simulate some time passing
  const evaluated = evaluateDocument(doc, {}, playback);

  assert.strictEqual(evaluated.kind, 'veyra-evaluated-scene');
  assert.strictEqual(evaluated.nodes.length, 1);

  // The radius should be animated
  const animatedNode = evaluated.nodes[0];
  const source = evaluated.sources[nodePropertyAddress(node.id, 'geometry/radius')];

  // Note: Since playback starts at time 0, radius should still be 50
  // but source should indicate animation
  if (source) {
    assert.strictEqual(source, 'animation');
  }

  console.log('✓ integration with evaluateDocument');
}

// Test: validation errors
{
  let threw = false;
  try {
    createTimeline({ loop: 'invalid-loop-mode' });
  } catch (error) {
    threw = true;
    assert(error.message.includes('loop mode'));
  }
  assert(threw, 'Should throw on invalid loop mode');

  threw = false;
  try {
    createKeyframe({ easing: 'invalid-easing' });
  } catch (error) {
    threw = true;
    assert(error.message.includes('easing type'));
  }
  assert(threw, 'Should throw on invalid easing');

  threw = false;
  try {
    normalizeDocument({
      format: 'veyra',
      version: 2,
      nodes: [],
      timelines: [{ id: 'test', name: 'Test', duration: 60, fps: 30, tracks: [{ address: '', keyframes: [] }] }],
    });
  } catch (error) {
    threw = true;
    assert(error.message.includes('address is required'));
  }
  assert(threw, 'Should throw on empty track address');

  console.log('✓ validation errors');
}

// Test: duplicate timeline IDs rejected
{
  let threw = false;
  try {
    normalizeDocument({
      format: 'veyra',
      version: 2,
      nodes: [],
      timelines: [
        createTimeline({ id: 'same', name: 'Timeline 1' }),
        createTimeline({ id: 'same', name: 'Timeline 2' }),
      ],
    });
  } catch (error) {
    threw = true;
    assert(error.message.includes('Duplicate timeline id'));
  }
  assert(threw, 'Should reject duplicate timeline IDs');

  console.log('✓ duplicate timeline IDs rejected');
}

// Test: keyframes are sorted by frame
{
  const track = normalizeDocument({
    format: 'veyra',
    version: 2,
    nodes: [],
    timelines: [
      createTimeline({
        tracks: [
          createTrack('test/prop', {
            keyframes: [
              createKeyframe({ frame: 20, value: 2 }),
              createKeyframe({ frame: 0, value: 0 }),
              createKeyframe({ frame: 10, value: 1 }),
            ],
          }),
        ],
      }),
    ],
  }).timelines[0].tracks[0];

  assert.strictEqual(track.keyframes[0].frame, 0);
  assert.strictEqual(track.keyframes[1].frame, 10);
  assert.strictEqual(track.keyframes[2].frame, 20);

  console.log('✓ keyframes are sorted by frame');
}

// Test: playback speed applies exactly once
{
  const node = createNode('rectangle', { name: 'Speed Once Box' });
  const timeline = createTimeline({
    id: 'rt_speed_once',
    name: 'Speed Once',
    duration: 30,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 30, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });
  playback.setSpeed(2);
  playback.play('rt_speed_once', { speed: 2 });

  t = 0.4;
  const states = playback.getActiveStates();
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].timelineId, 'rt_speed_once');
  // 0.4s of wall time x 2 (global) x 2 (timeline) = 1.6s of local time,
  // applied exactly once instead of being shared across a global clock.
  assert.strictEqual(states[0].time, 1.6);

  console.log('✓ playback speed applies exactly once');
}

// Test: setSpeed is not retroactive
{
  const node = createNode('rectangle', { name: 'Set Speed Box' });
  const timeline = createTimeline({
    id: 'rt_set_speed',
    name: 'Set Speed',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 60, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });
  playback.play('rt_set_speed');

  t = 0.4;
  assert.strictEqual(playback.getCurrentTime(), 0.4);

  playback.setSpeed(4);
  // The new rate only affects future wall time; the clock must not jump.
  assert.strictEqual(playback.getCurrentTime(), 0.4);

  t = 0.5;
  // 0.4 + 0.1s x 4; one ulp of float error is within the tight epsilon.
  assert(Math.abs(playback.getCurrentTime() - 0.8) < 1e-12);

  console.log('✓ setSpeed is not retroactive');
}

// Test: pause and resume preserve staggered timeline clocks
{
  const node = createNode('rectangle', { name: 'Stagger Box' });
  const tl1 = createTimeline({
    id: 'rt_stagger_1',
    name: 'Stagger One',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 60, easing: 'linear' }),
        ],
      }),
    ],
  });
  const tl2 = createTimeline({
    id: 'rt_stagger_2',
    name: 'Stagger Two',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/y'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 60, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [tl1, tl2] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });

  playback.play('rt_stagger_1');
  t = 0.3;
  playback.play('rt_stagger_2');
  t = 0.5;

  let states = playback.getActiveStates();
  const t1AtHalf = states.find((s) => s.timelineId === 'rt_stagger_1');
  const t2AtHalf = states.find((s) => s.timelineId === 'rt_stagger_2');
  assert.strictEqual(t1AtHalf.time, 0.5);
  assert.strictEqual(t2AtHalf.time, 0.2);

  playback.pause();
  t = 0.9; // A 0.4s pause must not advance either clock.
  playback.resume();
  t = 0.95;

  states = playback.getActiveStates();
  const t1AtEnd = states.find((s) => s.timelineId === 'rt_stagger_1');
  const t2AtEnd = states.find((s) => s.timelineId === 'rt_stagger_2');
  // 0.5 + 0.05 and 0.2 + 0.05; one ulp of float error is within epsilon.
  assert(Math.abs(t1AtEnd.time - 0.55) < 1e-12);
  assert(Math.abs(t2AtEnd.time - 0.25) < 1e-12);

  console.log('✓ pause and resume preserve staggered timeline clocks');
}

// Test: play loop option overrides the authored loop mode
{
  const node = createNode('rectangle', { name: 'Loop Override Box' });
  const timeline = createTimeline({
    id: 'rt_loop_override',
    name: 'Loop Override',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 30, easing: 'linear' }),
        ],
      }),
    ],
  });

  const address = nodePropertyAddress(node.id, 'transform/x');
  const doc = createDocument({ nodes: [node], timelines: [timeline] });

  // Two-argument call honors the authored 'none' mode: 45 frames clamp to 30.
  assert.strictEqual(evaluateTimeline(timeline, 1.5)[address], 30);
  // An explicit loop option wraps 45 frames back to frame 15.
  assert.strictEqual(evaluateTimeline(timeline, 1.5, { loop: 'loop' })[address], 15);
  // evaluateTimelines honors the loop carried on each active state.
  assert.strictEqual(
    evaluateTimelines(doc, [{ timelineId: 'rt_loop_override', time: 1.5, weight: 1, loop: 'loop' }])[address],
    15
  );
  // Invalid explicit loop modes are rejected.
  let threw = false;
  try {
    evaluateTimeline(timeline, 1.5, { loop: 'bogus' });
  } catch (error) {
    threw = error instanceof TypeError;
  }
  assert(threw, 'Should throw a TypeError for an invalid explicit loop mode');

  console.log('✓ play loop option overrides the authored loop mode');
}

// Test: getActiveStates exposes the effective loop mode
{
  const node = createNode('rectangle', { name: 'Loop State Box' });
  const timeline = createTimeline({
    id: 'rt_loop_state',
    name: 'Loop State',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 30, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });
  playback.play('rt_loop_state', { loop: 'loop' });

  const states = playback.getActiveStates();
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].timelineId, 'rt_loop_state');
  // The effective mode is the per-play option, not the authored 'none'.
  assert.strictEqual(states[0].loop, 'loop');

  console.log('✓ getActiveStates exposes the effective loop mode');
}

// Test: auto-finished timeline does not corrupt a co-running timeline
{
  const node = createNode('rectangle', { name: 'Finish Box' });
  const noneTl = createTimeline({
    id: 'rt_finish_none',
    name: 'Finish None',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 30, easing: 'linear' }),
        ],
      }),
    ],
  });
  const loopTl = createTimeline({
    id: 'rt_finish_loop',
    name: 'Finish Loop',
    duration: 30,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/y'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 30, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [noneTl, loopTl] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });
  playback.play('rt_finish_none');
  playback.play('rt_finish_loop');

  t = 2.0; // Past the 30/30 = 1s duration of the 'none' timeline.
  const states = playback.getActiveStates();
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].timelineId, 'rt_finish_loop');
  assert.strictEqual(states[0].time, 2.0);
  assert.strictEqual(playback.isPlaying, true);

  playback.stop();
  assert.strictEqual(playback.getCurrentTime(), 0);
  assert.strictEqual(playback.isPlaying, false);

  console.log('✓ auto-finished timeline does not corrupt a co-running timeline');
}

// Test: single timeline mixing weight blends against the authored value
{
  const node = createNode('rectangle', { name: 'Mix Weight Box', transform: { x: 100 } });
  const address = nodePropertyAddress(node.id, 'transform/x');
  const timeline = createTimeline({
    id: 'mw_single',
    name: 'Mix Weight Single',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(address, {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 300, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  const valueAt = (weight) => evaluateTimelines(doc, [{ timelineId: 'mw_single', time: 1.0, weight }])[address];

  // All four blends are exactly representable in IEEE754 (measured in node),
  // so strictEqual is safe instead of an epsilon.
  assert.strictEqual(valueAt(1), 300);
  assert.strictEqual(valueAt(0.5), 200);
  assert.strictEqual(valueAt(0.25), 150);
  assert.strictEqual(valueAt(0), 100); // Weight 0 must leave the property authored.

  console.log('\u2713 single timeline mixing weight blends against the authored value');
}

// Test: later timelines keep blending against accumulated animation values
{
  const node = createNode('rectangle', { name: 'Mix Weight Pair Box' });
  const address = nodePropertyAddress(node.id, 'transform/x');
  const timelineA = createTimeline({
    id: 'mw_pair_a',
    name: 'Mix Weight Pair A',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(address, {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 300, easing: 'linear' }),
        ],
      }),
    ],
  });
  const timelineB = createTimeline({
    id: 'mw_pair_b',
    name: 'Mix Weight Pair B',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(address, {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 600, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timelineA, timelineB] });
  // Timeline A at weight 1 writes the accumulated 300; B blends against it.
  const valueAt = (weight) => evaluateTimelines(doc, [
    { timelineId: 'mw_pair_a', time: 1.0, weight: 1 },
    { timelineId: 'mw_pair_b', time: 1.0, weight },
  ])[address];

  // Exact IEEE754 blends (measured in node), so strictEqual is safe.
  assert.strictEqual(valueAt(0), 300);
  assert.strictEqual(valueAt(0.5), 450);
  assert.strictEqual(valueAt(1), 600);

  console.log('\u2713 later timelines keep blending against accumulated animation values');
}

// Test: a timeline targeting a missing node does not throw
{
  const node = createNode('rectangle', { name: 'Missing Target Box' });
  // The address is well-formed but references a node that is not in the document.
  const address = nodePropertyAddress('mw_missing_node', 'transform/x');
  const timeline = createTimeline({
    id: 'mw_missing',
    name: 'Missing Target',
    duration: 30,
    fps: 30,
    loop: 'none',
    tracks: [
      createTrack(address, {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 300, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  assert.doesNotThrow(() => evaluateTimelines(doc, [{ timelineId: 'mw_missing', time: 1.0, weight: 0.5 }]));
  // The authored base cannot be read, so the animated value is assigned directly.
  const combined = evaluateTimelines(doc, [{ timelineId: 'mw_missing', time: 1.0, weight: 0.5 }]);
  assert.strictEqual(combined[address], 300);

  console.log('\u2713 a timeline targeting a missing node does not throw');
}

// Test: normalizeFrame honors the work area
{
  // Legacy three-argument calls keep the endpoint convention exactly.
  assert.strictEqual(normalizeFrame(10, 60, 'none'), 10);
  assert.strictEqual(normalizeFrame(70, 60, 'none'), 60);
  assert.strictEqual(normalizeFrame(60, 60, 'loop'), 0);
  assert.strictEqual(normalizeFrame(60, 60, 'pingpong'), 60);

  // Work range [10, 20]: 'none' clamps to the inclusive work area.
  assert.strictEqual(normalizeFrame(5, 60, 'none', 10, 20), 10);
  assert.strictEqual(normalizeFrame(25, 60, 'none', 10, 20), 20);
  assert.strictEqual(normalizeFrame(15, 60, 'none', 10, 20), 15);

  // 'loop' wraps within the span; workEnd is a boundary, not a repeat sample.
  assert.strictEqual(normalizeFrame(10, 60, 'loop', 10, 20), 10);
  assert.strictEqual(normalizeFrame(19.9, 60, 'loop', 10, 20), 19.9);
  assert.strictEqual(normalizeFrame(20, 60, 'loop', 10, 20), 10);
  assert.strictEqual(normalizeFrame(25, 60, 'loop', 10, 20), 15);
  assert.strictEqual(normalizeFrame(-1, 60, 'loop', 10, 20), 19);

  // 'pingpong' reflects within the same span; workEnd is reachable at the turn.
  assert.strictEqual(normalizeFrame(10, 60, 'pingpong', 10, 20), 10);
  assert.strictEqual(normalizeFrame(20, 60, 'pingpong', 10, 20), 20);
  assert.strictEqual(normalizeFrame(25, 60, 'pingpong', 10, 20), 15);
  assert.strictEqual(normalizeFrame(30, 60, 'pingpong', 10, 20), 10);
  assert.strictEqual(normalizeFrame(35, 60, 'pingpong', 10, 20), 15);
  assert.strictEqual(normalizeFrame(40, 60, 'pingpong', 10, 20), 20);
  assert.strictEqual(normalizeFrame(-1, 60, 'pingpong', 10, 20), 19);

  console.log('\u2713 normalizeFrame honors the work area');
}

// Test: evaluateTimeline evaluates within the work area
{
  const node = createNode('rectangle', { name: 'Work Area Box' });
  const address = nodePropertyAddress(node.id, 'transform/x');
  const timeline = createTimeline({
    id: 'wa_eval',
    name: 'Work Area Eval',
    duration: 60,
    fps: 30,
    loop: 'none',
    workStart: 10,
    workEnd: 20,
    tracks: [
      createTrack(address, {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 10, value: 100, easing: 'linear' }),
          createKeyframe({ frame: 20, value: 200, easing: 'linear' }),
          createKeyframe({ frame: 30, value: 300, easing: 'linear' }),
        ],
      }),
    ],
  });

  // Frame 0 (time 0) clamps to the work start: frame 10 -> 100.
  assert.strictEqual(evaluateTimeline(timeline, 0)[address], 100);
  // Frame 15 (time 0.5) evaluates normally inside the work area: 150.
  assert.strictEqual(evaluateTimeline(timeline, 0.5)[address], 150);
  // Frame 30 (time 1) clamps to the work end: frame 20 -> 200.
  assert.strictEqual(evaluateTimeline(timeline, 1)[address], 200);

  // A loop override wraps inside the work area: frame 45 -> frame 15 -> 150.
  assert.strictEqual(evaluateTimeline(timeline, 1.5, { loop: 'loop' })[address], 150);
  // A pingpong override reflects inside the work area: frame 30 -> frame 10 -> 100.
  assert.strictEqual(evaluateTimeline(timeline, 1, { loop: 'pingpong' })[address], 100);

  const doc = createDocument({ nodes: [node], timelines: [timeline] });
  // evaluateTimelines honors the loop carried on each active state.
  assert.strictEqual(
    evaluateTimelines(doc, [{ timelineId: 'wa_eval', time: 1.5, weight: 1, loop: 'loop' }])[address],
    150,
  );

  console.log('\u2713 evaluateTimeline evaluates within the work area');
}

// Test: auto-finish honors the work area end
{
  const node = createNode('rectangle', { name: 'Work Finish Box' });
  const noneTl = createTimeline({
    id: 'wa_finish_none',
    name: 'Work Finish None',
    duration: 60,
    fps: 30,
    loop: 'none',
    workStart: 10,
    workEnd: 20,
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/x'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 60, easing: 'linear' }),
        ],
      }),
    ],
  });
  const loopTl = createTimeline({
    id: 'wa_finish_loop',
    name: 'Work Finish Loop',
    duration: 60,
    fps: 30,
    loop: 'loop',
    tracks: [
      createTrack(nodePropertyAddress(node.id, 'transform/y'), {
        keyframes: [
          createKeyframe({ frame: 0, value: 0, easing: 'linear' }),
          createKeyframe({ frame: 60, value: 60, easing: 'linear' }),
        ],
      }),
    ],
  });

  const doc = createDocument({ nodes: [node], timelines: [noneTl, loopTl] });
  let t = 0;
  const playback = new AnimationPlayback(doc, { now: () => t });
  playback.play('wa_finish_none');
  playback.play('wa_finish_loop');

  t = 0.6; // 18 frames: still inside the [10, 20] work area.
  let states = playback.getActiveStates();
  assert.strictEqual(states.length, 2);
  assert.strictEqual(playback.isPlaying, true);

  t = 0.7; // 21 frames: past workEnd 20/30, well before duration 60/30.
  states = playback.getActiveStates();
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].timelineId, 'wa_finish_loop');
  assert.strictEqual(states[0].time, 0.7);
  assert.strictEqual(playback.isPlaying, true);

  playback.stop();
  assert.strictEqual(playback.getCurrentTime(), 0);
  assert.strictEqual(playback.isPlaying, false);

  // A play() loop override keeps the timeline alive past the work end.
  playback.play('wa_finish_none', { loop: 'loop' });
  states = playback.getActiveStates();
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].loop, 'loop');
  playback.stop();

  console.log('\u2713 auto-finish honors the work area end');
}

console.log('\n✅ All Veyra animation tests passed!');
