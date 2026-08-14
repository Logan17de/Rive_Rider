#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.rive-src"
OUT="$ROOT/runtime"
PIN="79c696a6cae99e936fc31b0e9778a01850ca8245"

if [ ! -d "$SRC/.git" ]; then
  git clone --recursive https://github.com/rive-app/rive-wasm.git "$SRC"
fi
cd "$SRC"
git fetch origin
git checkout "$PIN"
git submodule update --init --recursive
cd "$ROOT"
python3 scripts/patch-rive-tools.py
cd "$SRC/wasm"
chmod +x build_wasm.sh get_emcc.sh
./build_wasm.sh tools
mkdir -p "$OUT"
find "$SRC" -type f \( -name 'canvas_advanced.mjs' -o -name 'canvas_advanced.wasm' \) -exec cp {} "$OUT/" \;
ls -lah "$OUT"
test -f "$OUT/canvas_advanced.mjs"
test -f "$OUT/canvas_advanced.wasm"
echo "Custom Rive runtime ready in $OUT"
