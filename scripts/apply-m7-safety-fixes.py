from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('src/veyra/editorAuthoring.js')
t = p.read_text()

# Reverse is identity preserving, but in/out are directional. Remap authored
# animation/instance override addresses so reversing the editable topology does
# not silently retarget directional handle animation.
old = """export function reversePathInDocument(document, nodeId) {
  const node = pathNode(document, nodeId);
  node.geometry.vertices.reverse();
  for (const vertex of node.geometry.vertices) {
    const inX = vertex.inX;
    const inY = vertex.inY;
    vertex.inX = vertex.outX;
    vertex.inY = vertex.outY;
    vertex.outX = inX;
    vertex.outY = inY;
  }
  return createNodeRef(nodeId);
}
"""
new = """function reversedHandleAddress(address, nodeId, vertexIds) {
  const prefix = `node:${encodeURIComponent(String(nodeId))}/geometry/vertices/`;
  const text = String(address || '');
  if (!text.startsWith(prefix)) return text;
  const rest = text.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return text;
  let vertexId;
  try { vertexId = decodeURIComponent(rest.slice(0, slash)); } catch { return text; }
  if (!vertexIds.has(vertexId)) return text;
  const property = rest.slice(slash + 1);
  const swap = { inX: 'outX', inY: 'outY', outX: 'inX', outY: 'inY' }[property];
  return swap ? `${prefix}${encodeURIComponent(vertexId)}/${swap}` : text;
}

export function reversePathInDocument(document, nodeId) {
  const node = pathNode(document, nodeId);
  const vertexIds = new Set(node.geometry.vertices.map((vertex) => vertex.id));
  node.geometry.vertices.reverse();
  for (const vertex of node.geometry.vertices) {
    const inX = vertex.inX;
    const inY = vertex.inY;
    vertex.inX = vertex.outX;
    vertex.inY = vertex.outY;
    vertex.outX = inX;
    vertex.outY = inY;
  }
  for (const timeline of document.timelines || []) {
    for (const track of timeline.tracks || []) track.address = reversedHandleAddress(track.address, node.id, vertexIds);
  }
  for (const instance of document.componentInstances || []) {
    for (const override of instance.overrides || []) override.address = reversedHandleAddress(override.address, node.id, vertexIds);
  }
  return createNodeRef(nodeId);
}
"""
t = replace_once(t, old, new, 'reverse handle address remap')

# A single group cannot preserve appearance when selected siblings are
# interleaved with unselected siblings in draw order. Refuse that shape rather
# than silently changing stacking.
old = """  const selectedIds = new Set(nodes.map((node) => node.id));
  const selectedIndexes = document.nodes.map((node, index) => selectedIds.has(node.id) ? index : -1).filter((index) => index >= 0);
  const insertionIndex = Math.min(...selectedIndexes);
"""
new = """  const selectedIds = new Set(nodes.map((node) => node.id));
  const siblings = document.nodes.filter((node) => node.artboard?.id === artboardId && (referenceId(node.parent, 'node') || null) === parentId);
  const selectedSiblingIndexes = siblings.map((node, index) => selectedIds.has(node.id) ? index : -1).filter((index) => index >= 0);
  const firstSiblingIndex = Math.min(...selectedSiblingIndexes);
  const lastSiblingIndex = Math.max(...selectedSiblingIndexes);
  if (lastSiblingIndex - firstSiblingIndex + 1 !== selectedSiblingIndexes.length) {
    throw new TypeError('Grouping non-contiguous siblings would change draw order relative to unselected artwork; select a contiguous sibling range.');
  }
  const selectedIndexes = document.nodes.map((node, index) => selectedIds.has(node.id) ? index : -1).filter((index) => index >= 0);
  const insertionIndex = Math.min(...selectedIndexes);
"""
t = replace_once(t, old, new, 'group contiguous draw order')
p.write_text(t)

# Persistent straight mode has no handles by definition. Normalize legacy or
# malformed input into the one canonical representation instead of allowing
# mode and rendered geometry to disagree.
p = Path('src/veyra/model.js')
t = p.read_text()
old = """      const vertices = geometry.vertices.map((vertex, index) => {
        const id = String(vertex.id || `pathVertex_${legacyPrefix}_${index}`);
        if (ids.has(id)) throw new TypeError(`${path}.vertices contains duplicate id ${id}.`);
        ids.add(id);
        return {
          id,
          x: finite(vertex.x, `${path}.vertices[${index}].x`),
          y: finite(vertex.y, `${path}.vertices[${index}].y`),
          inX: finite(vertex.inX ?? 0, `${path}.vertices[${index}].inX`),
          inY: finite(vertex.inY ?? 0, `${path}.vertices[${index}].inY`),
          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
          handleMode: (() => {
            const explicit = vertex.handleMode == null ? null : String(vertex.handleMode);
            if (explicit != null && !VEYRA_VERTEX_HANDLE_MODES.includes(explicit)) {
              throw new TypeError(`${path}.vertices[${index}].handleMode must be one of ${VEYRA_VERTEX_HANDLE_MODES.join(', ')}.`);
            }
            if (explicit) return explicit;
            return [vertex.inX, vertex.inY, vertex.outX, vertex.outY].some((value) => Math.abs(Number(value) || 0) > 0.0001)
              ? 'detached'
              : 'straight';
          })(),
          cornerRadius: bounded(vertex.cornerRadius ?? 0, `${path}.vertices[${index}].cornerRadius`, 0, 100000),
        };
      });"""
new = """      const vertices = geometry.vertices.map((vertex, index) => {
        const id = String(vertex.id || `pathVertex_${legacyPrefix}_${index}`);
        if (ids.has(id)) throw new TypeError(`${path}.vertices contains duplicate id ${id}.`);
        ids.add(id);
        const explicitMode = vertex.handleMode == null ? null : String(vertex.handleMode);
        if (explicitMode != null && !VEYRA_VERTEX_HANDLE_MODES.includes(explicitMode)) {
          throw new TypeError(`${path}.vertices[${index}].handleMode must be one of ${VEYRA_VERTEX_HANDLE_MODES.join(', ')}.`);
        }
        const rawHandles = {
          inX: finite(vertex.inX ?? 0, `${path}.vertices[${index}].inX`),
          inY: finite(vertex.inY ?? 0, `${path}.vertices[${index}].inY`),
          outX: finite(vertex.outX ?? 0, `${path}.vertices[${index}].outX`),
          outY: finite(vertex.outY ?? 0, `${path}.vertices[${index}].outY`),
        };
        const handleMode = explicitMode || Object.values(rawHandles).some((value) => Math.abs(value) > 0.0001)
          ? (explicitMode || 'detached')
          : 'straight';
        const handles = handleMode === 'straight' ? { inX: 0, inY: 0, outX: 0, outY: 0 } : rawHandles;
        return {
          id,
          x: finite(vertex.x, `${path}.vertices[${index}].x`),
          y: finite(vertex.y, `${path}.vertices[${index}].y`),
          ...handles,
          handleMode,
          cornerRadius: bounded(vertex.cornerRadius ?? 0, `${path}.vertices[${index}].cornerRadius`, 0, 100000),
        };
      });"""
t = replace_once(t, old, new, 'canonical straight path mode')
p.write_text(t)
print('M7 safety fixes applied')
