import assert from 'node:assert/strict';
import {
  CommandSystem,
  ControlKind,
  RiveBridge,
  SemanticMetadataStore,
  buildSceneModel,
  preferredControl,
} from '../src/index.js';

function fakeArtboard() {
  const vertices = [{
    index: 0, x: 10, y: 20, renderX: 10, renderY: 20, hasWeight: false,
  }];
  const properties = [
    { name: 'width', kind: 'number', value: 50 },
    { name: 'height', kind: 'number', value: 30 },
  ];
  const objects = [
    { index: 0, typeKey: 1, concreteType: 'Core', name: 'Root', parentIndex: -1 },
    null, // Proves sparse Artboard object vectors are tolerated.
    {
      index: 2,
      typeKey: 20,
      concreteType: 'PointsPath',
      name: 'Jaw',
      parentIndex: 0,
      shapeIndex: -1,
      isPath: true,
      isPointsPath: true,
      isParametricPath: false,
      generatedVertices: false,
      hasWeightedVertices: false,
      pathType: 'points',
    },
    {
      index: 3,
      typeKey: 21,
      concreteType: 'Ellipse',
      name: 'Eye',
      parentIndex: 0,
      shapeIndex: -1,
      isPath: true,
      isPointsPath: false,
      isParametricPath: true,
      generatedVertices: true,
      hasWeightedVertices: false,
      pathType: 'parametric',
    },
  ];
  return {
    name: 'Character',
    debugObjectCount: () => objects.length,
    debugObjectInfo: (id) => objects[id],
    debugPathVertexCount: (id) => (id === 2 ? vertices.length : 4),
    debugPathVertexInfo: (id, vertex) => (
      id === 2 ? { ...vertices[vertex] } : { index: vertex, x: 0, y: 0 }
    ),
    debugSetPathVertexXY: (id, vertex, x, y) => {
      if (id !== 2 || !vertices[vertex]) return false;
      Object.assign(vertices[vertex], { x, y, renderX: x, renderY: y });
      return true;
    },
    debugParametricInfo: (id) => (
      id === 3 ? { concreteType: 'Ellipse', properties: properties.map((p) => ({ ...p })) } : null
    ),
    debugSetParametricProperty: (id, name, value) => {
      const property = id === 3 && properties.find((candidate) => candidate.name === name);
      if (!property) return false;
      property.value = value;
      return true;
    },
    flattenPath: () => null,
  };
}

const bridge = new RiveBridge(fakeArtboard());
assert.equal(bridge.object.count(), 4);
assert.deepEqual(bridge.object.list().map((item) => item.index), [0, 2, 3]);

const metadata = new SemanticMetadataStore();
metadata.set(2, { riveName: 'Jaw', semanticTags: ['face', 'jaw', 'jaw'] });
const scene = buildSceneModel(bridge, metadata);
assert.equal(scene.artboard.name, 'Character');
assert.deepEqual(scene.roots, [0]);
assert.deepEqual(scene.byId.get(0).childrenIds, [2, 3]);
assert.deepEqual(scene.byId.get(2).semanticTags, ['face', 'jaw']);
assert.deepEqual(scene.byId.get(3).semanticTags, []);
assert.equal(scene.byId.get(3).geometry.authoritative, true);

const chosen = preferredControl([
  { kind: ControlKind.POINTS_PATH, id: 'jaw-vertices' },
  { kind: ControlKind.IK_TARGET, id: 'hand-target' },
  { kind: ControlKind.VIEW_MODEL, id: 'expression' },
]);
assert.equal(chosen.id, 'expression');

const commands = new CommandSystem(bridge);
const vertexPreview = commands.preview({
  action: 'move_vertex', target: { objectId: 2 }, vertex: 0, x: 12, y: 24,
});
assert.deepEqual(
  { x: vertexPreview.before.x, y: vertexPreview.before.y },
  { x: 10, y: 20 },
);
const vertexResult = commands.apply({
  action: 'move_vertex', target: { objectId: 2 }, vertex: 0, x: 12, y: 24,
});
assert.equal(vertexResult.result.verified, true);
assert.equal(commands.undoCount, 1);
commands.undo();
assert.deepEqual(
  bridge.geometry.readPath(2).vertices.map(({ x, y }) => ({ x, y })),
  [{ x: 10, y: 20 }],
);

const propertyResult = commands.apply({
  action: 'set_property', target: { objectId: 3 }, property: 'width', value: 75,
});
assert.equal(propertyResult.result.verified, true);
assert.equal(propertyResult.result.readBack, 75);
commands.undo();
assert.equal(
  bridge.geometry.readPath(3).parametric.properties.find((p) => p.name === 'width').value,
  50,
);

assert.throws(
  () => commands.apply({ action: 'move_vertex', target: { objectId: 3 }, vertex: 0, x: 1, y: 2 }),
  /not an authored PointsPath/,
);

console.log('architecture module tests passed');
