#!/usr/bin/env bash
# =============================================================================
# build.sh — Install Lambda layer packages required before terraform apply.
#
# What this does:
#   1. Installs Python packages for the pdfminer Lambda layer
#   2. Installs Python packages for the opensearch Lambda layer
#
# Both layer python/ folders are gitignored, so this script must be run once
# after every fresh clone (or when requirements change).
#
# Usage:
#   ./build.sh               # Docker (recommended — matches Lambda runtime)
#   ./build.sh --no-docker   # Native python3 (must be 3.12)
#
# CI/CD:
#   Run this script as a step before `terraform init`.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR"
PYTHON_VERSION="3.12"
USE_DOCKER=1

for arg in "$@"; do
  case "$arg" in
    --no-docker) USE_DOCKER=0 ;;
  esac
done
# ── Helper: install a layer ──────────────────────────────────────────────────
build_layer() {
  local name="$1"
  local layer_dir="$2"

  echo "==> Building $name layer"
  local python_dir="$layer_dir/python"

  # Remove existing install — use sudo if plain rm fails (Docker-owned files)
  if [ -d "$python_dir" ]; then
    rm -rf "$python_dir" 2>/dev/null || { echo "    (retrying with sudo)"; sudo rm -rf "$python_dir"; }
  fi
  mkdir -p "$python_dir"

  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm \
      -v "$layer_dir:/layer" \
      "python:${PYTHON_VERSION}-slim" \
      bash -lc "python -m pip install -r /layer/requirements.txt -t /layer/python --quiet"
  else
    python3 -m pip install \
      -r "$layer_dir/requirements.txt" \
      -t "$layer_dir/python" \
      --quiet
  fi
  echo "    done → $layer_dir/python/"
}

# ── 1. pdfminer layer ─────────────────────────────────────────────────────────────────
build_layer "pdfminer" \
  "$INFRA_DIR/modules/document_pipeline/layers/pdfminer"

# ── 2. opensearch layer ────────────────────────────────────────────────────────────
build_layer "opensearch" \
  "$INFRA_DIR/modules/storage/layers/opensearch"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "Build complete. Next steps:"
echo "  cd $INFRA_DIR/envs/dev"
echo "  terraform init"
echo "  terraform plan"
echo "  terraform apply"
