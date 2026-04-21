#!/bin/bash
# =============================================================================
# Dev Container Post-Create Setup
# =============================================================================
# This script runs automatically when the container is first created.
# It installs all dependencies needed for development.

set -e  # Exit on any error

echo "🚀 Setting up development environment..."

# -----------------------------------------------------------------------------
# Frontend (React + TypeScript)
# -----------------------------------------------------------------------------
echo "📦 Installing frontend dependencies..."
cd /workspaces/aimory-talent-pool/frontend/web
npm install

# -----------------------------------------------------------------------------
# Python (Lambda development + testing)
# -----------------------------------------------------------------------------
echo "🐍 Installing Python dev dependencies..."
cd /workspaces/aimory-talent-pool
pip install -r requirements-dev.txt --quiet

# -----------------------------------------------------------------------------
# Infrastructure — Lambda layers + .build directory
# -----------------------------------------------------------------------------
echo "🏗️  Building Lambda layers and artefacts..."
cd /workspaces/aimory-talent-pool/infra
bash build.sh

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
echo "✅ Development environment ready!"
echo ""
echo "Quick start:"
echo "  Frontend:  cd frontend/web && npm run dev"
echo "  Terraform: cd infra/envs/dev && terraform init"
echo "  Tests:     pytest"
echo ""
echo "Before terraform apply:"
echo "  cd infra/envs/dev && cp terraform.tfvars.example terraform.tfvars"
echo "  terraform init && terraform plan"
