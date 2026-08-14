#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="$ROOT/.rive-wasm"
OUT="$ROOT/vendor/rive-tools"
# Pin the exact upstream source used by the stock JS wrapper version tested in deep.js.
RIVE_WASM_COMMIT="79c696a6cae99e936fc31b0e9778a01850ca8245"

rm -rf "$CHECKOUT"
git config --global url."https://github.com/".insteadOf git@github.com:
git clone https://github.com/rive-app/rive-wasm.git "$CHECKOUT"
git -C "$CHECKOUT" checkout "$RIVE_WASM_COMMIT"
git -C "$CHECKOUT" submodule update --init --recursive

python3 "$ROOT/tools/patch_rive.py"

cd "$CHECKOUT/wasm"
rm -rf build/rive-rider
# Build Rive's tools target so ENABLE_QUERY_FLAT_VERTICES is enabled. This
# branch intentionally keeps only the WASM sidecar; deep.js uses the official
# stock @rive-app/canvas-advanced JavaScript wrapper and locateFile().
OUT_DIR=build/rive-rider/bin/debug ./build_wasm.sh tools

mkdir -p "$OUT"
rm -f "$OUT/canvas_advanced.mjs"
cp build/rive-rider/bin/debug/canvas_advanced.wasm "$OUT/rive.wasm"

cat > "$OUT/build-info.json" <<EOF
{
  "kind": "stock-js-custom-wasm",
  "stockJsVersion": "2.39.2",
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

echo "Custom WASM written to $OUT (stock JS wrapper is not rebuilt)."
ls -lh "$OUT"
