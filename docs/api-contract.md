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
| `GET /vendors` | ✅ | ✅ | ✅ |
| `GET /vendors/:id` | ✅ | ✅ | ✅ |
| `POST /vendors` | ✅ | ❌ | ❌ |
| `PATCH /vendors/:id` | ✅ | ❌ | ❌ |
| `DELETE /vendors/:id` | ✅ | ❌ | ❌ |

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
