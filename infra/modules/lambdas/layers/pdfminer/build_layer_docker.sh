#!/usr/bin/env bash
set -euo pipefail

PYTHON_VERSION=${1:-3.12}

LAYER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$LAYER_ROOT/python"

rm -rf "$PYTHON_DIR"
mkdir -p "$PYTHON_DIR"

docker run --rm \
  -v "$LAYER_ROOT:/layer" \
  "python:${PYTHON_VERSION}-slim" \
  bash -lc "python -m pip install -r /layer/requirements.txt -t /layer/python"
