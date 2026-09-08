from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'patch target not found in {path}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# Fill-boundary tests must isolate fill behavior from the model's default stroke.
for marker in [
    "id: 'huge-ellipse', transform: { x: 500, y: 500 }, geometry: { width: 50, height: 50 },",
    "geometry: { width: 120, height: 80 },\n  });\n  const document = makeArtboardDocument(ellipse, artboard);",
    "geometry: { width: 120, height: 120, cornerRadius: 50 },\n  });\n  const document = makeArtboardDocument(rounded, artboard);",
    "geometry: { width: 180, height: 100, cornerRadius: 40 },\n  });\n  const document = makeArtboardDocument(rounded, artboard);",
]:
    if marker.startswith("id: 'huge-ellipse'"):
        replacement = marker + "\n    paint: { fill: { type: 'solid', color: '#111111' }, stroke: 'none', strokeWidth: 0 },"
    else:
        replacement = marker.replace("\n  });", "\n    paint: { fill: { type: 'solid', color: '#111111' }, stroke: 'none', strokeWidth: 0 },\n  });")
    patch('tests/veyra-m4-corrections.test.mjs', marker, replacement)

# Make the renderer consume the same canonical viewBox contract as hit testing.
patch(
    'src/veyra/renderer.js',
    "import { transformPoint } from './contracts.js';\n",
    "import { transformPoint } from './contracts.js';\nimport { createSvgViewBox, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './viewport.js';\n",
)
patch(
    'src/veyra/renderer.js',
    """  #applyViewBox() {
    if (!this.scene) return;
    const { width, height } = this.scene.artboard;
    if (!this.viewCenter) this.viewCenter = { x: width / 2, y: height / 2 };
    const visibleWidth = width / this.zoom;
    const visibleHeight = height / this.zoom;
    this.svg.setAttribute('viewBox', [
      this.viewCenter.x - visibleWidth / 2,
      this.viewCenter.y - visibleHeight / 2,
      visibleWidth,
      visibleHeight,
    ].join(' '));
  }
""",
    """  #applyViewBox() {
    if (!this.scene) return;
    const { width, height } = this.scene.artboard;
    if (!this.viewCenter) this.viewCenter = { x: width / 2, y: height / 2 };
    const viewBox = createSvgViewBox(this.scene.artboard, {
      zoom: this.zoom,
      centerX: this.viewCenter.x,
      centerY: this.viewCenter.y,
    });
    this.svg.setAttribute('preserveAspectRatio', VEYRA_SVG_PRESERVE_ASPECT_RATIO);
    this.svg.setAttribute('viewBox', [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(' '));
  }
""",
)

# Include exact corner endpoints so rounded-rectangle curved stroke segments and
# straight tangents are independently represented.
patch(
    'src/veyra/hitTest.js',
    """  for (const corner of corners) {
    for (let index = 0; index < perQuarter; index += 1) {
""",
    """  for (const corner of corners) {
    for (let index = 0; index <= perQuarter; index += 1) {
""",
)

# Publish the new deterministic mapping/tolerance contract through the package entrypoint.
patch(
    'src/index.js',
    "export { hitTestPoint, VEYRA_HIT_TEST_TOLERANCE_PX, VEYRA_POINTER_EVENT_MODES } from './veyra/hitTest.js';\n",
    "export { hitTestPoint, VEYRA_CURVE_APPROXIMATION_TOLERANCE_PX, VEYRA_HIT_TEST_TOLERANCE_PX, VEYRA_POINTER_EVENT_MODES } from './veyra/hitTest.js';\nexport { createSvgViewBox, createSvgViewBoxScreenTransform, VEYRA_SVG_PRESERVE_ASPECT_RATIO } from './veyra/viewport.js';\n",
)
