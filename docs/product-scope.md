# Product Scope

What the Bill Pay MVP includes and excludes. Source of truth for scope decisions. The implementation plan and API contract align to this. Full reference surface: `assignment/docs-example.md`.

---

## Roles

Three seeded roles, no real auth. `x-user-id` header selects the active user; backend enforces permissions via a roles guard. UI exposes an "Acting as" switcher.

- **Admin** — full access. Creates/edits bills, approves, schedules and releases payments, bulk actions, exports.
- **Approver** — view + approve/reject. Cannot create/edit bills, cannot act on payments.
- **Viewer** — read-only. No mutating actions.

Three seeded users (one per role) drive a multi-actor activity log. Vendor Owner, Approval Chain Member, Manager, and Employee roles from the reference product are out of scope.

---

## In Scope

### Bills
CRUD with line items. Lifecycle: `DRAFT → PENDING_APPROVAL → APPROVED → (SCHEDULED) → PAID`, plus `REJECTED` and `ARCHIVED` as terminal off-ramps. Lifecycle actions are explicit POST verbs (submit-for-approval, approve, reject, archive). Invalid transitions rejected at the service layer.

### Vendors
CRUD with search and pagination. Fields: name, email, default payment method, address (street, city, state, postalCode, country), notes.

### Payments
Auto-created when a bill enters `APPROVED`. Lifecycle: `UNSCHEDULED → SCHEDULED → INITIATED → PAID`, with `FAILED` and `CANCELED` branches; `FAILED` returns to `SCHEDULED` via retry. Actions: schedule, release, mark-as-paid, cancel, retry, unschedule. Payment method per payment (ACH, wire, check, card, off-platform). Paying a payment moves the bill to `PAID`.

### Approvals
Single-step approval — one approver completes it. Only Admin and Approver can approve/reject; other roles → `403`.

### Table experience
- Single **Bills** table with sub-tabs: Overview, Drafts, For Approvals, For Payment, History.
- Server-side pagination, sorting, filtering.
- Filters: status, vendor, amount range, due-date range, payment method, free-text search.
- Sorts: vendor, status, amount, due/invoice/payment date.
- Column visibility toggle (localStorage).
- Payment actions happen inline on bill rows in the **For Payment** and **History** tabs; no separate Payments page.

### Bulk actions
Apply approve, archive, edit (amount, due date, invoice date, description), release, mark-as-paid, cancel to selected bills. Actions are gated by status (e.g. release only on `SCHEDULED`). Endpoints return per-item results so partial failures surface in the UI.

### Activity log
Append-only audit trail of every state change and meaningful edit. Fields: actor, actor role, entity, action, from/to status, metadata, timestamp. Visible per bill and per payment.

### Exports
CSV export of the current bills view, respecting active filters. Includes payment columns (status, scheduled date, paid date) when the bill has a payment.

### Cross-cutting
Realistic seed data (3 users, ~10 vendors, 30-50 bills across all statuses, payments in every state, multi-actor activity log). Swagger at `/docs`. Bruno collection with one environment per role.

---

## Out of Scope

- Real authentication (login, SSO, password reset). The "Acting as" switcher stands in.
- Roles beyond Admin / Approver / Viewer.
- Multi-entity / multi-currency.
- ERP sync and "sync status" columns.
- Card transaction matching.
- Real banking integration (payments transition through statuses but no transfer occurs).
- Invoice file upload, OCR, "missing info" auto-extraction.
- Vendor portal / vendor-detail requests.
- Multi-step approval chains and approval policies.
- Reminders and notifications.
- AP aging report and bulk invoice ZIP export.
- Saved custom views and named filter presets.
- Mobile-first layouts (tablet-acceptable is fine).

---

## Key Decisions

- **Bills and Payments are separate entities** — mirrors the reference product. Clear lifecycles, coherent Payments tab.
- **Lifecycle actions are POST verbs** — transitions are explicit, audited, easy to reason about.
- **Archive is non-destructive; draft delete is hard-delete** — matches the reference product.
- **Audit logging is mandatory** — every transition writes a row. Difference between a toy and a real AP tool.
- **Server-side pagination/sort/filter** — handles realistic data volumes.
- **Three roles, three users** — demonstrates separation of duties and produces a believable multi-actor activity log without a real auth system.

---

## Success Criteria

From a clean clone, in under five minutes, a reviewer can:

1. Launch the app and API together.
2. See realistic data across every bill and payment status.
3. Create a bill as Admin, add line items, submit for approval, switch to Approver and approve, switch back to Admin, schedule the payment inline, mark it paid, see the full multi-actor activity trail.
4. Use filters, sorts, and a bulk action on the bills table.
5. Export a filtered list to CSV.
6. Switch to Viewer and confirm all mutating UI is hidden or disabled.

If any step requires guesswork, the MVP is incomplete.
