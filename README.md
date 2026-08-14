# Rive Rider

Tiny low-level Rive `.riv` inspector for testing exactly what the Rive WebAssembly runtime exposes to external code.

## Run

This is intentionally a zero-build app.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also use any static HTTP server, for example `npx serve .`.

> Do not open `index.html` directly with `file://`; browsers may block the Rive WASM module.

## Use your `.riv` file

Click **Open .riv** and choose your local Rive file. The inspector reads it in the browser; you do not need to copy the file into the repository.

The current UI still contains a **Load bundled test.riv** convenience button, but `test.riv` is intentionally not committed yet. For this first experiment, use **Open .riv**.

## What the inspector tests

- Loads a `.riv` file with `@rive-app/canvas-advanced`.
- Renders the selected artboard.
- Lists artboards, animations, and state machines through the low-level runtime.
- Reflects the JavaScript/WASM wrapper objects and shows their available properties and methods.
- Automatically probes `*Count()` + `*ByIndex()` API pairs to discover collections exposed by the runtime.
- Highlights method/property names related to paths, shapes, vertices, fills, strokes, paint, meshes, bones, transforms, etc.
- Lets you try `artboard.nodeByName(...)` when the runtime provides it.
- Shows primitive writable properties on a found node and lets you change them live.

The goal is not to assume that Rive exposes raw vector geometry. The app tells us empirically what the current low-level runtime actually makes accessible.

## Rive runtime

The page pins `@rive-app/canvas-advanced` to `2.39.1` so the JavaScript module and `rive.wasm` always match.
