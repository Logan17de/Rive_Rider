#!/usr/bin/env node
/**
 * Veyra override-merge acceptance tests — 3B-G2
 *
 * TARGET: `src/veyra/evaluation.js:61-65`.
 *
 *   let animationLayer = layers.animation || {};
 *   if (animationPlayback && typeof animationPlayback.evaluate === 'function') {
 *     const playbackOverrides = animationPlayback.evaluate();
 *     animationLayer = { ...animationLayer, ...playbackOverrides };   // silent
 *   }
 *
 * Machine overrides arrive through `layers.animation`. `AnimationPlayback`
 * overrides are spread OVER them at :64. Any shared property address is
 * therefore resolved by silent last-writer-wins, with no record that two
 * independent systems ever contested it.
 *
 * THE DETAIL THAT DRIVES THESE TESTS: the merge at :64 happens BEFORE
 * `applyLayer` is called at :67. Attribution (`sources[address] = source`,
 * :28) happens after. So by the time any provenance is recorded, the two
 * contributions are a single object under one label — `'animation'`. The
 * existing provenance channel cannot report this collision, not because it is
 * unused, but because the information has already been destroyed upstream.
 * These tests are written to make that unmissable.
 *
 * Labels: DEFECT = must fail today (contract item unenforced,
 * docs/VEYRA_INTERACTION_SURFACE.md). GUARD = passes today and must stay
 * green; a red guard is a regression, not a to-do.
 *
 * Rules honoured: zero dependencies, no DOM, no jsdom, no requestAnimationFrame,
 * no wall-clock assertions. Addresses are built with the real formatter
 * (`nodePropertyAddress`) rather than hand-written strings — a hand-written
 * address can pass a test by failing to parse, which is how
 * `tests/veyra-machine-invariants.test.mjs`'s stale-override check ended up
 * green for the wrong reason.
 *
 * Run: node tests/veyra-override-merge.test.mjs
 */

import assert from 'node:assert/strict';
import { createStarterDocument, normalizeDocument } from '../src/veyra/model.js';
import { evaluateDocument, propertySource } from '../src/veyra/evaluation.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

/* ------------------------------------------------------------------ *
 * Collector: report every violation in one pass, never stop at the first.
 * ------------------------------------------------------------------ */

const results = [];
function check(kind, name, fn) {
  try {
    fn();
    results.push({ kind, name, ok: true });
  } catch (error) {
    results.push({ kind, name, ok: false, message: error?.message ?? String(error) });
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const doc = createStarterDocument();
// A transform-capable, non-group node: group nodes lose paint paths
// (capabilities.js:79-81), so pick a shape for the animatable cases.
const target = doc.nodes.find((node) => node.type !== 'group') || doc.nodes[0];
const other = doc.nodes.find((node) => node !== target && node.type !== 'group') || doc.nodes[1];

/** Address both a machine state and a timeline would plausibly drive. */
const ADDR = nodePropertyAddress(target.id, 'transform.x');
const ADDR_SECOND = nodePropertyAddress(other.id, 'transform.y');

/** Address of a node that no longer exists — the realistic stale case: a
 *  machine state captured an override, then the node was deleted underneath it. */
const STALE_ADDR = nodePropertyAddress('node_deleted_underneath', 'opacity');
/** Well-formed, writable, but NOT animatable — the second real stale class. */
const NON_ANIMATABLE_ADDR = nodePropertyAddress(target.id, 'name');

/** Stand-in for the machine override layer produced by `runtime.evaluate()`. */
function machineLayer(overrides) {
  return { ...overrides };
}

/** Stand-in for `AnimationPlayback.evaluate()`. Counts calls so the suite can
 *  prove the evaluator runs exactly once per evaluation, not once per layer. */
function playback(overrides, tally) {
  return {
    evaluate() {
      if (tally) tally.calls += 1;
      return { ...overrides };
    },
  };
}

const readNode = (scene, id, leaf) => {
  const node = scene.nodes.find((entry) => entry.id === id);
  assert.ok(node, `scene has no node '${id}'`);
  return leaf === 'opacity' ? node.opacity : node.transform[leaf];
};

/* ==================================================================
 * GROUP A — the collision itself, at the function boundary
 * ================================================================== */

check('GUARD', 'two contributors on one address resolve deterministically (playback currently wins)', () => {
  const scene = evaluateDocument(
    doc,
    { animation: machineLayer({ [ADDR]: 10 }) },
    playback({ [ADDR]: 99 }),
  );
  // Pinning today's winner is NOT endorsement. It makes a change of precedence
  // a loud red line rather than a silent behaviour shift in the preview loop.
  assert.equal(readNode(scene, target.id, 'x'), 99,
    'playback no longer wins the merge: precedence changed, update the contract');
});

check('DEFECT', 'a contested address is reported, not silently resolved', () => {
  const scene = evaluateDocument(
    doc,
    { animation: machineLayer({ [ADDR]: 10 }) },
    playback({ [ADDR]: 99 }),
  );
  const reported = Object.values(scene.diagnostics ?? {})
    .flat(Infinity)
    .some((entry) => JSON.stringify(entry).includes(ADDR));
  assert.ok(reported,
    `both the machine and playback wrote ${ADDR}; the scene resolves it silently. `
    + 'Two authors, one value, zero trace — nothing downstream can tell a collision from a solo edit.');
});

check('DEFECT', 'a collision that changes no value is still reported', () => {
  // Same address, same value. Nothing observable changes, so an
  // "only report if the result differs" policy misses the entire class of
  // collisions where two systems agree today and diverge after the next edit.
  const scene = evaluateDocument(
    doc,
    { animation: machineLayer({ [ADDR]: 42 }) },
    playback({ [ADDR]: 42 }),
  );
  const reported = Object.values(scene.diagnostics ?? {})
    .flat(Infinity)
    .some((entry) => JSON.stringify(entry).includes(ADDR));
  assert.ok(reported,
    `agreeing contributors on ${ADDR} are invisible; the contract needs collision reporting `
    + 'independent of whether the values happen to match.');
});

check('GUARD', 'disjoint addresses from both contributors coexist without interference', () => {
  const scene = evaluateDocument(
    doc,
    { animation: machineLayer({ [ADDR]: 10 }) },
    playback({ [ADDR_SECOND]: 20 }),
  );
  assert.equal(readNode(scene, target.id, 'x'), 10, 'machine lost its own address');
  assert.equal(readNode(scene, other.id, 'y'), 20, 'playback lost its own address');
});

/* ==================================================================
 * GROUP B — provenance: the channel exists, the information does not
 * ================================================================== */

check('DEFECT', 'provenance can distinguish a collision from a solo machine override', () => {
  const solo = evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, null);
  const contested = evaluateDocument(
    doc,
    { animation: machineLayer({ [ADDR]: 10 }) },
    playback({ [ADDR]: 99 }),
  );
  assert.notEqual(propertySource(contested, ADDR), propertySource(solo, ADDR),
    'a collision and a solo edit report the identical provenance, so no consumer — human, '
    + 'renderer, or AI reading `sources` — can detect that two systems fought over this property. '
    + `Both report '${propertySource(solo, ADDR)}'.`);
});

check('GUARD', 'the existing provenance channel does work across separately-applied layers', () => {
  // `constraints` and `interactive` each get their own applyLayer call, so they
  // attribute correctly. The mechanism is sound and already reachable from
  // `scene.sources` / propertySource() — the fix for the merge should reuse it,
  // not invent a new channel.
  const scene = evaluateDocument(doc, {
    animation: machineLayer({ [ADDR]: 10 }),
    interactive: { [ADDR]: 77 },
  });
  assert.equal(propertySource(scene, ADDR), 'interactive',
    'layer attribution regressed; the panel depends on this to explain a value');
  assert.equal(readNode(scene, target.id, 'x'), 77, 'interactive precedence changed');
});

check('GUARD', 'an untouched property reports as authored', () => {
  const scene = evaluateDocument(doc, {}, playback({ [ADDR_SECOND]: 20 }));
  assert.equal(propertySource(scene, ADDR), 'authored',
    'fallback provenance changed; the AI surface leans on this to mean "nobody overrode this"');
});

check('GUARD', 'the documented layer order is exported and stable', () => {
  const scene = evaluateDocument(doc, {}, null);
  assert.deepEqual([...scene.evaluationOrder], ['authored', 'animation', 'constraints', 'interactive'],
    'layer order changed; every precedence claim in the contract has to be re-derived');
});

/* ==================================================================
 * GROUP C — staleness is an exception, not a degraded frame
 * 3B-2 must choose: catch-and-report, or guarantee-by-construction.
 * These tests pin the current discipline so the choice is made knowingly.
 * ================================================================== */

check('GUARD', 'a stale override for a deleted node throws out of evaluation', () => {
  // Note what this does NOT claim: only that the failure is loud. See the
  // DEFECT below — the message it produces is indistinguishable from a plain
  // authoring error, which is a separate problem.
  assert.throws(
    () => evaluateDocument(doc, {}, playback({ [STALE_ADDR]: 1 })),
    /cannot drive non-animatable property|does not exist/,
    'a deleted-node override must be loud; a render loop that swallows it hides a dead preview',
  );
});

check('DEFECT', 'a deleted target and a non-animatable path report different problems', () => {
  // `isAnimatableProperty` (evaluation.js:24 -> properties.js:153-162) answers
  // with Boolean(node && ...), so a MISSING node and an UNANIMATABLE path both
  // fail the same guard and never reach the "does not exist" error at
  // properties.js:108. One message, two entirely different remedies:
  //   deleted node      -> runtime is stale, reconcile/reset it
  //   non-animatable    -> the author picked a property that cannot be driven
  // An AI handed "animation cannot drive non-animatable property node:x/opacity"
  // cannot tell which of the two it is looking at, so it cannot route the fix.
  let deletedMessage = '';
  try {
    evaluateDocument(doc, {}, playback({ [STALE_ADDR]: 1 }));
  } catch (error) {
    deletedMessage = error.message;
  }
  let undrivableMessage = '';
  try {
    evaluateDocument(doc, {}, playback({ [NON_ANIMATABLE_ADDR]: 'renamed' }));
  } catch (error) {
    undrivableMessage = error.message;
  }
  assert.ok(deletedMessage && undrivableMessage, 'both stale classes must still fail loudly');
  // Compare the message TEMPLATE, not the string. Every one of these errors
  // embeds the offending address, so two different addresses make two different
  // strings no matter whether the classes are distinguishable — a naive
  // `notEqual(messages)` is tautologically true and proves nothing. (That was
  // this check's first draft, and it went green for exactly the wrong reason.)
  const shapeOf = (message, address) => message.replace(address, '<ADDR>');
  const deletedShape = shapeOf(deletedMessage, STALE_ADDR);
  const undrivableShape = shapeOf(undrivableMessage, NON_ANIMATABLE_ADDR);
  assert.notEqual(deletedShape, undrivableShape,
    `both classes share one message template: "${deletedShape}". `
    + 'Staleness needs a reset; an un-animatable path needs a re-author. One template cannot serve both, '
    + 'and nothing in the string tells the reader whether the target node still exists.');
});

check('GUARD', 'a well-formed but non-animatable override throws at the animatability check', () => {
  // The case the arbiter's stale-override check misses: `node:<id>/name` parses,
  // resolves to a real node, is writable, and is simply not animatable
  // (capabilities.js:24-38). It must fail at evaluation.js:24-26, not earlier.
  assert.throws(
    () => evaluateDocument(doc, {}, playback({ [NON_ANIMATABLE_ADDR]: 'renamed' })),
    /cannot drive non-animatable property/,
    'the animatability guard is no longer what rejects this override',
  );
});

check('GUARD', 'the two failure classes are distinguishable by message', () => {
  // Without this, any `/property/i` regex passes on both and a test can be green
  // without reaching the guard it claims to exercise.
  let parseMessage = '';
  try {
    evaluateDocument(doc, {}, playback({ 'nonsense-with-no-address': 1 }));
  } catch (error) {
    parseMessage = error.message;
  }
  let animatableMessage = '';
  try {
    evaluateDocument(doc, {}, playback({ [NON_ANIMATABLE_ADDR]: 'renamed' }));
  } catch (error) {
    animatableMessage = error.message;
  }
  assert.match(parseMessage, /Invalid Veyra property address/, 'malformed addresses stopped being rejected at parse');
  assert.match(animatableMessage, /cannot drive non-animatable property/, 'animatability rejection changed');
  assert.notEqual(parseMessage, animatableMessage,
    'identical messages mean a caller cannot tell "bad address" from "not animatable"');
});

check('DEFECT', 'a stale override reports the contributor that actually supplied it', () => {
  // `applyLayer(evaluatedDocument, animationLayer, 'animation', sources)` at :67
  // blames 'animation' even when the offending address came from
  // playback.evaluate() at :63. An AI told "animation cannot drive ..." will go
  // looking at the machine layer, which is clean. Merge order destroyed the
  // attribution; so did the error message.
  let message = '';
  try {
    evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, playback({ [STALE_ADDR]: 1 }));
  } catch (error) {
    message = error.message;
  }
  assert.match(message, /playback/i,
    `the bad address came from the playback contributor but the error says: "${message}". `
    + 'A machine-state error and a timeline error are different bugs to different owners.');
});

check('GUARD', 'a throwing evaluation leaves the authored document untouched', () => {
  // Critical for the preview loop: a mid-frame throw must not corrupt the
  // document the user is editing. :57 normalizes into a fresh object, so the
  // mutation happens on a clone. If anyone ever "optimises" that clone away,
  // this is the line that catches it.
  const before = JSON.stringify(doc);
  assert.throws(() => evaluateDocument(doc, {}, playback({ [STALE_ADDR]: 1 })));
  assert.equal(JSON.stringify(doc), before,
    'a failed evaluation mutated the live document; undo history is now out of step with it');
});

/* ==================================================================
 * GROUP D — determinism and evaluator discipline
 * ================================================================== */

check('GUARD', 'the same inputs produce a byte-identical scene', () => {
  const once = evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, playback({ [ADDR_SECOND]: 20 }));
  const twice = evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, playback({ [ADDR_SECOND]: 20 }));
  assert.equal(JSON.stringify(once), JSON.stringify(twice),
    'evaluation is not deterministic; golden previews and AI diffing are both unsafe');
});

check('GUARD', 'the playback contributor is consulted exactly once per evaluation', () => {
  // Three normalize passes already run per evaluation (:57, :72, :81). A
  // controller that evaluates playback once per layer multiplies a cost 3B-2
  // inherits per frame.
  const tally = { calls: 0 };
  evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, playback({ [ADDR_SECOND]: 20 }, tally));
  assert.equal(tally.calls, 1, `playback.evaluate() ran ${tally.calls} times; it must run once`);
});

check('GUARD', 'an empty contributor cannot clobber a populated one', () => {
  // Guards the shape of the merge itself: `{...a, ...{}}` is harmless, but a
  // contributor returning `undefined` per key must not erase authored values.
  const scene = evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, playback({}));
  assert.equal(readNode(scene, target.id, 'x'), 10, 'an empty playback layer erased the machine override');
});

check('GUARD', 'a null contributor is ignored rather than spread as a hole', () => {
  const scene = evaluateDocument(doc, { animation: machineLayer({ [ADDR]: 10 }) }, null);
  assert.equal(readNode(scene, target.id, 'x'), 10, 'null playback broke the machine layer');
});

/* ==================================================================
 * GROUP E — frame budget: a MEASUREMENT, reported, never asserted.
 * `evaluateDocument` normalizes at :57, :72 and :81. Per-frame preview
 * inherits that cost, so "preview stutters" needs a number to be a bug report.
 * Timing is reported only: no threshold here, so this cannot go flaky.
 * ================================================================== */

const BUDGET_NODES = 200;

function largeDocument(nodeCount) {
  const big = createStarterDocument();
  const base = big.nodes.find((node) => node.type === 'rectangle') || big.nodes.find((node) => node.type !== 'group');
  for (let index = 0; index < nodeCount; index += 1) {
    const clone = JSON.parse(JSON.stringify(base));
    clone.id = `budget-node-${index}`;
    clone.name = `Budget node ${index}`;
    big.nodes.push(clone);
  }
  big.semantics = [];
  return big;
}

let budgetReport = 'unavailable';
try {
  const big = largeDocument(BUDGET_NODES);
  const sceneAddress = nodePropertyAddress(big.nodes[big.nodes.length - 1].id, 'transform.x');
  const layers = { animation: machineLayer({ [sceneAddress]: 5 }) };
  const contributor = playback({ [nodePropertyAddress(big.nodes[1].id, 'transform.y')]: 7 });

  // Warm up, then interleave. Measuring A-then-B back to back lets the second
  // run inherit JIT warmup and report a negative delta for the first; the
  // alternation cancels that, and best-of-N cancels GC pauses.
  const measure = (fn) => {
    for (let warm = 0; warm < 3; warm += 1) fn();
    let best = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const started = process.hrtime.bigint();
      const sink = fn();
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      if (elapsed < best) best = elapsed;
      // `sink` keeps the work from being treated as dead code.
      if (typeof sink !== 'number') throw new TypeError('measurement function must return a number');
    }
    return best;
  };

  const normalizeWork = () => normalizeDocument(big).nodes.length;
  const bareWork = () => JSON.stringify(evaluateDocument(big, {}, null)).length;
  const mergedWork = () => JSON.stringify(evaluateDocument(big, layers, contributor)).length;

  const samples = { normalize: [], bare: [], merged: [] };
  for (let round = 0; round < 3; round += 1) {
    samples.normalize.push(measure(normalizeWork));
    samples.bare.push(measure(bareWork));
    samples.merged.push(measure(mergedWork));
  }
  const singleNormalize = Math.min(...samples.normalize);
  const bareEvaluation = Math.min(...samples.bare);
  const mergedEvaluation = Math.min(...samples.merged);

  const threeNormalizes = singleNormalize * 3;
  const mergeDelta = mergedEvaluation - bareEvaluation;
  const pct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a');
  const mergeLine = mergeDelta > 0.05
    ? `  merge + extra layer work                : ${mergeDelta.toFixed(2)} ms (${pct(mergeDelta, mergedEvaluation)} of the frame)`
    : `  merge + extra layer work                : below measurement noise (< 0.05 ms) — the merge is not the cost`;

  budgetReport = [
    `${BUDGET_NODES} nodes; warm + interleaved best-of-7, milliseconds per call (a measurement, not an assertion)`,
    `  one normalizeDocument                   : ${singleNormalize.toFixed(2)} ms`,
    `  three normalize passes per evaluation   : ${threeNormalizes.toFixed(2)} ms (${pct(threeNormalizes, mergedEvaluation)} of a merged frame)`,
    `  evaluateDocument, no contributors       : ${bareEvaluation.toFixed(2)} ms`,
    `  evaluateDocument, machine + playback    : ${mergedEvaluation.toFixed(2)} ms`,
    mergeLine,
    `  60 fps budget                           : 16.70 ms/frame — ${mergedEvaluation <= 16.7 ? 'within' : 'OVER'}`,
    `  one second of preview at this size      : ${(mergedEvaluation * 60).toFixed(0)} ms of work`,
  ].join('\n');
} catch (error) {
  budgetReport = `could not measure (${error.message})`;
}

/* ==================================================================
 * Report
 * ================================================================== */

const failed = results.filter((result) => !result.ok);
const redDefects = failed.filter((result) => result.kind === 'DEFECT');
const redGuards = failed.filter((result) => result.kind === 'GUARD');

console.log(`\nVeyra override-merge — ${results.length - failed.length}/${results.length} checks green`);
console.log(`  ${redDefects.length} unenforced contract item(s), ${redGuards.length} guard regression(s)\n`);
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} [${result.kind.padEnd(6)}] ${result.name}`);
  if (!result.ok) console.log(`       ${result.message.split('\n').slice(0, 5).join('\n       ')}`);
}
console.log(`\nFRAME BUDGET\n${budgetReport}\n`);

if (failed.length) {
  if (redGuards.length) {
    console.log('A GUARD is a regression against settled behaviour: fix the implementation, not the assertion.');
  }
  if (redDefects.length) {
    console.log('DEFECT checks are the 3B contract not yet enforced (docs/VEYRA_INTERACTION_SURFACE.md).');
  }
  process.exitCode = 1;
} else {
  console.log('All override-merge contract items enforced.');
}
