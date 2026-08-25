#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="$ROOT/.rive-wasm"
OUT="$ROOT/vendor/rive-tools"
RIVE_WASM_COMMIT="79c696a6cae99e936fc31b0e9778a01850ca8245"

case "$(uname -s)" in
    MINGW*|CYGWIN*)
        echo "Rive's WASM make toolchain requires Linux or WSL; Git Bash is not sufficient." >&2
        exit 1
        ;;
esac

if [[ ! -d "$CHECKOUT/.git" ]]; then
    echo "Missing $CHECKOUT. Complete the one-time checkout setup in README.md first." >&2
    exit 1
fi

ACTUAL_COMMIT="$(git -C "$CHECKOUT" rev-parse HEAD)"
if [[ "$ACTUAL_COMMIT" != "$RIVE_WASM_COMMIT" ]]; then
    echo "Expected rive-wasm $RIVE_WASM_COMMIT, found $ACTUAL_COMMIT." >&2
    exit 1
fi

if ! grep -q 'debugSetPathVertexXY' "$CHECKOUT/wasm/src/bindings.cpp"; then
    echo "The checkout is not patched. Run: python3 tools/patch_rive.py" >&2
    exit 1
fi

cd "$CHECKOUT/wasm"
# Reuse object files in build/rive-rider; build_wasm.sh regenerates build files
# but make recompiles only sources affected by the local patch.
OUT_DIR=build/rive-rider/bin/debug ./build_wasm.sh tools

mkdir -p "$OUT"
cp build/rive-rider/bin/debug/canvas_advanced.mjs "$OUT/canvas_advanced.mjs"
if ! grep -q '^export default Rive;$' "$OUT/canvas_advanced.mjs"; then
    printf '\nexport default Rive;\n' >> "$OUT/canvas_advanced.mjs"
fi
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
    "debugParametricInfo",
    "debugSetParametricProperty",
    "flattenPath"
  ]
}
EOF

echo "Incremental Rive tools runtime written to $OUT"
ls -lh "$OUT"
