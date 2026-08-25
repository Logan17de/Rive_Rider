# Deep geometry test

This page uses a pinned, tools-mode Rive WASM build with a narrow diagnostic
bridge. It exists to prove that Rive Rider can inspect and mutate authoritative
vector geometry without recreating the loaded Artboard instance.

## What the bridge exposes

On an Artboard instance:

- `debugObjectCount()`
- `debugObjectInfo(index)` — names, path kind, and visibility/collapse state
- `debugPathVertexCount(pathObjectIndex)`
- `debugPathVertexInfo(pathObjectIndex, vertexIndex)` — source/rendered position,
  skin weight state, and source/rendered cubic handles
- `debugSetPathVertexXY(pathObjectIndex, vertexIndex, x, y)` — accepts only a
  real `PointsPath`, marks its geometry dirty, and runs the update pass
- `debugParametricInfo(pathObjectIndex)` — reports only source properties
  supported by the concrete Rectangle, Ellipse, Polygon, Star, Triangle, or
  base ParametricPath class
- `debugSetParametricProperty(pathObjectIndex, propertyName, value)` — validates
  the concrete class/property pair, invokes the generated setter, and advances
  the existing Artboard instance
- `flattenPath(index, transformToParent)`

Generated `ParametricPath` vertices remain read-only. Rectangles, ellipses,
polygons, stars, and triangles are edited through their authoritative source
properties instead.

## One-time local setup

On Windows, install native emsdk `4.0.23` at a path without spaces (recommended:
`C:\emsdk`) and activate it permanently. The rebuild script downloads pinned
native Windows Premake and Ninja executables when needed.

```powershell
git clone https://github.com/rive-app/rive-wasm.git .rive-wasm
git -C .rive-wasm checkout 79c696a6cae99e936fc31b0e9778a01850ca8245
git -C .rive-wasm config url."https://github.com/".insteadOf git@github.com:
git -C .rive-wasm submodule update --init --recursive
python tools\patch_rive.py
```

## Native Windows development loop

```powershell
.\tools\rebuild-local-windows.ps1
python -m http.server 8000
```

Open `http://localhost:8000/deep.html`. The command reuses the existing checkout
and build directory, so GitHub Actions is not part of the local edit/test loop.

Linux developers can continue to use `bash tools/rebuild-local.sh`; the clean
GitHub Actions build continues to use `bash tools/build-custom-rive.sh`.

## Manual proof

1. Open the existing test `.riv` file.
2. Select the actual character Artboard.
3. Use the geometry summary and owning-Shape groups to find a visible character
   feature such as Face, R_Eye, L_Eye, Mouth, Nose, Hair, or Ear. Only names
   stored in the `.riv` hierarchy are shown.
4. For `PointsPath`, change one X or Y value and select **Apply & verify**.
5. For Rectangle/Ellipse/Polygon/Star/Triangle, change a displayed source
   property and select **Apply source properties & verify**.
6. Confirm that read-back source values match the request and the same canvas
   Artboard visibly deforms.

For a weighted vertex, the verification panel separately reports source and
rendered positions so skin-deformation behavior is explicit. Procedural paths
keep generated vertices read-only and expose only properties supported by their
concrete runtime class.
