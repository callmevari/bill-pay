# Bill Pay API

NestJS + Prisma + PostgreSQL accounts payable backend. Implements vendors, bills, approvals, payments, bulk operations, the activity log, and CSV export.

## Quick setup

From a clean clone (at the repo root):

```bash
docker compose up -d postgres            # start Postgres
pnpm install                             # install workspace deps
pnpm --filter backend exec prisma migrate deploy  # apply schema
pnpm --filter backend exec prisma db seed         # load realistic data
pnpm --filter backend dev                # http://localhost:3001
```

The API listens on `http://localhost:3001/api/v1`. Swagger UI is at `http://localhost:3001/docs`.

## Configuration

`backend/.env.example` documents every variable. Copy to `.env` for local dev:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (uses the `public` schema for dev) | `postgresql://postgres:postgres@localhost:5432/billpay?schema=public` |
| `PORT` | HTTP port the API listens on | `3001` |
| `FRONTEND_ORIGIN` | CORS allow-list for the frontend dev server | `http://localhost:3000` |

`backend/.env.test` mirrors the same connection but pins `schema=test_e2e` so e2e tests run against an isolated schema in the same container — dev data in `public` is never touched.

## Scripts

All run from the repo root with `pnpm --filter backend <script>`, or from `backend/` directly.

| Script | What it does |
|---|---|
| `dev` | `nest start --watch` — local dev with HMR |
| `build` | `nest build` — emit `dist/` |
| `start:prod` | `node dist/main` — run the compiled output |
| `lint` | ESLint with autofix |
| `test` | Jest unit suite (mocked Prisma) |
| `test:e2e` | Jest e2e suite (real Postgres, `test_e2e` schema) |
| `test:all` | unit then e2e |
| `prisma:migrate` | `prisma migrate dev` — create/apply a new migration |
| `prisma:seed` | run `prisma/seed.ts` |
| `prisma:studio` | Prisma Studio against the dev schema |
| `prisma:studio:test` | Prisma Studio against the `test_e2e` schema |

## Auth

No real login in this MVP. Every request (except `GET /health`) requires an `x-user-id` header naming a seeded user. The seed script creates one user per role with deterministic ids — see `backend/prisma/seed-ids.ts`.

- Missing / invalid header → `401 UNAUTHENTICATED`
- Role mismatch on a `@Roles(...)` endpoint → `403 INSUFFICIENT_PERMISSIONS`

The full permission matrix lives in `docs/api-contract.md`.

## Testing

Two layers, scoped to non-overlapping jobs:

- **Unit** (`src/**/*.spec.ts`, `pnpm test`) — service-level tests with `PrismaService` mocked. Cover branching logic where the answer is in code paths: sort/where parsers, terminal-edit guards, math, bulk error translation, CSV cell escaping.
- **E2E** (`test/**/*.e2e-spec.ts`, `pnpm test:e2e`) — boot the full Nest app, hit it with supertest, real Postgres connection against the `test_e2e` schema. Covers persistence shape, transaction atomicity, role guard wired through the global pipeline, partial-failure bulk responses, and CSV content.

E2E requires Postgres up: `docker compose up -d postgres`. Jest `globalSetup` runs `prisma migrate deploy` against the `test_e2e` schema before the first test; specs reset between runs via `backend/test/helpers/db.ts`.

The full testing strategy lives in `CLAUDE.md → Testing` and `docs/backend.md → Testing strategy`.

## HTTP testing (Bruno)

The Bruno collection in `backend/bruno/` covers every endpoint with seed-aware default values. Open the collection in [Bruno](https://www.usebruno.com/), select one of the environments under `bruno/environments/`, and you can drive the API end-to-end:

| Environment | Stage | Role |
|---|---|---|
| `local-admin` / `local-approver` / `local-viewer` | `localhost:3001` | Admin / Approver / Viewer |
| `prod-admin` / `prod-approver` / `prod-viewer` | hosted (placeholder URL) | Admin / Approver / Viewer |

The stage controls `baseUrl`; the role controls the `x-user-id` set at the collection level. Seed user ids are deterministic (`backend/prisma/seed-ids.ts`), so the same role selector works against any stage that ran the canonical seed.

Suggested flow for a smoke test: `vendors > List vendors` → `bills > Create bill` → `bills > lifecycle > Submit for approval` → switch env to `local-approver` → `bills > lifecycle > Approve` → switch back to `local-admin` → `payments > lifecycle > Schedule` → `payments > lifecycle > Mark as paid`.

## Production image

```bash
docker build -f backend/Dockerfile -t billpay-api .
docker run --rm -p 3001:3001 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/billpay?schema=public" \
  billpay-api
```

The image is a multi-stage build (`deps → build → runner`). The runner stage runs `prisma migrate deploy` before `node dist/main.js`, so an empty database is migrated on first boot. The seed script is intentionally not part of the entrypoint — production data is not demo data.

## Layout

```
backend/
├── bruno/                # HTTP test collection (one folder per resource)
├── prisma/
│   ├── schema.prisma     # single source of truth for the data model
│   ├── migrations/       # generated, do not edit
│   ├── seed.ts           # realistic seed (3 users, ~10 vendors, ~30 bills)
│   └── seed-ids.ts       # deterministic ids referenced by Bruno
├── src/
│   ├── activity/         # polymorphic ActivityLog read service
│   ├── auth/             # current-user + roles guards, decorators
│   ├── bills/            # bills CRUD, lifecycle, line items, bulk
│   ├── common/           # shared DTOs, exception filter, bulk runner
│   ├── exports/          # CSV export
│   ├── health/           # GET /health
│   ├── payments/         # payments CRUD, lifecycle, bulk
│   ├── prisma/           # PrismaService (Nest DI wrapper)
│   ├── vendors/          # vendors CRUD with delete guard
│   ├── app.module.ts
│   └── main.ts
└── test/
    ├── helpers/          # createTestApp + resetDatabase/seedMinimalData
    └── *.e2e-spec.ts
```

For the live API surface see `docs/api-contract.md`. For backend technical decisions and rationale, `docs/backend.md`.
