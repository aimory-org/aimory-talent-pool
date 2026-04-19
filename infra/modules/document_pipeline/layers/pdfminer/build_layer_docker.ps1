Param(
    [string]$PythonVersion = "3.12"
)

$LayerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonDir = Join-Path $LayerRoot "python"

if (Test-Path $PythonDir) {
    Remove-Item -Recurse -Force $PythonDir
}

$repoRoot = Resolve-Path (Join-Path $LayerRoot "..\..\..\..")
$layerRel = Resolve-Path $LayerRoot

$reqPath = Join-Path $LayerRoot "requirements.txt"

$dockerCmd = @(
    "run", "--rm",
    "-v", "$($layerRel):/layer",
    "python:$PythonVersion-slim",
    "bash", "-lc",
    "python -m pip install -r /layer/requirements.txt -t /layer/python"
)

& docker @dockerCmd
