import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { evaluateTimeline } from '../src/veyra/animation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

const fixtures = {
  animated: 'aa989c4bf157db1ae2b11e36d01d4601bc84e8e329f402a1b478ccc37e08b670',
  rectangle: '8819fbbbd1712fb3c6063589c33368926675018cfd95cc7a9336d7d22ba86ace',
  'bezier-face': 'e514408bcbce113b1db5f93f9f89c2d9b2fc1892ee362dcba68e533852f40db1',
  gradients: '59ef23a11dfeffa08be8970113bfcc958d2d51e3cfdb09515975e13d7408492f',
  'ik-arm': 'a036c47d8b51da8f6699d04f1185721ad39970897e7b2a1e47333cf8ae4aeef2',
};

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Keep every golden independent: one regression must not hide the assertions after it.
const failures = [];
let executedAssertions = 0;
function check(label, assertion) {
  executedAssertions += 1;
  try {
    assertion();
    console.log(`✓ ${label}`);
  } catch (error) {
    failures.push(error);
    console.error(`✗ ${label}: ${error.message}`);
  }
}

for (const [name, expectedSvgHash] of Object.entries(fixtures)) {
  const raw = fs.readFileSync(new URL(`./fixtures/veyra/${name}.veyra`, import.meta.url), 'utf8');
  const document = parseVeyra(raw);
  check(`${name} migrates to stable canonical v5 JSON`, () => {
    const once = serializeVeyra(document);
    const twice = serializeVeyra(parseVeyra(once));
    assert.equal(document.version, 5, `${name} must migrate to v5.`);
    assert.ok(Number(JSON.parse(raw).version) < 5, `${name} remains a legacy migration fixture.`);
    assert.equal(once, twice, `${name} migration must stabilize after the first canonical write.`);
  });
  const firstRender = renderSvgString(evaluateDocument(document));
  const secondRender = renderSvgString(evaluateDocument(document));
  check(`${name} renders deterministically`, () => {
    assert.equal(firstRender, secondRender, `${name} must render deterministically.`);
  });
  check(`${name} SVG matches its golden hash`, () => {
    assert.equal(hash(firstRender), expectedSvgHash, `${name} SVG golden hash changed.`);
  });
}

const gradientRaw = fs.readFileSync(new URL('./fixtures/veyra/gradients.veyra', import.meta.url), 'utf8');
const gradientSvg = renderSvgString(evaluateDocument(parseVeyra(gradientRaw)));
check('gradient linear units are objectBoundingBox', () => {
  assert.match(gradientSvg, /<linearGradient[^>]+gradientUnits="objectBoundingBox"/);
});
check('gradient radial units are objectBoundingBox', () => {
  assert.match(gradientSvg, /<radialGradient[^>]+gradientUnits="objectBoundingBox"/);
});
check('gradient stop opacity is emitted', () => {
  assert.match(gradientSvg, /stop-opacity="0.8"/);
});
check('gradient fill references its definition', () => {
  assert.match(gradientSvg, /fill="url\(#veyra-node-node_linear_gradient-fill\)"/);
});

const armRaw = fs.readFileSync(new URL('./fixtures/veyra/ik-arm.veyra', import.meta.url), 'utf8');
const arm = parseVeyra(armRaw);
const armScene = evaluateDocument(arm);
check('two-bone IK reaches its target', () => {
  assert.deepEqual(
    { x: armScene.bones.at(-1).end.x, y: armScene.bones.at(-1).end.y },
    { x: 240, y: 170 },
    'Golden two-bone IK must reach its target exactly.',
  );
});
check('two-bone IK reports solved', () => {
  assert.equal(armScene.diagnostics.constraints[0].status, 'solved');
});
check('two-bone IK deforms its mesh', () => {
  assert.equal(armScene.meshes[0].deformedVertices.length, 3);
});
check('two-bone IK does not bake its pose', () => {
  assert.equal(arm.bones.every((bone) => bone.pose.rotation === 0), true, 'Golden IK evaluation must not bake its solved pose.');
});

const animatedRaw = fs.readFileSync(new URL('./fixtures/veyra/animated.veyra', import.meta.url), 'utf8');
const animated = parseVeyra(animatedRaw);
const roundTrippedAnimation = parseVeyra(serializeVeyra(animated));
check('animation timelines survive round-trips', () => {
  assert.deepEqual(
    roundTrippedAnimation.timelines,
    animated.timelines,
    'Animation timelines must survive parse/serialize round-trips.',
  );
});
const halfwayLayer = evaluateTimeline(animated.timelines[0], 1);
check('animation evaluates its halfway layer', () => {
  assert.deepEqual(halfwayLayer, {
    'node:node_animated_rectangle/transform/x': 90,
    'node:node_animated_rectangle/transform/rotation': Math.PI / 4,
    'node:node_animated_rectangle/paint/fill': { color: '#878ec4', type: 'solid' },
  });
});
const animatedFrame = renderSvgString(evaluateDocument(animated, { animation: halfwayLayer }));
check('animation frame matches its golden hash', () => {
  assert.equal(
    hash(animatedFrame),
    'dca81ba512028470b426ffb7022c190f05b1f3b2b65e4593cfe9edc2c469afca',
    'Known fixture-driven animation frame changed.',
  );
});
check('animation evaluation does not bake x', () => {
  assert.equal(animated.nodes[0].transform.x, 50, 'Golden-frame evaluation must not bake into authored data.');
});
check('animation evaluation does not bake rotation', () => {
  assert.equal(animated.nodes[0].transform.rotation, 0, 'Golden-frame evaluation must preserve authored rotation.');
});

console.log(`veyra golden assertions executed: ${executedAssertions}`);
if (failures.length > 0) {
  throw new AggregateError(failures, `veyra golden scene tests failed (${failures.length} assertion${failures.length === 1 ? '' : 's'})`);
}
console.log('veyra golden scene tests passed');
