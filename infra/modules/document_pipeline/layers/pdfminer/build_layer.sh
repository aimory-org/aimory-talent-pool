#!/usr/bin/env bash
set -euo pipefail

PYTHON_EXE=${1:-python3}

LAYER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$LAYER_ROOT/python"

rm -rf "$PYTHON_DIR"
mkdir -p "$PYTHON_DIR"

"$PYTHON_EXE" -m pip install -r "$LAYER_ROOT/requirements.txt" -t "$PYTHON_DIR"
