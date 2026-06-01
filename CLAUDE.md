# CLAUDE.md

Project constitution for the Bill Pay take-home. Cross-cutting facts every agent needs. Operational detail lives in `.claude/agents/` and `docs/`.

## Repository

- `backend/` — NestJS, Prisma, PostgreSQL
- `frontend/` — Next.js App Router, React, TypeScript, Tailwind, shadcn/ui
- `docs/` — `product-scope.md`, `api-contract.md`, `implementation-plan.md`, `backend.md` (backend technical decisions log)
- `assignment/` — immutable source brief. Read first.
- `.claude/agents/` — per-role playbooks (loaded only when that agent runs)

## Goal

Ship a polished, end-to-end accounts payable MVP inspired by Ramp Bill Pay. Strong product judgment, clean UX, robust backend, clear implementation. More working features is better than fewer — but every shipped feature works end-to-end. Half-built features are worse than a smaller, polished surface.

## Deliverable

A runnable project plus a root `README.md` covering:

1. What the product does.
2. Workflows prioritized.
3. What was left out and why.
4. Setup instructions that work from a clean clone.
5. Architecture and data model decisions with tradeoffs.

If a reviewer hits a compile or runtime error following the README, the submission is rejected.

## Evaluation

Reviewers score on product taste, design/UI, UX, scope judgment, ability to grok complex workflows, simple/robust systems, raw output, implemented features. Automated validation may run on the repo — broken builds or missing scripts fail it.

## Product

Bill Pay workspace. Users (Admin / Approver / Viewer per role) can: create + edit bills with line items, manage vendors, submit for approval, approve/reject, schedule + track payments inline on bills, use the bills table with status tabs / filters / sorts / bulk actions, inspect activity history, export CSV.

Bills and payments are **separate concepts** with separate lifecycles. A payment is created when a bill is approved.

Full scope: `docs/product-scope.md`. Build sequence: `docs/implementation-plan.md`. Live API surface: `docs/api-contract.md`.

## Stack

- Node.js 20 LTS+, pnpm workspaces
- TypeScript strict on both sides; no `any`
- Backend: NestJS, Prisma 6 (pinned — Prisma 7 dropped the in-schema datasource URL; sticking with 6 for ecosystem maturity), PostgreSQL 16, class-validator, @nestjs/swagger
- Frontend: Next.js App Router, React 19, Tailwind, shadcn/ui, TanStack Table, TanStack Query
- Container: `docker-compose.yml` for one-command local setup
- HTTP testing: Bruno collection in `backend/bruno/`

Pick current stable versions. Outdated stack reads as outdated judgment.

## Wire conventions

These cross the BE↔FE↔Bruno boundary. Documented once here.

- IDs: CUID v2 (`@default(cuid(2))` in Prisma). Sort by `createdAt`, not by ID.
- Dates: ISO 8601 strings on the wire. UTC in the DB.
- Money: stringified decimal (`"1234.56"`) on the wire. `Decimal(12, 2)` in the DB.
- Enums: uppercase snake (`PENDING_APPROVAL`).
- List endpoints: `{ data: [...], meta: { page, pageSize, total, totalPages } }`.
- Single-resource endpoints: bare object.
- Errors: `{ error: { code, message, details } }`. `code` is a stable uppercase-snake string the UI branches on. Always JSON, even on 500.

## Auth

No real login. Three seeded users with distinct roles: **Admin**, **Approver**, **Viewer**. Active user injected via `x-user-id` header read by a current-user guard. Authorization enforced with `@Roles(...)` decorator + roles guard at the controller layer. Unauthorized → `403 INSUFFICIENT_PERMISSIONS`. Frontend exposes an "Acting as" switcher (localStorage-persisted) that swaps the header.

## Backend rules

- NestJS idioms. Thin controllers, services own business logic, Prisma is the persistence boundary.
- DTOs explicit and validated. One DTO per shape. Map Prisma → response DTOs in a `*.mapper.ts`; never leak Prisma types past the service.
- State transitions enforced at the service layer. Invalid → `409` with a stable code.
- Every state change writes to the append-only `ActivityLog` with `actorId`, `actorRole`, `fromStatus`, `toStatus`, `metadata`.
- Deep playbook: `.claude/agents/backend-engineer.md`.

## Frontend rules

- Next.js App Router, shadcn/ui + Tailwind for UI, TanStack Table for complex grids, TanStack Query for server state and invalidation.
- Handle loading / empty / error / 403 states for every fetch. Skeletons over spinners where it matters.
- Role context + "Acting as" switcher in the app shell. A `useCan(action)` helper hides or disables UI the role cannot use. Backend remains authoritative.
- Forms validate optimistically, but trust backend responses as the source of truth.
- Visual polish never at the expense of broken functionality.

## Subagent topology

Specialized agents live in `.claude/agents/`:

- `backend-engineer.md` — owns `backend/`, Prisma schema/migrations/seed, `docs/api-contract.md`, backend section of root README, backend services in `docker-compose.yml`.
- `frontend-engineer.md` — owns `frontend/`, frontend section of root README, frontend env. *(To be drafted when the frontend phase nears.)*
- `reviewer.md` — final audits before declaring work done; reviews both sides and triages external PR reviews dropped in `docs/pr-reviews/`.

**Cross-cutting rule**: an agent that needs a change outside its scope stops and asks the human. The human is the broker between backend and frontend. This protects the API contract from silent drift.

## Forbidden patterns

Instant red flags. None ship.

- AI-generated comments (`// This function does X`, ChatGPT-flavored prose).
- Placeholder endpoints or UI screens that don't work end-to-end.
- `any` in TypeScript.
- Silent `catch {}`.
- `console.log` in committed code (use the framework logger).
- Mock data in production code paths (demo data lives in seed scripts).
- Hardcoded secrets, credentials, or production URLs.
- Commented-out code blocks.

## Quality bar (principle)

Before any slice is "done": build/lint/typecheck/test (unit + e2e) pass on the touched side, the golden path of the touched workflow has been exercised manually, `docs/api-contract.md` matches the live surface, README setup still runs from a clean clone. Per-side commands live in the agent playbooks. The testing contract — how to design the unit/e2e suite for any new module — lives in the `## Testing` section below; the deeper recipe is in `docs/backend.md → Testing strategy`.

Additionally, before declaring a module done the engineer who owns it runs a reviewer pass on the diff — **inline** (an adversarial pass against `.claude/agents/reviewer.md`, covering boundary inputs, null on required-non-null fields, error-envelope shape on every non-happy path, and role gating) for simple CRUD modules, and **as a spawned `reviewer` subagent** for anything touching a state machine, lifecycle transitions, bulk operations, or cross-module side effects. Any BLOCKER or MAJOR finding is fixed before the PR opens; MINOR / NIT findings either land in the same PR or are called out explicitly in the PR body.

| Work type | Reviewer pass |
|---|---|
| Simple business-logic CRUD (Vendors-like) | inline |
| Lifecycle / state machine (Bills lifecycle, Approvals, Payments) | spawn `reviewer` subagent |
| Bulk / partial-failure surfaces | spawn `reviewer` subagent |
| **Test infrastructure / harness** (jest configs, e2e setup, isolation primitives, fixture helpers) | spawn `reviewer` subagent — concurrency, env override, parallel workers, and shared-state races are state-machine-equivalent and the author is the worst-placed reader |
| Cross-cutting tooling (docker-compose, prisma config, build / lint config when it changes execution semantics) | spawn `reviewer` subagent |
| Docs / config (text, simple settings without execution semantics) | inline |

## Testing

Every feature / module ships with **both** a unit suite and an e2e suite. They have non-overlapping jobs — never write the same assertion in both layers.

### Where each layer belongs

| Layer | Lives in | Runs with | What it covers | What it does NOT cover |
|---|---|---|---|---|
| **Unit** | `backend/src/**/*.spec.ts` | `pnpm --filter backend test` | Logic where the answer lives in code paths: parsers, allow-lists, guards as decisions, math, mappers (when non-trivial), error-translation branches. `PrismaService` is mocked. | Anything whose correctness depends on actually persisting / reading / joining rows. |
| **E2E** | `backend/test/**/*.e2e-spec.ts` | `pnpm --filter backend test:e2e` | Anything that has to be true once the request reaches Postgres: persistence, type round-tripping (`Decimal(12, 2)`, `DateTime`, JSON metadata), nested writes, transaction atomicity (activity-log row visible iff the parent write committed), contract translations of Prisma error codes (e.g. `P2003` → `404 VENDOR_NOT_FOUND`), real list queries (filters / sort / pagination producing the documented `{data, meta}` against real SQL), role guard wired end-to-end through HTTP. | Branch-by-branch validation that the unit layer already covers. |

### Designing the test suite for a new module / feature

Walk the controller endpoint by endpoint. For each endpoint, ask **"what is the assertion?"** and route it to the right layer:

1. If the assertion is about a **decision in code** (rejects unknown enum, hits guard, validates math) → unit test.
2. If the assertion is about **persistence**: each write endpoint (`POST` / `PATCH`) gets **one happy-path e2e** that hits the endpoint AND verifies the persisted row(s) via Prisma (the right amount, decimals to 2dp, dates as `DateTime`, nested children, related activity-log row).
3. Every **FK field accepted in a request body** (`vendorId`, `billId`, `approverId`, etc.) gets **one e2e** with an invalid id, asserting the translated error code (`404 *_NOT_FOUND`) — not the raw Prisma `409 FOREIGN_KEY_VIOLATION`.
4. Every **role-restricted endpoint** gets at least **one e2e with the wrong role** asserting 403 + `INSUFFICIENT_PERMISSIONS` — proves the guard is wired through the global pipeline, not just the decorator.
5. Every **list endpoint** with filters / sort / pagination gets **one e2e** that seeds a deterministic dataset and asserts the order + the `meta` envelope.
6. Every **terminal/guard transition** (e.g. `BILL_NOT_EDITABLE` on PAID) gets **one e2e** end-to-end so the transaction rolls back cleanly.

Anti-patterns:

- ❌ Asserting "PrismaService was called with X" in a unit test — that duplicates code without verifying behaviour.
- ❌ Writing an e2e per validation branch — the parser is unit territory.
- ❌ Writing a unit test for a calculation whose correctness depends on Prisma `Decimal` precision — that's e2e.
- ❌ Mocking Prisma in an e2e — defeats the entire point of the layer.

### Setup primitives

- **Isolation**: e2e uses the `test_e2e` Postgres schema in the same container as dev (`backend/.env.test`). The `public` schema is never touched.
- **Reset + seed**: `backend/test/helpers/db.ts` exposes `resetDatabase()` and `seedMinimalData()`. Every e2e spec calls them in `beforeEach`; tests are independent.
- **App boot**: `backend/test/helpers/app.ts` boots a real Nest app with the same global wiring as `main.ts` (prefix + `ValidationPipe`); the exception filter is registered as `APP_FILTER` and picked up automatically.

When a new module adds a meaningful new shape of test (state machine transitions, partial-failure bulk responses, async flows), extend `docs/backend.md → Testing strategy` with the new pattern so the recipe stays current.

## Git commits

- Follow the Conventional Commits 1.0.0 specification.
- Format: `<type>(<scope>)?: <description>` (e.g. `feat(bills): add bulk approve action`).
- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`, `perf`, `style`, `ci`.
- Few but meaningful — group related changes. Never per file, never per micro-step.
- Do not commit after every requested change. Batch related work and commit once it forms a coherent unit. Hold uncommitted changes across several requests rather than spraying commits.
- Each commit leaves the repo in a working state.
- Subject in imperative mood, lowercase, no trailing period, under 72 chars.
- Body only when the *why* is non-obvious.
- Separate boilerplate commits from feature/contribution commits so reviewers can read the history.

### PR sizing

- A feature PR holds **4-5 commits max** and **15-25 files changed (30 absolute ceiling)**. If work exceeds this, split it into multiple PRs along module or concern boundaries.
- The one-time **bootstrap/foundation PR** (scaffold, tooling, initial schema, docs) is the lone exception — it is a single coherent foundation and may exceed these limits. Every later PR obeys them.
- Push to update an open PR rather than opening a new one for the same slice.

### develop → main cadence

Feature work lives on `develop`. `main` is updated by a separate `develop → main` PR at **coherent milestones** — never per feature, never only at the end. The milestones for this project, in order:

| Milestone | Trigger | What lands on `main` |
|---|---|---|
| Backend MVP | End of Phase 7 (vendors + bills + approvals + payments + bulk + activity + exports complete) | A backend that is feature-complete and deployable standalone |
| Frontend MVP | End of Phase 11 (full UI workflows wired) | Stack usable end-to-end |
| Polish | End of Phase 12 (final sweep, README setup verified from a clean clone) | Reviewer-ready state |
| Deploy | End of Phase 13 (hosted AWS deployment) | Submission state |

At every milestone, open the `develop → main` PR, wait for review/Copilot like any other PR, then merge. Between milestones, `main` is intentionally behind — that is the signal that the work is in flight on `develop`.

### PR bodies

Every PR body follows the same standard structure, auto-filled from `.github/pull_request_template.md`, so reviewers read every PR the same way:

- **Title** — Conventional Commit style, under 70 chars (e.g. `feat(vendors): add CRUD with search and delete guard`).
- **`## Summary`** *(required)* — what the PR does and why, in 1-3 sentences. Lead with the behavioural change, not the file list.
- **`## Changes`** *(required)* — notable changes as bullets.
- **`## Testing`** *(required)* — a checklist of how it was verified (commands run, Bruno requests, golden-path and role checks). State explicitly anything not exercised.
- **`## Screenshots`** *(conditional)* — before/after for UI changes; delete the section otherwise.
- **`## Breaking changes / Notes`** *(conditional)* — migrations, risks, follow-ups; delete when none.
- **`Closes #`** *(conditional)* — link the issue/ticket the PR resolves.

Delete conditional sections that don't apply rather than leaving them empty.

## Communication

Be concise. Explain decisions briefly. When uncertain, propose the simplest safe option. Ask before expanding scope. Respond in the language the human writes in (Spanish or English).
