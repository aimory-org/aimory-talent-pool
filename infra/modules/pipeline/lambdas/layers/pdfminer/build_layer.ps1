Param(
    [string]$PythonExe = "python"
)

$LayerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonDir = Join-Path $LayerRoot "python"

if (Test-Path $PythonDir) {
    Remove-Item -Recurse -Force $PythonDir
}

New-Item -ItemType Directory -Path $PythonDir | Out-Null

& $PythonExe -m pip install -r (Join-Path $LayerRoot "requirements.txt") -t $PythonDir
