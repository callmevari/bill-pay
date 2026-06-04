# Bill Pay

An accounts payable workspace inspired by Ramp Bill Pay. Manage vendors, create and approve bills, schedule payments, and audit every state change through a complete activity log.

## Setup

Two supported paths. Both start with cloning the repo.

### Docker (one command)

```bash
docker compose up --build
```

Brings up Postgres, the backend, and the frontend. On first boot the backend container runs `prisma migrate deploy` then `prisma db seed`; both are idempotent (seed skips itself when the `User` table already holds at least one row — set `BILLPAY_SEED_FORCE=1` on the backend service to wipe and reseed). Open <http://localhost:3000>.

**Optional: Prisma Studio.** Run with the `studio` profile to also bring up a read/write DB browser at <http://localhost:5555>:

```bash
docker compose --profile studio up --build
```

Off by default — the default `docker compose up` keeps the stack minimal. Studio has no auth, so leave it scoped to localhost.

### Local (Node + pnpm)

```bash
corepack enable && corepack prepare pnpm@latest --activate
pnpm install
cp backend/.env.example backend/.env               # only needed for local dev
docker compose up -d postgres                      # Postgres only

pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma db seed
pnpm dev                                           # API on :3001, web on :3000
```

`pnpm dev` runs both packages in parallel via `pnpm --parallel`. Stop with `Ctrl+C`. Tested against Node 20 LTS+. Swagger renders at <http://localhost:3001/docs>.

The frontend reads `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3001/api/v1`). The top-bar **Acting as** switcher swaps the active seeded user (Admin / Approver / Viewer) and the API client attaches the matching `x-user-id` header to every request; the choice persists in `localStorage`. A dark-mode toggle sits next to it.

## Workflows prioritized

End-to-end, with role-aware gating + per-step activity logging:

1. **Vendor management** — Admins create vendors with a required default payment method (used as the rail for every bill the vendor backs unless the bill overrides it).
2. **Bill creation + edit** — Admins create bills with line items, an optional per-bill `paymentMethod` override, and full validation (invoice number regex, decimal-precise amounts, cross-field date rules).
3. **Submit for approval** — Admins submit a DRAFT bill; the bill flips to PENDING_APPROVAL and the approval row is opened.
4. **Approve / reject** — Admins or Approvers act on a PENDING bill. Approve creates the `Payment` row in UNSCHEDULED with the resolved method (bill override > vendor default) recorded on the activity log. Reject records optional notes.
5. **Payment lifecycle** — Schedule (`UNSCHEDULED → SCHEDULED`), unschedule, release (`SCHEDULED → INITIATED`), mark-as-paid (`UNSCHEDULED|SCHEDULED|INITIATED → PAID`), retry (`FAILED → SCHEDULED`), cancel (`UNSCHEDULED|SCHEDULED|INITIATED|FAILED → CANCELED`). Cancel cascades the linked Bill to ARCHIVED in the same transaction.
6. **Bill index** — Tabs (Overview / Drafts / For approval / For payment / History) layered on filters (vendor, amount range, due-date range, payment method, free-text search), column visibility, server-side sort + pagination, and CSV export of the current view.
7. **Bulk actions** — Multi-select on the bills table opens a bulk toolbar gated by role + tab + per-status eligibility. Each run returns a `{ results, summary }` envelope so partial failures surface in a summary toast + per-item details modal (failed ids copyable).
8. **Activity audit** — Every state change writes an `ActivityLog` row keyed by entity + actor + role + transition + metadata. Surfaced inline on the bill detail page as a timeline.

## Scope decisions

What was left out and why:

- **Bulk `amount` editing** — listed in the brief, intentionally not shipped. Setting the same monetary value across N distinct invoices is rarely the right operation; AP teams that need batch amount changes reach for CSV import, which is out of scope.
- **Bulk `paymentMethod` editing** — the per-bill override exists on the Bill, but the post-payment field lock freezes it the moment a Payment row is created. A mixed-selection bulk run would fail per-item on every approved row, which is worse UX than the inline override path.
- **CSV import** — the export half ships; the import half doesn't. It's an entire UX track (column mapping, dry-run, partial-success reporting) and the brief prioritised export.
- **Real auth** — replaced by a header-based `x-user-id` against three seeded users (Admin / Approver / Viewer). The role guard, permission matrix, and 403 envelopes all behave production-shaped; only the credential surface is mocked.
- **Multi-step approval chains** — the model supports it (one PENDING `Approval` row per Bill, designed to extend), but the MVP fires a single approval.
- **Sidebar "coming soon" decoy nav** — kept the visual fidelity to the Ramp reference for one phase, then removed: nav items that do nothing add cognitive load on review.
- **Mobile responsive polish** — desktop-first is the AP product reality, and the brief budget did not justify a second pass.

## Architecture + data model decisions

The deeper rationale lives in `docs/backend.md` and `docs/frontend.md`. Highlights:

- **Bill and Payment are separate lifecycles.** Approving a bill creates the Payment row in UNSCHEDULED; the two state machines run side-by-side from that point on. A canceled Payment cascade-archives the Bill because the system creates exactly **one Payment per Bill** at approve and never re-creates it — leaving an APPROVED Bill behind a CANCELED Payment would hide a dead end from the audit trail.
- **`bill.amount` and `sum(lineItems.total)` may diverge — by design.** Real AP invoices carry tax, fees, shipping, and discounts that are not always line-itemized, and some vendors send total-only invoices. `bill.amount` is the source of truth; the line items breakdown is informational. The bill detail page renders a reconciliation row showing both totals plus the difference (muted when they match, amber when they don't) so the divergence is visible to an auditor rather than hidden. Industry-standard AP products (Ramp, Bill.com, Stripe Invoicing) handle this the same way.
- **Payment method on a bill is a hint, not the live method.** `bill.paymentMethod` is consulted at approve time when the Payment row is created (`bill.paymentMethod ?? vendor.defaultPaymentMethod`) and recorded on the `payment.created` activity row as `metadata.methodSource`. The chain terminates at the vendor because `Vendor.defaultPaymentMethod` is non-null at the schema level — vendor-create forces an explicit method, so there is no silent ACH fallback. Once the payment exists, its `method` is the source of truth.
- **Post-payment field lock.** Once a non-cancelled Payment exists for a Bill, editing `amount` / `currency` / `paymentMethod` returns `409 BILL_FIELD_LOCKED_POST_PAYMENT`. `description` / `dueDate` / `invoiceDate` stay editable — memo / tracking / typo-correction don't affect the payment.
- **CAS state transitions + transactional activity log.** Every mutating service method opens a `prisma.$transaction` that reads-current → guards-status → writes-row → writes the activity row in the same step, so the audit log row exists if and only if the parent write committed. Race conditions on concurrent transitions are caught by the status guard.
- **Wire conventions live once.** IDs are CUID v2; money is a 2-decimal string on the wire and `Decimal(12, 2)` in the DB; dates are ISO-8601 UTC; lists carry a `{ data, meta }` envelope; errors are always `{ error: { code, message, details } }` with a stable uppercase-snake code the UI branches on.

## Suggested walkthrough

Five-minute path to see the system end-to-end:

1. Set "Acting as" to **Admin**. Open **Vendors**, create a vendor with a default payment method.
2. Open **Bills → New**. Pick the vendor, add 2 line items, leave the invoice/due dates in the future. Save → bill lands in **Drafts**.
3. Click the row → on the detail page hit **Submit for approval**. Status flips to PENDING_APPROVAL.
4. Switch to **Approver** via the top-bar switcher. Approve the bill → Payment row appears in the panel below.
5. Switch back to **Admin**. From the **For payment** tab, schedule the payment, release it, then mark it paid.
6. Open the **Activity** tab on the detail page → full audit trail with actor + role + metadata per row.
7. Multi-select a few bills in the index → use the bulk toolbar (approve / archive / edit) and watch the summary toast + Details modal.
8. Click **Export → CSV** to download the current filtered view.

## Repository

- `backend/` — NestJS, Prisma, PostgreSQL
- `frontend/` — Next.js App Router, React, TypeScript, Tailwind, shadcn/ui
- `docs/` — `product-scope.md`, `api-contract.md`, `implementation-plan.md`, `backend.md`, `frontend.md`
- `backend/bruno/` — HTTP collection covering every endpoint + every role
- `assignment/` — source brief

## Testing

Two layers:

- **Unit tests** — fast, no I/O, mock `PrismaService`. Run with `pnpm --filter backend test` and `pnpm --filter frontend test`.
- **End-to-end tests** — boot the full Nest app against a real Postgres connection on an isolated `test_e2e` schema (the dev `public` schema is never touched). Run with `pnpm --filter backend test:e2e`. Requires Postgres up (`docker compose up -d postgres`).

E2E coverage is deliberately narrow: contract-shape behaviour that mocked-Prisma unit tests can't reach — FK violations translated to `404 *_NOT_FOUND`, terminal-edit guards, decimal-overflow validation, role enforcement end-to-end through HTTP. See `docs/backend.md → Testing strategy` for the full rationale.

## Workspace

This is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with two packages, `backend` and `frontend` (declared in `pnpm-workspace.yaml`). Use pnpm, not npm or yarn — pnpm is pinned via corepack and the lockfile is `pnpm-lock.yaml`.

```bash
pnpm install                          # install all workspaces, from the repo root
pnpm --filter backend <script>        # run a package.json script in one package
pnpm --filter backend add <pkg>       # add a dependency to one package
```

`pnpm --filter backend dev` and `cd backend && pnpm dev` are equivalent. Packages declaring postinstall build scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml` (pnpm blocks them by default); Prisma and NestJS are already allowed.

## Production images

```bash
docker build -f backend/Dockerfile  -t billpay-api .
docker build -f frontend/Dockerfile -t billpay-web .
```
