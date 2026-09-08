import assert from 'node:assert/strict';
import {
  cloneValue,
  createAsset,
  createDocument,
  createGradientStop,
  createLinearGradient,
  createNode,
  createStarterDocument,
  normalizeDocument,
} from '../src/veyra/model.js';
import {
  degreesToRadians,
  radiansToDegrees,
  transformMatrix,
  transformPoint,
} from '../src/veyra/contracts.js';
import { nodeCapabilities } from '../src/veyra/capabilities.js';
import { evaluateDocument, propertySource } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { serializeVeyra } from '../src/veyra/io.js';
import {
  formatPropertyAddress,
  isAnimatableProperty,
  nodePropertyAddress,
  parsePropertyAddress,
  readProperty,
  writeProperty,
} from '../src/veyra/properties.js';
import { createAssetRef, createNodeRef, referenceId } from '../src/veyra/references.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSceneSummary } from '../src/veyra/summary.js';

const starter = createStarterDocument();
assert.equal(starter.conventions.angleUnit, 'radians');
assert.equal(starter.conventions.positiveAngle, 'clockwise');
assert.deepEqual(starter.conventions.transformOrder, ['translate', 'rotate', 'skewX', 'skewY', 'scale', 'pivot']);
assert.equal(starter.assets.length, 0);
assert.ok(Math.abs(radiansToDegrees(degreesToRadians(32)) - 32) < 1e-12);

const pivotMatrix = transformMatrix({
  x: 10,
  y: 20,
  rotation: Math.PI / 2,
  skewX: 0,
  skewY: 0,
  scaleX: 1,
  scaleY: 1,
  pivotX: 5,
  pivotY: 0,
});
const pivotPosition = transformPoint(pivotMatrix, { x: 5, y: 0 });
assert.ok(Math.abs(pivotPosition.x - 10) < 1e-10);
assert.ok(Math.abs(pivotPosition.y - 20) < 1e-10);

const legacy = cloneValue(starter);
legacy.version = 1;
legacy.nodes.forEach((node) => { node.paint.fill = node.paint.fill.color; });
legacy.meshes.forEach((mesh) => { mesh.paint.fill = mesh.paint.fill.color; });
delete legacy.conventions;
delete legacy.bones;
delete legacy.meshes;
delete legacy.controls;
delete legacy.constraints;
legacy.nodes[0].transform.rotation = 90;
legacy.nodes[1].parentId = referenceId(legacy.nodes[1].parent, 'node');
delete legacy.nodes[1].parent;
legacy.semantics[0].nodeId = referenceId(legacy.semantics[0].target, 'node');
delete legacy.semantics[0].target;
const migrated = normalizeDocument(legacy);
assert.equal(migrated.version, 5);
assert.equal(migrated.nodes[0].paint.fill.type, 'solid');
assert.deepEqual(
  { bones: migrated.bones, meshes: migrated.meshes, controls: migrated.controls, constraints: migrated.constraints },
  { bones: [], meshes: [], controls: [], constraints: [] },
);
assert.ok(Math.abs(migrated.nodes[0].transform.rotation - Math.PI / 2) < 1e-12);
assert.equal(migrated.nodes[1].parent.kind, 'node');
assert.equal(migrated.semantics[0].target.kind, 'node');

const legacyV2 = cloneValue(starter);
legacyV2.version = 2;
legacyV2.nodes.forEach((node) => { node.paint.fill = node.paint.fill.color; });
legacyV2.meshes.forEach((mesh) => { mesh.paint.fill = mesh.paint.fill.color; });
legacyV2.timelines = [{
  id: 'timeline_legacy_fill',
  name: 'Legacy fill',
  duration: 30,
  fps: 30,
  loop: 'none',
  tracks: [{
    id: 'track_legacy_fill',
    address: `node:${legacyV2.nodes[0].id}/paint/fill`,
    keyframes: [
      { frame: 0, value: '#ec4899', easing: 'linear' },
      { frame: 30, value: '#22d3ee', easing: 'linear' },
    ],
  }],
}];
const migratedV2 = normalizeDocument(legacyV2);
assert.equal(migratedV2.version, 5);
assert.deepEqual(migratedV2.nodes[0].paint.fill, { type: 'solid', color: legacyV2.nodes[0].paint.fill });
assert.deepEqual(migratedV2.timelines[0].tracks[0].keyframes[1].value, { type: 'solid', color: '#22d3ee' });

const image = createAsset('image', {
  id: 'asset_logo',
  name: 'Logo',
  mimeType: 'image/png',
  source: { kind: 'external', uri: './logo.png' },
  metadata: { width: 512, height: 512 },
});
const assetDocument = normalizeDocument(createDocument({ assets: [image] }));
assert.equal(assetDocument.assets[0].source.kind, 'external');
const duplicateAsset = cloneValue(assetDocument);
duplicateAsset.assets.push(cloneValue(duplicateAsset.assets[0]));
assert.throws(() => normalizeDocument(duplicateAsset), /Duplicate asset id/);

const wrongParentKind = cloneValue(starter);
wrongParentKind.nodes[1].parent = createAssetRef('asset_logo');
assert.throws(() => normalizeDocument(wrongParentKind), /must be a node reference/);

const rightEye = starter.nodes.find((node) => node.name === 'Right Eye');
const widthAddress = nodePropertyAddress(rightEye.id, 'geometry.width');
assert.equal(parsePropertyAddress(widthAddress).reference.id, rightEye.id);
assert.equal(readProperty(starter, widthAddress), 72);
const propertyEdited = cloneValue(starter);
writeProperty(propertyEdited, widthAddress, 96);
assert.equal(readProperty(propertyEdited, widthAddress), 96);
assert.equal(isAnimatableProperty(propertyEdited, widthAddress), true);
const encodedAddress = formatPropertyAddress(createNodeRef('node:eye/right'), 'transform.rotation');
assert.equal(parsePropertyAddress(encodedAddress).reference.id, 'node:eye/right');

const smile = starter.nodes.find((node) => node.name === 'Smile');
const smileVertex = smile.geometry.vertices[0];
const vertexAddress = formatPropertyAddress(createNodeRef(smile.id), ['geometry', 'vertices', smileVertex.id, 'x']);
assert.equal(readProperty(starter, vertexAddress), smileVertex.x);
assert.equal(nodeCapabilities(smile).editVertices, true);
assert.ok(nodeCapabilities(smile).animatable.includes('geometry.vertices.*.x'));

const gradientNode = createNode('rectangle', {
  id: 'node_gradient_properties',
  paint: {
    fill: createLinearGradient({
      stops: [
        createGradientStop({ id: 'stop_a', offset: 0, color: '#ec4899' }),
        createGradientStop({ id: 'stop_b', offset: 1, color: '#22d3ee' }),
      ],
    }),
  },
});
const gradientProperties = normalizeDocument(createDocument({ nodes: [gradientNode] }));
const stopColorAddress = formatPropertyAddress(createNodeRef(gradientNode.id), ['paint', 'fill', 'stops', 'stop_a', 'color']);
assert.equal(readProperty(gradientProperties, stopColorAddress), '#ec4899');
assert.equal(isAnimatableProperty(gradientProperties, stopColorAddress), true);
writeProperty(gradientProperties, stopColorAddress, '#facc15');
assert.equal(readProperty(gradientProperties, stopColorAddress), '#facc15');
assert.ok(nodeCapabilities(gradientProperties.nodes[0]).animatable.includes('paint.fill.stops.*.color'));

const rotationAddress = nodePropertyAddress(rightEye.id, 'transform.rotation');
const evaluated = evaluateDocument(starter, {
  animation: { [rotationAddress]: 0.1 },
  constraints: { [rotationAddress]: 0.2 },
  interactive: { [rotationAddress]: 0.3 },
});
assert.equal(evaluated.nodes.find((node) => node.id === rightEye.id).transform.rotation, 0.3);
assert.equal(propertySource(evaluated, rotationAddress), 'interactive');
assert.equal(readProperty(starter, rotationAddress), 0, 'Evaluation must not mutate authored values.');
assert.throws(
  () => evaluateDocument(starter, { animation: { [nodePropertyAddress(rightEye.id, 'name')]: 'Animated name' } }),
  /non-animatable/,
);
assert.match(renderSvgString(evaluated), /matrix\(/);

const parent = createNode('group', { id: 'node_parent', transform: { x: 10, y: 0 } });
const child = createNode('ellipse', { id: 'node_child', parent: createNodeRef(parent.id), transform: { x: 0, y: 20 } });
const nestedScene = evaluateDocument(createDocument({ nodes: [parent, child] }));
const evaluatedChild = nestedScene.nodes.find((node) => node.id === child.id);
assert.equal(evaluatedChild.worldMatrix[4], 10);
assert.equal(evaluatedChild.worldMatrix[5], 20);

const canonical = serializeVeyra(starter);
const reversedTopLevel = Object.fromEntries(Object.entries(JSON.parse(canonical)).reverse());
assert.equal(serializeVeyra(reversedTopLevel), canonical);
assert.equal(serializeVeyra(starter), canonical);

const commandStore = new VeyraStore(starter);
commandStore.setProperty({
  source: 'ai',
  label: 'Make right eye wider',
  propertyAddresses: [widthAddress],
}, widthAddress, 104);
assert.equal(readProperty(commandStore.document, widthAddress), 104);
assert.equal(commandStore.commandHistory.at(-1).source, 'ai');
assert.equal(commandStore.commandHistory.at(-1).label, 'Make right eye wider');
assert.deepEqual(commandStore.commandHistory.at(-1).propertyAddresses, [widthAddress]);

const summary = createSceneSummary(starter);
const summarizedSmile = summary.objects.find((object) => object.ref.id === smile.id);
assert.equal(summarizedSmile.geometry, undefined);
assert.equal(summarizedSmile.geometrySummary.vertexCount, 3);
assert.equal(summarizedSmile.capabilities.editVertices, true);
assert.ok(createSceneSummary(starter, { includeGeometry: true }).objects.find((object) => object.ref.id === smile.id).geometry.vertices);

console.log('veyra foundation contract tests passed');
