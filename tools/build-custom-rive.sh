#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="$ROOT/.rive-wasm"
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

# The clone above is fresh, so this remains the clean/reproducible CI path.
# The shared helper performs the same build/copy/finalization steps used by
# local incremental rebuilds.
bash "$ROOT/tools/rebuild-local.sh"
