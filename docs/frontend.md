# Frontend Technical Decisions

Living log of frontend implementation choices and their rationale. Captures the *why* behind decisions whose answer isn't obvious from the source alone. Grows phase by phase as new surfaces land.

`product-scope.md` covers **what** we build. `implementation-plan.md` covers **when**. `api-contract.md` covers **what the boundary looks like**. This file covers **why we built the frontend this way**.

---

## Stack

- **Next.js 15 + App Router** — file-system routing, RSC by default, Server Components for shell + Client Components for interactivity. Turbopack on `next dev` to dodge a webpack RSC HMR bug that left module manifests stale across hot reloads.
- **React 19** — pairs with Next 15; we lean on `useTransition` only where it genuinely helps (none yet).
- **TypeScript strict** + `noUncheckedIndexedAccess` + `noImplicitOverride`. No `any` in committed code.
- **Tailwind CSS v4** — design tokens via `@theme inline` against CSS custom properties in `globals.css`. shadcn-style variants compose against the token set.
- **shadcn/ui (vendored) + Radix primitives** — copy-in component source under `src/components/ui/`. Radix gives the focus management / a11y; Tailwind gives the look.
- **TanStack Query v5** — every server-state read + mutation goes through it.
- **TanStack Table v8** — headless table for the bills index. Sorting, column visibility, pagination are server-driven via URL state.
- **Zustand** — the role context store, persisted to localStorage. Single small store; we did not reach for Redux/Jotai.
- **next-themes** — class-based dark mode, persisted automatically.
- **sonner** — toast surface for mutation feedback. `richColors` mode so success / error are visually distinct.
- **lucide-react** — icon set.

Avoid: GraphQL, MobX, Redux, Storybook, MSW, a separate form library (forms are small enough to live on `useState` for this MVP).

---

## State boundaries

| Surface | Owner | Examples |
|---|---|---|
| Server state (anything that lives on the API) | TanStack Query | bills, vendors, bill detail, activity timelines, mutations |
| Persisted client state | Zustand + localStorage | active "Acting as" user, theme preset (if added) |
| URL state | Next route + query params | bills index tab, filters, sort, page |
| Transient UI state | React `useState` | dialog open/closed, edit mode, draft form fields |

The "Acting as" user is held in Zustand because it must outlive a tab close and feeds the API client at module-evaluation time — see `src/components/providers/role-provider.tsx`, which installs the getter once on the client so the very first request after rehydration ships the `x-user-id` header.

---

## API client (`src/lib/api.ts`)

A single `apiFetch<T>` wrapper. Adds the active `x-user-id` (skippable via `skipAuth` for `/health`), serializes JSON bodies, parses JSON responses, and on non-2xx throws `ApiError` carrying the documented `{ code, message, details? }` envelope plus the HTTP `status`. The wrapper normalises headers via `new Headers(...)` rather than a plain-object spread so `Headers` instance / `[string, string][]` inputs merge correctly. Network failures throw a synthetic `NETWORK_ERROR` envelope so the UI's `ErrorState` does not have to distinguish "fetch threw" from "server replied 5xx with no body".

`ErrorCode` is re-exported as a stable union so the UI can branch on backend codes (`UNAUTHENTICATED`, `INSUFFICIENT_PERMISSIONS`, `BILL_INVALID_TRANSITION`, etc.) and translate them into per-field or per-toast copy.

---

## Permission gating

`src/lib/roles.ts` is the single source of truth for the FE permission matrix. It mirrors `docs/api-contract.md → Permission matrix` action-for-action: each `Action` literal (`'bill.create'`, `'bill.approve'`, `'payment.schedule'`, `'bill.lineItem.write'`, etc.) maps to the roles the backend's `@Roles(...)` decorator accepts.

`useCan(action)` returns a boolean. UI hides or disables affordances the role cannot perform; the backend remains authoritative — every mutation still flows through the API client and surfaces the documented 403 envelope when the gate is bypassed. We deliberately *render* disabled affordances (with a tooltip) rather than removing them, so the surface stays predictable when switching roles via the "Acting as" picker.

---

## Query keys + invalidation

Every server-state query key is namespaced and includes the active user id where the response varies by role.

| Hook | Key |
|---|---|
| `useBillsQuery` | `['bills', activeUserId, params]` |
| `useBillQuery` | `['bill', billId, activeUserId]` |
| `useBillActivityQuery` | `['bill-activity', billId, activeUserId, pageSize]` |
| `useVendorsQuery` | `['vendors', activeUserId, params]` |
| `useAllVendorsQuery` | `['vendors-all', activeUserId]` |
| `usePaymentQuery` | `['payment', paymentId, activeUserId]` |

Mutations invalidate by **prefix** (`['bills']`, `['bill-activity']`) rather than exact key match, so every mounted variant of the list / activity surface refetches without us having to enumerate filter / pageSize combinations. The Phase 9 reviewer pass caught a stale-invalidation bug here (`['bill-activity', undefined, billId]` never matched the real keys); the pattern below is the correction.

Cascading rules:

- Any bill mutation invalidates `['bills']` + `['bill', billId]` + `['bill-activity', billId]`.
- Any payment mutation also invalidates the parent bill query, because the bill row carries the payment snapshot inline.
- Line item mutations invalidate the parent bill and its activity feed.

---

## Mutations

Each lifecycle action is its own `useMutation` hook under `src/hooks/`:

- `useCreateBillMutation` / `useUpdateBillMutation`
- `useSubmitBillMutation` / `useApproveBillMutation` / `useRejectBillMutation` / `useArchiveBillMutation`
- `useAddLineItemMutation` / `useUpdateLineItemMutation` / `useRemoveLineItemMutation`
- `useSchedulePaymentMutation` / `useUnschedulePaymentMutation` / `useReleasePaymentMutation` / `useMarkPaymentPaidMutation` / `useCancelPaymentMutation` / `useRetryPaymentMutation`
- `useCreateVendorMutation` / `useUpdateVendorMutation`

Each hook:

1. Calls `apiFetch` with the right verb / path / body.
2. On success: invalidates relevant query keys (see above), surfaces a `toast.success(...)` describing the change.
3. On error: surfaces `toast.error(...)` via `describeMutationError(error, fallback)`, which prefers a translated `BILL_INVALID_TRANSITION` / `PAYMENT_INVALID_TRANSITION` copy ("Cannot transition bill from PAID to ARCHIVED.") over the raw envelope when the code is known.

**Optimistic updates** are applied only where the result is deterministic and rollback is trivial:

- Bill status transitions (submit / approve / reject / archive) — patch `data.status` to the target status, rollback on error.
- Payment scheduling — patch the local payment block immediately so the UI feels instant.

Multi-row optimism (the bill index row reflecting a payment status flip) is avoided in favour of plain invalidation; the cost is one extra fetch, the savings is no divergence between row state and cache state on partial failures.

---

## Forms

No external form library. Each form (`BillForm`, `VendorFormDialog`, `LineItemFormDialog`, `ConfirmDialog` body) carries its own local state, submits on click, and surfaces the backend's `VALIDATION_ERROR` envelope inline beneath the affected fields via `extractValidationMessages`.

- **Date inputs**: `<input type="date">` returns `YYYY-MM-DD`; we append `T00:00:00.000Z` at submit time so the wire value is ISO-8601 UTC and round-trips through the formatter without a day shift.
- **Money inputs**: `<input type="number">` returns a string; we coerce to `Number(...).toFixed(2)` at submit so the wire is always the documented two-decimal string. Display uses `Intl.NumberFormat('en-US', { style: 'currency', currency })`.
- **Date/datetime display** pins `timeZone: 'UTC'` on every `Intl.DateTimeFormat` instance — the wire is UTC and the UI matches the wire so reviewers in non-UTC zones never see a day shift on invoice/due dates.

---

## URL ↔ state on the bills index

The bills index URL is the source of truth for tab, filters, sort, and pagination. Reasons:

- Deep-linkable: a reviewer can paste a filter combo into another tab and land on the same view.
- Back/forward navigation works for free — Next reads the route, the hooks re-derive their `queryKey` from the URL search params, TanStack Query refetches if anything changed.
- Survives reloads without an extra persistence layer.

The filter bar holds *local* state only for the three debounced inputs (`q`, `minAmount`, `maxAmount`). When the debounce fires, the latest snapshot of `value` + `onChange` is read from a ref (the Phase 9 reviewer pass caught a stale-closure bug where the debounced effect captured the `value` from the render in which it was created, clobbering newer filter changes). Selects and date pickers update the URL on every change.

Column visibility is persisted in localStorage per page; the keyed prefix is `bill-pay.columns.<page>` so future tables don't collide.

---

## State primitives

`src/components/states/` is the surface every fetch boundary points at:

- `Loading` — skeleton matching the surrounding shape so layout shift is minimal.
- `Empty` — title + optional CTA copy. Used both for "no results" and "no data yet" cases.
- `ErrorState` — renders the `ApiError.message` plus a retry button. Errors with `details.messages` are flattened into a sub-list so backend validation surfaces are scannable.
- `Forbidden` — frozen copy from `CLAUDE.md`: "Your role cannot perform this action." Used when a 403 envelope reaches a read surface.

Every `useQuery` consumer renders these instead of inlining their own loading/error markup.

---

## a11y notes worth keeping

- Every Radix `<Dialog>` carries a `DialogTitle` (visually hidden via `sr-only` when the dialog is icon-only, e.g. the vendor combobox). Radix warns in dev when this is missing.
- Disabled nav items are focusable `<button aria-disabled>` rather than non-focusable `<span>`s, so the Coming-in-a-later-phase tooltip is reachable by keyboard.
- The connection dot in the topbar is a focusable button so the tooltip with the last-checked timestamp and the parsed error envelope is reachable without a mouse.
- `<input type="number">` carries `inputMode="decimal"` and `min={0}` on amount/quantity/unit-price fields.

---

## Phase notes

### Phase 8 — Bootstrap

- App shell + role switcher + theme toggle + `ConnectionDot` (polls `/health` every 15s, surfaces a red dot with the parsed error envelope when the API is down).
- `useRoleHydrated()` mirrors Zustand's `persist.onFinishHydration` so consumers can gate queries until the persisted active user has been read.

### Phase 9 — Core views

- Bills index (tabs + filter bar + TanStack Table + URL state + column visibility), Vendors index (debounced search), Bill detail (line items + payment + approvals + polymorphic activity timeline).
- `approverName` joined into the bill response (backend addition) so the UI doesn't render cuids in the Approvals section.
- `CopyIdButton` for surfacing the underlying cuid on demand without polluting the cell.

### Phase 10 — Workflows

- Forms (`BillForm` shared by `/bills/new` and `/bills/[id]/edit`, `VendorFormDialog`, `LineItemFormDialog`), `ConfirmDialog` body for destructive flows.
- Bill lifecycle action cluster on the detail page; payment lifecycle inline on bills-index rows and on the detail page.
- Line item editing on the bill detail page (add / edit / remove) via the backend's dedicated sub-resource endpoints. Gated by both `useCan('bill.lineItem.write')` and a non-terminal bill status (`EDITABLE_BILL_STATUSES`), mirroring the backend's `ensureEditable` rule.
- `paymentMethod` is intentionally NOT in the bill form — the backend does not accept it on `POST /bills` (the field lives on `Payment`, defaulted from `vendor.defaultPaymentMethod` on approve). A future slice will surface an approve-time picker so a single bill can override the vendor default.
