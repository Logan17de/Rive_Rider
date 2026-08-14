# Deep geometry test

This test bypasses the normal published `@rive-app/canvas-advanced` API and builds Rive's official WASM source in its existing `tools` mode, then adds a very small bridge for reading and mutating original Path vertices.

## What the bridge exposes

On an Artboard instance:

- `queryPathIndices()` -> object indices whose internal object is a `rive::Path`
- `queryPathVertexCount(pathObjectIndex)`
- `queryPathVertex(pathObjectIndex, vertexIndex)` -> `{x,y,coreType,isCubic,inX,inY,outX,outY}`
- `setPathVertexXY(pathObjectIndex, vertexIndex, x, y)` -> mutates the original Rive vertex and marks the Path dirty

The first experiment intentionally changes only vertex X/Y. Cubic handle values are read for inspection but are not writable yet.

## Build the custom runtime

The build is easiest in WSL/Ubuntu or Linux because Rive's own WASM build scripts are shell-based.

From the repository root:

```bash
bash scripts/build-custom-rive.sh
```

The script:

1. clones `rive-app/rive-wasm` recursively into `.rive-src`
2. pins the tested upstream commit
3. patches only the tools/query surface
4. runs Rive's `build_wasm.sh tools`
5. copies `canvas_advanced.mjs` and `canvas_advanced.wasm` into `runtime/`

If Rive's upstream build dependencies fail on your machine, keep the terminal output; that is the next thing to fix rather than changing the inspector.

## Run Rive Rider

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/deep.html
```

Then:

1. Click **Open .riv**.
2. Select the artboard.
3. The right panel should say all four custom methods are `YES`.
4. Select a Path object.
5. Its original vertices and cubic handle coordinates are listed.
6. Change one X or Y number and click **Apply**.
7. The rendered Rive should redraw with that vertex changed.

If that final step works, we have proven the key architecture: `.riv -> our engine -> original vector coordinates -> modify -> Rive renderer`.

## Why this is separate from `index.html`

`index.html` remains the stock/public-runtime inspector. `deep.html` is the experimental custom-runtime path. Keeping both makes it easy to compare what Rive officially exposes versus what exists in the underlying open-source runtime.
