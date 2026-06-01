# Bill Pay

An accounts payable workspace inspired by Ramp Bill Pay. Manage vendors, create and approve bills, schedule payments, and audit every state change.

## Status

Project is under active development. Setup instructions and a full feature walkthrough will land alongside the first complete vertical slice.

## Repository

- `backend/` — NestJS API, Prisma, PostgreSQL
- `frontend/` — Next.js App Router, React, TypeScript, Tailwind, shadcn/ui
- `docs/` — product scope, API contract, implementation plan, backend decisions log
- `assignment/` — source brief

## Requirements

- Node.js 20 LTS or newer
- pnpm (enable with `corepack enable && corepack prepare pnpm@latest --activate`)
- Docker (for local PostgreSQL via `docker-compose`)

## Workspace

This is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with two packages, `backend` and `frontend` (declared in `pnpm-workspace.yaml`). Use pnpm, not npm or yarn — pnpm is pinned via corepack and the lockfile is `pnpm-lock.yaml`.

```bash
pnpm install                          # install all workspaces, from the repo root
pnpm --filter backend <script>        # run a package.json script in one package
pnpm --filter backend add <pkg>       # add a dependency to one package
```

`pnpm --filter backend dev` and `cd backend && pnpm dev` are equivalent. Packages declaring postinstall build scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml` (pnpm blocks them by default); Prisma and NestJS are already allowed.

## Testing

Two layers:

- **Unit tests** — fast, no I/O, mock `PrismaService`. Cover branching logic where the value is in code paths (sort/where parsing, terminal-edit guard, math). Run with `pnpm --filter backend test`.
- **End-to-end tests** — boot the full Nest app, hit it with supertest, and use a real Postgres connection against an isolated `test_e2e` schema in the same Postgres container as dev. The `public` schema (dev data) is never touched. Run with `pnpm --filter backend test:e2e`. Requires Postgres to be up (`docker compose up -d postgres`). The Jest `globalSetup` loads `backend/.env.test` and applies `prisma migrate deploy` to the test schema before the first test.

E2E coverage is deliberately narrow: we focus on contract-shape behaviour that unit tests with mocked Prisma can't reach — vendor FK violations translated to `404 VENDOR_NOT_FOUND`, terminal-edit guards, decimal-overflow validation, delete guards, and role enforcement. See `docs/backend.md` → Testing strategy for the full rationale.

## Backend

See `backend/README.md` for the full setup, scripts, Bruno usage, and Docker image notes. Quick path:

```bash
docker compose up -d postgres
pnpm install
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma db seed
pnpm backend:dev                    # http://localhost:3001/api/v1
```

Swagger renders at `http://localhost:3001/docs`; the permission matrix lives in `docs/api-contract.md`.

## Frontend

Next.js App Router workspace under `frontend/`. Full notes in `frontend/README.md`. Quick path:

```bash
pnpm install
pnpm frontend:dev                   # http://localhost:3000
```

Point at the backend with `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3001/api/v1`). The top-bar **Acting as** switcher swaps the active seeded user (Admin / Approver / Viewer) and the API client attaches the matching `x-user-id` header to every request; the choice persists in `localStorage`. A dark-mode toggle lives next to it and also persists across reloads.

Production image:

```bash
docker build -f frontend/Dockerfile -t billpay-web .
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL="http://localhost:3001/api/v1" \
  billpay-web
```
