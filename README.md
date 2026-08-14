# Rive Rider

Experimental Rive geometry inspector for one concrete question:

> Can external code read real vector geometry inside a `.riv` file, change it, and have Rive redraw the result?

## Two implementations to compare

### `main`

Uses a **custom-built Rive JavaScript wrapper + custom `rive.wasm`**.

### `stock-js-custom-wasm`

Uses the official stock `@rive-app/canvas-advanced@2.39.2` JavaScript wrapper and overrides only the WASM path with:

```js
R = await factory({
  locateFile: () => './vendor/rive-tools/rive.wasm',
});
```

This branch intentionally builds and stores only:

```text
vendor/rive-tools/rive.wasm
vendor/rive-tools/build-info.json
```

It does **not** rebuild or ship `canvas_advanced.mjs`.

## Run the stock-JS/custom-WASM branch

```bash
git switch stock-js-custom-wasm
git pull
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Then load a `.riv` file. In **Runtime capability**, the successful result should say:

```text
Runtime: STOCK JS 2.39.2 + CUSTOM WASM
✓ debugObjectCount
✓ debugObjectInfo
✓ debugPathVertexCount
✓ debugPathVertexInfo
✓ debugSetPathVertexXY
✓ flattenPath
```

If the custom WASM cannot initialize with the stock wrapper, the app deliberately falls back to the normal stock WASM and labels that clearly.

## Geometry bridge

The patched tools build exposes these Artboard methods:

```text
debugObjectCount()
debugObjectInfo(index)
debugPathVertexCount(objectIndex)
debugPathVertexInfo(objectIndex, vertexIndex)
debugSetPathVertexXY(objectIndex, vertexIndex, x, y)
flattenPath(index, transformToParent)
```

The underlying Rive runtime already owns the vector data. The patch only exposes a narrow diagnostic bridge to JavaScript.

## Test

1. Load the same `.riv` file on `main`.
2. Select an artboard and a path.
3. Change one vertex X/Y and confirm the render changes.
4. Switch to `stock-js-custom-wasm`.
5. Repeat with the same file/path.

If both work, the stock-JS/custom-WASM branch is the cleaner architecture and we can drop the custom JS wrapper.

## Build

GitHub Actions builds the patched WASM automatically for this branch. Local build:

```bash
bash tools/build-custom-rive.sh
```

The source is pinned to the exact Rive WASM revision used for this experiment to reduce JS/WASM compatibility ambiguity.
