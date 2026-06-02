Re: [callmevari/bill-pay] feat(workflows): create, approve, and pay bills end-to-end (PR #11)

@Copilot commented on this pull request.

Pull request overview
Implements Phase 10’s end-to-end bill workflow in the frontend UI, enabling users (with appropriate roles) to create/edit bills, drive bill and payment lifecycles, manage vendors, and edit bill line items with consistent mutation handling and cache invalidation.

Changes:

Added shared mutation hooks for bill lifecycle, payment lifecycle, vendor CRUD, bill create/update, and line-item add/update/remove (with toast/error helpers).
Introduced new UI surfaces: BillForm (/bills/new, /bills/[id]/edit), bill/payment action clusters, row-level payment dropdown actions, vendor create/edit dialog, and line-item edit dialogs on bill detail.
Added wire-convention utilities (money/date conversion + validation error extraction) and a frontend technical decisions log; switched next dev to Turbopack.
Reviewed changes
Copilot reviewed 28 out of 35 changed files in this pull request and generated 4 comments.

Show a summary per file
File	Description
frontend/src/lib/wire.ts	Adds wire conversion helpers (money/date) and validation message extraction.
frontend/src/lib/payment-actions.ts	Defines FE payment lifecycle action availability matrix + labels.
frontend/src/lib/mutation-errors.ts	Centralizes mutation error → toast copy translation.
frontend/src/hooks/use-vendor-mutations.ts	Vendor create/update mutations + vendor query invalidation.
frontend/src/hooks/use-update-bill-mutation.ts	Bill update mutation with cache update + invalidations.
frontend/src/hooks/use-payment-lifecycle-mutation.ts	Payment lifecycle mutation factory with optimistic scheduling + invalidation.
frontend/src/hooks/use-line-item-mutations.ts	Line-item add/update/remove mutations + editable-status guard constant.
frontend/src/hooks/use-create-bill-mutation.ts	Bill create mutation with cache seeding + list invalidation.
frontend/src/hooks/use-bill-lifecycle-mutation.ts	Bill lifecycle mutation factory with optimistic bill-status updates.
frontend/src/components/vendors/vendor-form-dialog.tsx	Vendor create/edit dialog with inline validation surfacing.
frontend/src/components/ui/textarea.tsx	Adds a shared styled textarea primitive.
frontend/src/components/ui/confirm-dialog.tsx	Adds shared confirmation dialog primitive for destructive flows.
frontend/src/components/bills/vendor-combobox.tsx	Adds vendor picker combobox dialog with a11y title/description.
frontend/src/components/bills/payment-row-menu.tsx	Adds row-level payment actions dropdown + confirm dialogs.
frontend/src/components/bills/payment-actions.tsx	Adds bill-detail payment action button cluster + confirm dialogs.
frontend/src/components/bills/line-item-form-dialog.tsx	Adds add/edit line-item dialog with client validation and totals preview.
frontend/src/components/bills/bills-table.tsx	Adds optional payment actions column for relevant tabs.
frontend/src/components/bills/bill-form.tsx	Adds shared bill create/edit form including line-items repeater on create.
frontend/src/components/bills/bill-actions.tsx	Adds bill lifecycle action cluster (submit/approve/reject/archive/edit).
frontend/src/app/vendors/vendors-page.tsx	Wires vendor create/edit via dialog + per-row actions menu.
frontend/src/app/bills/new/page.tsx	Adds the /bills/new route shell.
frontend/src/app/bills/new/new-bill-view.tsx	Adds permission-gated new-bill client view.
frontend/src/app/bills/[id]/edit/page.tsx	Adds the /bills/[id]/edit route shell.
frontend/src/app/bills/[id]/edit/edit-bill-view.tsx	Adds permission-gated edit-bill client view with error/empty handling.
frontend/src/app/bills/[id]/bill-detail-page.tsx	Adds bill actions, payment actions, and editable line-items block to bill detail.
frontend/src/app/bills-page.tsx	Wires “New bill” CTA and enables payment actions column on relevant tabs.
frontend/package.json	Switches pnpm dev to next dev --turbopack.
docs/frontend.md	Adds a living “Frontend Technical Decisions” log.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In frontend/src/components/bills/bills-table.tsx:

> +        cell: ({ row }) => {
+          const payment = row.original.payment;
+          if (!payment) return null;
+          // Stop click propagation so the row's "open detail" handler
+          // does not fire when the user is targeting the row dropdown.
+          return (
+            <div
+              onClick={(event) => event.stopPropagation()}
+              onKeyDown={(event) => event.stopPropagation()}
+              className="flex justify-end"
+            >
+              <PaymentRowMenu payment={payment} />
+            </div>
+          );
The actions-cell wrapper stops click/keyboard event propagation even when PaymentRowMenu renders nothing (e.g. terminal statuses). This makes rows non-navigable when the user clicks the empty actions cell. Since PaymentRowMenu already stops propagation on its trigger/content, the extra stopPropagation handlers here are unnecessary and can be removed.

In frontend/src/components/bills/payment-row-menu.tsx:

> +    <DropdownMenuItem
+      disabled={!available}
+      onSelect={(event) => {
+        event.preventDefault();
+        if (available) onSelect();
+      }}
ActionItem always calls event.preventDefault() in onSelect, which prevents Radix from closing the dropdown menu when an enabled action is chosen. This can leave the menu open behind the confirmation dialog / after triggering a mutation. Let the default behavior close the menu for enabled items.

In docs/frontend.md:

> +| `useBillQuery` | `['bill', billId, activeUserId]` |
+| `useBillActivityQuery` | `['bill-activity', billId, activeUserId, pageSize]` |
+| `useVendorsQuery` | `['vendors', activeUserId, params]` |
+| `useAllVendorsQuery` | `['vendors-all', activeUserId]` |
+| `usePaymentQuery` | `['payment', paymentId, activeUserId]` |
The query-key table doesn’t match the actual TanStack Query keys used by the hooks: useBillQuery and useBillActivityQuery place activeUserId before billId (see frontend/src/hooks/use-bill-query.ts / use-bill-activity-query.ts), and there is no usePaymentQuery hook in the frontend. Updating this table avoids misleading future contributors.

In docs/frontend.md:

> +- Any bill mutation invalidates `['bills']` + `['bill', billId]` + `['bill-activity', billId]`.
+- Any payment mutation also invalidates the parent bill query, because the bill row carries the payment snapshot inline.
+- Line item mutations invalidate the parent bill and its activity feed.
The “Cascading rules” bullets reference invalidation keys like ['bill', billId] / ['bill-activity', billId], but the code invalidates by namespace prefixes (e.g. invalidateQueries({ queryKey: ['bill-activity'] })) and/or updates the ['bill'] cache via setQueriesData. Consider rewording these bullets to match the prefix-based invalidation strategy and avoid implying a billId-specific key shape.