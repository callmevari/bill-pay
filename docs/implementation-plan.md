# Implementation Plan

End-to-end roadmap. Each phase has a goal, deliverables, and an exit condition. Phases run in order; a phase isn't done until its exit condition is met. Backend-first because the data model and contract let the frontend be built without churn.

## Principles

- **Ship working slices.** Every phase leaves the repo runnable. No half-built endpoints or screens on `main`.
- **Contract before consumer.** Backend ships endpoint + `docs/api-contract.md` entry + Bruno request before frontend consumes.
- **One thing at a time.** Build a module top-to-bottom (schema → service → controller → DTOs → Bruno → contract entry) before starting the next.
- **State machines are explicit.** Enforced at the service layer; invalid transitions return `409`.
- **Realistic seed data.** No `Foo Vendor 1`.

---

## Phase 0 — Setup and Alignment

Read `CLAUDE.md`, `assignment/*`, `docs/product-scope.md`. Confirm stack versions. Initialize the **root workspace only**: `git init`, root `.gitignore`, root `package.json`, `pnpm-workspace.yaml` declaring `backend` and `frontend` as workspace packages (folders empty for now), `.npmrc`, root `README.md` stub. First commit is the boilerplate; feature commits land separately. Confirm `docs/product-scope.md` is final.

No package scaffolds in this phase. Backend package is scaffolded in Phase 2. Frontend package is scaffolded in Phase 8. One-at-a-time.

**Exit**: `pnpm install` runs cleanly at the root, repo is under git, first boilerplate commit landed.

---

## Phase 1 — Data Model

Draft `backend/prisma/schema.prisma` with the full entity surface, in one pass, so later modules don't ripple migrations.

Models: `User` (with `role: Role`), `Vendor`, `Bill`, `BillLineItem`, `Approval`, `Payment`, `ActivityLog` (with `actorId`, `actorRole`).

Enums: `Role` (`ADMIN | APPROVER | VIEWER`), `BillStatus`, `PaymentStatus`, `PaymentMethod`, `ApprovalStatus`, `ActivityEntityType`.

Pinned conventions: CUID v2 ids (`@default(cuid(2))`), `Decimal(12, 2)` money, UTC `DateTime`, `createdAt`/`updatedAt` on every model, archive via `archivedAt` (non-destructive). Indexes on likely filter/sort paths (status, vendorId, dueDate, createdAt).

Document each model with a short purpose-and-lifecycle comment block.

**Exit**: schema reviewed and approved by the human. No migration generated yet.

---

## Phase 2 — Backend Bootstrap and Seed

Scaffold the Nest app. Install `prisma@^6` and `@prisma/client@^6` (pinned, see `docs/backend.md`). Wire global `ValidationPipe`, exception filter producing the documented error envelope, CORS, health endpoint, Swagger at `/docs`, request logging.

Implement:
- **Current-user guard**: reads `x-user-id`, loads user, attaches `{ id, name, role }` to the request. Missing/invalid → `401 UNAUTHENTICATED`.
- **Roles guard** with `@Roles(...)` decorator: mismatch → `403 INSUFFICIENT_PERMISSIONS`.

Run the initial migration. Write `prisma/seed.ts`:
- 3 users (Admin, Approver, Viewer) with distinct realistic names.
- 8-12 vendors with believable names and default payment methods.
- 30-50 bills distributed across every status; creator/approver attribution split across Admin and Approver so the activity log shows real separation of duties.
- Line items per bill.
- Payments for approved bills (mix of scheduled, paid, failed, canceled).
- Multi-actor activity log entries.

Bruno collection skeleton under `backend/bruno/` with one environment per role.

**Exit**: `docker-compose up` from a clean clone brings the API up, migrations apply, seed runs, Swagger renders, `/health` returns 200, seeded data visible in Prisma Studio.

---

## Phase 3 — Vendors Module

Smallest end-to-end slice. Validates conventions.

- `VendorsModule`: controller, service, DTOs, mapper.
- Endpoints: list (paginated, `q` search), create, read, update, delete (guarded — `409 VENDOR_HAS_BILLS` when bills reference the vendor).
- `docs/api-contract.md` entry. Bruno requests across all three roles.
- One service-level unit test for the delete guard.

**Exit**: Bruno collection runs green for vendors. Contract doc reflects reality. Viewer cannot mutate.

---

## Phase 4 — Bills Module (Core)

CRUD for bills with line items.

- Endpoints: paginated list with filters (`status`, `vendorId`, `minAmount`, `maxAmount`, `dueDateFrom`, `dueDateTo`, `paymentMethod`, `q`) and sorts; create, read, update; line items sub-resource (list/create/update/delete).
- Bills are created in `DRAFT`. No lifecycle transitions yet.
- Activity log entries on create, update, line-item edits.
- Role enforcement: Admin can mutate, Approver/Viewer cannot.
- Contract doc + Bruno updates.

**Exit**: Bills CRUD exercised in Bruno across roles. List supports documented filters and sorts.

---

## Phase 5 — Approvals and Lifecycle

Move bills through the lifecycle.

- Lifecycle endpoints: `submit-for-approval`, `approve`, `reject`, `archive`.
- Approve creates a `Payment` row with status `UNSCHEDULED`.
- Transitions enforced in the service layer; invalid → `409 BILL_INVALID_TRANSITION`.
- Role enforcement: only Admin/Approver can approve/reject.
- Activity log on every transition.
- Test: one transition-table test covering legal and illegal moves.

**Exit**: approving a bill creates a payment, rejecting transitions correctly, archive is terminal, activity log shows the full trail.

---

## Phase 6 — Payments Module

Full payment lifecycle.

- Endpoints: paginated list with filters, read, schedule, release, mark-as-paid, cancel, retry, unschedule.
- Marking a payment `PAID` also moves the bill to `PAID`.
- Activity log on every transition.
- Role enforcement: only Admin can mutate payments.
- Contract doc + Bruno updates.

**Exit**: full bill-to-paid loop exercisable from Bruno. State machine consistent and audited.

---

## Phase 7 — Bulk Actions, Activity, Exports

Round out the backend surface.

- Bulk endpoints (per-item result for partial-failure visibility): `bills/bulk/{approve,archive,edit}`, `payments/bulk/{release,mark-as-paid,cancel}`.
- Read-only activity endpoints: `GET /bills/:id/activity`, `GET /payments/:id/activity`.
- CSV export of bills respecting active filters. Includes payment columns where applicable: `GET /exports/bills.csv`.
- README backend section: setup, run, seed, Bruno usage, Swagger location.

**Exit**: every committed feature is reachable via an endpoint, documented, and Bruno-tested across roles.

---

## Phase 8 — Frontend Bootstrap

Next.js app skeleton wired to the backend with a consistent visual language.

- Scaffold Next.js App Router, TypeScript strict, Tailwind, shadcn/ui base components (button, input, dialog, table, dropdown, badge, toast, skeleton, command, sheet).
- TanStack Query with a global `QueryClient` + devtools.
- Typed API client (`lib/api.ts`): typed fetch wrapper, error envelope handling, `x-user-id` header from the active role context.
- Role context store, localStorage-persisted, default Admin.
- App shell: sidebar, top nav with **"Acting as"** role switcher (user name + role badge), dark mode toggle.
- `useCan(action)` permission helper. UI hides/disables actions the role cannot perform; backend remains authoritative.
- Empty / loading / error / 403 state primitives. 403 copy: "Your role cannot perform this action."

**Exit**: app boots, sidebar renders, `GET /health` succeeds from the client. Role switcher works (different `x-user-id` sent per selection).

---

## Phase 9 — Core Views (Bills + Vendors tables)

Main read surfaces feel solid.

- Bills index with the canonical tab structure: Overview, Drafts, For Approvals, For Payment, History. Single page; no separate Payments view.
- TanStack Table: pagination, sorting, column visibility, persisted preferences.
- Filter bar wired to documented backend filters.
- Vendors index: list, search, create/edit dialog.
- Bill detail: header (status, amount, dates, vendor), line items, payment block (when present, with payment status + transition history), activity timeline.
- Skeletons, empty states with helpful CTAs, error toasts mapping backend `code` to user-friendly copy.

**Exit**: a reviewer can land on the app, see realistic data, filter and sort bills, drill into a bill detail.

---

## Phase 10 — Workflows (Create, Approve, Pay)

Active workflows complete and polished.

- New Bill flow: vendor picker, line items editor, date pickers, payment method selector.
- Edit Bill flow: same form, populated.
- Bill actions: submit for approval, approve, reject, archive. Confirmation dialogs for destructive/irreversible actions.
- Payment actions inline on bill rows (For Payment and History tabs) and on the bill detail payment block: schedule (date picker), release, mark-as-paid, cancel, retry, unschedule.
- Optimistic updates where safe; query invalidation on success.
- Toasts on every mutation with success/failure copy.

**Exit**: a reviewer can take a bill from draft to paid entirely through the UI.

---

## Phase 11 — Bulk Actions, Exports, Activity

Parity with the bulk/audit surface.

- Multi-select on the bills table.
- Bulk action toolbar on selection: approve, archive, edit, release, mark-as-paid, cancel. Actions gated by bill status.
- Per-item result modal showing successes and failures after a bulk run.
- Activity tab on bill detail with human-readable copy (covers bill + payment history).
- Export menu on the bills table: CSV respecting current filters.

**Exit**: every bulk action in the contract is wired in the UI with clear feedback.

---

## Phase 12 — Polish and Final Sweep

Submission is reviewer-ready.

- Root README: product description, prioritized workflows, what was left out and why, setup (`docker-compose up`, `pnpm install`, `pnpm dev`), suggested walkthrough, key architecture/data-model decisions with tradeoffs.
- Backend: one meaningful unit test on a state transition. Lint/build/test pass.
- Frontend: one meaningful unit test on a critical component or hook. Lint/typecheck/build pass.
- `docs/api-contract.md` matches the live surface.
- Codebase sweep: no AI-generated comments, no `any`, no `console.log`, no commented-out code, no placeholder UI.
- Manual golden path: create a bill as Admin, add line items, submit for approval, switch to Approver and approve, switch back to Admin, schedule payment, mark paid, see it in History with full multi-actor activity log. Switch to Viewer and confirm mutating UI is hidden/disabled.
- Cold-start path: clone fresh, follow README, app runs.

**Exit**: reviewer cloning the repo can run the project in under five minutes and exercise the full Bill Pay flow without friction.

---

## Optional Phase 13 — Deployment

If time permits: deploy frontend to Vercel, backend + Postgres to a managed host. Add the hosted URL to the top of the README.

---

## Cadence

End each phase with a 3-bullet summary (shipped / tested / next). Human approves moving to the next phase. Scope questions emerging mid-phase pause work until resolved.
