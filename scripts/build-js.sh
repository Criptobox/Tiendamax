#!/bin/bash
# TiendaMax — build script: minify .src.js → .js for 3G performance
# - Preserves ALL top-level function names (referenced by HTML onclick + other scripts)
# - Mangles local variables (smaller, safe)
# - Strips esbuild's injected "use strict" (preserves original non-strict semantics)
# Usage: bash scripts/build-js.sh
set -e
cd "$(dirname "$0")/.."

SRC_DIR="public/js/src"
ESBUILD="node_modules/.bin/esbuild"

echo "=== TiendaMax JS build (minify .src.js → .js) ==="

for src in "$SRC_DIR"/*.src.js; do
  base=$(basename "$src" .src.js)
  out="$SRC_DIR/$base.js"
  "$ESBUILD" "$src" --minify --target=es2017 --outfile="$out.tmp" 2>/dev/null
  sed '1s/^"use strict";//' "$out.tmp" > "$out"
  rm -f "$out.tmp"
  src_size=$(wc -c < "$src")
  out_size=$(wc -c < "$out")
  ratio=$(awk "BEGIN{printf \"%.0f\", ($out_size/$src_size)*100}")
  echo "  $base: ${src_size}B → ${out_size}B (${ratio}%)"
done

echo "=== Done ==="
