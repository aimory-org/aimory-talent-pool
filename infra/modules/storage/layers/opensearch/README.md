# opensearch Lambda layer

Provides `opensearch-py` for the DynamoDB → OpenSearch sync Lambda.

The `python/` folder is gitignored and must be built before `terraform apply`.
Use the top-level build script — it builds this layer alongside all other
required artefacts in one go:

```bash
# from the infra/ directory
./build.sh            # Docker (recommended)
./build.sh --no-docker  # native python3.12
```

```powershell
# Windows
.\build.ps1           # Docker
.\build.ps1 -NoDocker # native python 3.12
```

Do not commit the `python/` folder.
