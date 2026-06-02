Re: [callmevari/bill-pay] feat(frontend): add bills + vendors core views with tabs, filters, detail (PR #10)

@Copilot commented on this pull request.

Pull request overview
Adds the Phase 9 read-only “spine” for the Bill Pay app: a bills index (tabs + filters + sortable table + column visibility), a vendors list (debounced search + pagination), and a bill detail page (line items + payment + approvals + activity timeline). It also updates backend bill responses and activity logging to support the new UI surfaces (approver display names + deterministic activity ordering).

Changes:

Frontend: introduce Bills index + Vendors index + Bill detail (TanStack Table, URL-driven state, debounced search, activity timeline, copy-id affordance).
Backend: add approverName to bill approval responses; fix activity log ordering determinism (explicit createdAt, secondary sort by id, reorder payment/bill cascade logging).
Seed/docs: stagger seeded activity timestamps to preserve lifecycle order; document the new approverName field.
Reviewed changes
Copilot reviewed 33 out of 35 changed files in this pull request and generated 5 comments.

Show a summary per file
File	Description
pnpm-lock.yaml	Adds TanStack Table dependency and lockfile updates.
frontend/package.json	Adds @tanstack/react-table.
frontend/src/lib/table-meta.d.ts	TanStack Table column meta augmentation for human labels (visibility UI).
frontend/src/lib/format.ts	Centralized money/date/time formatters + enum humanization.
frontend/src/lib/bill-tabs.ts	Defines canonical bills tab configuration and status mappings.
frontend/src/lib/api-types.ts	Adds shared wire-shape types mirroring docs/api-contract.md.
frontend/src/hooks/use-vendors-query.ts	Adds vendors list query hook + “all vendors” helper for dropdowns.
frontend/src/hooks/use-debounced-value.ts	Adds debounced value hook for search inputs.
frontend/src/hooks/use-bills-query.ts	Adds bills list query hook with filter/sort params.
frontend/src/hooks/use-bill-query.ts	Adds single-bill query hook.
frontend/src/hooks/use-bill-activity-query.ts	Adds bill activity query hook.
frontend/src/components/ui/copy-id-button.tsx	Adds reusable “copy opaque id” UI button with tooltip/toast.
frontend/src/components/ui/badge.tsx	Updates success badge styling.
frontend/src/components/layout/sidebar.tsx	Enables Vendors nav item.
frontend/src/components/bills/payment-status-badge.tsx	Adds payment status badge mapping.
frontend/src/components/bills/payment-method-badge.tsx	Adds payment method badge display.
frontend/src/components/bills/filter-bar.tsx	Adds bills filter bar (vendor/method/date/amount/search) with debounced inputs.
frontend/src/components/bills/column-visibility.tsx	Adds column visibility dropdown for TanStack Table.
frontend/src/components/bills/bills-table.tsx	Adds bills table (sorting, persisted column visibility, row navigation).
frontend/src/components/bills/bill-status-badge.tsx	Adds bill status badge mapping.
frontend/src/components/activity/activity-timeline.tsx	Adds polymorphic activity timeline rendering.
frontend/src/app/vendors/vendors-page.tsx	Implements vendors index page (search, pagination, column visibility).
frontend/src/app/vendors/page.tsx	Suspense wrapper route for vendors index.
frontend/src/app/page.tsx	Routes home to BillsPage under Suspense boundary.
frontend/src/app/health-card.tsx	Removes bootstrap health/auth probe UI.
frontend/src/app/bills/[id]/page.tsx	Adds bill detail route wrapper to pass id to client component.
frontend/src/app/bills/[id]/bill-detail-page.tsx	Implements bill detail page (header, line items, payment, approvals, activity).
frontend/src/app/bills-page.tsx	Implements bills index page (tabs, URL-driven filters/sort/pagination, table).
docs/api-contract.md	Documents approverName on approval rows in bill responses.
backend/src/payments/payments.service.ts	Reorders logging vs bill cascade and sets explicit createdAt for activity rows.
backend/src/bills/dto/bill-approval-response.dto.ts	Adds approverName to approval response DTO.
backend/src/bills/bills.service.ts	Includes approver name in bill reads; sets explicit createdAt in activity logging.
backend/src/bills/bills.mapper.ts	Maps approverName from joined approver relation.
backend/src/activity/activity.service.ts	Adds secondary id sort for deterministic ordering on timestamp ties.
backend/prisma/seed.ts	Staggers seeded timestamps to preserve activity ordering.
Files not reviewed (1)
pnpm-lock.yaml: Language not supported
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In frontend/src/components/bills/filter-bar.tsx:

> +  useEffect(() => {
+    if (debouncedQ !== value.q) onChange({ ...value, q: debouncedQ });
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [debouncedQ]);
This effect intentionally omits value/onChange from its dependency list, but it closes over them. When another filter field changes (e.g. vendor) before the debounce fires, this can call onChange with a stale value and overwrite the newer selection.

In frontend/src/components/bills/filter-bar.tsx:

> +  useEffect(() => {
+    if (debouncedMin !== value.minAmount) onChange({ ...value, minAmount: debouncedMin });
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [debouncedMin]);
Same stale-closure issue as the search effect: omitting value/onChange from deps can cause the debounce to apply an older snapshot and clobber other filters.

In frontend/src/components/bills/filter-bar.tsx:

> +  useEffect(() => {
+    if (debouncedMax !== value.maxAmount) onChange({ ...value, maxAmount: debouncedMax });
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [debouncedMax]);
Same stale-closure issue as the other debounced fields: with the current deps, this can apply a stale value object and reset other filter fields.

In frontend/src/lib/format.ts:

> +const dateFormatter = new Intl.DateTimeFormat('en-US', {
+  month: 'short',
+  day: 'numeric',
+  year: 'numeric',
+});
+
+const timeFormatter = new Intl.DateTimeFormat('en-US', {
+  hour: '2-digit',
+  minute: '2-digit',
+  hour12: false,
+});
formatDate/formatDateTime currently format in the browser’s local timezone. Since the API sends UTC timestamps (often at 00:00:00.000Z for invoice/due dates), users west of UTC will see date-only fields shift to the previous day. Set the formatter timezone explicitly to UTC to keep wire dates stable.

In frontend/src/hooks/use-vendors-query.ts:

> +// All vendors used as a dropdown source / id→name map. Backend caps
+// pageSize at 100; the seed ships ~10 vendors so a single page covers it
+// comfortably.
+export function useAllVendorsQuery(
+  options: { enabled?: boolean } = {},
+): UseQueryResult<ListEnvelope<Vendor>, ApiError> {
+  return useVendorsQuery({ pageSize: 100, sort: 'name' }, options);
+}
useAllVendorsQuery only fetches the first page (max 100) but its name/comments imply it returns all vendors. This will silently omit vendors once meta.total > 100, which breaks the vendor filter dropdown and id→name mapping.