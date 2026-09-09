from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('src/veyra/editorAuthoring.js')
t = p.read_text()

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
t = replace_once(t, old, new, 'reverse directional address remap')

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
t = replace_once(t, old, new, 'contiguous sibling grouping safety')

p.write_text(t)
print('M7 live safety patch applied')
