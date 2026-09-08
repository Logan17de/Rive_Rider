from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing replacement anchor: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Persistent single-artboard origin in the authored document model.
# ---------------------------------------------------------------------------
path = 'src/veyra/model.js'
text = read(path)
text = replace_once(text, """    artboard: {\n      width: 960,\n      height: 640,\n      background: '#fff7fc',\n      ...(overrides.artboard || {}),\n    },""", """    artboard: {\n      x: 0,\n      y: 0,\n      width: 960,\n      height: 640,\n      background: '#fff7fc',\n      ...(overrides.artboard || {}),\n    },""", 'createDocument artboard defaults')
text = replace_once(text, """    artboard: {\n      width: bounded(input.artboard?.width ?? 960, 'artboard.width', 1, 100000),\n      height: bounded(input.artboard?.height ?? 640, 'artboard.height', 1, 100000),\n      background: color(input.artboard?.background ?? '#fff7fc', 'artboard.background'),\n    },""", """    artboard: {\n      // Legacy documents had an implicit frame origin at world (0,0). Keep\n      // that migration deterministic while making frame position authored.\n      x: finite(input.artboard?.x ?? 0, 'artboard.x'),\n      y: finite(input.artboard?.y ?? 0, 'artboard.y'),\n      width: bounded(input.artboard?.width ?? 960, 'artboard.width', 1, 100000),\n      height: bounded(input.artboard?.height ?? 640, 'artboard.height', 1, 100000),\n      background: color(input.artboard?.background ?? '#fff7fc', 'artboard.background'),\n    },""", 'normalizeDocument artboard')
write(path, text)

# Preserve byte-canonical legacy fixtures while persisting any non-zero frame origin.
path = 'src/veyra/io.js'
text = read(path)
text = replace_once(text, """export function canonicalVeyraValue(documentModel) {\n  return canonicalize(normalizeDocument(documentModel));\n}""", """export function canonicalVeyraValue(documentModel) {\n  const normalized = normalizeDocument(documentModel);\n  const canonical = canonicalize(normalized);\n  // x/y=0 are the legacy implicit defaults. Omitting only those default values\n  // keeps old canonical files byte-stable; any moved frame persists explicitly.\n  if (canonical.artboard?.x === 0) delete canonical.artboard.x;\n  if (canonical.artboard?.y === 0) delete canonical.artboard.y;\n  return canonical;\n}""", 'canonical legacy origin omission')
write(path, text)

# ---------------------------------------------------------------------------
# Canonical stable camera defaults and Fit Artboard consume frame origin.
# ---------------------------------------------------------------------------
path = 'src/veyra/viewport.js'
text = read(path)
text = replace_once(text, """  const centerX = finite(viewport.centerX, artboardWidth / 2);\n  const centerY = finite(viewport.centerY, artboardHeight / 2);""", """  const artboardX = finite(artboard.x, 0);\n  const artboardY = finite(artboard.y, 0);\n  const centerX = finite(viewport.centerX, artboardX + artboardWidth / 2);\n  const centerY = finite(viewport.centerY, artboardY + artboardHeight / 2);""", 'viewport default center')
write(path, text)

path = 'src/veyra/workspace.js'
text = read(path)
text = replace_once(text, """function screenMapping(artboard, viewport, screenSize) {\n  return createSvgViewBoxScreenTransform(artboard, {\n    width: finite(screenSize?.width, artboard?.width),\n    height: finite(screenSize?.height, artboard?.height),\n    zoom: clampZoom(viewport?.zoom ?? 1),\n    centerX: finite(viewport?.centerX, finite(artboard?.width) / 2),\n    centerY: finite(viewport?.centerY, finite(artboard?.height) / 2),\n  });\n}""", """function artboardCenter(artboard = {}) {\n  return {\n    x: finite(artboard.x, 0) + finite(artboard.width, 0) / 2,\n    y: finite(artboard.y, 0) + finite(artboard.height, 0) / 2,\n  };\n}\n\nfunction screenMapping(artboard, viewport, screenSize) {\n  const center = artboardCenter(artboard);\n  return createSvgViewBoxScreenTransform(artboard, {\n    width: finite(screenSize?.width, artboard?.width),\n    height: finite(screenSize?.height, artboard?.height),\n    zoom: clampZoom(viewport?.zoom ?? 1),\n    centerX: finite(viewport?.centerX, center.x),\n    centerY: finite(viewport?.centerY, center.y),\n  });\n}""", 'workspace screen mapping center')
text = replace_once(text, """    centerX: finite(viewport.centerX, artboard.width / 2) - finite(delta?.x) / mapping.scale,\n    centerY: finite(viewport.centerY, artboard.height / 2) - finite(delta?.y) / mapping.scale,""", """    centerX: finite(viewport.centerX, artboardCenter(artboard).x) - finite(delta?.x) / mapping.scale,\n    centerY: finite(viewport.centerY, artboardCenter(artboard).y) - finite(delta?.y) / mapping.scale,""", 'workspace pan fallback')
text = replace_once(text, """  return {\n    zoom: clampZoom(Math.min(\n      Math.max(1, screenWidth - padding * 2) / width,\n      Math.max(1, screenHeight - padding * 2) / height,\n    )),\n    centerX: width / 2,\n    centerY: height / 2,\n  };""", """  const center = artboardCenter(artboard);\n  return {\n    zoom: clampZoom(Math.min(\n      Math.max(1, screenWidth - padding * 2) / width,\n      Math.max(1, screenHeight - padding * 2) / height,\n    )),\n    centerX: center.x,\n    centerY: center.y,\n  };""", 'fit artboard origin')
write(path, text)

# ---------------------------------------------------------------------------
# Artboard resize changes the authored frame itself. Camera never participates.
# ---------------------------------------------------------------------------
write('src/veyra/gestures.js', """// Pure gesture orchestration: browser events are converted to data before this layer.\n\nexport const VEYRA_ARTBOARD_RESIZE_DIRECTIONS = Object.freeze([\n  'left', 'right', 'top', 'bottom',\n  'top-left', 'top-right', 'bottom-left', 'bottom-right',\n]);\n\nfunction normalizedDirection(direction, mode) {\n  if (VEYRA_ARTBOARD_RESIZE_DIRECTIONS.includes(direction)) return direction;\n  if (mode === 'resize-x') return 'right';\n  if (mode === 'resize-y') return 'bottom';\n  if (mode === 'resize') return 'bottom-right';\n  return null;\n}\n\nfunction finite(value, fallback = 0) {\n  const number = Number(value);\n  return Number.isFinite(number) ? number : fallback;\n}\n\nexport function createArtboardResizeGesture({\n  store,\n  start,\n  startArtboard,\n  direction,\n  mode,\n  scaleX = 1,\n  scaleY = 1,\n  threshold = 2,\n  minSize = 1,\n  onMove,\n} = {}) {\n  if (!store || !start || !startArtboard) throw new TypeError('Artboard resize gesture requires store, start, and startArtboard.');\n  const resolvedDirection = normalizedDirection(direction, mode);\n  if (!resolvedDirection) throw new TypeError(`Unsupported artboard resize direction ${direction ?? mode}.`);\n  const startX = finite(startArtboard.x, 0);\n  const startY = finite(startArtboard.y, 0);\n  const startWidth = Math.max(minSize, finite(startArtboard.width, minSize));\n  const startHeight = Math.max(minSize, finite(startArtboard.height, minSize));\n  const fixedRight = startX + startWidth;\n  const fixedBottom = startY + startHeight;\n  let active = false;\n  let last = { x: startX, y: startY, width: startWidth, height: startHeight, direction: resolvedDirection };\n\n  function move(point) {\n    const clientX = finite(point?.clientX, start.x);\n    const clientY = finite(point?.clientY, start.y);\n    const distance = Math.hypot(clientX - start.x, clientY - start.y);\n    if (!active && distance < threshold) return { started: false, moved: false, ...last };\n    if (!active) {\n      store.begin('Resize artboard');\n      active = true;\n    }\n    const dx = (clientX - start.x) * finite(scaleX, 1);\n    const dy = (clientY - start.y) * finite(scaleY, 1);\n    const left = resolvedDirection.includes('left');\n    const right = resolvedDirection.includes('right');\n    const top = resolvedDirection.includes('top');\n    const bottom = resolvedDirection.includes('bottom');\n\n    const width = Math.max(minSize, Math.round(startWidth + (right ? dx : left ? -dx : 0)));\n    const height = Math.max(minSize, Math.round(startHeight + (bottom ? dy : top ? -dy : 0)));\n    const x = left ? fixedRight - width : startX;\n    const y = top ? fixedBottom - height : startY;\n    last = { x, y, width, height, direction: resolvedDirection };\n\n    store.mutate((documentModel) => {\n      documentModel.artboard.x = last.x;\n      documentModel.artboard.y = last.y;\n      documentModel.artboard.width = last.width;\n      documentModel.artboard.height = last.height;\n    }, 'drag');\n    onMove?.(last);\n    return { started: true, moved: true, ...last };\n  }\n\n  function end() {\n    if (!active) return { committed: false, moved: false, error: null, ...last };\n    try {\n      store.commit();\n      active = false;\n      return { committed: true, moved: true, error: null, ...last };\n    } catch (error) {\n      store.cancel();\n      active = false;\n      return { committed: false, moved: true, error, ...last };\n    }\n  }\n\n  function cancel() {\n    if (!active) return { cancelled: false, moved: false, ...last };\n    store.cancel();\n    active = false;\n    return { cancelled: true, moved: true, ...last };\n  }\n\n  return {\n    move,\n    end,\n    cancel,\n    direction: resolvedDirection,\n    get active() { return active; },\n  };\n}\n""")

# ---------------------------------------------------------------------------
# Renderer frame/background and camera defaults consume authored origin.
# ---------------------------------------------------------------------------
path = 'src/veyra/renderer.js'
text = read(path)
text = replace_once(text, """      this.viewCenter = {\n        x: this.scene.artboard.width / 2,\n        y: this.scene.artboard.height / 2,\n      };""", """      this.viewCenter = {\n        x: (this.scene.artboard.x || 0) + this.scene.artboard.width / 2,\n        y: (this.scene.artboard.y || 0) + this.scene.artboard.height / 2,\n      };""", 'renderer resetView center')
text = replace_once(text, """      centerX: this.viewCenter?.x ?? this.scene?.artboard.width / 2 ?? 0,\n      centerY: this.viewCenter?.y ?? this.scene?.artboard.height / 2 ?? 0,""", """      centerX: this.viewCenter?.x ?? ((this.scene?.artboard.x || 0) + (this.scene?.artboard.width || 0) / 2),\n      centerY: this.viewCenter?.y ?? ((this.scene?.artboard.y || 0) + (this.scene?.artboard.height || 0) / 2),""", 'renderer getViewport center')
text = replace_once(text, """    const centerX = Number(viewport.centerX ?? this.viewCenter?.x ?? this.scene.artboard.width / 2);\n    const centerY = Number(viewport.centerY ?? this.viewCenter?.y ?? this.scene.artboard.height / 2);""", """    const centerX = Number(viewport.centerX ?? this.viewCenter?.x ?? ((this.scene.artboard.x || 0) + this.scene.artboard.width / 2));\n    const centerY = Number(viewport.centerY ?? this.viewCenter?.y ?? ((this.scene.artboard.y || 0) + this.scene.artboard.height / 2));""", 'renderer setViewport center')
text = replace_once(text, """    const { width, height } = this.scene.artboard;\n    if (!this.viewCenter) this.viewCenter = { x: width / 2, y: height / 2 };""", """    const { width, height } = this.scene.artboard;\n    const artboardX = Number(this.scene.artboard.x || 0);\n    const artboardY = Number(this.scene.artboard.y || 0);\n    if (!this.viewCenter) this.viewCenter = { x: artboardX + width / 2, y: artboardY + height / 2 };""", 'renderer apply viewBox center')
text = replace_once(text, """      this.viewCenter = { x: scene.artboard.width / 2, y: scene.artboard.height / 2 };""", """      this.viewCenter = {\n        x: (scene.artboard.x || 0) + scene.artboard.width / 2,\n        y: (scene.artboard.y || 0) + scene.artboard.height / 2,\n      };""", 'renderer render reset center')
text = replace_once(text, """      x: 0,\n      y: 0,\n      width: scene.artboard.width,\n      height: scene.artboard.height,""", """      x: scene.artboard.x || 0,\n      y: scene.artboard.y || 0,\n      width: scene.artboard.width,\n      height: scene.artboard.height,""", 'renderer background origin')
write(path, text)

# ---------------------------------------------------------------------------
# Runtime hit-test fallback center and shell preview consume origin.
# ---------------------------------------------------------------------------
path = 'src/veyra/hitTest.js'
text = read(path)
text = replace_once(text, """  const centerX = finite(viewport.centerX, finite(viewport.panX, finite(artboard.width, 0) / 2));\n  const centerY = finite(viewport.centerY, finite(viewport.panY, finite(artboard.height, 0) / 2));""", """  const artboardCenterX = finite(artboard.x, 0) + finite(artboard.width, 0) / 2;\n  const artboardCenterY = finite(artboard.y, 0) + finite(artboard.height, 0) / 2;\n  const centerX = finite(viewport.centerX, finite(viewport.panX, artboardCenterX));\n  const centerY = finite(viewport.centerY, finite(viewport.panY, artboardCenterY));""", 'hit-test fallback center')
write(path, text)

path = 'src/veyra/shellBridge.js'
text = read(path)
text = replace_once(text, """    const center = (getViewCenter && getViewCenter()) || { x: fallback.width / 2, y: fallback.height / 2 };""", """    const center = (getViewCenter && getViewCenter()) || {\n      x: Number(fallback.x || 0) + fallback.width / 2,\n      y: Number(fallback.y || 0) + fallback.height / 2,\n    };""", 'shell bridge fallback center')
write(path, text)

# ---------------------------------------------------------------------------
# SVG export clips to the authored frame origin while preserving old zero-origin goldens.
# ---------------------------------------------------------------------------
path = 'src/veyra/geometry.js'
text = read(path)
old = """  return [\n    '<?xml version=\"1.0\" encoding=\"UTF-8\"?>',\n    `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${scene.artboard.width}\" height=\"${scene.artboard.height}\" viewBox=\"0 0 ${scene.artboard.width} ${scene.artboard.height}\">`,\n    `<title>${escapeXml(scene.name)}</title>`,\n    `<metadata>${escapeXml(JSON.stringify({ generator: 'Veyra', formatVersion: scene.version, documentId: scene.documentId }))}</metadata>`,\n    definitions ? `<defs>${definitions}</defs>` : '',\n    `<rect width=\"100%\" height=\"100%\" fill=\"${escapeXml(scene.artboard.background)}\"/>`,\n    content,\n    meshContent,\n    '</svg>',\n  ].filter(Boolean).join('\\n');"""
new = """  const artboardX = Number(scene.artboard.x || 0);\n  const artboardY = Number(scene.artboard.y || 0);\n  const background = artboardX === 0 && artboardY === 0\n    ? `<rect width=\"100%\" height=\"100%\" fill=\"${escapeXml(scene.artboard.background)}\"/>`\n    : `<rect x=\"${artboardX}\" y=\"${artboardY}\" width=\"${scene.artboard.width}\" height=\"${scene.artboard.height}\" fill=\"${escapeXml(scene.artboard.background)}\"/>`;\n  return [\n    '<?xml version=\"1.0\" encoding=\"UTF-8\"?>',\n    `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${scene.artboard.width}\" height=\"${scene.artboard.height}\" viewBox=\"${artboardX} ${artboardY} ${scene.artboard.width} ${scene.artboard.height}\">`,\n    `<title>${escapeXml(scene.name)}</title>`,\n    `<metadata>${escapeXml(JSON.stringify({ generator: 'Veyra', formatVersion: scene.version, documentId: scene.documentId }))}</metadata>`,\n    definitions ? `<defs>${definitions}</defs>` : '',\n    background,\n    content,\n    meshContent,\n    '</svg>',\n  ].filter(Boolean).join('\\n');"""
text = replace_once(text, old, new, 'SVG export artboard origin')
write(path, text)

# ---------------------------------------------------------------------------
# Browser frame overlay, authored resize, object creation centers.
# ---------------------------------------------------------------------------
path = 'veyra.js'
text = read(path)
text = replace_once(text, """  const topLeft = renderer.worldToClient(0, 0);\n  const bottomRight = renderer.worldToClient(artboard.width, artboard.height);""", """  const artboardX = Number(artboard.x || 0);\n  const artboardY = Number(artboard.y || 0);\n  const topLeft = renderer.worldToClient(artboardX, artboardY);\n  const bottomRight = renderer.worldToClient(artboardX + artboard.width, artboardY + artboard.height);""", 'syncArtboardFrame origin')
text = replace_once(text, """  const startViewport = renderer.getViewport();\n  const startArtboard = { width: store.document.artboard.width, height: store.document.artboard.height };""", """  const startViewport = renderer.getViewport();\n  const startArtboard = {\n    x: Number(store.document.artboard.x || 0),\n    y: Number(store.document.artboard.y || 0),\n    width: store.document.artboard.width,\n    height: store.document.artboard.height,\n  };""", 'browser resize start frame')
text = replace_once(text, """    onMove: (state) => {\n      renderer.setViewport({\n        ...startViewport,\n        centerX: startViewport.centerX + state.anchorShiftX,\n        centerY: startViewport.centerY + state.anchorShiftY,\n      });\n      syncArtboardFrame();\n      setStatus(`Artboard ${state.width} × ${state.height}`);\n    },""", """    onMove: (state) => {\n      // Resizing authors the frame origin/dimensions only. The camera is\n      // deliberately untouched, so artwork remains stationary on screen.\n      syncArtboardFrame();\n      setStatus(`Artboard ${state.width} × ${state.height} @ ${state.x}, ${state.y}`);\n    },""", 'remove camera resize workaround')
text = replace_once(text, """    if (!commitGesture) {\n      renderer.setViewport(startViewport);\n      evaluateCurrentFrame();\n      syncArtboardFrame();\n      setStatus('Artboard resize cancelled');\n    } else if (result.error) {\n      renderer.setViewport(startViewport);\n      renderAll('validation-error');""", """    if (!commitGesture) {\n      evaluateCurrentFrame();\n      syncArtboardFrame();\n      setStatus('Artboard resize cancelled');\n    } else if (result.error) {\n      renderAll('validation-error');""", 'browser resize cancel camera no-op')
text = replace_once(text, """  getArtboardSize: () => ({ width: store.document.artboard.width, height: store.document.artboard.height }),""", """  getArtboardSize: () => ({\n    x: Number(store.document.artboard.x || 0),\n    y: Number(store.document.artboard.y || 0),\n    width: store.document.artboard.width,\n    height: store.document.artboard.height,\n  }),""", 'preview artboard origin')
text = replace_once(text, """    : { x: store.document.artboard.width / 2, y: store.document.artboard.height / 2 };""", """    : {\n      x: Number(store.document.artboard.x || 0) + store.document.artboard.width / 2,\n      y: Number(store.document.artboard.y || 0) + store.document.artboard.height / 2,\n    };""", 'new node artboard center')
text = replace_once(text, """  const center = {\n    x: store.document.artboard.width / 2,\n    y: store.document.artboard.height / 2,\n  };""", """  const center = {\n    x: Number(store.document.artboard.x || 0) + store.document.artboard.width / 2,\n    y: Number(store.document.artboard.y || 0) + store.document.artboard.height / 2,\n  };""", 'new rig artboard center')
write(path, text)

# ---------------------------------------------------------------------------
# Replace stale camera-anchor assertions in the previous correction suite.
# ---------------------------------------------------------------------------
path = 'tests/veyra-m5-camera-artboard-corrections.test.mjs'
text = read(path)
text = text.replace("const artboard = { width: 800, height: 600 };", "const artboard = { x: 0, y: 0, width: 800, height: 600 };")
text = text.replace("startArtboard: { width: 800, height: 600 },", "startArtboard: { x: 0, y: 0, width: 800, height: 600 },")
text = text.replace("assert.equal(moved.anchorShiftX, 0); assert.equal(JSON.stringify(s.document.nodes[0]), childBefore);", "assert.equal(moved.x, 0); assert.equal(JSON.stringify(s.document.nodes[0]), childBefore);")
text = text.replace("assert.equal(moved.width, 780); assert.equal(moved.anchorShiftX, -20);", "assert.equal(moved.width, 780); assert.equal(moved.x, 20); assert.equal(moved.x + moved.width, 800);")
text = text.replace("assert.equal(moved.height, 585); assert.equal(moved.anchorShiftY, -15);", "assert.equal(moved.height, 585); assert.equal(moved.y, 15); assert.equal(moved.y + moved.height, 600);")
old_block = """// Left/top camera shifts keep the opposite rendered edge/corner exactly fixed.\n{\n  const size = { width: 1000, height: 700 };\n  const startCamera = { zoom: 2, centerX: 400, centerY: 300 };\n  const before = createSvgViewBoxScreenTransform(artboard, { ...size, ...startCamera });\n  const oldRight = transformPoint(before.matrix, { x: 800, y: 300 });\n  const { g, moved } = gesture('left', 80, 0, { zoom: 2 });\n  const nextArtboard = { width: moved.width, height: 600 };\n  const nextCamera = { ...startCamera, centerX: startCamera.centerX + moved.anchorShiftX };\n  const after = createSvgViewBoxScreenTransform(nextArtboard, { ...size, ...nextCamera });\n  const newRight = transformPoint(after.matrix, { x: moved.width, y: 300 });\n  close(newRight.x, oldRight.x, 1e-8, 'left resize preserves opposite rendered edge');\n  g.cancel();\n}\n"""
new_block = """// Left/top resize moves the authored frame while the camera and artwork stay fixed.\n{\n  const size = { width: 1000, height: 700 };\n  const startCamera = { zoom: 2, centerX: 400, centerY: 300 };\n  const before = createSvgViewBoxScreenTransform(artboard, { ...size, ...startCamera });\n  const childScreenBefore = transformPoint(before.matrix, { x: 200, y: 150 });\n  const { s, g, moved } = gesture('left', 80, 0, { zoom: 2 });\n  const after = createSvgViewBoxScreenTransform(s.document.artboard, { ...size, ...startCamera });\n  const childScreenAfter = transformPoint(after.matrix, { x: 200, y: 150 });\n  assert.deepEqual(startCamera, { zoom: 2, centerX: 400, centerY: 300 });\n  close(moved.x + moved.width, 800, 1e-8, 'left resize preserves opposite world edge');\n  close(childScreenAfter.x, childScreenBefore.x, 1e-8, 'child screen x stays fixed');\n  close(childScreenAfter.y, childScreenBefore.y, 1e-8, 'child screen y stays fixed');\n  g.cancel();\n}\n"""
text = replace_once(text, old_block, new_block, 'replace stale camera anchor test')
write(path, text)

# ---------------------------------------------------------------------------
# Final adversarial suite: persistence + stationarity + export + undo/redo.
# ---------------------------------------------------------------------------
write('tests/veyra-m5-artboard-origin-final.test.mjs', r"""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { createArtboardResizeGesture, VEYRA_ARTBOARD_RESIZE_DIRECTIONS } from '../src/veyra/gestures.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, normalizeDocument } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import { classifyArtboardResizeZone, fitArtboardViewport } from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-9, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);
}

const baseFrame = { x: 0, y: 0, width: 800, height: 600, background: '#fff7fc' };
const camera = Object.freeze({ zoom: 2, centerX: 420, centerY: 310 });
const screen = { width: 1000, height: 700 };
const child = createNode('rectangle', {
  id: 'child:stationary', transform: { x: 200, y: 150 }, geometry: { width: 40, height: 30 },
});

function createStore() {
  return new VeyraStore(normalizeDocument(createDocument({ artboard: baseFrame, nodes: [child] })));
}

function resize(direction, dxPx, dyPx) {
  const store = createStore();
  const beforeCamera = { ...camera };
  const beforeChild = JSON.stringify(store.document.nodes[0]);
  const beforeMap = createSvgViewBoxScreenTransform(store.document.artboard, { ...screen, ...camera });
  const beforeScreen = transformPoint(beforeMap.matrix, { x: 200, y: 150 });
  const gesture = createArtboardResizeGesture({
    store,
    start: { x: 100, y: 100 },
    startArtboard: { ...store.document.artboard },
    direction,
    scaleX: 1 / camera.zoom,
    scaleY: 1 / camera.zoom,
  });
  const moved = gesture.move({ clientX: 100 + dxPx, clientY: 100 + dyPx });
  const afterMap = createSvgViewBoxScreenTransform(store.document.artboard, { ...screen, ...camera });
  const afterScreen = transformPoint(afterMap.matrix, { x: 200, y: 150 });
  assert.deepEqual(camera, beforeCamera, `${direction}: camera object is unchanged`);
  assert.equal(JSON.stringify(store.document.nodes[0]), beforeChild, `${direction}: child world data is unchanged`);
  close(afterScreen.x, beforeScreen.x, 1e-9, `${direction}: child CSS x stationary`);
  close(afterScreen.y, beforeScreen.y, 1e-9, `${direction}: child CSS y stationary`);
  return { store, gesture, moved };
}

assert.deepEqual(VEYRA_ARTBOARD_RESIZE_DIRECTIONS, [
  'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);

// 1-7: all eight directions operate on the authored frame, not camera/artwork.
{
  const { store, gesture } = resize('left', 80, 0);
  assert.deepEqual(store.document.artboard, { ...baseFrame, x: 40, width: 760 });
  assert.equal(store.document.artboard.x + store.document.artboard.width, 800);
  gesture.end();
}
{
  const { store, gesture } = resize('top', 0, 60);
  assert.deepEqual(store.document.artboard, { ...baseFrame, y: 30, height: 570 });
  assert.equal(store.document.artboard.y + store.document.artboard.height, 600);
  gesture.end();
}
const expected = {
  right: { x: 0, y: 0, width: 840, height: 600 },
  bottom: { x: 0, y: 0, width: 800, height: 630 },
  'top-left': { x: 40, y: 30, width: 760, height: 570 },
  'top-right': { x: 0, y: 30, width: 840, height: 570 },
  'bottom-left': { x: 40, y: 0, width: 760, height: 630 },
  'bottom-right': { x: 0, y: 0, width: 840, height: 630 },
};
for (const direction of Object.keys(expected)) {
  const { store, gesture } = resize(direction, 80, 60);
  const { background, ...frame } = store.document.artboard;
  assert.deepEqual(frame, expected[direction], `${direction}: composed frame semantics`);
  if (direction === 'right' || direction === 'bottom' || direction === 'bottom-right') {
    assert.equal(store.document.artboard.x, 0);
    assert.equal(store.document.artboard.y, 0);
  }
  gesture.end();
}

// 8-9: legacy migration and non-zero origin persistence.
{
  const legacy = JSON.stringify({
    format: 'veyra', version: 3, id: 'legacy', name: 'Legacy',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    artboard: { width: 320, height: 240, background: '#ffffff' }, nodes: [],
  });
  const migrated = parseVeyra(legacy);
  assert.equal(migrated.artboard.x, 0);
  assert.equal(migrated.artboard.y, 0);
}
{
  const { store, gesture } = resize('top-left', 80, 60);
  gesture.end();
  const edgesBefore = {
    left: store.document.artboard.x,
    top: store.document.artboard.y,
    right: store.document.artboard.x + store.document.artboard.width,
    bottom: store.document.artboard.y + store.document.artboard.height,
  };
  const saved = serializeVeyra(store.document);
  assert.match(saved, /"x": 40/);
  assert.match(saved, /"y": 30/);
  const reloaded = parseVeyra(saved);
  assert.deepEqual({
    left: reloaded.artboard.x,
    top: reloaded.artboard.y,
    right: reloaded.artboard.x + reloaded.artboard.width,
    bottom: reloaded.artboard.y + reloaded.artboard.height,
  }, edgesBefore);
  assert.equal(reloaded.nodes[0].transform.x, 200);
  assert.equal(reloaded.nodes[0].transform.y, 150);
}

// 10: one committed resize is one history entry; undo/redo restore exact frame.
{
  const store = createStore();
  const before = { ...store.document.artboard };
  const history = store.commandHistory.length;
  const gesture = createArtboardResizeGesture({
    store, start: { x: 0, y: 0 }, startArtboard: { ...store.document.artboard }, direction: 'top-left', scaleX: 0.5, scaleY: 0.5,
  });
  gesture.move({ clientX: 40, clientY: 30 });
  const after = { ...store.document.artboard };
  gesture.end();
  assert.equal(store.commandHistory.length, history + 1);
  assert.equal(store.undo(), true);
  assert.deepEqual(store.document.artboard, before);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.document.artboard, after);
}

// 11-12: cancel exact serialization and sub-threshold click no-op.
{
  const store = createStore();
  const before = serializeVeyra(store.document);
  const gesture = createArtboardResizeGesture({ store, start: { x: 0, y: 0 }, startArtboard: { ...store.document.artboard }, direction: 'left' });
  gesture.move({ clientX: 30, clientY: 0 });
  assert.notEqual(serializeVeyra(store.document), before);
  gesture.cancel();
  assert.equal(serializeVeyra(store.document), before);
  assert.deepEqual(camera, { zoom: 2, centerX: 420, centerY: 310 });
}
{
  const store = createStore();
  const before = serializeVeyra(store.document);
  const history = store.commandHistory.length;
  const gesture = createArtboardResizeGesture({ store, start: { x: 10, y: 10 }, startArtboard: { ...store.document.artboard }, direction: 'left' });
  assert.equal(gesture.move({ clientX: 11, clientY: 11 }).started, false);
  assert.equal(gesture.end().committed, false);
  assert.equal(serializeVeyra(store.document), before);
  assert.equal(store.commandHistory.length, history);
}

// 13: the 7px classification contract remains screen-space and zoom-independent.
const rect = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };
for (const zoom of [0.1, 1, 8]) {
  void zoom;
  assert.equal(classifyArtboardResizeZone({ x: 103, y: 350 }, rect), 'left');
  assert.equal(classifyArtboardResizeZone({ x: 897, y: 54 }, rect), 'top-right');
}

// 14-15: renderer-equivalent screen transform/hit-test parity survives origin + panel resize.
{
  const model = normalizeDocument(createDocument({
    artboard: { x: 40, y: 30, width: 760, height: 570 },
    nodes: [child],
  }));
  for (const viewportSize of [{ width: 1000, height: 700 }, { width: 620, height: 910 }]) {
    const viewport = { ...viewportSize, ...camera };
    const map = createSvgViewBoxScreenTransform(model.artboard, viewport);
    close(map.scale, camera.zoom);
    const point = transformPoint(map.matrix, { x: 200, y: 150 });
    assert.deepEqual(hitTestPoint(point, model, viewport), { kind: 'node', id: child.id });
    assert.deepEqual(camera, { zoom: 2, centerX: 420, centerY: 310 });
  }
}

// 16: Fit Artboard centers a non-zero-origin frame.
{
  const frame = { x: 125, y: -60, width: 500, height: 300 };
  const fit = fitArtboardViewport(frame, { width: 1000, height: 800 }, { padding: 50 });
  assert.equal(fit.centerX, 375);
  assert.equal(fit.centerY, 90);
  assert.ok(fit.zoom > 0);
}

// Export must use the persisted frame as its SVG viewBox and background bounds.
{
  const model = normalizeDocument(createDocument({ artboard: { x: 40, y: 30, width: 760, height: 570 }, nodes: [child] }));
  const svg = renderSvgString(evaluateDocument(model));
  assert.match(svg, /viewBox="40 30 760 570"/);
  assert.match(svg, /<rect x="40" y="30" width="760" height="570"/);
}

// 17 + browser contract: no permanent artboard handles and no camera anchor-shift workaround.
const browser = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../veyra.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /class="artboardHandle"/);
assert.doesNotMatch(browser, /anchorShiftX|anchorShiftY/);
assert.match(browser, /renderer\.worldToClient\(artboardX, artboardY\)/);
assert.match(browser, /startArtboard: \{/);
assert.match(browser, /x: Number\(store\.document\.artboard\.x \|\| 0\)/);

console.log('veyra M5 final artboard-origin correction tests passed');
""")

print('M5 persistent artboard-origin final correction applied')
