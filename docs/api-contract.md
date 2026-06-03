# API Contract

Live HTTP surface of the Bill Pay API. Grows module by module; each entry matches the implemented endpoints and is kept in sync in the same commit as any surface change.

- **Base URL**: `/api/v1`
- **Auth**: every request (except `GET /health`) requires an `x-user-id` header naming a seeded user. Missing/invalid → `401 UNAUTHENTICATED`. Role mismatch → `403 INSUFFICIENT_PERMISSIONS`.
- **Wire conventions** (IDs, money, dates, enums, envelopes, error shape): see `CLAUDE.md → Wire conventions`. Lists return `{ data, meta }`; single resources return a bare object; errors return `{ error: { code, message, details? } }`.
- **Pagination**: `page` (default 1, min 1), `pageSize` (default 25, min 1, max 100). `meta` is `{ page, pageSize, total, totalPages }`.
- **Sorting**: `sort=<field>` ascending, `sort=-<field>` descending. Unknown fields → `400 VALIDATION_ERROR`.

## Permission matrix

| Endpoint | Admin | Approver | Viewer |
|---|---|---|---|
| `GET /vendors`, `GET /vendors/:id` | ✅ | ✅ | ✅ |
| `POST /vendors`, `PATCH /vendors/:id`, `DELETE /vendors/:id` | ✅ | ❌ | ❌ |
| `GET /bills`, `GET /bills/:id`, `GET /bills/:id/line-items`, `GET /bills/:id/activity` | ✅ | ✅ | ✅ |
| `POST /bills`, `PATCH /bills/:id` | ✅ | ❌ | ❌ |
| `POST /bills/:id/line-items`, `PATCH /bills/:id/line-items/:lineItemId`, `DELETE /bills/:id/line-items/:lineItemId` | ✅ | ❌ | ❌ |
| `POST /bills/:id/submit-for-approval`, `POST /bills/:id/archive` | ✅ | ❌ | ❌ |
| `POST /bills/:id/approve`, `POST /bills/:id/reject` | ✅ | ✅ | ❌ |
| `POST /bills/bulk/approve` | ✅ | ✅ | ❌ |
| `POST /bills/bulk/archive`, `POST /bills/bulk/edit` | ✅ | ❌ | ❌ |
| `GET /payments`, `GET /payments/:id`, `GET /payments/:id/activity` | ✅ | ✅ | ✅ |
| `POST /payments/:id/{schedule,unschedule,release,mark-as-paid,cancel,retry,change-method}` | ✅ | ❌ | ❌ |
| `POST /payments/bulk/{release,mark-as-paid,cancel}` | ✅ | ❌ | ❌ |
| `GET /exports/bills.csv` | ✅ | ✅ | ✅ |

---

## Vendors

Vendor records that bills are owed to. Hard-deleted (guarded), not archived.

### `GET /vendors`

List vendors, paginated.

**Query**: `page`, `pageSize`, `q` (free-text, case-insensitive on `name` and `email`), `sort` (`name` | `createdAt` | `updatedAt`, default `name`).

**200**
```json
{
  "data": [
    {
      "id": "qn4ajdh15g2nvdgrv2srksqe",
      "name": "Stripe, Inc.",
      "email": "ap@stripe.com",
      "defaultPaymentMethod": "ACH",
      "streetAddress": "510 Townsend Street",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94103",
      "country": "US",
      "notes": null,
      "createdAt": "2026-05-20T12:00:00.000Z",
      "updatedAt": "2026-05-20T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 10, "totalPages": 1 }
}
```

### `GET /vendors/:id`

**200** → bare `VendorResponse` (shape as above). **404 NOT_FOUND** if missing.

### `POST /vendors` — Admin only

**Body** (`name` required; all else optional):
```json
{
  "name": "Acme Corp",
  "email": "ap@acme.com",
  "defaultPaymentMethod": "ACH",
  "streetAddress": "1 Market St",
  "city": "San Francisco",
  "state": "CA",
  "postalCode": "94105",
  "country": "US",
  "notes": "Net 30"
}
```
`defaultPaymentMethod` ∈ `ACH | WIRE | CHECK | CARD | OFF_PLATFORM`.

**201** → bare `VendorResponse`. **400 VALIDATION_ERROR** on invalid body. **403 INSUFFICIENT_PERMISSIONS** for non-Admin.

### `PATCH /vendors/:id` — Admin only

**Body**: any subset of the create fields. **200** → updated `VendorResponse`. **404** if missing. **403** for non-Admin.

### `DELETE /vendors/:id` — Admin only

**204** on success. **409 VENDOR_HAS_BILLS** (`details: { billCount }`) if any bill references the vendor. **404** if missing. **403** for non-Admin.

### Error codes

`VALIDATION_ERROR` (400) · `UNAUTHENTICATED` (401) · `INSUFFICIENT_PERMISSIONS` (403) · `NOT_FOUND` (404) · `VENDOR_HAS_BILLS` (409).

---

## Bills

Invoices owed to a vendor. Created in `DRAFT` (lifecycle transitions land in a later module). Each bill has zero or more `BillLineItem` rows; the line-item `total` is stored and the service enforces `total = quantity * unitPrice` on every write. `Bill.amount` is the invoice total the user provides; it is not constrained to equal the sum of line items (real invoices include taxes, discounts, and bill-level adjustments).

`BillStatus` ∈ `DRAFT | PENDING_APPROVAL | APPROVED | SCHEDULED | PAID | REJECTED | ARCHIVED`.

### `GET /bills`

Paginated list with filters and sorts.

**Query**:

- `page`, `pageSize` (shared pagination defaults).
- `status` — comma-separated `BillStatus` values (e.g. `APPROVED,SCHEDULED`). Unknown values → `400 VALIDATION_ERROR`.
- `vendorId` — CUID v2.
- `minAmount`, `maxAmount` — non-negative decimal strings with up to 10 integer digits and up to 2 decimal digits (bounded to the `Decimal(12, 2)` columns).
- `dueDateFrom`, `dueDateTo` — ISO-8601 timestamps; inclusive.
- `paymentMethod` — `ACH | WIRE | CHECK | CARD | OFF_PLATFORM`. Filters by the linked `Payment.method`; bills without a payment are excluded.
- `q` — free-text, case-insensitive, matches `invoiceNumber`, `description`, or `vendor.name`.
- `sort` — one of `createdAt | updatedAt | amount | status | dueDate | invoiceDate | invoiceNumber | vendor`, optionally prefixed with `-` for descending. Default `-createdAt`. `vendor` sorts by `vendor.name`.

**200** → `{ data: BillResponse[], meta }`. Each `BillResponse` includes its `lineItems` array, its `approvals` array (empty until the bill is submitted; one row per Approval after that, each row carrying `approverId` plus the approver's `approverName` joined at read time), and its `payment` (the linked Payment snapshot, `null` until the bill is approved).

### `GET /bills/:id`

**200** → bare `BillResponse` (with `lineItems`, `approvals`, and `payment`). **404 NOT_FOUND** if missing.

```json
{
  "id": "j8u7p2vdhxnpf8m1wgz3rnek",
  "invoiceNumber": "INV-2026-0099",
  "status": "DRAFT",
  "vendorId": "qn4ajdh15g2nvdgrv2srksqe",
  "createdById": "qn4ajdh15g2nvdgrv2srksqe",
  "description": "May infrastructure",
  "amount": "12480.55",
  "currency": "USD",
  "paymentMethod": "WIRE",
  "invoiceDate": "2026-05-01T00:00:00.000Z",
  "dueDate": "2026-05-31T00:00:00.000Z",
  "archivedAt": null,
  "createdAt": "2026-05-29T10:00:00.000Z",
  "updatedAt": "2026-05-29T10:00:00.000Z",
  "lineItems": [
    {
      "id": "...",
      "billId": "j8u7p2vdhxnpf8m1wgz3rnek",
      "description": "EC2 compute",
      "quantity": "1.00",
      "unitPrice": "8200.00",
      "total": "8200.00",
      "createdAt": "2026-05-29T10:00:00.000Z",
      "updatedAt": "2026-05-29T10:00:00.000Z"
    }
  ],
  "approvals": [],
  "payment": null
}
```

`paymentMethod` (`ACH | WIRE | CHECK | CARD | OFF_PLATFORM | null`) is the per-bill override of the vendor's default. When set, it wins over `vendor.defaultPaymentMethod` at approve time (resolution order documented under `POST /bills/:id/approve`). `null` means "fall back to the vendor".

### `POST /bills` — Admin only

Creates a bill in `DRAFT`. The acting user is recorded as `createdById`. Line items may be supplied inline; their `total` is computed server-side.

**Body** (required: `invoiceNumber`, `vendorId`, `amount`, `invoiceDate`, `dueDate`):
```json
{
  "invoiceNumber": "INV-2026-0099",
  "vendorId": "qn4ajdh15g2nvdgrv2srksqe",
  "description": "May infrastructure",
  "amount": "12480.55",
  "currency": "USD",
  "paymentMethod": "WIRE",
  "invoiceDate": "2026-05-01T00:00:00.000Z",
  "dueDate": "2026-05-31T00:00:00.000Z",
  "lineItems": [
    { "description": "EC2 compute", "quantity": "1", "unitPrice": "8200.00" }
  ]
}
```

`currency` is a 3-letter uppercase ISO 4217 code (e.g. `"USD"`) and defaults to `"USD"` when omitted. `dueDate` must be on or after `invoiceDate`. `paymentMethod` is an optional per-bill override of the vendor default — see `POST /bills/:id/approve` for the resolution rule.

**201** → bare `BillResponse`. **400 VALIDATION_ERROR** on invalid body — including `null` on any required-non-null field, decimals outside `Decimal(12, 2)`, currency not matching `^[A-Z]{3}$`, or `dueDate < invoiceDate`. **403 INSUFFICIENT_PERMISSIONS** for non-Admin. **404 VENDOR_NOT_FOUND** if `vendorId` does not reference an existing vendor (pre-checked and also re-translated from a Prisma FK race). **409 UNIQUE_CONSTRAINT_VIOLATION** when `(vendorId, invoiceNumber)` already exists.

### `PATCH /bills/:id` — Admin only

Updates an editable bill. `vendorId`, `invoiceNumber`, and line items are not patchable here — line items have their own sub-resource. `description` is the only nullable field (send `null` to clear); the others reject `null`.

**Body**: any subset of `description?: string | null`, `amount?: string`, `currency?: string`, `paymentMethod?: PaymentMethod | null`, `invoiceDate?: ISO-8601`, `dueDate?: ISO-8601`. Same shape rules as create — `amount` is bounded to `Decimal(12, 2)`, `currency` must match `^[A-Z]{3}$`, and the resulting `dueDate` must remain on or after `invoiceDate`. `paymentMethod` accepts either a `PaymentMethod` enum value or `null` (clears the override and falls back to the vendor default at approve time); unknown enum values → `400 VALIDATION_ERROR`.

**200** → updated `BillResponse`. **400 VALIDATION_ERROR** on invalid body. **404 NOT_FOUND** if missing. **409 BILL_NOT_EDITABLE** (`details: { status }`) when the bill's status is terminal (`PAID`, `REJECTED`, or `ARCHIVED`). **403** for non-Admin.

### `GET /bills/:id/line-items`

**200** → `BillLineItemResponse[]`, ordered by `createdAt` ascending. **404 NOT_FOUND** if the bill is missing.

### `POST /bills/:id/line-items` — Admin only

Adds a line item to an editable bill. `total = quantity * unitPrice` is computed server-side.

**Body**:
```json
{ "description": "EC2 compute", "quantity": "1", "unitPrice": "8200.00" }
```

**201** → `BillLineItemResponse`. **409 BILL_NOT_EDITABLE** for terminal bills. **404** if the bill is missing.

### `PATCH /bills/:id/line-items/:lineItemId` — Admin only

Partial update. `quantity`, `unitPrice`, and `description` are non-null; `null` is rejected with `400 VALIDATION_ERROR`. Whenever `quantity` or `unitPrice` is sent, `total` is recomputed.

**200** → updated `BillLineItemResponse`. **404 BILL_LINE_ITEM_NOT_FOUND** if the line item does not belong to the bill or does not exist. **409 BILL_NOT_EDITABLE** for terminal bills.

### `DELETE /bills/:id/line-items/:lineItemId` — Admin only

**204** on success. **404 BILL_LINE_ITEM_NOT_FOUND** if missing/mismatched. **409 BILL_NOT_EDITABLE** for terminal bills.

### Lifecycle

Four action endpoints drive the bill through its state machine. Each is a `POST` returning the updated `BillResponse` with `200` (the response surfaces the side effects of the transition inline — the updated `approvals` array and, after `approve`, the freshly-created `payment` snapshot). Invalid transitions return **`409 BILL_INVALID_TRANSITION`** with `details: { from, to, allowedFrom }`. The status flip is done with a Prisma compare-and-swap (`updateMany` with the current status as a predicate) inside the same transaction as the side effects, so concurrent requests can never both succeed: the second one re-reads the bill and surfaces the actual current status in `details.from`.

#### `POST /bills/:id/submit-for-approval` — Admin only

`DRAFT → PENDING_APPROVAL`. Creates one `Approval` row in `PENDING`, assigned to the seeded Approver user. **200** → updated `BillResponse`. **409 BILL_INVALID_TRANSITION** if the bill is not in `DRAFT`. **500 INTERNAL_ERROR** if no user with the `APPROVER` role exists (data inconsistency).

#### `POST /bills/:id/approve` — Admin or Approver

`PENDING_APPROVAL → APPROVED`. Updates the existing `Approval` row to `APPROVED` and sets `approverId` to the acting user (the actual approver, which may be an Admin). Creates the linked `Payment` row in `UNSCHEDULED` with `amount` / `currency` copied from the bill and `method` resolved as **`bill.paymentMethod ?? vendor.defaultPaymentMethod ?? 'ACH'`** — per-bill override beats vendor default beats `ACH` fallback. **200** → updated `BillResponse`. **409 BILL_INVALID_TRANSITION** if the bill is not in `PENDING_APPROVAL`. A `payment.created` `ActivityLog` row is written alongside the `bill.approved` entry; its `metadata` carries `{ "method": <resolved>, "methodSource": "bill" | "vendor" | "fallback", "billId": <bill.id> }` so the UI can explain why a particular method was chosen.

#### `POST /bills/:id/reject` — Admin or Approver

`PENDING_APPROVAL → REJECTED`. Updates the existing `Approval` row to `REJECTED` and stores the optional reviewer notes on `Approval.notes`.

**Body** (optional):
```json
{ "notes": "Vendor billed for the wrong period." }
```

**200** → updated `BillResponse`. **409 BILL_INVALID_TRANSITION** if the bill is not in `PENDING_APPROVAL`. The `bill.rejected` activity entry carries `metadata.notes` when provided.

#### `POST /bills/:id/archive` — Admin only

`<any non-PAID, non-ARCHIVED> → ARCHIVED`. Sets `archivedAt` and the status; archival is permanent (no un-archive).

**Side effect — cancel-on-archive (Approval).** If the bill had a `PENDING` Approval (i.e. it was archived from `PENDING_APPROVAL`), that Approval row is transitioned to **`CANCELED`** inside the same transaction so it stops surfacing in approvers' queues. **Approvals already in `APPROVED` or `REJECTED` are never rewritten** — those are real human decisions and the audit trail keeps them. When at least one Approval was cancelled, the `bill.archived` activity entry's `metadata` carries `{ "cancelledApprovals": <count> }`.

**Note**: archiving from `SCHEDULED` is allowed by the lifecycle table but is not reachable from the Phase 5 API surface — `Bill.status = SCHEDULED` only appears via seeded data, since the endpoint that schedules a payment lands in Phase 6. When that arrives, cancel-on-archive will be extended to in-flight Payments too.

**200** → updated `BillResponse` (with the possibly-CANCELED Approval visible in `approvals[]`). **409 BILL_INVALID_TRANSITION** if the bill is `PAID` or already `ARCHIVED`. The `bill.archived` activity entry records the originating status in `fromStatus`.

### Error codes (Bills)

`VALIDATION_ERROR` (400) · `NOT_FOUND` (404) · `VENDOR_NOT_FOUND` (404) · `BILL_LINE_ITEM_NOT_FOUND` (404) · `BILL_NOT_EDITABLE` (409) · `BILL_INVALID_TRANSITION` (409) · `UNIQUE_CONSTRAINT_VIOLATION` (409) — plus the auth/role codes shared across the API.

### Activity log

Every successful write emits one `ActivityLog` row in the same transaction with `entityType = BILL`, `entityId = bill.id`, `actorId`, `actorRole`. Possible `action` values: `bill.created`, `bill.updated`, `bill.line_item_added`, `bill.line_item_updated`, `bill.line_item_removed`, `bill.submitted_for_approval`, `bill.approved`, `bill.rejected`, `bill.archived`, `bill.scheduled`, `bill.unscheduled`, `bill.paid`, `bill.payment_canceled`. Approving a bill additionally writes a sibling `payment.created` entry (`entityType = PAYMENT`, `entityId = payment.id`). Read endpoints for the activity log are documented in a later module.

---

## Payments

Payments are auto-created in `UNSCHEDULED` when a bill is approved. They have their own lifecycle and a dedicated `Payments` surface for triage and action. Marking a payment `PAID` propagates `Bill.status → PAID`; `schedule` / `unschedule` / `cancel` propagate the bill back to `SCHEDULED` / `APPROVED` as appropriate.

`PaymentStatus` ∈ `UNSCHEDULED | SCHEDULED | INITIATED | PAID | FAILED | CANCELED`. `FAILED` is reachable only via seed data — there is no API endpoint that fails a payment manually; the Payment service simulates the bank rejection path so we can exercise `retry`.

### `GET /payments`

Paginated list.

**Query**: `page`, `pageSize`, `status` (comma-separated `PaymentStatus`), `method` (`ACH | WIRE | CHECK | CARD | OFF_PLATFORM`), `billId`, `vendorId` (filters by the linked `Bill.vendorId`), `minAmount`, `maxAmount`, `scheduledForFrom`, `scheduledForTo`, `sort` (one of `createdAt | updatedAt | scheduledFor | paidAt | amount | status`; default `-createdAt`).

`scheduledForFrom` / `scheduledForTo` apply a range on the `scheduledFor` column. Payments where `scheduledFor` is `null` (`UNSCHEDULED`, or any state that has not been scheduled yet) are excluded from the result.

**200** → `{ data: PaymentResponse[], meta }`.

### `GET /payments/:id`

**200** → bare `PaymentResponse`. **404 PAYMENT_NOT_FOUND** if missing.

### Lifecycle — `POST /payments/:id/...` — Admin only

Every lifecycle action is `200`, CAS-atomic on `Payment.status`, runs in a single transaction with the bill propagation and an `ActivityLog` row. Invalid transitions on the Payment side return **`409 PAYMENT_INVALID_TRANSITION`** with `details: { from, to, allowedFrom }`. If the linked Bill is in an unexpected state for the propagation (e.g. it was archived in parallel), the whole action is aborted with **`409 BILL_INVALID_TRANSITION`** carrying `details: { from, to, allowedFrom, triggeredBy: "payment" }` — the consumer should refresh and retry.

| Endpoint | Transition | Body | Side effects |
|---|---|---|---|
| `schedule` | `UNSCHEDULED → SCHEDULED` | `{ "scheduledFor": ISO-8601 }` | Set `scheduledFor`; Bill `APPROVED → SCHEDULED`. Past timestamps are accepted for back-dating operational scenarios; the contract does not enforce future-only. |
| `unschedule` | `SCHEDULED → UNSCHEDULED` | none | Clear `scheduledFor`; Bill `SCHEDULED → APPROVED` |
| `release` | `SCHEDULED → INITIATED` | none | Set `initiatedAt` |
| `mark-as-paid` | `SCHEDULED \| INITIATED → PAID` | none | Set `paidAt`; Bill `SCHEDULED → PAID` |
| `cancel` | `SCHEDULED \| INITIATED \| FAILED → CANCELED` | none | Set `canceledAt`; Bill `SCHEDULED → APPROVED` |
| `retry` | `FAILED → SCHEDULED` | none | Clear `failedAt`, `failureReason` |

### Cancel-on-archive

`POST /bills/:id/archive` (Phase 5) cancels an in-flight Payment (`UNSCHEDULED`, `SCHEDULED`, `INITIATED`, or `FAILED`) in the same transaction as the bill archive, sets `Payment.canceledAt`, and records `metadata: { cancelledPayment: paymentId }` on the `bill.archived` activity entry. A sibling `payment.canceled` entry is written with `metadata: { triggeredBy: "bill.archived" }`.

### Error codes (Payments)

`VALIDATION_ERROR` (400) · `PAYMENT_NOT_FOUND` (404) · `PAYMENT_INVALID_TRANSITION` (409) — plus the auth/role codes shared across the API.

### Activity log (Payment actions)

`entityType = PAYMENT`, `entityId = payment.id`. `action` ∈ `payment.created`, `payment.scheduled`, `payment.unscheduled`, `payment.released`, `payment.marked_as_paid`, `payment.canceled`, `payment.retried`. Bill-side mirror entries are listed in the Bills activity-log section above.

---

## Bulk operations

Every bulk endpoint takes `{ ids: string[], ...action-specific fields }` and returns **`200`** with a per-item result envelope — partial failures never collapse the HTTP status. Each item runs in its own transaction via the existing single-item service method, so failures roll back only their own write (and only their own activity-log row) while the rest of the batch persists. Idempotency is whatever the underlying single-item endpoint gives you.

**Request constraints**: `ids` is 1-100 entries, deduplicated; duplicates → `400 VALIDATION_ERROR`. Sending an empty `ids` → `400 VALIDATION_ERROR`.

**Response shape** (same for every bulk endpoint):
```json
{
  "results": [
    { "id": "qn4...", "ok": true, "data": { /* updated entity */ } },
    {
      "id": "j8u...",
      "ok": false,
      "error": {
        "code": "BILL_INVALID_TRANSITION",
        "message": "Cannot transition bill from PAID to APPROVED.",
        "details": { "from": "PAID", "to": "APPROVED", "allowedFrom": ["PENDING_APPROVAL"] }
      }
    }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

The per-item `error` envelope matches the single-item endpoint's envelope verbatim (same `code`, same `message`, same `details`) so the frontend can branch on the same codes without a special path. Missing ids surface as `NOT_FOUND` (bills) or `PAYMENT_NOT_FOUND` (payments).

### Bills

#### `POST /bills/bulk/approve` — Admin or Approver

Body: `{ ids: string[] }`. Each item runs the same flow as `POST /bills/:id/approve`, including the auto-created `Payment` row and the `bill.approved` + `payment.created` activity entries. Items already approved or otherwise outside `PENDING_APPROVAL` fail with `BILL_INVALID_TRANSITION`.

#### `POST /bills/bulk/archive` — Admin only

Body: `{ ids: string[] }`. Each item runs `POST /bills/:id/archive`. `PAID` and already-`ARCHIVED` items fail with `BILL_INVALID_TRANSITION`. The cancel-on-archive cascades (PENDING `Approval` → `CANCELED`, in-flight `Payment` → `CANCELED`) apply per item, same as the single-item path.

#### `POST /bills/bulk/edit` — Admin only

Body: `{ ids: string[], fields: { dueDate?: ISO-8601, description?: string | null } }`. `fields` must contain at least one of `dueDate` / `description`; an empty object → `400 VALIDATION_ERROR`. `paymentMethod` is intentionally not bulk-editable — it lives on the linked `Payment`, not on the Bill. Terminal bills (`PAID`, `REJECTED`, `ARCHIVED`) fail per-item with `BILL_NOT_EDITABLE`.

### Payments

#### `POST /payments/bulk/release` — Admin only

Body: `{ ids: string[] }`. Per item: `POST /payments/:id/release`. Items not in `SCHEDULED` fail with `PAYMENT_INVALID_TRANSITION`.

#### `POST /payments/bulk/mark-as-paid` — Admin only

Body: `{ ids: string[] }`. Per item: `POST /payments/:id/mark-as-paid`. Cascades the linked bill to `PAID` per item. Items not in `SCHEDULED` / `INITIATED` fail with `PAYMENT_INVALID_TRANSITION`.

#### `POST /payments/bulk/cancel` — Admin only

Body: `{ ids: string[] }`. Per item: `POST /payments/:id/cancel`. Cascades the linked bill back to `APPROVED` per item. Items not in `SCHEDULED` / `INITIATED` / `FAILED` fail with `PAYMENT_INVALID_TRANSITION`.

---

## Activity log reads

The `ActivityLog` table is polymorphic by `(entityType, entityId)`. Two read endpoints scope it per parent entity.

### `GET /bills/:id/activity` — any authenticated role

Returns the activity entries for the bill **and** for its linked Payment (if any), newest first. This makes the bill detail page the single pane for "what happened to this bill and its payment". Paginated with shared `page` / `pageSize`.

**404 NOT_FOUND** if the bill is missing.

**200**
```json
{
  "data": [
    {
      "id": "...",
      "actorId": "qn4...",
      "actorName": "María Sosa",
      "actorRole": "ADMIN",
      "entityType": "BILL",
      "entityId": "j8u...",
      "action": "bill.approved",
      "fromStatus": "PENDING_APPROVAL",
      "toStatus": "APPROVED",
      "metadata": null,
      "createdAt": "2026-05-29T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 4, "totalPages": 1 }
}
```

`actorName` is resolved from the User row via a join at read time (so display names update if a user is renamed; `actorRole` stays the role at the time of the action). `metadata` is action-specific JSON whose shape is documented inline alongside each lifecycle action above.

### `GET /payments/:id/activity` — any authenticated role

Same shape, scoped to `entityType = PAYMENT`, `entityId = payment.id`. Bill-side mirror entries (e.g. `bill.scheduled` triggered by a payment action) live on the bill's activity feed, not here.

**404 PAYMENT_NOT_FOUND** if the payment is missing.

---

## Exports

### `GET /exports/bills.csv` — any authenticated role

Returns a CSV of all bills matching the active filters. Accepts the **same query string as `GET /bills`** (`status`, `vendorId`, `minAmount`, `maxAmount`, `dueDateFrom`, `dueDateTo`, `paymentMethod`, `q`, `sort`) so the table and the export cannot drift on what a given filter means. No pagination — every matching row is emitted.

Response headers:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="bills-YYYY-MM-DD.csv"` (date is server-side UTC)

Columns, in order: `id, vendor, status, amount, dueDate, paymentMethod, invoiceNumber, description, paymentStatus, paymentScheduledFor, paymentPaidAt, createdAt`. Money is the same `"1234.56"` decimal string the JSON API uses; dates are ISO-8601. Payment columns are empty cells when the bill has no payment yet. Quoting follows RFC 4180 (`csv-stringify`): values containing `,`, `"`, `\r`, or `\n` are wrapped in `"…"` and embedded `"` is doubled to `""`. Cells whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r` are prefixed with a single quote so spreadsheets do not evaluate user-controlled strings as formulas.

Errors return JSON via the global exception filter, not CSV — an unknown `sort` field returns `400 VALIDATION_ERROR` with the regular `{ error: { code, message } }` envelope.
