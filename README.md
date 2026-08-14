# Rive Rider

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
- identify `Path` objects;
- read the original path vertices (`x`, `y`);
- read rendered cubic Bezier in/out handle positions;
- change an original path vertex's `x/y` values;
- mark the path dirty and let Rive redraw it immediately.

The page shows **CUSTOM geometry tools** when the patched runtime loaded successfully. If it shows **PUBLIC fallback**, the generated WASM has not been built/pulled yet.

## Custom Rive WASM

Rive Rider pins the inspected upstream `rive-app/rive-wasm` revision and builds Rive's own `tools` target (`ENABLE_QUERY_FLAT_VERTICES`). A small patch adds these Artboard methods:

```text
debugObjectCount()
debugObjectInfo(index)
debugPathVertexCount(objectIndex)
debugPathVertexInfo(objectIndex, vertexIndex)
debugSetPathVertexXY(objectIndex, vertexIndex, x, y)
flattenPath(index, transformToParent)
```

The underlying Rive runtime already owns the actual vector data. The patch only exposes a narrow diagnostic bridge to JavaScript.

### Automatic build

`.github/workflows/build-custom-rive.yml` builds the patched WASM on GitHub Actions and commits the generated runtime to:

```text
vendor/rive-tools/canvas_advanced.mjs
vendor/rive-tools/rive.wasm
vendor/rive-tools/build-info.json
```

The workflow runs when the tools/build files change and can also be started manually with **Run workflow**.

### Local build

You need Emscripten available in your shell, then run:

```bash
bash tools/build-custom-rive.sh
```

## Files

- `deep.html` / `deep.js` — deep geometry viewer/editor.
- `index.html` / `app.js` — original public-runtime API inspector.
- `tools/patch_rive.py` — narrow patch applied to the pinned Rive source.
- `tools/build-custom-rive.sh` — reproducible custom WASM build.
- `.github/workflows/build-custom-rive.yml` — CI builder.

## Current scope

V1 intentionally edits only vertex position. Bezier handles are already readable. Once vertex mutation is proven on a real character, the next bridge can expose cubic handle setters, fill/stroke properties, meshes, and other geometry objects.
