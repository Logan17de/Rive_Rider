import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { evaluateTimeline } from '../src/veyra/animation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';

const fixtures = {
  animated: '79b5ad1d7bfc93b89fbe3d690e6c86be6b8a1352465faad31c2f0a3de4ad3f84',
  rectangle: '164926d7b99cce4e23dbe0beba103baf13893589fe85917357980abdc6089708',
  'bezier-face': '41235a2a6898b33e8fe56e57154ecb359957eb3fe9c139f3c9947577a085b795',
  'ik-arm': 'f4b5d5a7e39666858000a11eba1c8401081c31e2efd3f3489a97c9947d90ab26',
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
  'node:node_animated_rectangle/paint/fill': '#878ec4',
});
const animatedFrame = renderSvgString(evaluateDocument(animated, { animation: halfwayLayer }));
assert.equal(
  hash(animatedFrame),
  'd384197beeb1e4773c8cb9ef6a6fe7008f5e605cd752104a6af3ad36806f1258',
  'Known fixture-driven animation frame changed.',
);
assert.equal(animated.nodes[0].transform.x, 50, 'Golden-frame evaluation must not bake into authored data.');
assert.equal(animated.nodes[0].transform.rotation, 0, 'Golden-frame evaluation must preserve authored rotation.');

console.log('veyra golden scene tests passed');
