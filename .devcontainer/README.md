# Dev Container

This folder contains the development container configuration for consistent environments across all developers.

## What's Included

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22 | Frontend (React + Vite) |
| Python | 3.12 | Lambda functions |
| Terraform | 1.9 | Infrastructure as Code |
| AWS CLI | latest | AWS deployments |
| Docker | latest | Building Lambda layers |

## Getting Started

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [VS Code](https://code.visualstudio.com/) with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- AWS credentials configured locally (`~/.aws/credentials`)

### Open in Container
1. Open this repo in VS Code
2. Press `F1` → **Dev Containers: Reopen in Container**
3. Wait for the container to build and setup to complete

The setup script automatically installs:
- Frontend npm packages
- Python dev dependencies (pytest, moto, boto3, etc.)

## Daily Workflow

```bash
# Start frontend dev server
cd frontend/web
npm run dev

# Run Python tests
pytest

# Deploy infrastructure
cd infra/envs/dev
terraform init    # first time only
terraform plan
terraform apply
```

## Building Lambda Layers

Before `terraform apply`, build the pdfminer layer:

```bash
./infra/modules/pipeline/lambdas/layers/pdfminer/build_layer_docker.sh
```

This uses Docker to ensure the layer is compatible with the Lambda runtime.

## AWS Credentials

Your host machine's `~/.aws` folder is automatically mounted into the container. No additional configuration needed if you already have AWS CLI configured locally.

## Troubleshooting

**Container won't start?**
- Ensure Docker Desktop is running
- Try "Dev Containers: Rebuild Container" to start fresh

**AWS commands fail?**
- Check that `~/.aws/credentials` exists on your host machine
- Run `aws sts get-caller-identity` to verify credentials

**Layer build fails?**
- Ensure Docker-in-Docker is working: `docker ps`
- Try rebuilding the container if Docker isn't available
