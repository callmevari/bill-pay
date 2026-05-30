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
- `minAmount`, `maxAmount` — decimal strings (`"0,2"` digits).
- `dueDateFrom`, `dueDateTo` — ISO-8601 timestamps; inclusive.
- `paymentMethod` — `ACH | WIRE | CHECK | CARD | OFF_PLATFORM`. Filters by the linked `Payment.method`; bills without a payment are excluded.
- `q` — free-text, case-insensitive, matches `invoiceNumber`, `description`, or `vendor.name`.
- `sort` — one of `createdAt | updatedAt | amount | status | dueDate | invoiceDate | invoiceNumber | vendor`, optionally prefixed with `-` for descending. Default `-createdAt`. `vendor` sorts by `vendor.name`.

**200** → `{ data: BillResponse[], meta }`. Each `BillResponse` includes its `lineItems` array.

### `GET /bills/:id`

**200** → bare `BillResponse` (with `lineItems`). **404 NOT_FOUND** if missing.

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
  ]
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

`currency` defaults to `"USD"` when omitted.

**201** → bare `BillResponse`. **400 VALIDATION_ERROR** on invalid body (including `null` on any required-non-null field). **403 INSUFFICIENT_PERMISSIONS** for non-Admin. **409 UNIQUE_CONSTRAINT_VIOLATION** when `(vendorId, invoiceNumber)` already exists. **409 FOREIGN_KEY_VIOLATION** if `vendorId` does not exist.

### `PATCH /bills/:id` — Admin only

Updates an editable bill. `vendorId`, `invoiceNumber`, and line items are not patchable here — line items have their own sub-resource. `description` is the only nullable field (send `null` to clear); the others reject `null`.

**Body**: any subset of `description?: string | null`, `amount?: string`, `currency?: string`, `invoiceDate?: ISO-8601`, `dueDate?: ISO-8601`.

**200** → updated `BillResponse`. **404 NOT_FOUND** if missing. **409 BILL_NOT_EDITABLE** (`details: { status }`) when the bill's status is terminal (`PAID`, `REJECTED`, or `ARCHIVED`). **403** for non-Admin.

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

### Error codes (Bills)

`VALIDATION_ERROR` (400) · `NOT_FOUND` (404) · `BILL_LINE_ITEM_NOT_FOUND` (404) · `BILL_NOT_EDITABLE` (409) · `UNIQUE_CONSTRAINT_VIOLATION` (409) · `FOREIGN_KEY_VIOLATION` (409) — plus the auth/role codes shared across the API.

### Activity log

Every successful write emits one `ActivityLog` row in the same transaction with `entityType = BILL`, `entityId = bill.id`, `actorId`, `actorRole`, and one of: `bill.created`, `bill.updated`, `bill.line_item_added`, `bill.line_item_updated`, `bill.line_item_removed`. Read endpoints for the activity log are documented in a later module.
