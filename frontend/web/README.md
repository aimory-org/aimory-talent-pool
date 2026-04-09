# Frontend — Talent Pool Dashboard

A React + TypeScript single-page application for browsing, searching, and managing talent profiles. Users authenticate via Microsoft Entra ID (federated through AWS Cognito) and interact with the talent database through a REST API.

## Folder Structure

```
frontend/web/
├── public/                    # Static assets (favicon, etc.)
├── src/
│   ├── assets/               # Images, icons
│   ├── components/
│   │   ├── TalentDashboard/  # Main dashboard feature
│   │   │   ├── TalentDashboard.tsx    # Table view with search/filter
│   │   │   ├── ProfileDetailPanel.tsx # Side panel for selected profile
│   │   │   ├── components/            # Sub-components (badges, filters)
│   │   │   ├── constants.ts           # Column definitions, defaults
│   │   │   └── types.ts               # Dashboard-specific types
│   │   └── ui/               # Reusable UI primitives (shadcn/ui)
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── table.tsx
│   │       └── ...
│   ├── data/
│   │   └── mockTalent.ts     # Development mock data
│   ├── hooks/
│   │   ├── useTalents.ts     # Talent CRUD operations
│   │   └── useLookups.ts     # Autocomplete suggestions
│   ├── lib/
│   │   ├── api.ts            # API client (authenticated fetch)
│   │   ├── auth.ts           # Cognito/Amplify configuration
│   │   └── utils.ts          # Utility functions (cn, etc.)
│   ├── types/
│   │   └── talent.ts         # TypeScript types matching DynamoDB schema
│   ├── App.tsx               # Root component with auth flow
│   ├── main.tsx              # React entry point
│   └── index.css             # Tailwind imports + global styles
├── .env.example              # Environment variable template
├── components.json           # shadcn/ui configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite bundler configuration
└── package.json              # Dependencies and scripts
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool and dev server |
| **Tailwind CSS v4** | Utility-first styling |
| **Radix UI** | Accessible UI primitives |
| **shadcn/ui** | Pre-built component library |
| **AWS Amplify** | Cognito authentication |
| **Lucide React** | Icon library |

## Prerequisites

- **Node.js 22+** (for dev container, 20+ works locally)
- **Deployed Infrastructure** — The API and Cognito must be deployed first. See [infra/README.md](../../infra/README.md).
- **Environment Variables** — Copy from Terraform outputs (see below)

## Configuration

### Environment Variables

Create `.env` (or `.env.local`) from the template:

```bash
cp .env.example .env
```

Get values from Terraform (in `infra/envs/dev`):

```bash
# Get all values at once
terraform output cognito_frontend_config

# Or individually
terraform output cognito_user_pool_id    # → VITE_COGNITO_USER_POOL_ID
terraform output cognito_client_id       # → VITE_COGNITO_CLIENT_ID  
terraform output cognito_domain          # → VITE_COGNITO_DOMAIN
terraform output api_endpoint            # → VITE_API_ENDPOINT
```

Fill in your `.env`:

```bash
# AWS Cognito Configuration (required)
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=aimory-talent-pool-dev-auth.auth.us-east-1.amazoncognito.com
VITE_AWS_REGION=us-east-1

# OAuth Redirect (optional - defaults to window.location.origin)
VITE_COGNITO_REDIRECT_URI=http://localhost:5173

# API Gateway endpoint (required for data)
VITE_API_ENDPOINT=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com

# Email domain restriction (optional)
# Comma-separated list of allowed email suffixes
# Leave empty to allow all authenticated users
VITE_ALLOWED_EMAIL_SUFFIXES=@aimory.com
```

> ⚠️ **Note:** The `VITE_` prefix is required for Vite to expose variables to the client bundle.

## Development

### Start Dev Server

```bash
npm install    # First time only
npm run dev    # Starts at http://localhost:5173
```

Hot module replacement (HMR) is enabled — changes appear instantly without page reload.

### Authentication Flow

1. User clicks "Sign in with Microsoft"
2. Redirects to Cognito Hosted UI → Microsoft login
3. Returns with OAuth code to `http://localhost:5173`
4. Amplify exchanges code for tokens
5. JWT token included in all API requests

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build production bundle to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## Key Components

### TalentDashboard

The main feature component displaying a searchable, filterable table of talent profiles.

**Features:**
- Full-text search powered by OpenSearch (prefix matching on name, fuzzy matching on summary with edit distance 1)
- Search result highlighting — matched terms shown with yellow `<mark>` tags
- Filter by status, talent bucket, category, clearance level, location, skills, certifications
- Sortable columns
- Click row to open detail panel
- Update candidate status inline

**Location:** [src/components/TalentDashboard/](src/components/TalentDashboard/)

### ProfileDetailPanel

Slide-out panel showing full profile details for a selected candidate.

**Features:**
- Contact information with clickable links
- Skills with evidence tooltips
- Work history
- Download original resume button

### UI Components (shadcn/ui)

Pre-styled, accessible components in `src/components/ui/`:
- `Button`, `Card`, `Input`, `Label`
- `Select` (dropdown)
- `Table` (data grid)
- `Badge` (status indicators)

Add more from [shadcn/ui](https://ui.shadcn.com/):
```bash
npx shadcn@latest add dialog
```

## API Integration

### Hooks

| Hook | Purpose |
|------|---------|
| `useTalents(filters)` | Fetch filtered talent list, update status |
| `useLookups()` | Fetch autocomplete suggestions for skills/certs |

### API Client

All requests go through `src/lib/api.ts` which:
1. Fetches the current Cognito session
2. Extracts the ID token
3. Adds `Authorization: Bearer <token>` header
4. Handles errors consistently

### Endpoints Used

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/talents` | List/search profiles (OpenSearch-backed; supports prefix search, fuzzy matching, and multi-dimension filters with highlight fragments) |
| GET | `/talents/{pk}` | Get single profile |
| PATCH | `/talents/{pk}` | Update profile fields |
| DELETE | `/talents/{pk}` | Remove profile |
| GET | `/lookups` | Get skill/cert suggestions |
| GET | `/resume-url/{pk}` | Get presigned resume download URL |

## Production Build

```bash
npm run build
```

Outputs optimized bundle to `dist/`. Deploy to the S3 bucket provisioned by Terraform:

```bash
# From infra/envs/dev
aws s3 sync ../../frontend/web/dist s3://$(terraform output -raw frontend_bucket_name) --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw frontend_cloudfront_distribution_id) \
  --paths "/*"
```

## Adding New Features

### New Component

1. Create folder in `src/components/YourFeature/`
2. Add `YourFeature.tsx`, `index.ts`, and any sub-components
3. Export from `index.ts`

### New API Endpoint

1. Add function to `src/lib/api.ts`:
   ```typescript
   export async function yourFunction(params: YourParams): Promise<YourResponse> {
     return apiFetch<YourResponse>(`/your-endpoint?${new URLSearchParams(params)}`);
   }
   ```

2. Create hook in `src/hooks/useYourData.ts` if needed

### New UI Component

```bash
npx shadcn@latest add [component-name]
```

Or create manually in `src/components/ui/`.

## Troubleshooting

### "Missing Cognito configuration" error on start

Ensure `.env` exists with all `VITE_COGNITO_*` variables set.

### Sign-in redirects but returns to login page

1. Check browser console for errors
2. Verify `VITE_COGNITO_REDIRECT_URI` matches what's configured in Cognito callback URLs
3. Ensure the Cognito domain is correct

### API calls return 401 Unauthorized

1. Sign out and sign back in (token may be expired)
2. Verify `VITE_API_ENDPOINT` is correct
3. Check that Cognito client ID matches the API authorizer

### CORS errors

The API Gateway is configured to allow the CloudFront origin. For localhost:
1. Ensure `http://localhost:5173` is in Cognito callback URLs
2. API Gateway should allow `*` origin in dev (check Terraform config)

### Styling issues after dependency update

```bash
rm -rf node_modules package-lock.json
npm install
```
