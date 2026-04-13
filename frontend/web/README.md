# Frontend — Talent Pool Dashboard

React + TypeScript SPA for browsing, searching, and managing talent profiles. Authenticates via Microsoft Entra ID (federated through AWS Cognito) and interacts with the backend through a JWT-authenticated REST API.

## Folder Structure

```
frontend/web/src/
├── components/
│   ├── HowItWorks/          # Page shell with User Guide / Tech Reference tab switcher
│   ├── UserGuide/           # End-user guide content (recruiters)
│   ├── TechReference/       # Developer & architecture reference content
│   ├── TalentDashboard/     # Main dashboard feature
│   │   ├── TalentDashboard.tsx    # Table view with search + filters
│   │   ├── ProfileDetailPanel.tsx # Slide-out panel for editing a profile
│   │   ├── components/            # StatsCards, FiltersPanel, TalentTable, badges
│   │   ├── constants.ts           # Status/clearance color maps
│   │   └── types.ts               # Filters, SortField, SortDirection types
│   └── ui/                  # Reusable primitives (Button, Input, Select, etc.)
├── hooks/
│   ├── useAuth.ts           # Amplify auth state + Hub listener
│   ├── useTalents.ts        # Talent list fetching with filter/sort
│   └── useLookups.ts        # Dropdown data fetching (skills, certs, cities)
├── lib/
│   ├── api.ts               # Authenticated API client (all endpoints)
│   ├── auth.ts              # Amplify + Cognito configuration
│   ├── theme.tsx            # ThemeProvider + useTheme hook (dark/light/system)
│   └── utils.ts             # cn() utility (clsx + tailwind-merge)
├── types/
│   └── talent.ts            # TalentProfile, CandidateStatus, enums, constants
├── data/
│   └── mockTalent.ts        # Development mock data
├── App.tsx                  # Root with auth state machine + route layout
└── main.tsx                 # React entry point, Amplify init, theme bootstrap
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool + HMR dev server |
| Tailwind CSS v4 | Utility-first styling |
| shadcn/ui | Pre-built component primitives |
| AWS Amplify v6 | Cognito OAuth token management |
| Lucide React | Icon library |

## Prerequisites

- **Node.js 22+**
- **Deployed infrastructure** — Cognito, API Gateway, and S3 must exist first. See [infra/README.md](../../infra/README.md).

## Configuration

Create `.env` from the template:

```bash
cp .env.example .env
```

Populate values from Terraform:

```bash
cd infra/envs/dev
terraform output cognito_frontend_config
```

```env
# Required
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=aimory-talent-pool-dev.auth.us-east-1.amazoncognito.com
VITE_API_ENDPOINT=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com

# Optional
VITE_COGNITO_REDIRECT_URI=http://localhost:5173   # defaults to window.location.origin
VITE_ALLOWED_EMAIL_SUFFIXES=@aimory.com           # leave empty to allow all authenticated users
```

> All variables must be prefixed with `VITE_` for Vite to expose them to the client bundle.

## Development

```bash
npm install     # first time only
npm run dev     # starts at http://localhost:5173
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production bundle → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest |

## Key Concepts

### Authentication Flow

1. User clicks "Sign in with Microsoft"
2. Amplify redirects to Cognito Hosted UI → Microsoft login
3. Cognito issues JWT tokens, redirects back with `?code=`
4. Amplify exchanges code for tokens (PKCE); redirects cleaned from URL
5. `useAuth` hook stores user info; `api.ts` attaches `Authorization: Bearer <id_token>` to every request

### Component Architecture

| Component | Responsibility |
|-----------|---------------|
| `App.tsx` | Auth state machine: loading → login / access denied / authenticated routes |
| `TalentDashboard` | Orchestrates filters, sort, search input, and profile selection |
| `FiltersPanel` | All filter dropdowns and multi-select chips (skills, certs, tags) |
| `TalentTable` | Sortable table rows with OpenSearch highlight rendering |
| `ProfileDetailPanel` | View + edit mode for a single candidate profile |
| `HowItWorks` | Tab switcher routing between `UserGuide` and `TechReference` |
| `UserGuide` | Plain-language guide for recruiters |
| `TechReference` | Architecture, data model, API reference for developers |

### Search & Filtering

All filtering is server-side via OpenSearch. The search input is decoupled from the API call — the user must press Enter or click Search to commit a query (avoids hammering the API on each keystroke). Client-side sorting is applied to the returned result set.

### Adding UI Components

```bash
npx shadcn@latest add dialog
```

Components are added to `src/components/ui/`.

## Deployment

```bash
npm run build

AWS_DEFAULT_REGION=us-east-1 \
  aws s3 sync dist/ s3://<frontend-bucket> --delete

aws cloudfront create-invalidation \
  --distribution-id <id> \
  --paths "/*"
```

Get `<frontend-bucket>` and `<id>` from:

```bash
cd infra/envs/dev
terraform output frontend_bucket_name
terraform output frontend_cloudfront_distribution_id
```
