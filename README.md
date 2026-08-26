# Veyra

Veyra is an AI-readable vector and character editor with its own open,
versioned document model. The editable source is UTF-8 JSON saved with the
`.veyra` extension; SVG is the first portable render export.

Veyra is a real local editor rather than a UI-only prototype. In addition to
vector artwork, hierarchy, semantics, undo/redo, autosave, and deterministic
SVG export, Milestone 2 adds bone hierarchies, weighted meshes, draggable pose
controls, six constraint types, deformation diagnostics, normalization, and
weight symmetry. Milestone 3A adds multiple timelines, property-addressed
keyframes, easing and cubic Bezier controls, Auto-key, scrubbing, playback,
keyframe drag/delete, and timeline zoom. The starter document is a two-bone IK
character rig that can be inspected without guessing from layer names.

## Run Veyra

From the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`. The root redirects to
`http://localhost:8000/veyra.html`.

Useful shortcuts:

- `Ctrl+S`: save the current `.veyra` document;
- `Ctrl+Z` / `Ctrl+Y`: undo and redo;
- `V`, `B`, `M`, `C`, `K`, `H`: Select, Bones, Weights, Controls,
  Constraints, and Pan tools;
- `Ctrl++` / `Ctrl+-` / `Ctrl+0`: zoom the Veyra canvas in, out, or fit it
  without changing browser-page zoom;
- `Ctrl+wheel`: zoom the canvas around the pointer;
- wheel / `Shift+wheel`: pan vertically or horizontally;
- `Alt+drag`: pan from any tool;
- `Shift+bone drag`: snap rotation to 15-degree increments or translation to
  one axis;
- `Space`: play or pause the active timeline;
- `Ctrl+wheel` over the timeline: zoom around the pointer; double-click the
  ruler to reset to 20 pixels per frame;
- `Delete`: remove the selected keyframe, or the selected object when no
  keyframe is selected;
- `Escape`: close the keyframe editor, cancel a drag, or clear the selection.

In the Bones tool, drag a bone's cyan end handle to pose it and its start joint
to translate it. Dragging an IK-driven bone moves the linked target so the
skeleton and weighted mesh update together; disable that IK constraint when
you want to author the bone's rotation directly.

Run the dependency-free checks with:

```powershell
npm test
npm run check
```

The Veyra implementation plan and format decisions are in
[`docs/VEYRA_PLAN.md`](docs/VEYRA_PLAN.md). The current file format is
`format: "veyra"`, `version: 2`, with MIME type
`application/vnd.veyra+json`. Stable IDs, authored geometry, hierarchy, and
semantic records are stored explicitly; SVG selection overlays and generated
render paths are not stored in the document.

Milestone 1B foundation contracts are also complete: radians-based canonical
transforms with pivot/skew, typed references, deterministic serialization,
property addresses, derived capabilities, the asset registry, command
provenance, the authored-to-evaluated scene pipeline, compact AI summaries,
and golden render fixtures. See
[`docs/VEYRA_FOUNDATION_CONTRACTS.md`](docs/VEYRA_FOUNDATION_CONTRACTS.md).

Milestone 2's rest/pose ownership, linear blend skinning, typed rig references,
constraint solvers, migration, and diagnostics are specified in
[`docs/VEYRA_RIGGING.md`](docs/VEYRA_RIGGING.md). Existing version 1 files are
migrated in memory and save as version 2 without changing their artwork.

Milestone 3A's timeline schema, interpolation, easing, playback ownership,
editor interactions, command semantics, and serialization rules are specified
in [`docs/VEYRA_ANIMATION.md`](docs/VEYRA_ANIMATION.md).

Local scripts and agents can use the running editor through `globalThis.veyra`:

```js
veyra.getSceneSummary();
veyra.getEvaluatedScene();
veyra.readProperty('node:<id>/geometry/width');
veyra.applyCommand({
  source: 'ai',
  label: 'Make the right eye wider',
  address: 'node:<id>/geometry/width',
  value: 104,
});
veyra.setMeshVertexWeights({
  meshId: '<mesh-id>',
  vertexId: '<mesh-vertex-id>',
  weights: [{ boneId: '<bone-id>', value: 1 }],
});
const timelineId = veyra.createTimeline({
  name: 'Wave',
  duration: 60,
  fps: 30,
  loop: 'loop',
});
veyra.setKeyframe({
  timelineId,
  address: 'node:<id>/transform/rotation',
  frame: 0,
  value: 0,
  easing: 'ease-in-out',
});
veyra.playTimeline(timelineId, { speed: 1 });
```

## Rive research lab

Experimental Rive geometry inspector for answering one concrete question:

> Can external code read the real vector geometry inside a `.riv` file, change it, and have Rive redraw the result?

## Deep geometry test

The main experiment is `deep.html`.

Run a local static server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/deep.html
```

Click **Open .riv** and choose any local `.riv` file.

When the custom runtime is present, the page can:

- enumerate every internal object in the selected Artboard;
- distinguish authored `PointsPath` geometry from generated `ParametricPath` geometry;
- report concrete classes, owning shape/parent names, type keys,
  hidden/collapsed state, generated vertices, and weighted vertices;
- group paths by their actual owning Shape and summarize the Artboard's
  PointsPath/Rectangle/Ellipse/Polygon/Star/Triangle composition;
- compare source vertex positions (`x`, `y`) with rendered/deformed positions (`renderX`, `renderY`);
- read source and rendered cubic Bezier handles;
- change only an authored `PointsPath` vertex's source `x/y` values;
- inspect and edit authoritative parametric source properties using the real
  generated Rectangle/Ellipse/Polygon/Star/Triangle setters;
- run Rive's update pass on the existing Artboard instance and verify the read-back immediately.

The page shows **CUSTOM geometry tools** when the patched runtime loaded successfully. If it shows **PUBLIC fallback**, the generated WASM has not been built/pulled yet.

## Custom Rive WASM

Rive Rider pins the inspected upstream `rive-app/rive-wasm` revision and builds Rive's own `tools` target (`ENABLE_QUERY_FLAT_VERTICES`). A small patch adds these Artboard methods:

```text
debugObjectCount()
debugObjectInfo(index)
debugPathVertexCount(objectIndex)
debugPathVertexInfo(objectIndex, vertexIndex)
debugSetPathVertexXY(objectIndex, vertexIndex, x, y)
debugParametricInfo(objectIndex)
debugSetParametricProperty(objectIndex, propertyName, value)
flattenPath(index, transformToParent)
```

The underlying Rive runtime already owns the actual vector data. The patch only exposes a narrow diagnostic bridge to JavaScript.

The proof-of-concept APIs now sit behind a small layered JavaScript facade so
future rig, constraint, animation, and data controls do not expand one flat
debug namespace. See:

- [`docs/RIVE_CAPABILITY_MATRIX.md`](docs/RIVE_CAPABILITY_MATRIX.md) — audited
  feature-by-feature runtime/editing/authoring support at the pinned revisions;
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — bridge, scene graph, control,
  semantic metadata, commands, and render feedback boundaries;
- [`docs/AI_CONTROL_MODEL.md`](docs/AI_CONTROL_MODEL.md) — highest-level-first
  control selection without an AI integration;
- [`docs/RIVE_SERIALIZATION.md`](docs/RIVE_SERIALIZATION.md) — why the runtime
  cannot currently save mutated objects as `.riv` and the sidecar strategy.

### Automatic build

`.github/workflows/build-custom-rive.yml` builds the patched WASM on GitHub Actions and commits the generated runtime to:

```text
vendor/rive-tools/canvas_advanced.mjs
vendor/rive-tools/rive.wasm
vendor/rive-tools/build-info.json
```

The workflow runs when the tools/build files change and can also be started manually with **Run workflow**.

### Native Windows local build

The Windows development loop runs entirely from PowerShell. It does not use
WSL, Ubuntu, Docker, or Git Bash.

Install these native Windows prerequisites once:

- Git for Windows and Python 3;
- Emscripten SDK `4.0.23`, preferably at `C:\emsdk`, activated with
  `emsdk.bat activate 4.0.23 --permanent` so `emcc` and `em++` are on `PATH`.

The PowerShell script checks these prerequisites and prints setup commands when
one is missing. On its first successful run it downloads the pinned native
Windows Premake `5.0.0-beta7` and Ninja `1.12.1` executables into `.rive-wasm`
and fetches Rive's Premake Ninja support; subsequent builds reuse all of them.

For a new checkout, do this once from the repository root:

```powershell
git clone https://github.com/rive-app/rive-wasm.git .rive-wasm
git -C .rive-wasm checkout 79c696a6cae99e936fc31b0e9778a01850ca8245
git -C .rive-wasm config url."https://github.com/".insteadOf git@github.com:
git -C .rive-wasm submodule update --init --recursive
python tools\patch_rive.py
```

Then the normal Windows development loop is:

```powershell
.\tools\rebuild-local-windows.ps1
python -m http.server 8000
```

The native Ninja build reuses `.rive-wasm\wasm\build\rive-rider`, writes the refreshed
module and WASM to `vendor\rive-tools`, and never deletes or reclones the Rive
checkout. Open `http://localhost:8000/deep.html` and refresh after each build.

### Checks

The architecture modules have dependency-free Node tests and both browser
entry points have syntax checks:

```powershell
npm test
npm run check
```

With the local server running, open
`http://localhost:8000/tests/wasm-geometry-fixtures.html` to run the custom WASM
against pinned upstream Rive fixtures. A passing page verifies PointsPath,
Rectangle, Ellipse, Polygon, Star, Triangle, generated-vertex rejection,
unsupported-property rejection, and weighted-path detection.

### Linux and reproducible CI builds

The existing Linux incremental command remains available:

```bash
bash tools/rebuild-local.sh
```

The clean/reproducible Linux build remains:

```bash
bash tools/build-custom-rive.sh
```

That command deletes and reclones `.rive-wasm`, reapplies the patch, and is the
path used by GitHub Actions. All build paths preserve the same pinned upstream
revision and tools configuration.

## Files

- `veyra.html` / `veyra.js` / `veyra.css` - Veyra editor workspace.
- `src/veyra` - validated document model, geometry, transactional store,
  renderer, and file I/O.
- `docs/VEYRA_PLAN.md` - product scope, architecture, and staged roadmap.
- `docs/VEYRA_FOUNDATION_CONTRACTS.md` - normative Milestone 1B coordinate,
  property, evaluation, and serialization rules.
- `docs/VEYRA_RIGGING.md` - normative Milestone 2 bone, mesh, skinning,
  constraint, diagnostic, and migration rules.
- `docs/VEYRA_ANIMATION.md` - normative Milestone 3A timeline, interpolation,
  playback, interaction, and serialization rules.
- `tests/veyra-model.test.mjs` - document, geometry, file, and history tests.
- `tests/veyra-foundation.test.mjs` - typed reference, capability, property,
  evaluation, provenance, asset, summary, and migration tests.
- `tests/veyra-rigging.test.mjs` - bones, skinning, all six constraints,
  diagnostics, normalization, symmetry, and authored/evaluated ownership tests.
- `tests/veyra-animation.test.mjs` - timeline, easing, interpolation, loop,
  playback, and evaluation integration tests.
- `tests/fixtures/veyra` / `tests/veyra-golden.test.mjs` - canonical artwork,
  animated, and weighted IK scenes with deterministic rendered-frame hashes.
- `tests/veyra-browser.html` - browser renderer smoke test.
- `deep.html` / `deep.js` — deep geometry viewer/editor.
- `index.html` / `app.js` — original public-runtime API inspector.
- `tools/patch_rive.py` — narrow patch applied to the pinned Rive source.
- `tools/rebuild-local-windows.ps1` — native Windows incremental WASM rebuild.
- `tools/rebuild-local.sh` — Linux incremental WASM rebuild and vendor copy.
- `tools/build-custom-rive.sh` — clean, reproducible custom WASM build.
- `.github/workflows/build-custom-rive.yml` — CI builder.
- `src/bridge` / `src/scene` — raw runtime facade and normalized scene model.
- `src/control` / `src/semantic` / `src/commands` — control policy, separate
  metadata, and validated preview/apply/read-back/undo commands.
- `tests/architecture-modules.test.mjs` — dependency-free module contract tests.
- `tests/wasm-geometry-fixtures.html` — browser-level mutation/read-back tests
  using the pinned upstream `.riv` fixtures.

## Current scope

V1 edits authored `PointsPath` vertex positions and the inspected source
properties of Rectangle, Ellipse, Polygon, Star, Triangle, and base
`ParametricPath` geometry. Bezier handles are readable, including the
distinction between source and rendered handles. A later bridge can add cubic
handle setters, fill/stroke properties, meshes, and other geometry objects.
