# Scheduler

Multi-tenant university timetabling SaaS powered by Google OR-Tools constraint optimization.

## Architecture

- **Web App**: Next.js 14 (App Router) + React + TypeScript + Tailwind + shadcn/ui
- **Scheduling Engine**: Python + FastAPI + Google OR-Tools CP-SAT
- **Database**: PostgreSQL (Neon) with Drizzle ORM + Row-Level Security
- **Auth**: Clerk (Organizations for multi-tenancy)
- **Monorepo**: Turborepo + pnpm workspaces

## Prerequisites

Install these before getting started:

1. **Node.js 20+** — https://nodejs.org/
2. **pnpm 9+** — `npm install -g pnpm`
3. **Python 3.11+** — https://www.python.org/
4. **Docker** (optional, for engine container) — https://www.docker.com/

## External accounts needed

Create free accounts on these services:

1. **Clerk** — https://dashboard.clerk.com/ (auth + orgs)
2. **Neon** — https://console.neon.tech/ (database)
3. **Sentry** — https://sentry.io/ (error tracking, optional for dev)
4. **Upstash** — https://console.upstash.com/ (redis, optional for dev)

## Setup

### 1. Install dependencies

```bash
# Root (installs all workspaces)
pnpm install

# Python engine
cd engine
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
```

### 2. Configure environment

```bash
# Web app
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your Clerk, Neon, etc. credentials

# Engine
cp engine/.env.example engine/.env
# Edit engine/.env with your HMAC secret
```

### 3. Set up database

```bash
# Generate migration from schema
pnpm db:generate

# Run migration against Neon
pnpm db:migrate

# Apply RLS policies
psql $DATABASE_URL_UNPOOLED -f apps/web/src/lib/db/rls-setup.sql

# (Optional) Open Drizzle Studio to inspect data
pnpm db:studio
```

### 4. Configure Clerk

1. Create a Clerk application at https://dashboard.clerk.com/
2. Enable **Organizations** in Clerk Dashboard → Organization settings
3. Create custom roles: `university_admin`, `lecturer`, `student`
4. Set up webhook endpoint: `https://your-domain/api/webhooks/clerk`
5. Copy your keys to `.env.local`

## Development

```bash
# Start everything (web + engine)
# Terminal 1: Web app
pnpm dev

# Terminal 2: Engine
cd engine
source .venv/bin/activate
uvicorn src.main:app --reload --port 8000
```

- Web app: http://localhost:3000
- Engine API: http://localhost:8000
- Engine docs: http://localhost:8000/docs

## Testing

```bash
# All tests
pnpm test              # Web (Vitest)
cd engine && pytest    # Engine (pytest)

# With coverage
pnpm test:coverage
cd engine && pytest --cov=src --cov-report=html

# E2E (requires running dev server)
pnpm test:e2e
```

## Project structure

```
scheduler/
├── apps/web/           # Next.js app (Vercel)
│   ├── src/app/        # Pages & API routes
│   ├── src/lib/db/     # Drizzle schema & migrations
│   ├── src/lib/trpc/   # tRPC routers & middleware
│   └── tests/          # Vitest + Playwright
├── engine/             # Python scheduling engine (Cloud Run)
│   ├── src/solver/     # OR-Tools CP-SAT solver
│   ├── src/api/        # FastAPI routes & schemas
│   └── tests/          # pytest
├── packages/types/     # Shared TypeScript types
├── packages/config/    # Shared ESLint & TS configs
└── .github/workflows/  # CI/CD
```

## Deployment

- **Web**: Vercel (auto-deploys from `main`)
- **Engine**: Google Cloud Run (Docker container)
- **Database**: Neon (managed PostgreSQL)
