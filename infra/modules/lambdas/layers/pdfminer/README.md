Build the Lambda layer locally before running Terraform:

- PowerShell (Windows):
  - .\build_layer.ps1 -PythonExe "C:\\Users\\chris\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
- Bash (macOS/Linux):
  - ./build_layer.sh python3

This creates a local `python/` folder for Terraform to zip as a layer. Do not commit the `python/` folder.
