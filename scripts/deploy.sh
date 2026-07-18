#!/bin/bash
# TiendaMax Deploy Script
set -e
echo "🔧 Building CSS..."
python3 scripts/build_css.py
echo "🔧 Minifying JS..."
python3 scripts/minify_js.py
echo "🔧 Building JS..."
python3 scripts/build_js_bundle.py
echo "🔧 Bumping versions..."
python3 scripts/bump_versions.py
echo "✅ Deploy ready! All assets rebuilt and versioned."
