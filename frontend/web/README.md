# Aimory Talent Pool Frontend

A Vite + React shell that authenticates users with Microsoft Entra ID (Azure AD) via MSAL, then surfaces resume-pipeline insights. The UI ships with a modern gradient theme meant to be deployed as a static site on S3 + CloudFront.

## Prerequisites

- Azure subscription access to create an **App registration** in Entra ID
- AWS account for S3/CloudFront (Terraform module lives under `infra/modules/frontend_site`)
- Node 20+

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and populate the values:

```
VITE_AZURE_CLIENT_ID=<app-registration-client-id>
VITE_AZURE_TENANT_ID=<directory-tenant-id>
VITE_AZURE_REDIRECT_URI=http://localhost:5173
VITE_ALLOWED_EMAIL_SUFFIXES=@contoso.com,@subsidiary.com
```

- `VITE_AZURE_REDIRECT_URI` must match a SPA redirect URI inside the Azure app registration (add the CloudFront URL once deployed).
- `VITE_ALLOWED_EMAIL_SUFFIXES` is optional; when present we enforce that the signed-in UPN ends with one of the suffixes (e.g., `@aimory.com`). Azure still limits logins to the tenant you select.

## Local development

```bash
cd frontend/web
npm install
npm run dev
```

The dev server runs at http://localhost:5173 with Hot Module Replacement. Sign-in opens a popup pointing to login.microsoftonline.com.

## Production build

```
npm run build
```

Outputs land in `frontend/web/dist`. Upload that folder to the S3 bucket provisioned by Terraform (see `infra/modules/frontend_site`). CloudFront serves the SPA with `/index.html` fallbacks for 403/404 responses, making client-side routing safe.

## Terraform integration

1. Configure `frontend_domain_aliases` and `frontend_certificate_arn` in the desired `infra/envs/<env>/terraform.tfvars` if you plan to use a custom domain.
2. Deploy with the existing Terraform workflows (`terraform init/plan/apply` inside the matching environment folder).
3. After the CloudFront distribution finishes deploying, add its domain to the Azure redirect URIs and redeploy the frontend bundle.

## Next steps

- Wire the placeholder metrics to API Gateway / Lambda data once endpoints are available.
- Add CI/CD to push the `dist/` directory into the site bucket automatically (e.g., GitHub Actions + `aws s3 sync`).
