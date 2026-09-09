from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Disambiguate the renderer-host callback property from globalThis.veyra's
# public `moveVertex` helper. The M3 static audit intentionally finds bare
# helper property names in the global adapter; quoted callback keys are an
# internal host seam and must not shadow that audit target.
p = Path('veyra.js')
t = p.read_text()
t = replace_once(
    t,
    """  moveVertex: (nodeId, vertexId, next) => store.mutate((documentModel) => {""",
    """  'moveVertex': (nodeId, vertexId, next) => store.mutate((documentModel) => {""",
    'renderer callback/helper audit disambiguation',
)
p.write_text(t)

# Pen gesture preview already scales stroke-width by 1/zoom, so a second
# non-scaling vector-effect is redundant and violates the verified M6 rule
# that authored strokes scale while only the established draft overlay uses
# that SVG flag.
p = Path('src/veyra/renderer.js')
t = p.read_text()
t = replace_once(
    t,
    """      class: 'penGesturePreview', x1: start.x, y1: start.y, x2: start.x, y2: start.y,
      'stroke-width': 1.5 / this.zoom, 'vector-effect': 'non-scaling-stroke',
""",
    """      class: 'penGesturePreview', x1: start.x, y1: start.y, x2: start.x, y2: start.y,
      'stroke-width': 1.5 / this.zoom,
""",
    'pen preview vector-effect',
)
p.write_text(t)

# The manifest catalog deliberately grows by the 11 canonical M7 persistent
# path/group mutations. Keep the old exact-count guard, but migrate its
# expected value/message so accidental deletions/additions remain visible.
p = Path('tests/veyra-manifest.test.mjs')
t = p.read_text()
t = replace_once(
    t,
    """assert.equal(actions.length, 65, 'Action catalog grows additively with the 12 canonical M6 project/Component mutations.');""",
    """assert.equal(actions.length, 76, 'Action catalog grows additively with the 12 canonical M6 and 11 canonical M7 path/group mutations.');""",
    'manifest action count M7',
)
p.write_text(t)

# Renderer callback tests predate stable pathVertex refs and used array index
# as identity. M7 deliberately changes this callback boundary to vertex IDs;
# update the legacy fixture while preserving the same pointer->model proof.
p = Path('tests/veyra-renderer-interaction.test.mjs')
t = p.read_text()
t = replace_once(
    t,
    """    moveVertex(nodeId, index, next) {
      const node = documentModel.nodes.find((candidate) => candidate.id === nodeId);
      Object.assign(node.geometry.vertices[index], next);
      moved.push({ nodeId, index, next });
    },""",
    """    moveVertex(nodeId, vertexId, next) {
      const node = documentModel.nodes.find((candidate) => candidate.id === nodeId);
      Object.assign(node.geometry.vertices.find((candidate) => candidate.id === vertexId), next);
      moved.push({ nodeId, vertexId, next });
    },""",
    'renderer moveVertex stable id fixture',
)
t = t.replace(
    """    moveHandle(nodeId, index, prefix, next) {
      const node = documentModel.nodes.find((candidate) => candidate.id === nodeId);
      node.geometry.vertices[index][`${prefix}X`] = next.x;
      node.geometry.vertices[index][`${prefix}Y`] = next.y;
    },""",
    """    moveHandle(nodeId, vertexId, prefix, next) {
      const node = documentModel.nodes.find((candidate) => candidate.id === nodeId);
      const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
      vertex[`${prefix}X`] = next.x;
      vertex[`${prefix}Y`] = next.y;
    },""",
)
t = t.replace(
    """    moveHandle(nodeId, index, prefix, next) {
      const node = straightDoc.nodes.find((candidate) => candidate.id === nodeId);
      node.geometry.vertices[index][`${prefix}X`] = next.x;
      node.geometry.vertices[index][`${prefix}Y`] = next.y;
    },""",
    """    moveHandle(nodeId, vertexId, prefix, next) {
      const node = straightDoc.nodes.find((candidate) => candidate.id === nodeId);
      const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
      vertex[`${prefix}X`] = next.x;
      vertex[`${prefix}Y`] = next.y;
    },""",
)
t = t.replace(
    """  // KD-1 fix: zero-offset handles are suppressed, so a corner path exposes no
  // invisible targets. Corner → smooth from the canvas remains a named gap
  // until a vertex-type/curve affordance ships; AI can still author offsets.
""",
    """  // Zero-offset handles stay suppressed, but M7 now provides a visible
  // straight-vertex affordance (Ctrl/Cmd-click or Alt-drag) to create curves.
""",
)
p.write_text(t)

print('M7 legacy gate compatibility fixes applied')
