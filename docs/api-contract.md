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
| `GET /bills`, `GET /bills/:id`, `GET /bills/:id/line-items` | ✅ | ✅ | ✅ |
| `POST /bills`, `PATCH /bills/:id` | ✅ | ❌ | ❌ |
| `POST /bills/:id/line-items`, `PATCH /bills/:id/line-items/:lineItemId`, `DELETE /bills/:id/line-items/:lineItemId` | ✅ | ❌ | ❌ |
| `POST /bills/:id/submit-for-approval`, `POST /bills/:id/archive` | ✅ | ❌ | ❌ |
| `POST /bills/:id/approve`, `POST /bills/:id/reject` | ✅ | ✅ | ❌ |
| `GET /payments`, `GET /payments/:id` | ✅ | ✅ | ✅ |
| `POST /payments/:id/{schedule,unschedule,release,mark-as-paid,cancel,retry}` | ✅ | ❌ | ❌ |

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

**200** → `{ data: BillResponse[], meta }`. Each `BillResponse` includes its `lineItems` array, its `approvals` array (empty until the bill is submitted; one row per Approval after that), and its `payment` (the linked Payment snapshot, `null` until the bill is approved).

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
  "invoiceDate": "2026-05-01T00:00:00.000Z",
  "dueDate": "2026-05-31T00:00:00.000Z",
  "lineItems": [
    { "description": "EC2 compute", "quantity": "1", "unitPrice": "8200.00" }
  ]
}
```

`currency` is a 3-letter uppercase ISO 4217 code (e.g. `"USD"`) and defaults to `"USD"` when omitted. `dueDate` must be on or after `invoiceDate`.

**201** → bare `BillResponse`. **400 VALIDATION_ERROR** on invalid body — including `null` on any required-non-null field, decimals outside `Decimal(12, 2)`, currency not matching `^[A-Z]{3}$`, or `dueDate < invoiceDate`. **403 INSUFFICIENT_PERMISSIONS** for non-Admin. **404 VENDOR_NOT_FOUND** if `vendorId` does not reference an existing vendor (pre-checked and also re-translated from a Prisma FK race). **409 UNIQUE_CONSTRAINT_VIOLATION** when `(vendorId, invoiceNumber)` already exists.

### `PATCH /bills/:id` — Admin only

Updates an editable bill. `vendorId`, `invoiceNumber`, and line items are not patchable here — line items have their own sub-resource. `description` is the only nullable field (send `null` to clear); the others reject `null`.

**Body**: any subset of `description?: string | null`, `amount?: string`, `currency?: string`, `invoiceDate?: ISO-8601`, `dueDate?: ISO-8601`. Same shape rules as create — `amount` is bounded to `Decimal(12, 2)`, `currency` must match `^[A-Z]{3}$`, and the resulting `dueDate` must remain on or after `invoiceDate`.

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

`PENDING_APPROVAL → APPROVED`. Updates the existing `Approval` row to `APPROVED` and sets `approverId` to the acting user (the actual approver, which may be an Admin). Creates the linked `Payment` row in `UNSCHEDULED` with `method = vendor.defaultPaymentMethod ?? 'ACH'` and `amount` / `currency` copied from the bill. **200** → updated `BillResponse`. **409 BILL_INVALID_TRANSITION** if the bill is not in `PENDING_APPROVAL`. A `payment.created` `ActivityLog` row is written alongside the `bill.approved` entry.

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

**200** → `{ data: PaymentResponse[], meta }`.

### `GET /payments/:id`

**200** → bare `PaymentResponse`. **404 PAYMENT_NOT_FOUND** if missing.

### Lifecycle — `POST /payments/:id/...` — Admin only

Every lifecycle action is `200`, CAS-atomic on `Payment.status`, runs in a single transaction with the bill propagation and an `ActivityLog` row. Invalid transitions return **`409 PAYMENT_INVALID_TRANSITION`** with `details: { from, to, allowedFrom }`.

| Endpoint | Transition | Body | Side effects |
|---|---|---|---|
| `schedule` | `UNSCHEDULED → SCHEDULED` | `{ "scheduledFor": ISO-8601 }` | Set `scheduledFor`; Bill `APPROVED → SCHEDULED` |
| `unschedule` | `SCHEDULED → UNSCHEDULED` | none | Clear `scheduledFor`; Bill `SCHEDULED → APPROVED` |
| `release` | `SCHEDULED → INITIATED` | none | Set `initiatedAt` |
| `mark-as-paid` | `SCHEDULED | INITIATED → PAID` | none | Set `paidAt`; Bill `SCHEDULED → PAID` |
| `cancel` | `SCHEDULED | INITIATED | FAILED → CANCELED` | none | Set `canceledAt`; Bill `SCHEDULED → APPROVED` |
| `retry` | `FAILED → SCHEDULED` | none | Clear `failedAt`, `failureReason` |

### Cancel-on-archive

`POST /bills/:id/archive` (Phase 5) cancels an in-flight Payment (`UNSCHEDULED | SCHEDULED | INITIATED | FAILED`) in the same transaction as the bill archive, sets `Payment.canceledAt`, and records `metadata: { cancelledPayment: paymentId }` on the `bill.archived` activity entry. A sibling `payment.canceled` entry is written with `metadata: { triggeredBy: "bill.archived" }`.

### Error codes (Payments)

`VALIDATION_ERROR` (400) · `PAYMENT_NOT_FOUND` (404) · `PAYMENT_INVALID_TRANSITION` (409) — plus the auth/role codes shared across the API.

### Activity log (Payment actions)

`entityType = PAYMENT`, `entityId = payment.id`. `action` ∈ `payment.created`, `payment.scheduled`, `payment.unscheduled`, `payment.released`, `payment.marked_as_paid`, `payment.canceled`, `payment.retried`. Bill-side mirror entries are listed in the Bills activity-log section above.
