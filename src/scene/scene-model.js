function geometryCapabilities(info) {
  if (!info?.isPath) return Object.freeze({ read: false, mutate: false });
  if (info.isPointsPath) {
    return Object.freeze({ read: true, mutate: true, strategy: 'points-path' });
  }
  if (info.isParametricPath) {
    return Object.freeze({ read: true, mutate: true, strategy: 'parametric-source' });
  }
  return Object.freeze({ read: true, mutate: false, strategy: 'derived-or-unknown' });
}

/**
 * Normalize the information that the raw bridge can prove. No name-based
 * semantics are inferred here.
 */
export function buildSceneModel(bridge, semanticMetadata = null) {
  if (!bridge?.object?.list) throw new TypeError('buildSceneModel requires a RiveBridge.');

  const rawObjects = bridge.object.list();
  const objects = rawObjects.map((raw) => {
    const id = Number(raw.index ?? raw.objectIndex);
    const parentId = Number(raw.parentIndex);
    const shapeId = Number(raw.shapeIndex);
    return {
      id,
      runtimeIndex: id,
      riveType: raw.concreteType || raw.pathType || 'Core',
      typeKey: Number(raw.typeKey),
      name: raw.name || '',
      parentId: parentId >= 0 ? parentId : null,
      childrenIds: [],
      properties: raw,
      capabilities: {
        inspect: true,
        geometry: geometryCapabilities(raw),
      },
      references: {
        shapeId: shapeId >= 0 ? shapeId : null,
      },
      geometry: raw.isPath ? {
        kind: raw.pathType || 'unknown',
        authoritative: raw.isPointsPath || raw.isParametricPath,
        generatedVertices: Boolean(raw.generatedVertices),
      } : null,
      rigRelationships: raw.hasWeightedVertices ? { weighted: true } : null,
      constraints: [],
      semanticTags: semanticMetadata?.tagsFor?.(id) || [],
    };
  });

  const byId = new Map(objects.map((object) => [object.id, object]));
  const roots = [];
  for (const object of objects) {
    const parent = object.parentId == null ? null : byId.get(object.parentId);
    if (parent) parent.childrenIds.push(object.id);
    else roots.push(object.id);
  }

  return {
    artboard: {
      name: bridge.artboard?.name || '',
      instanceScopedIds: true,
    },
    objects,
    roots,
    byId,
  };
}
