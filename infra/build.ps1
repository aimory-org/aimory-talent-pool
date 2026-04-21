# =============================================================================
# build.ps1 — Install Lambda layer packages required before terraform apply.
#
# What this does:
#   1. Installs Python packages for the pdfminer Lambda layer
#   2. Installs Python packages for the opensearch Lambda layer
#
# Usage:
#   .\build.ps1                    # Docker (recommended — matches Lambda runtime)
#   .\build.ps1 -NoDocker          # Native Python (must be 3.12)
#   .\build.ps1 -PythonVersion 3.11
# =============================================================================
param(
    [string]$PythonVersion = "3.12",
    [switch]$NoDocker
)

$ErrorActionPreference = "Stop"

$InfraDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Build-Layer {
    param([string]$Name, [string]$LayerDir)

    Write-Host "==> Building $Name layer"
    $PythonDir = Join-Path $LayerDir "python"
    if (Test-Path $PythonDir) { Remove-Item -Recurse -Force $PythonDir }
    New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null

    if ($NoDocker) {
        python -m pip install -r (Join-Path $LayerDir "requirements.txt") -t $PythonDir --quiet
    } else {
        $LayerAbs = (Resolve-Path $LayerDir).Path
        docker run --rm `
            -v "${LayerAbs}:/layer" `
            "python:${PythonVersion}-slim" `
            bash -lc "python -m pip install -r /layer/requirements.txt -t /layer/python --quiet"
    }
    Write-Host "    done -> $PythonDir"
}

# ── 1. pdfminer layer ─────────────────────────────────────────────────────────────────
Build-Layer "pdfminer" (Join-Path $InfraDir "modules\document_pipeline\layers\pdfminer")

# ── 2. opensearch layer ────────────────────────────────────────────────────────────
Build-Layer "opensearch" (Join-Path $InfraDir "modules\storage\layers\opensearch")

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Build complete. Next steps:"
Write-Host "  cd $InfraDir\envs\dev"
Write-Host "  terraform init"
Write-Host "  terraform plan"
Write-Host "  terraform apply"
