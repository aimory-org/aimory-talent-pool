Build the Lambda layer locally before running Terraform:

- PowerShell (Windows):
  - .\build_layer.ps1 -PythonExe "C:\\Users\\chris\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
- Bash (macOS/Linux):
  - ./build_layer.sh python3
- Docker (Linux-compatible build, recommended on Windows/macOS):
  - .\build_layer_docker.ps1 -PythonVersion "3.12"
  - ./build_layer_docker.sh 3.12

This creates a local `python/` folder for Terraform to zip as a layer. Do not commit the `python/` folder.
