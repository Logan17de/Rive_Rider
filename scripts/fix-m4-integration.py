from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Could not find patch target in {path}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


def patch_all(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Could not find patch-all target in {path}: {old!r}')
    target.write_text(text.replace(old, new), encoding='utf-8')


# The project manifest exposes listener runtime schema under authoring.listener.
patch(
    'tests/veyra-interaction-loop.test.mjs',
    "manifest.authoring.schema.listener.variants.machine.hostAvailability",
    "manifest.authoring.listener.variants.machine.hostAvailability",
)

# Preserve canonical JSON for legacy documents: `auto` is the implicit pointer
# participation default and is omitted from serialized nodes. Explicit
# pass-through/none remain authored data.
patch(
    'src/veyra/model.js',
    """    visible: true,
    locked: false,
    pointerEvents: 'auto',
    opacity: 1,
""",
    """    visible: true,
    locked: false,
    opacity: 1,
""",
)
patch(
    'src/veyra/model.js',
    """    visible: node.visible !== false,
    locked: Boolean(node.locked),
    pointerEvents,
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
""",
    """    visible: node.visible !== false,
    locked: Boolean(node.locked),
    ...(pointerEvents !== 'auto' ? { pointerEvents } : {}),
    opacity: bounded(node.opacity ?? 1, `nodes[${index}].opacity`, 0, 1),
""",
)

# Exact hit testing must reject zero-area/degenerate shapes instead of letting
# coincident polygon edges manufacture a hit.
patch(
    'src/veyra/hitTest.js',
    """function geometryScreenPath(node, matrix, viewport) {
  if (node.type === 'path') return pathScreenPoints(node, matrix, viewport);
""",
    """function drawableGeometry(node) {
  if (node.type === 'rectangle' || node.type === 'ellipse') {
    return Number(node.geometry?.width) > 0 && Number(node.geometry?.height) > 0;
  }
  if (node.type === 'polygon') return Number(node.geometry?.radius) > 0 && Number(node.geometry?.sides) >= 3;
  if (node.type === 'star') {
    return Number(node.geometry?.outerRadius) > 0
      && Number(node.geometry?.innerRadius) >= 0
      && Number(node.geometry?.points) >= 2;
  }
  if (node.type === 'path') return Array.isArray(node.geometry?.vertices) && node.geometry.vertices.length >= 2;
  return false;
}

function geometryScreenPath(node, matrix, viewport) {
  if (!drawableGeometry(node)) return { points: [], strokeClosed: false };
  if (node.type === 'path') return pathScreenPoints(node, matrix, viewport);
""",
)

# Entity reads expose dependencySummary (property reads expose dependencies).
patch(
    'tests/veyra-interaction-loop.test.mjs',
    "assert.equal(read.dependencies.status, 'ok');",
    "assert.ok(read.dependencySummary.edgeCount > 0);",
)

# Listener count is now an intentional first-class manifest count.
patch(
    'tests/veyra-manifest.test.mjs',
    """  timelines: 1,
  stateMachines: 1,
});
""",
    """  timelines: 1,
  stateMachines: 1,
  listeners: 0,
});
""",
)

# M4 closes the pointermove runtime hole: direct pointermove listeners are no
# longer merely reported; the shell dispatches them exactly once.
patch(
    'tests/veyra-shell-bridge.test.mjs',
    """const moveBridge = createShellInteractionBridge({ document: normalizeDocument({ ...document, listeners: [createPointerListener({ id: 'move-play', targetId: 'target', event: 'pointermove', action: 'play', timelineId: 'tl' })] }), onIntent: () => { throw new Error('pointermove direct intent escaped'); } });
const move = moveBridge.resolve({ type: 'pointermove', x: 50, y: 50 }, scene, 1, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
assert.equal(move.intents.length, 1, 'resolver reports direct pointermove listener without dispatching it');
""",
    """const moveIntents = [];
const moveBridge = createShellInteractionBridge({ document: normalizeDocument({ ...document, listeners: [createPointerListener({ id: 'move-play', targetId: 'target', event: 'pointermove', action: 'play', timelineId: 'tl' })] }), onIntent: (intent) => moveIntents.push(intent) });
const move = moveBridge.resolve({ type: 'pointermove', x: 50, y: 50 }, scene, 1, { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1 });
assert.equal(move.intents.length, 1, 'resolver reports direct pointermove listener');
assert.equal(moveIntents.length, 1, 'M4 dispatches a direct pointermove listener exactly once');
""",
)

# Exact rounded-rectangle geometry makes the historical lower-right bounding
# corner (140,120) a legitimate miss. Use the rendered button center instead.
patch_all(
    'tests/veyra-shell-integration.test.mjs',
    "clientX: 140, clientY: 120",
    "clientX: 100, clientY: 100",
)
# CSS/backing-scale gate: local center (100,100) with 2x backing scale and
# page offset (50,60) corresponds to client (100,110).
patch(
    'tests/veyra-shell-integration.test.mjs',
    "clientX: 120, clientY: 120",
    "clientX: 100, clientY: 110",
)
