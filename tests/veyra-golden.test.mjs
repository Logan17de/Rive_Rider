import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { evaluateTimeline } from '../src/veyra/animation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

const fixtures = {
  animated: '04980c87cf6db93d8d4ef3ae0633dd89809abe712fd29ce1b59bbe04368b0efb',
  rectangle: 'c177f9797a74651fde492f2c309142c2ee5cdcea2d0a8d53452bbff2e10bfbad',
  'bezier-face': 'eda12d677ed250d5a81aef6a4ecfab393e7397871a9c174ad6280c2a53b3cb02',
  gradients: '0417f670c8b94e6f158f45f8324c8650f96323860ea2930de5b4b430cbc26fe1',
  'ik-arm': '250641d4671a89086d7e02369ef244d7958e800737a5c0a9ca11368da2616531',
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
    '7752ef4810a1f6c0f0d776335f27de5a641d454bfa553c7ac5ec19dccb7518ae',
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
