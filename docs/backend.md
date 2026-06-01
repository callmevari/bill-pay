# Backend Technical Decisions

Living log of backend implementation choices and their rationale. Captures the *why* behind decisions whose answer isn't obvious from the code or schema alone. Grows phase by phase as new modules land.

`product-scope.md` covers **what** we build. `implementation-plan.md` covers **when**. `api-contract.md` covers **how it looks at the boundary**. This file covers **why we built backend internals this way**.

---

## Data Model

Schema lives at `backend/prisma/schema.prisma`. Seven models, six enums.

### Prisma version

Pinned to **Prisma 6.x** (`prisma` + `@prisma/client` both `^6`). Prisma 7 (late 2025) removed the in-schema `datasource { url = env(...) }` block in favor of `prisma.config.ts`. Sticking with 6 because the NestJS + Prisma ecosystem (modules, generators, tutorials) is still indexed against 6, and the project benefits more from ecosystem maturity than from chasing a release that landed weeks ago.

### Conventions

- **IDs**: CUID v2 (`@default(cuid(2))`). Not k-sortable; always sort by `createdAt`.
- **Money**: `Decimal(12, 2)`. Up to ~$10B per row. String on the wire to avoid float drift.
- **Currency**: stored per Bill and Payment, defaults to `"USD"`. Makes amounts unambiguous in CSV exports.
- **Timestamps**: `createdAt` and `updatedAt` on every mutable model. `ActivityLog` is append-only and only has `createdAt`.
- **Archive**: non-destructive via `archivedAt` on `Bill`. Setting it removes the row from the active queue; clearing it reactivates. Vendors have no archive — they are hard-deleted, guarded by `409 VENDOR_HAS_BILLS` when bills still reference them.
- **Indexes**: single-column on commonly filtered/sorted paths (`status`, `dueDate`, `createdAt`, `archivedAt`). Filtering `Bill` by `vendorId` is served by the leftmost prefix of the `(vendorId, invoiceNumber)` compound unique, so no separate single-column index is added. Further compound indexes added only when profiling justifies it.

### Key design calls

- **`Approval` as a separate table** even though the MVP is single-step. One extra read per bill in exchange for free multi-step approval chains as a future feature, with no migration cost.
- **Polymorphic `ActivityLog`** via `(entityType, entityId)`. One audit table for bills, payments, and vendors. Loses the FK on `entityId` deliberately; a composite index `(entityType, entityId, createdAt)` covers the per-entity feed query cleanly.
- **Payment transition timestamps as separate fields** (`scheduledFor`, `initiatedAt`, `paidAt`, `failedAt`, `canceledAt`). Lets the payment detail page render the full history without joining `ActivityLog`. `ActivityLog` still receives a row for every transition for audit consistency.
- **`(vendorId, invoiceNumber)` compound unique** on `Bill`. Different vendors realistically reuse invoice numbers; globally unique would be too strict.
- **`BillLineItem.total` is stored, not computed**. Service layer enforces `total = quantity * unitPrice` on write. Stored avoids per-read math and lets the column be indexed/exported directly.
- **`onDelete: Cascade`** on `BillLineItem → Bill` and `Approval → Bill`. Hard-delete only happens for `DRAFT` bills, so cascading line items and approvals is safe.
- **No cascade on `Payment → Bill`**. Bills with payments cannot be hard-deleted (they aren't in `DRAFT` anyway), so the FK is enforced strictly.

---

## Lifecycle and state machines

State transitions are enforced in the service layer. An invalid transition returns `409` with a stable error code (e.g. `BILL_INVALID_TRANSITION`, `PAYMENT_INVALID_TRANSITION`). Every transition writes an `ActivityLog` row with `fromStatus`, `toStatus`, and the acting user + role.

### Bill

```
DRAFT ──► PENDING_APPROVAL ──► APPROVED ──► SCHEDULED ──► PAID
  │              │                │
  │              ▼                ▼
  │           REJECTED        (also via Payment → PAID)
  ▼
ARCHIVED (also reachable from any non-PAID state)
```

| From | To | Trigger | Side effects |
|---|---|---|---|
| `DRAFT` | `PENDING_APPROVAL` | `POST /bills/:id/submit-for-approval` | Create `Approval` row with `PENDING` |
| `PENDING_APPROVAL` | `APPROVED` | `POST /bills/:id/approve` | Update `Approval` → `APPROVED`; create `Payment` row with `UNSCHEDULED` |
| `PENDING_APPROVAL` | `REJECTED` | `POST /bills/:id/reject` | Update `Approval` → `REJECTED` |
| `APPROVED` | `SCHEDULED` | `POST /payments/:id/schedule` (propagated from payment) | Set `Payment.scheduledFor` |
| any non-`PAID`, non-`ARCHIVED` | `ARCHIVED` | `POST /bills/:id/archive` | Set `archivedAt`; if any Approval row is `PENDING`, transition it to `CANCELED` in the same transaction. `APPROVED`/`REJECTED` approvals are never rewritten. |
| `APPROVED`/`SCHEDULED` | `PAID` | Payment reaches `PAID` | Bill moves automatically |

`REJECTED` and `ARCHIVED` are terminal. `PAID` is terminal. Hard-delete is allowed only in `DRAFT`.

#### Bill tab mapping (UI ↔ BE)

The Bills page tabs map to `BillStatus` filters. Each bill appears in exactly one tab.

| Tab | Statuses shown |
|---|---|
| Overview | all statuses, grouped by status |
| Drafts | `DRAFT` |
| For Approvals | `PENDING_APPROVAL` |
| For Payment | `APPROVED`, `SCHEDULED` |
| History | `PAID`, `REJECTED`, `ARCHIVED` |

Each tab calls `GET /bills?status=...`. Multi-status filtering uses comma-separated values (e.g. `status=APPROVED,SCHEDULED`). Overview omits the `status` param and groups client-side.

### Payment

```
UNSCHEDULED ──► SCHEDULED ──► INITIATED ──► PAID
                    ▲             │
                    │             ▼
                    └── retry ── FAILED
                                  │
                                  ▼
                                CANCELED
```

| From | To | Trigger | Side effects |
|---|---|---|---|
| `UNSCHEDULED` | `SCHEDULED` | `POST /payments/:id/schedule` | Set `scheduledFor`; bill → `SCHEDULED` |
| `SCHEDULED` | `UNSCHEDULED` | `POST /payments/:id/unschedule` | Clear `scheduledFor`; bill → `APPROVED` |
| `SCHEDULED` | `INITIATED` | `POST /payments/:id/release` | Set `initiatedAt` |
| `INITIATED`/`SCHEDULED` | `PAID` | `POST /payments/:id/mark-as-paid` | Set `paidAt`; bill → `PAID` |
| `INITIATED` | `FAILED` | (simulated; reachable via retry-then-fail in seed only) | Set `failedAt`, `failureReason` |
| `FAILED` | `SCHEDULED` | `POST /payments/:id/retry` | Clear `failedAt`/`failureReason`; restore `scheduledFor` |
| `SCHEDULED`/`INITIATED`/`FAILED` | `CANCELED` | `POST /payments/:id/cancel` | Set `canceledAt`; bill returns to `APPROVED` (unpaid queue) |

`PAID` and `CANCELED` are terminal.

### Approval

```
PENDING ──► APPROVED
   │
   ├─────► REJECTED
   │
   └─────► CANCELED   (auto, when the bill is archived from PENDING_APPROVAL)
```

Single-step in the MVP — exactly one `Approval` row per bill, created when the bill enters `PENDING_APPROVAL`. The decision endpoints (`approve`, `reject`) update both the `Approval` and the parent `Bill` in a single transaction. `archive` adds a third decision branch: if the Approval is still `PENDING` at archive time, it is transitioned to `CANCELED` (it never actually got a human decision); `APPROVED`/`REJECTED` rows are immutable historical records.

---

## Auth + Roles

(Detail in `CLAUDE.md → Auth`. Backend-specific notes below.)

- **Current-user guard** runs before every request, reading `x-user-id` and attaching `{ id, name, role }` to the Nest request object. Missing/invalid id → `401 UNAUTHENTICATED`.
- **Roles guard** + `@Roles(...)` decorator enforces per-endpoint role allow-lists. Default for unannotated endpoints is "all authenticated roles". Mutating endpoints must be explicitly annotated.
- **Permission matrix** lives in `docs/api-contract.md` as each endpoint is added, so reviewers don't have to read the code.
- **Activity log captures role at time of action** (`actorRole` on `ActivityLog`). If a user's role later changes, the historical record stays correct.

---

## Testing strategy

Two layers, each scoped to what it actually verifies:

### Unit tests (`src/**/*.spec.ts`, run with `pnpm test`)

Service-level tests with `PrismaService` mocked. They cover **branching logic where the value is in the code path**, not the I/O:

- Where-clause + sort parsers (allow-list violations → `400 VALIDATION_ERROR`).
- Terminal-status edit guard (`BILL_NOT_EDITABLE` on PAID/REJECTED/ARCHIVED).
- Cross-field date order (`dueDate >= invoiceDate`).
- Vendor delete guard branching (no bills → success; bills → `409 VENDOR_HAS_BILLS`; missing vendor → `404`).
- Math: `BillLineItem.total = quantity * unitPrice`.

Anything that only fails when it hits a real database — FK violations, unique constraints, `Decimal(12, 2)` overflow, transaction atomicity, role-guard wiring end-to-end — is out of scope here and lives in e2e.

### End-to-end tests (`test/**/*.e2e-spec.ts`, run with `pnpm test:e2e`)

Boot the full Nest app with the same global wiring as `main.ts` (prefix, `ValidationPipe`, exception filter). Drive it with supertest. Use a real Prisma connection against an **isolated `test_e2e` schema** in the same Postgres container as dev (`DATABASE_URL=...?schema=test_e2e` in `backend/.env.test`). The dev `public` schema is never touched.

Setup:

- `backend/test/global-setup.ts` (Jest `globalSetup`) loads `.env.test` and runs `prisma migrate deploy` once before any test starts. Idempotent.
- `backend/test/setup-env.ts` (Jest `setupFiles`) re-loads `.env.test` in each worker before the test file is imported, so the `PrismaClient` Nest creates picks up the test URL.
- `backend/test/helpers/db.ts` exposes `resetDatabase()` (truncate all rows in dependency order) and `seedMinimalData()` (one admin + approver + viewer + vendor). Specs call them in `beforeEach` so every test starts on a clean slate.

E2E coverage targets the contract-shape behaviours that mocked-Prisma unit tests cannot reach. The high-level rule and per-endpoint checklist for designing the suite for any new module live in `CLAUDE.md → Testing`. Currently covered:

- **Happy-path persistence (write plumbing).** `POST /bills` with full body asserts the response, then re-reads via Prisma to confirm the row + nested line-item `total`s + the `bill.created` activity-log entry are all persisted. `POST /vendors` does the same against `Vendor`. These two tests cover the bulk of the Decimal/Date/JSON/nested-write/transaction plumbing in one shot — if Phase 5/6 accidentally breaks field mapping or transaction wiring, they'll catch it.
- **Read plumbing.** `GET /bills?status=...&sort=amount` seeds a deterministic dataset and asserts the `{data, meta}` envelope shape, the filter intersection, and the sort order against real SQL.
- **FK translations.** `POST /bills` with `vendorId: "asd"` → `404 VENDOR_NOT_FOUND` (translated, not the raw `409 FOREIGN_KEY_VIOLATION`). One per FK field accepted in a request body.
- **DTO-boundary overflow.** `POST /bills` with `amount` outside `Decimal(12, 2)` → `400 VALIDATION_ERROR` from the regex helper, not a 500 from Postgres.
- **Terminal / guard transitions.** `PATCH /bills/<paid>` → `409 BILL_NOT_EDITABLE` with `details.status` end-to-end.
- **Delete guards.** `DELETE /vendors/<referenced>` → `409 VENDOR_HAS_BILLS` with `details.billCount`.
- **Role-guard plumbing.** `POST /vendors` as Viewer → `403 INSUFFICIENT_PERMISSIONS` — proves the guard is wired through the global pipeline.
- **Smoke.** `GET /health` returns `{ ok: true }`.

### Patterns to add as new module shapes appear

When the next phase introduces a shape we haven't tested yet, codify it here so the recipe stays current.

- **State machine transitions** (Phase 5, lifecycle endpoints): one e2e per legal transition (`submit-for-approval` then `approve` then `mark-as-paid`, asserting the resulting `status`, the auto-created `Payment` row, and the chain of `ActivityLog` entries) plus one e2e per **illegal** transition (e.g. `approve` on `DRAFT` → `409 BILL_INVALID_TRANSITION`).
- **Bulk endpoints** (Phase 7): one e2e mixing valid and invalid items in the same batch and asserting the per-item result envelope (`{ id, ok, error? }`), so partial-failure visibility is preserved end-to-end. Plus a role-gate e2e and a "succeeded items persist, failed items untouched" assertion against Prisma after the call.
- **CSV export** (Phase 7): one e2e that seeds a deterministic dataset including a row with embedded `,`, `"`, and `\n` in a text field, hits the endpoint with a filter, asserts `Content-Type` + `Content-Disposition`, parses the body with `csv-parse` so record count is accurate, and checks the column order + a sampled row against the documented projection.
- **Async / job-driven flows**: not in scope for this MVP. If one ever lands, add a section.

---

## Phase 7 — Bulk, activity reads, CSV export

### Bulk surface

Bulk endpoints are mounted under a **separate controller prefix** (`@Controller('bills/bulk')`, `@Controller('payments/bulk')`) rather than alongside the lifecycle actions on the main controller. Two reasons:

1. The literal `bulk` segment can never collide with the `:id` parameter on the lifecycle controller's `POST /bills/:id/approve`. With both routes under the same controller, ordering would determine which won — fragile.
2. Per-controller `@Roles(...)` decorators stay readable: the bulk controller advertises its role allow-list independently from the single-item one, which matters here because `bulk/approve` accepts Approver but most other bulk actions are Admin-only.

The per-item loop lives in a small **`runBulk` helper** (`src/common/bulk/bulk-runner.ts`) that:

- Iterates ids sequentially. The single-item methods all open their own Prisma transaction, so per-item failures are atomic and isolated; the bulk path never re-implements the state machine.
- Catches per-item exceptions and translates them through `toBulkItemError` into the same `{ code, message, details? }` envelope the single-item endpoint would have returned via the global filter. Bulk endpoints return `200` with that envelope nested in `results[].error`, so partial failures never collapse the HTTP status.
- Builds the `summary` (`{ total, succeeded, failed }`) once at the end. The frontend can render "3 of 5 succeeded" without recomputing.

The decision **not** to support `paymentMethod` in `POST /bills/bulk/edit` is documented in the DTO and the API contract: payment method lives on the linked `Payment`, not on the `Bill`, so editing it through the bills bulk surface would cross the bill ↔ payment boundary and require a parallel service method with its own guard. That's a real product need but outside the "reuse the single-item service methods" charter of Phase 7. Bills bulk-edit is limited to `dueDate` and `memo` (`memo` is the wire alias for `Bill.description`, matching the spec's wording).

### Activity reads

The polymorphic `ActivityLog` is read via two endpoints scoped per parent entity: `GET /bills/:id/activity` and `GET /payments/:id/activity`. Both controllers live on the parent's module (`BillsController`, `PaymentsController`) so the URL nests naturally and Swagger groups them under the right tag; the shared read service lives in a separate `ActivityModule` that exports `ActivityService` so both controllers can inject it without circular imports.

`forBill` widens the read to **also include the linked Payment's entries**: a reviewer reading the bill's activity sees the full life of the work item (bill events + payment events) in one feed without making a second request. `forPayment` is narrower — just the payment's own entries; bill-side mirror entries (`bill.scheduled` triggered by a payment action) live on the bill feed only. Both feeds are always newest-first; no sort knob is exposed (the question "show me activity sorted by action alphabetically" has no product meaning and would let unbounded inputs reach Prisma).

`actorName` is resolved at read time via a `User` join — so display names update if a user is renamed, but `actorRole` stays the role *at the time of the action* (`actorRole` is denormalized onto the activity row itself, by design, so the audit trail is correct even if a user's role changes later).

### CSV export

The bills CSV export accepts **the same query DTO as `GET /bills`** (`BillListQueryDto`) and reuses `BillsService.findAllForExport` — which itself reuses the same `buildWhere` and `parseSort` the list endpoint uses. The table and the export cannot drift on what `?status=APPROVED,SCHEDULED&sort=-dueDate` means.

Quoting uses `csv-stringify` (`/sync` build) so we never hand-roll RFC 4180 escaping. The full filtered result is built in memory and sent in one `res.send()` — bills are bounded in practice (low thousands), so the streaming API isn't needed; if the table ever grows past in-memory, swap to `csv-stringify`'s streaming interface without changing the column projection.

Headers are set **inside the handler after `billsCsv` resolves**, not via the `@Header(...)` decorator. The decorator would lock the response Content-Type to `text/csv` for *every* response, including 400s from the bills query parser — the error envelope is JSON and must flow through the global exception filter normally. Setting the headers post-resolution keeps the error path entirely on the filter.

`Content-Disposition` carries `bills-YYYY-MM-DD.csv` built from server-side UTC. Predictable for re-runs and tests, and avoids ambiguity when the export action ever needs an activity log entry of its own.

---

