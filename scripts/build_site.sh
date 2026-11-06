#!/usr/bin/env bash
# Build the static public output for Qoder Sites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/site"

rm -rf dist
mkdir -p dist
cp index.html dist/index.html
cp -R assets dist/assets

echo "site/dist ready:"
find dist -type f | sort
