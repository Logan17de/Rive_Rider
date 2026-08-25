import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { nodePropertyAddress } from '../src/veyra/properties.js';

const fixtures = {
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

const rectangleRaw = fs.readFileSync(new URL('./fixtures/veyra/rectangle.veyra', import.meta.url), 'utf8');
const rectangle = parseVeyra(rectangleRaw);
const rotation = nodePropertyAddress('node_rectangle', 'transform.rotation');
const animatedFrame = renderSvgString(evaluateDocument(rectangle, {
  animation: { [rotation]: Math.PI / 4 },
}));
assert.equal(
  hash(animatedFrame),
  'c26828dd2f86609c13455c54a718260d7a52922fe9b2cecb3020dba552434127',
  'Known animation-layer frame changed.',
);
assert.equal(rectangle.nodes[0].transform.rotation, 0, 'Golden-frame evaluation must not bake into authored data.');

console.log('veyra golden scene tests passed');
