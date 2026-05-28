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
| any non-`PAID` | `ARCHIVED` | `POST /bills/:id/archive` | Set `archivedAt` |
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
   └─────► REJECTED
```

Single-step in the MVP — exactly one `Approval` row per bill, created when the bill enters `PENDING_APPROVAL`. The decision endpoints (`approve`, `reject`) update both the `Approval` and the parent `Bill` in a single transaction.

---

## Auth + Roles

(Detail in `CLAUDE.md → Auth`. Backend-specific notes below.)

- **Current-user guard** runs before every request, reading `x-user-id` and attaching `{ id, name, role }` to the Nest request object. Missing/invalid id → `401 UNAUTHENTICATED`.
- **Roles guard** + `@Roles(...)` decorator enforces per-endpoint role allow-lists. Default for unannotated endpoints is "all authenticated roles". Mutating endpoints must be explicitly annotated.
- **Permission matrix** lives in `docs/api-contract.md` as each endpoint is added, so reviewers don't have to read the code.
- **Activity log captures role at time of action** (`actorRole` on `ActivityLog`). If a user's role later changes, the historical record stays correct.

---

