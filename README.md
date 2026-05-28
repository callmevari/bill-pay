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
