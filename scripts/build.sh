#!/usr/bin/env bash
# Builds NEAR-compatible (MVP-only) wasm for both contracts into res/.
#
# NEAR's VM rejects post-MVP wasm features (bulk-memory, reference-types encodings, ...).
# Stable Rust ships a precompiled std built with those features, so we rebuild std
# from source on nightly with target-cpu=mvp, then validate the output.
set -euo pipefail
cd "$(dirname "$0")/.."

export RUSTFLAGS="-C target-cpu=mvp -C target-feature=+mutable-globals -C link-arg=-s"
export CFLAGS_wasm32_unknown_unknown="-mno-bulk-memory -mno-bulk-memory-opt"

cargo +nightly build \
  -Zbuild-std=std,panic_abort \
  --target wasm32-unknown-unknown --release \
  -p ebbflow -p test-token

mkdir -p res
cp target/wasm32-unknown-unknown/release/ebbflow.wasm res/ebbflow.wasm
cp target/wasm32-unknown-unknown/release/test_token.wasm res/test_token.wasm

if command -v wasm-tools >/dev/null; then
  for f in res/ebbflow.wasm res/test_token.wasm; do
    wasm-tools validate --features mvp,mutable-global "$f"
    echo "$f: valid MVP wasm ($(stat -c%s "$f") bytes)"
  done
else
  echo "wasm-tools not found; skipping MVP validation (cargo install wasm-tools)"
fi
