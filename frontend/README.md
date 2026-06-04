# Bill Pay Frontend

Next.js App Router + React 19 + Tailwind v4 + shadcn/ui workspace for the Bill Pay take-home. Wires a typed API client, role context, and `useCan()` helper around the NestJS backend documented in `docs/api-contract.md`.

## Quick setup

From a clean clone (at the repo root):

```bash
pnpm install
pnpm --filter frontend dev
```

The dev server listens on `http://localhost:3000`. Point it at a running backend via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001/api/v1`). To launch the backend, see `backend/README.md`.

## Configuration

`frontend/.env.example` documents every variable. Copy to `.env.local` for local overrides.

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Bill Pay API base URL the browser hits. Inlined at build time. | `http://localhost:3001/api/v1` |

Anything `NEXT_PUBLIC_*` ships to the browser, so never put secrets there.

## Scripts

All run from the repo root with `pnpm --filter frontend <script>`, or from `frontend/` directly.

| Script | What it does |
|---|---|
| `dev` | `next dev` on port 3000 |
| `build` | `next build` — emits `.next/` including the standalone output |
| `start` | `next start` on port 3000 (serves the `build` output) |
| `lint` | ESLint via flat config (`next/core-web-vitals`, `next/typescript`, strict no-any) |
| `typecheck` | `tsc --noEmit` against `tsconfig.json` (strict + `noUncheckedIndexedAccess`) |

## Acting as

The MVP has no real login. Three seeded users (Admin, Approver, Viewer — ids in `src/lib/seed-users.ts`, mirroring `backend/prisma/seed-ids.ts`) drive every request. The top-bar **Acting as** switcher (Zustand store, persisted in `localStorage` under `bill-pay.active-user`) sets the active user; the API client reads it through a module-level getter and attaches `x-user-id` to every request.

Switching role refetches every query that depends on the active user id (see `health-card.tsx` for the wiring pattern). A bad / unknown cuid surfaces as a `401 UNAUTHENTICATED` envelope rendered through the standard error state — proves the header is on the wire, not the network.

## Dark mode

`next-themes` drives the theme (`class` strategy on `<html>`, `system` default, persisted in `localStorage`). The toggle in the top bar flips between `light` and `dark`; the preference survives reloads.

## State primitives

Every fetch handles loading / empty / error / 403 explicitly via the components in `src/components/states/`:

- `Loading` — skeletons sized for a generic list row.
- `Empty` — illustrated empty card with an optional CTA.
- `ErrorState` — renders an `ApiError` envelope (code + message) with a retry handler.
- `Forbidden` — fixed copy `Your role cannot perform this action.` (per `CLAUDE.md → Frontend rules`).

## Production image

```bash
docker build -f frontend/Dockerfile -t billpay-web .
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL="http://localhost:3001/api/v1" \
  billpay-web
```

Multi-stage build (`deps → build → runner`). `next.config.ts` sets `output: 'standalone'`, so the runner stage ships only the Next.js standalone server, `.next/static`, and `public/` — no full `node_modules` copy.

`NEXT_PUBLIC_API_BASE_URL` is inlined at build time. Override via `--build-arg NEXT_PUBLIC_API_BASE_URL=…` when baking an image for a non-default backend.

## Layout

```
frontend/
├── src/
│   ├── app/                  # App Router routes, root layout, home page
│   ├── components/
│   │   ├── layout/           # AppShell, Sidebar, Topbar, RoleSwitcher, ThemeToggle
│   │   ├── providers/        # Query / Theme / Role / TooltipProvider stack
│   │   ├── states/           # Loading, Empty, ErrorState, Forbidden
│   │   └── ui/               # shadcn primitives (button, input, dialog, table, …)
│   ├── hooks/                # useCan
│   ├── lib/                  # api client, roles matrix, seed-users, utils
│   └── stores/               # Zustand role store (localStorage-persisted)
├── public/
├── Dockerfile
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
└── tsconfig.json
```

For the live API surface see `docs/api-contract.md`. For the project-wide rules see `CLAUDE.md`. For the frontend playbook (conventions, component shape, commit examples) see `.claude/agents/frontend-engineer.md`.
