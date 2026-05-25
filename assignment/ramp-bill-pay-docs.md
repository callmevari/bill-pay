# Managing Bills and Payments on Bill Pay

## Overview

The Bill Pay workspace centralizes bill and payment management. It exposes filters, sorts, and bulk actions designed to streamline the accounts payable workflow.

This document describes the feature surface the product should support. It is intended as the functional reference for implementation.

---

## Managing Bills

### Bill Table Views

Bills are organized by stage. The default top-level tabs are:

- **Drafts**
- **For Approvals**
- **For Payment**
- **History** — includes Paid and Archived bills
- **Overview** — shows all bills grouped by status

Columns within each view can be added, removed, and reordered. When a user consistently relies on a specific combination of columns and filters, that combination can be saved as a custom view.

### Bill Filters

The following filters apply to the Bills table:

- **Vendor** — bills for one or more vendors.
- **Vendor owner** — bills owned by one or more vendor owners.
- **Status** — bills filtered by any available status.
- **Missing info** — bills that were scanned but are missing required fields.
- **Ready** — bills with all required info and ready to proceed.
- **Awaiting approvals** — bills currently in the approval flow.
- **Scheduled** — approved bills with a scheduled payment date.
- **Initiated** — bills whose payment has been initiated.
- **Waiting for match** — approved bills waiting for a card transaction match.
- **Ready for payment** — approved bills selected to be paid off-platform.
- **Waiting for vendor** — bills with open vendor detail requests.
- **Unscheduled** — approved bills without a scheduled payment date.
- **Payment failed** — bills whose payment attempt failed.
- **Paid** — bills with completed payment.
- **Archived** — bills closed without payment. Visible in History for audit; cannot be restored.
- **Rejected** — bills rejected during approval.
- **Amount** — bills within a minimum/maximum amount range.
- **Payment type**:
  - ACH (direct deposit)
  - International wire (SWIFT USD and FX)
  - Check by mail
  - Card
  - Paid off-platform
- **Next approver** — bills in approval, filtered by upcoming approver.
- **ERP accounting fields** — accounting codings on the bill. If a field varies across line items, the table shows `MULTIPLE`.
- **Sync status**:
  - Sync successful
  - Sync in progress
  - Sync failed
- **Entity** — bills scoped to a specific entity (multi-entity tenants only).
- **Bill dates** — Invoice date, Due date, Payment send date, Payment arrival date.

Filters support an **Exclude** toggle, which inverts the selected categories.

### Bill Sorts

Bills can be sorted by:

- Vendor / Owner
- Status
- Amount
- Payment, Invoice, and Due dates
- Invoice #
- Entity

### Bill Bulk Actions

The Bills table supports the following bulk actions:

- **Remind approvers and vendors**
- **Edit bills**:
  - Amount
  - Due date
  - Invoice date
  - Description
  - Accounting fields
- **Retry sync** — re-attempt sync for bills or bill payments with sync errors.
- **Approval actions**:
  - **Approve** — bulk-approve bills in the approval queue.
- **Payment actions**:
  - **Mark bills as paid** — for bills paid off-platform.
  - **Edit payment date** — set or update the scheduled payment date.
  - **Pay now** — initiate payment for selected approved bills.
  - **Retry payments** — re-attempt failed payments.
  - **Unschedule** — remove the scheduled payment date.
  - **Cancel** — cancel initiated payments that have not yet been delivered.
  - **Delete** — permanently remove selected draft bills (Drafts tab only, admin-only, irreversible).

### Archiving a Bill

Archiving removes a bill from the active queue and from the connected accounting provider, marking it as closed without payment. This action is permanent. Archived bills remain visible in History for audit but cannot be restored.

**Canceling a payment vs. archiving a bill**: canceling stops an in-flight payment and returns the bill to an unpaid state in the active queue. Archiving closes the bill entirely.

To archive a bill:

1. Navigate to Bill Pay.
2. Locate the target bill.
3. Open the row's overflow menu and select **Archive bill**.
4. Confirm the action.

The bill moves to the History tab with an **Archived** status.

---

## Managing Payments

The Payments tab is a dedicated surface for managing payments after a bill has been fully approved. While the Bills tab focuses on invoice creation and approval, the Payments tab is the central workspace for tracking and acting on outgoing payments.

When a bill is fully approved, a payment object is created automatically. The payment represents the transfer of funds to the vendor and has its own lifecycle, status, and set of actions, distinct from the bill itself.

### Payments Table Views

Payments are organized by action stage:

- **Overview** — all payments at a glance, across statuses.
- **Needs Review** — triage view for payments that require action before going out (e.g. require release, missing information).
- **Pending** — payments in motion (ACH in transit, checks mailed, scheduled payments awaiting auto-release).
- **History** — completed and archived payments. Remittance receipts can be downloaded from the row actions.

### Payments Filters

- **Arrival date** — expected payment arrival.
- **Bill due date** — due date on the linked bill.
- **Payment date** — date the payment was sent or is scheduled to send.
- **Vendor** — payments by vendor name.
- **Status** — e.g. ready for release, initiated, scheduled, failed, paid.
- **Amount** — payment amount range.
- **Payment method** — ACH, check, wire, card, etc.

### Payments Sorts

Payments can be sorted by:

- Due date
- Payment date
- Arrival date

### Payments Bulk Actions

- **Release** — release payments ready for release.
- **Cancel** — cancel in-flight payments not yet delivered.
- **Edit payment date** — update the scheduled payment date.
- **Mark as paid** — mark off-platform payments as paid.
- **Retry** — retry failed payments.
- **Unschedule** — remove the scheduled payment date.

---

## Exporting Bills and Payments

Exports are available from each table's export menu. The following options are supported:

- **Export CSV** — exports the current list based on applied filters and visible columns. Draft and archived bills are excluded from CSV export.
- **Download invoices (ZIP)** — bulk download of invoice files. Available in the Bills table only. Delivery is asynchronous via email link.
- **Download AP aging report** — available in the Bills table only.
- **Advanced export** — see below.

### Advanced Export

The advanced export exposes additional fields beyond the standard table columns:

- Bill URL
- Invoice received date
- Payment method
- Payment initiated date
- Payment received date
- Bill amount
- Purchase order number
- Currency
- Bill payment sync status
- Entity
- Vendor memo
- Trace ID
- Check number
- Banking partner ID
- Latest approver
- Approvers
- Remote ID

Line-item-level accounting can be included via the export settings.

---

## FAQ

### Who has access to bill table views and the available filters, sorts, and bulk actions?

- **Admin, Owner, and Accounts Payable roles** have access to all Bill Pay tabs (Drafts, Approvals, Payments, History) and all bills within them.
- **Vendor Owners** have access to the Approvals, Payments, and History tabs, scoped to bills they own.
- **Approval-chain members** have access to the Approvals tab, scoped to bills requiring their approval. When approver editing is enabled by an admin, approvers may edit most bill fields during approval, except the total amount, payment details, and vendor.
- **Managers and Employees** who are not vendor owners or approvers do not have access to the Bill Pay tab.

### Can a deleted draft bill or archived bill be recovered?

No. Both actions are permanent.

- Deleted draft bills are removed and cannot be restored.
- Archived bills remain visible in History for audit but cannot be returned to an active state.
- To pay an archived bill, re-upload the original invoice to create a new bill.

### Can a partial payment be marked as paid on a bill?

No. **Mark as paid** applies to the full bill amount.

### Who can see the Payments tab?

Any user with the **view payment details** permission, including Admins, Owners, and AP Clerks by default.
