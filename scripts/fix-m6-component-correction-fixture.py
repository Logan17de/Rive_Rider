from pathlib import Path

p = Path('tests/veyra-m6-component-corrections.test.mjs')
t = p.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global t
    if old not in t:
        raise SystemExit(f'missing fixture anchor: {label}')
    t = t.replace(old, new, 1)

replace_once(
"""  const node = createNode('rectangle', {
    id: 'runtime-node', artboard: createArtboardRef('source'), transform: { x: 10, y: 40 },
    geometry: { width: 20, height: 20 }, paint: { fill: '#ff0000', stroke: 'none', strokeWidth: 0 },
  });
  const a = constantTimeline('timeline-a', 'source', 'node:runtime-node/transform/x', 20);
  const b = constantTimeline('timeline-b', 'source', 'node:runtime-node/transform/x', 110);
  const host = constantTimeline('host-timeline', 'host', 'node:runtime-node/transform/x', 999);""",
"""  const node = createNode('rectangle', {
    id: 'runtime-node', artboard: createArtboardRef('source'), transform: { x: 10, y: 40 },
    geometry: { width: 20, height: 20 }, paint: { fill: '#ff0000', stroke: 'none', strokeWidth: 0 },
  });
  const hostNode = createNode('rectangle', {
    id: 'host-node', artboard: createArtboardRef('host'), transform: { x: 5, y: 5 },
    geometry: { width: 10, height: 10 }, paint: { fill: '#000000', stroke: 'none', strokeWidth: 0 },
  });
  const a = constantTimeline('timeline-a', 'source', 'node:runtime-node/transform/x', 20);
  const b = createTimeline({
    id: 'timeline-b', name: 'timeline-b', duration: 30, fps: 30,
    tracks: [{ id: 'timeline-b-track', address: 'node:runtime-node/transform/x', keyframes: [
      { id: 'timeline-b-0', frame: 0, value: 110, easing: 'linear' },
      { id: 'timeline-b-30', frame: 30, value: 210, easing: 'linear' },
    ] }],
  });
  b.artboard = createArtboardRef('source');
  const host = constantTimeline('host-timeline', 'host', 'node:host-node/transform/x', 999);""",
'runtime host-node and observable remap timeline',
)
replace_once("nodes: [node], timelines: [a, b, host],", "nodes: [node, hostNode], timelines: [a, b, host],", 'host node registry')
replace_once(
"""  assert.equal(one.worldMatrix[4], 110);
  assert.equal(two.worldMatrix[4], 110);
  assert.notEqual(registry.evaluate('remap-one').mappings.timeline[0].timeSeconds, registry.evaluate('remap-two').mappings.timeline[0].timeSeconds, 'runtime clocks remain per-instance even when both remap to one source timeline');""",
"""  assert.equal(one.worldMatrix[4], 210, 'instance one uses its own remapped runtime clock');
  assert.equal(two.worldMatrix[4], 110, 'instance two keeps its own remapped runtime clock');
  assert.notEqual(one.worldMatrix[4], two.worldMatrix[4], 'runtime clocks are observably isolated even when both remap to one source timeline');
  assert.notEqual(registry.evaluate('remap-one').mappings.timeline[0].timeSeconds, registry.evaluate('remap-two').mappings.timeline[0].timeSeconds);""",
'observable remap isolation',
)
replace_once(
"""  const vertices = [
    { id: 'rv0', x: 50, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv1', x: 90, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv2', x: 90, y: 60, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
  ];""",
"""  const vertices = [
    { id: 'rv0', x: 50, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv1', x: 90, y: 40, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv2', x: 90, y: 60, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
    { id: 'rv3', x: 50, y: 60, weights: [{ bone: createBoneRef('rig-bone'), value: 1 }] },
  ];""",
'weighted quad fixture',
)
replace_once(
"""  assert.deepEqual(source.meshes[0].deformedVertices.map(({ x, y }) => ({ x, y })), [{ x: 50, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 60 }], 'source rig remains authored/rest-driven');""",
"""  assert.deepEqual(source.meshes[0].deformedVertices.map(({ x, y }) => ({ x, y })), [{ x: 50, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 60 }, { x: 50, y: 60 }], 'source rig remains authored/rest-driven');""",
'rig source expectation',
)

p.write_text(t, encoding='utf-8')
print('M6 correction adversarial fixture repaired')
