#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="$ROOT/.rive-wasm"
OUT="$ROOT/vendor/rive-tools"
# Pin the exact upstream source we inspected when writing the patch.
RIVE_WASM_COMMIT="79c696a6cae99e936fc31b0e9778a01850ca8245"

rm -rf "$CHECKOUT"
# Rive's submodule URL is SSH. Rewrite GitHub SSH URLs to HTTPS so hosted CI
# and ordinary users without GitHub SSH keys can clone it.
git config --global url."https://github.com/".insteadOf git@github.com:
git clone https://github.com/rive-app/rive-wasm.git "$CHECKOUT"
git -C "$CHECKOUT" checkout "$RIVE_WASM_COMMIT"
git -C "$CHECKOUT" submodule update --init --recursive

python3 "$ROOT/tools/patch_rive.py"

cd "$CHECKOUT/wasm"
rm -rf build/rive-rider
# The upstream `tools` target enables ENABLE_QUERY_FLAT_VERTICES. It emits an
# Emscripten ES-module-shaped wrapper plus its WASM sidecar. The tools output
# defines `Rive`, but unlike Rive's release finalization path it does not add
# an actual ES module export. We intentionally skip finalize_glue.py because
# it rejects the tools/debug output; append the one export we need instead.
OUT_DIR=build/rive-rider/bin/debug ./build_wasm.sh tools

mkdir -p "$OUT"
cp build/rive-rider/bin/debug/canvas_advanced.mjs "$OUT/canvas_advanced.mjs"
printf '\nexport default Rive;\n' >> "$OUT/canvas_advanced.mjs"
cp build/rive-rider/bin/debug/canvas_advanced.wasm "$OUT/rive.wasm"

cat > "$OUT/build-info.json" <<EOF
{
  "kind": "rive-rider-custom-tools",
  "riveWasmCommit": "$RIVE_WASM_COMMIT",
  "features": [
    "debugObjectCount",
    "debugObjectInfo",
    "debugPathVertexCount",
    "debugPathVertexInfo",
    "debugSetPathVertexXY",
    "flattenPath"
  ]
}
EOF

echo "Custom Rive tools runtime written to $OUT"
ls -lh "$OUT"
