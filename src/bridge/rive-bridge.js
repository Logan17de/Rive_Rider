const REQUIRED_GEOMETRY_METHODS = Object.freeze([
  'debugObjectCount',
  'debugObjectInfo',
  'debugPathVertexCount',
  'debugPathVertexInfo',
  'debugSetPathVertexXY',
  'debugParametricInfo',
  'debugSetParametricProperty',
  'flattenPath',
]);

function requireInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
}

function requireFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function nearlyEqual(a, b) {
  return Number.isFinite(Number(a))
    && Number.isFinite(Number(b))
    && Math.abs(Number(a) - Number(b)) < 0.001;
}

/**
 * Thin JavaScript facade over Rive Rider's raw Artboard WASM bindings.
 *
 * This layer deliberately uses runtime object indexes, not names or semantic
 * labels. An index is stable only for the lifetime of its ArtboardInstance.
 */
export class RiveBridge {
  constructor(artboard) {
    if (!artboard) throw new TypeError('RiveBridge requires an ArtboardInstance.');
    this.artboard = artboard;

    // Namespaced entry points are the migration seam away from the original
    // flat debug API. Future rig/constraint bindings can be added beside these
    // without changing the scene or command layers.
    this.object = Object.freeze({
      count: () => this.objectCount(),
      get: (objectId) => this.readObject(objectId),
      list: () => this.listObjects(),
    });
    this.geometry = Object.freeze({
      readPath: (objectId) => this.readPath(objectId),
      setPointsVertex: (objectId, vertexId, x, y) =>
        this.setPointsVertex(objectId, vertexId, x, y),
      setParametricProperty: (objectId, property, value) =>
        this.setParametricProperty(objectId, property, value),
    });
  }

  capabilities() {
    return Object.fromEntries(REQUIRED_GEOMETRY_METHODS.map((name) => [
      name,
      typeof this.artboard[name] === 'function',
    ]));
  }

  has(method) {
    return typeof this.artboard[method] === 'function';
  }

  objectCount() {
    return this.has('debugObjectCount') ? this.artboard.debugObjectCount() : 0;
  }

  readObject(objectId) {
    requireInteger(objectId, 'objectId');
    if (!this.has('debugObjectInfo')) return null;
    return this.artboard.debugObjectInfo(objectId) || null;
  }

  listObjects() {
    const objects = [];
    for (let objectId = 0; objectId < this.objectCount(); objectId += 1) {
      const value = this.readObject(objectId);
      // ArtboardInstance object arrays can contain sparse/null slots.
      if (value) objects.push(value);
    }
    return objects;
  }

  readPath(objectId) {
    requireInteger(objectId, 'objectId');
    const info = this.readObject(objectId);
    if (!info?.isPath) return null;

    const vertices = [];
    const vertexCount = this.has('debugPathVertexCount')
      ? this.artboard.debugPathVertexCount(objectId)
      : 0;
    if (this.has('debugPathVertexInfo')) {
      for (let vertexId = 0; vertexId < vertexCount; vertexId += 1) {
        const vertex = this.artboard.debugPathVertexInfo(objectId, vertexId);
        if (vertex) vertices.push(vertex);
      }
    }

    const parametric = info.isParametricPath && this.has('debugParametricInfo')
      ? this.artboard.debugParametricInfo(objectId) || null
      : null;
    return { ...info, objectIndex: objectId, vertexCount, vertices, parametric };
  }

  setPointsVertex(objectId, vertexId, x, y) {
    requireInteger(objectId, 'objectId');
    requireInteger(vertexId, 'vertexId');
    requireFinite(x, 'x');
    requireFinite(y, 'y');
    if (!this.has('debugSetPathVertexXY') || !this.has('debugPathVertexInfo')) {
      throw new Error('PointsPath mutation is not exposed by the loaded runtime.');
    }

    const before = this.artboard.debugPathVertexInfo(objectId, vertexId) || null;
    const accepted = Boolean(
      this.artboard.debugSetPathVertexXY(objectId, vertexId, x, y),
    );
    const after = this.artboard.debugPathVertexInfo(objectId, vertexId) || null;
    return {
      accepted,
      requested: { x, y },
      before,
      after,
      verified: Boolean(after) && nearlyEqual(after.x, x) && nearlyEqual(after.y, y),
    };
  }

  setParametricProperty(objectId, property, value) {
    requireInteger(objectId, 'objectId');
    if (typeof property !== 'string' || property.length === 0) {
      throw new TypeError('property must be a non-empty string.');
    }
    requireFinite(value, 'value');
    if (!this.has('debugSetParametricProperty')) {
      throw new Error('Parametric mutation is not exposed by the loaded runtime.');
    }

    const before = this.readPath(objectId);
    const accepted = Boolean(
      this.artboard.debugSetParametricProperty(objectId, property, value),
    );
    const after = this.readPath(objectId);
    const readBack = Array.from(after?.parametric?.properties || [])
      .find((item) => item.name === property)?.value;
    return {
      accepted,
      property,
      requested: value,
      before,
      after,
      readBack,
      verified: accepted && nearlyEqual(readBack, value),
    };
  }
}

export const geometryBridgeMethods = REQUIRED_GEOMETRY_METHODS;
