import RiveFactory from '../vendor/rive-tools/canvas_advanced.mjs';
import { RiveBridge } from '../src/bridge/rive-bridge.js';

const result = document.getElementById('result');
const fixtureRoot = '../.rive-wasm/wasm/submodules/rive-runtime/tests/unit_tests/assets';
const fixtureNames = [
  'shapetest.riv',
  'fix_rectangle.riv',
  'follow_path_shapes.riv',
  'bad_skin.riv',
  'zombie_skins.riv',
  'bullet_man.riv',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function property(path, name) {
  return Array.from(path?.parametric?.properties || [])
    .find((candidate) => candidate.name === name);
}

function cleanup(value) {
  try { value?.delete?.(); } catch {}
}

async function run() {
  const R = await RiveFactory({ locateFile: () => '../vendor/rive-tools/rive.wasm' });
  const found = new Map();
  let weighted = null;
  const files = [];

  try {
    for (const fixtureName of fixtureNames) {
      const response = await fetch(`${fixtureRoot}/${fixtureName}`);
      assert(response.ok, `Could not fetch ${fixtureName}: ${response.status}`);
      const file = await R.load(new Uint8Array(await response.arrayBuffer()));
      files.push(file);
      for (let artboardIndex = 0; artboardIndex < file.artboardCount(); artboardIndex += 1) {
        let artboard = null;
        try {
          artboard = file.artboardByIndex(artboardIndex);
          const bridge = new RiveBridge(artboard);
          for (const info of bridge.object.list().filter((object) => object.isPath)) {
            if (!found.has(info.concreteType)) {
              found.set(info.concreteType, { fixtureName, artboard, bridge, info });
            }
            if (!weighted && info.isPointsPath && info.hasWeightedVertices) {
              weighted = { fixtureName, artboard, bridge, info };
            }
          }

          // Keep an Artboard only when a selected record points at it.
          const retained = [...found.values(), weighted]
            .filter(Boolean)
            .some((entry) => entry.artboard === artboard);
          if (!retained) cleanup(artboard);
        } catch (error) {
          cleanup(artboard);
          throw error;
        }
      }
    }

    const points = found.get('PointsPath');
    assert(points, 'No PointsPath found in pinned upstream fixtures.');
    const pointsPath = points.bridge.geometry.readPath(points.info.index);
    assert(pointsPath.vertices.length > 0, 'PointsPath has no source vertices.');
    const vertex = pointsPath.vertices[0];
    const moved = points.bridge.geometry.setPointsVertex(
      points.info.index, vertex.index, vertex.x + 1, vertex.y + 1,
    );
    assert(moved.accepted && moved.verified, 'PointsPath source mutation/read-back failed.');
    const restored = points.bridge.geometry.setPointsVertex(
      points.info.index, vertex.index, vertex.x, vertex.y,
    );
    assert(restored.accepted && restored.verified, 'PointsPath restore failed.');

    for (const [type, propertyName, delta] of [
      ['Rectangle', 'cornerRadiusTL', 1],
      ['Ellipse', 'width', 1],
      ['Polygon', 'points', 1],
      ['Star', 'innerRadius', 0.01],
      ['Triangle', 'width', 1],
    ]) {
      const selected = found.get(type);
      assert(selected, `No ${type} found in pinned upstream fixtures.`);
      const path = selected.bridge.geometry.readPath(selected.info.index);
      const source = property(path, propertyName);
      assert(source, `${type}.${propertyName} is missing from bridge read-back.`);
      const next = Number(source.value) + delta;
      const changed = selected.bridge.geometry.setParametricProperty(
        selected.info.index, propertyName, next,
      );
      assert(changed.accepted && changed.verified, `${type}.${propertyName} mutation failed.`);
      const restoredProperty = selected.bridge.geometry.setParametricProperty(
        selected.info.index, propertyName, Number(source.value),
      );
      assert(
        restoredProperty.accepted && restoredProperty.verified,
        `${type}.${propertyName} restore failed.`,
      );
    }

    const generated = found.get('Ellipse');
    assert(
      !generated.bridge.geometry.setPointsVertex(generated.info.index, 0, 1, 1).accepted,
      'Generated parametric vertex unexpectedly accepted direct mutation.',
    );
    assert(
      !generated.bridge.geometry.setParametricProperty(
        generated.info.index, '__unsupported__', 1,
      ).accepted,
      'Unsupported parametric property unexpectedly accepted.',
    );
    assert(weighted, 'No weighted PointsPath found in pinned upstream fixtures.');
    const weightedPath = weighted.bridge.geometry.readPath(weighted.info.index);
    assert(
      weightedPath.vertices.some((candidate) => candidate.hasWeight),
      'Weighted PointsPath did not report any weighted vertices.',
    );

    return {
      fixtures: fixtureNames,
      types: [...found.keys()].sort(),
      weightedFixture: weighted.fixtureName,
      checkGroups: 10,
    };
  } finally {
    const retained = new Set([...found.values(), weighted]
      .filter(Boolean)
      .map((entry) => entry.artboard));
    retained.forEach(cleanup);
    for (const file of files) {
      try { file?.unref?.(); } catch {}
    }
    try { R.cleanup?.(); } catch {}
  }
}

try {
  const summary = await run();
  document.body.dataset.status = 'passed';
  result.textContent = `PASS\n${JSON.stringify(summary, null, 2)}`;
} catch (error) {
  console.error(error);
  document.body.dataset.status = 'failed';
  result.textContent = `FAIL\n${error?.stack || error}`;
}
