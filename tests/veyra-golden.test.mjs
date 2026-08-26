import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { evaluateTimeline } from '../src/veyra/animation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

const fixtures = {
  animated: 'e73a39cc65aa41f7b35369cf21008de7485172cddde2619b1b0ac1325d9a5712',
  rectangle: 'f5ffcd82208ae60e67459ff6d29b4ef098c418e6341ab2e6480331085e379810',
  'bezier-face': '5ce88bf9652213542f7a6c11bcca7d7994f03571e5a2625bccac1205b19497a0',
  gradients: '1d6a0d34fc95fbb4ba52a484d73a5db26a28acd75cd8fce2e9b74d4fca9f3c43',
  'ik-arm': '9447c8d798df4512515a79819ecec5742f05bf43b88acd28fe43cd252d15b943',
};

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

for (const [name, expectedSvgHash] of Object.entries(fixtures)) {
  const raw = fs.readFileSync(new URL(`./fixtures/veyra/${name}.veyra`, import.meta.url), 'utf8');
  const document = parseVeyra(raw);
  assert.equal(serializeVeyra(document), raw.trimEnd(), `${name} must remain canonical JSON.`);
  const firstRender = renderSvgString(evaluateDocument(document));
  const secondRender = renderSvgString(evaluateDocument(document));
  assert.equal(firstRender, secondRender, `${name} must render deterministically.`);
  assert.equal(hash(firstRender), expectedSvgHash, `${name} SVG golden hash changed.`);
}

const gradientRaw = fs.readFileSync(new URL('./fixtures/veyra/gradients.veyra', import.meta.url), 'utf8');
const gradientSvg = renderSvgString(evaluateDocument(parseVeyra(gradientRaw)));
assert.match(gradientSvg, /<linearGradient[^>]+gradientUnits="objectBoundingBox"/);
assert.match(gradientSvg, /<radialGradient[^>]+gradientUnits="objectBoundingBox"/);
assert.match(gradientSvg, /stop-opacity="0.8"/);
assert.match(gradientSvg, /fill="url\(#veyra-node-node_linear_gradient-fill\)"/);

const armRaw = fs.readFileSync(new URL('./fixtures/veyra/ik-arm.veyra', import.meta.url), 'utf8');
const arm = parseVeyra(armRaw);
const armScene = evaluateDocument(arm);
assert.deepEqual(
  { x: armScene.bones.at(-1).end.x, y: armScene.bones.at(-1).end.y },
  { x: 240, y: 170 },
  'Golden two-bone IK must reach its target exactly.',
);
assert.equal(armScene.diagnostics.constraints[0].status, 'solved');
assert.equal(armScene.meshes[0].deformedVertices.length, 3);
assert.equal(arm.bones.every((bone) => bone.pose.rotation === 0), true, 'Golden IK evaluation must not bake its solved pose.');

const animatedRaw = fs.readFileSync(new URL('./fixtures/veyra/animated.veyra', import.meta.url), 'utf8');
const animated = parseVeyra(animatedRaw);
const roundTrippedAnimation = parseVeyra(serializeVeyra(animated));
assert.deepEqual(
  roundTrippedAnimation.timelines,
  animated.timelines,
  'Animation timelines must survive parse/serialize round-trips.',
);
const halfwayLayer = evaluateTimeline(animated.timelines[0], 1);
assert.deepEqual(halfwayLayer, {
  'node:node_animated_rectangle/transform/x': 90,
  'node:node_animated_rectangle/transform/rotation': Math.PI / 4,
  'node:node_animated_rectangle/paint/fill': { color: '#878ec4', type: 'solid' },
});
const animatedFrame = renderSvgString(evaluateDocument(animated, { animation: halfwayLayer }));
assert.equal(
  hash(animatedFrame),
  '0710dbfbb72c460b0a1dab14501869bbaa6e7c662728e5fd9299effb4460d8fe',
  'Known fixture-driven animation frame changed.',
);
assert.equal(animated.nodes[0].transform.x, 50, 'Golden-frame evaluation must not bake into authored data.');
assert.equal(animated.nodes[0].transform.rotation, 0, 'Golden-frame evaluation must preserve authored rotation.');

console.log('veyra golden scene tests passed');
