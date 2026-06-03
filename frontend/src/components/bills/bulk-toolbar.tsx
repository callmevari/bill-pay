'use client';

import { useState } from 'react';
import {
  Archive,
  Ban,
  CalendarClock,
  CalendarDays,
  Check,
  PlayCircle,
  RefreshCw,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BulkResultModal } from './bulk-result-modal';
import {
  useBulkApproveBillsMutation,
  useBulkArchiveBillsMutation,
  useBulkEditBillsMutation,
  useBulkRejectBillsMutation,
  useBulkSubmitBillsMutation,
} from '@/hooks/use-bulk-bill-mutations';
import {
  useBulkCancelPaymentsMutation,
  useBulkMarkPaymentsPaidMutation,
  useBulkReleasePaymentsMutation,
  useBulkRetryPaymentsMutation,
  useBulkSchedulePaymentsMutation,
} from '@/hooks/use-bulk-payment-mutations';
import { useCan } from '@/hooks/use-can';
import type { BulkResponse } from '@/lib/bulk';
import type { Bill, BillPayment } from '@/lib/api-types';
import type { BillTabId } from '@/lib/bill-tabs';

// Bulk action toolbar rendered above the bills table when at least one
// row is selected. The toolbar consumes the page-owned selection plus the
// active tab id and decides which buttons are relevant — actions that
// would always fail for the rows on that tab are hidden, not just
// disabled. Buttons the active role cannot perform render disabled with
// an explanatory tooltip rather than disappearing, so the surface stays
// predictable across the "Acting as" picker.

interface BulkToolbarProps {
  // Ids of every selected row in the current page snapshot. The page
  // owns selection so the toolbar can read it without lifting state.
  selectedIds: string[];
  // Full bills payload for the current page — used to resolve invoice
  // numbers in the result modal and to find linked payment ids for the
  // payment-tab actions.
  bills: Bill[];
  activeTab: BillTabId;
  onClearSelection: () => void;
}

type BulkResultEntity = Bill | BillPayment;

type DialogKind = null | 'reject' | 'edit' | 'schedule';

export function BulkToolbar({
  selectedIds,
  bills,
  activeTab,
  onClearSelection,
}: BulkToolbarProps): React.JSX.Element | null {
  // Permission gates — mirror `docs/api-contract.md → Permission matrix`.
  // Bulk approve allows Approver too; everything else mutating is Admin.
  const canBulkApprove = useCan('bill.bulkApprove');
  const canBulkArchive = useCan('bill.bulkArchive');
  const canBulkEdit = useCan('bill.bulkEdit');
  const canReject = useCan('bill.reject');
  const canSubmit = useCan('bill.submitForApproval');
  const canSchedule = useCan('payment.schedule');
  const canRelease = useCan('payment.bulkRelease');
  const canMarkPaid = useCan('payment.bulkMarkAsPaid');
  const canCancel = useCan('payment.bulkCancel');
  const canRetry = useCan('payment.retry');

  // Bulk hooks.
  const approveMutation = useBulkApproveBillsMutation();
  const archiveMutation = useBulkArchiveBillsMutation();
  const editMutation = useBulkEditBillsMutation();
  const rejectMutation = useBulkRejectBillsMutation();
  const submitMutation = useBulkSubmitBillsMutation();
  const scheduleMutation = useBulkSchedulePaymentsMutation();
  const releaseMutation = useBulkReleasePaymentsMutation();
  const markPaidMutation = useBulkMarkPaymentsPaidMutation();
  const cancelMutation = useBulkCancelPaymentsMutation();
  const retryMutation = useBulkRetryPaymentsMutation();

  // Result modal state. `null` = no result yet; the modal stays hidden.
  // Each entry carries its own label resolver so bill-shaped and
  // payment-shaped results render the right identifier per row.
  const [result, setResult] = useState<{
    title: string;
    response: BulkResponse<BulkResultEntity>;
    resolveLabel: (item: { id: string; data?: BulkResultEntity }) => string;
  } | null>(null);

  // Dialog state for actions that need extra input.
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [scheduledFor, setScheduledFor] = useState(() => tomorrowYmd());
  const [editDueDate, setEditDueDate] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEnableDescription, setEditEnableDescription] = useState(false);

  if (selectedIds.length === 0) return null;
  if (activeTab === 'history') return null;

  const selectedSet = new Set(selectedIds);
  const selectedBills = bills.filter((bill) => selectedSet.has(bill.id));

  // Map a bill id to its linked payment id so payment-tab actions can be
  // dispatched against the right entity. Rows without a payment are
  // dropped — the buttons disable when nothing in the selection has one.
  const paymentIds = selectedBills
    .map((bill) => bill.payment?.id)
    .filter((id): id is string => typeof id === 'string');
  const billIdByPaymentId = new Map<string, string>();
  for (const bill of selectedBills) {
    if (bill.payment) billIdByPaymentId.set(bill.payment.id, bill.id);
  }

  const invoiceById = new Map(bills.map((bill) => [bill.id, bill.invoiceNumber]));

  const resolveBillLabel = (item: { id: string; data?: BulkResultEntity }): string => {
    if (item.data && 'invoiceNumber' in item.data) return item.data.invoiceNumber;
    return invoiceById.get(item.id) ?? item.id;
  };

  const resolvePaymentLabel = (item: { id: string; data?: BulkResultEntity }): string => {
    const billId = billIdByPaymentId.get(item.id);
    if (billId) return invoiceById.get(billId) ?? billId;
    return item.id;
  };

  // After every bulk run, open the modal with the envelope, invalidate
  // happens inside the hook's `onSettled`, and the selection is cleared
  // so a second action does not fire against rows the user no longer
  // expects to be selected.
  const presentBills = (
    title: string,
    response: BulkResponse<Bill> | undefined,
  ): void => {
    if (!response) return;
    setResult({
      title,
      response: response as BulkResponse<BulkResultEntity>,
      resolveLabel: resolveBillLabel,
    });
    onClearSelection();
  };
  const presentPayments = (
    title: string,
    response: BulkResponse<BillPayment> | undefined,
  ): void => {
    if (!response) return;
    setResult({
      title,
      response: response as BulkResponse<BulkResultEntity>,
      resolveLabel: resolvePaymentLabel,
    });
    onClearSelection();
  };

  const isAnyPending =
    approveMutation.isPending ||
    archiveMutation.isPending ||
    editMutation.isPending ||
    rejectMutation.isPending ||
    submitMutation.isPending ||
    scheduleMutation.isPending ||
    releaseMutation.isPending ||
    markPaidMutation.isPending ||
    cancelMutation.isPending ||
    retryMutation.isPending;

  const draftActions = activeTab === 'drafts' || activeTab === 'overview';
  const approvalActions = activeTab === 'for-approvals' || activeTab === 'overview';
  const paymentActions = activeTab === 'for-payment' || activeTab === 'overview';

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2"
        role="region"
        aria-label="Bulk actions"
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            Clear selection
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftActions ? (
            <>
              <Affordance
                show
                enabled={canSubmit}
                disabledHint="Your role cannot submit bills for approval."
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canSubmit || isAnyPending}
                  onClick={async () => {
                    const response = await submitMutation.mutateAsync({ ids: selectedIds });
                    presentBills('Submit for approval', response);
                  }}
                >
                  <Send className="size-4" />
                  Submit for approval
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canBulkEdit}
                disabledHint="Your role cannot edit bills."
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canBulkEdit || isAnyPending}
                  onClick={() => setDialog('edit')}
                >
                  <CalendarClock className="size-4" />
                  Edit
                </Button>
              </Affordance>
            </>
          ) : null}

          {approvalActions ? (
            <>
              <Affordance
                show
                enabled={canBulkApprove}
                disabledHint="Your role cannot approve bills."
              >
                <Button
                  size="sm"
                  disabled={!canBulkApprove || isAnyPending}
                  onClick={async () => {
                    const response = await approveMutation.mutateAsync({ ids: selectedIds });
                    presentBills('Approve bills', response);
                  }}
                >
                  <Check className="size-4" />
                  Approve
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canReject}
                disabledHint="Your role cannot reject bills."
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canReject || isAnyPending}
                  onClick={() => setDialog('reject')}
                >
                  <X className="size-4" />
                  Reject
                </Button>
              </Affordance>
            </>
          ) : null}

          {paymentActions ? (
            <>
              <Affordance
                show
                enabled={canSchedule && paymentIds.length > 0}
                disabledHint={
                  canSchedule
                    ? 'None of the selected bills have a payment yet.'
                    : 'Your role cannot schedule payments.'
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canSchedule || paymentIds.length === 0 || isAnyPending}
                  onClick={() => setDialog('schedule')}
                >
                  <CalendarDays className="size-4" />
                  Schedule
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canRelease && paymentIds.length > 0}
                disabledHint={
                  canRelease
                    ? 'None of the selected bills have a payment yet.'
                    : 'Your role cannot release payments.'
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canRelease || paymentIds.length === 0 || isAnyPending}
                  onClick={async () => {
                    const response = await releaseMutation.mutateAsync({ ids: paymentIds });
                    presentPayments('Release payments', response);
                  }}
                >
                  <PlayCircle className="size-4" />
                  Release
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canMarkPaid && paymentIds.length > 0}
                disabledHint={
                  canMarkPaid
                    ? 'None of the selected bills have a payment yet.'
                    : 'Your role cannot mark payments as paid.'
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canMarkPaid || paymentIds.length === 0 || isAnyPending}
                  onClick={async () => {
                    const response = await markPaidMutation.mutateAsync({ ids: paymentIds });
                    presentPayments('Mark payments as paid', response);
                  }}
                >
                  <Wallet className="size-4" />
                  Mark as paid
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canCancel && paymentIds.length > 0}
                disabledHint={
                  canCancel
                    ? 'None of the selected bills have a payment yet.'
                    : 'Your role cannot cancel payments.'
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canCancel || paymentIds.length === 0 || isAnyPending}
                  onClick={async () => {
                    const response = await cancelMutation.mutateAsync({ ids: paymentIds });
                    presentPayments('Cancel payments', response);
                  }}
                >
                  <Ban className="size-4" />
                  Cancel
                </Button>
              </Affordance>
              <Affordance
                show
                enabled={canRetry && paymentIds.length > 0}
                disabledHint={
                  canRetry
                    ? 'None of the selected bills have a payment yet.'
                    : 'Your role cannot retry payments.'
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canRetry || paymentIds.length === 0 || isAnyPending}
                  onClick={async () => {
                    const response = await retryMutation.mutateAsync({ ids: paymentIds });
                    presentPayments('Retry payments', response);
                  }}
                >
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </Affordance>
            </>
          ) : null}

          <Affordance
            show
            enabled={canBulkArchive}
            disabledHint="Your role cannot archive bills."
          >
            <Button
              size="sm"
              variant="outline"
              disabled={!canBulkArchive || isAnyPending}
              onClick={async () => {
                const response = await archiveMutation.mutateAsync({ ids: selectedIds });
                presentBills('Archive bills', response);
              }}
            >
              <Archive className="size-4" />
              Archive
            </Button>
          </Affordance>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setRejectNotes('');
          }
        }}
        title={`Reject ${selectedIds.length} bill${selectedIds.length === 1 ? '' : 's'}?`}
        description="The selected bills will be moved to REJECTED. This cannot be undone."
        confirmLabel="Reject bills"
        destructive
        pending={rejectMutation.isPending}
        onConfirm={async () => {
          const response = await rejectMutation.mutateAsync({
            ids: selectedIds,
            notes: rejectNotes.trim() ? rejectNotes.trim() : undefined,
          });
          setDialog(null);
          setRejectNotes('');
          presentBills('Reject bills', response);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-reject-notes">Notes (optional)</Label>
          <Textarea
            id="bulk-reject-notes"
            value={rejectNotes}
            onChange={(event) => setRejectNotes(event.target.value)}
            placeholder="Why are these bills being rejected?"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'schedule'}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Schedule payments"
        description={`Pick the date the ${paymentIds.length} selected payment${paymentIds.length === 1 ? '' : 's'} should be released.`}
        confirmLabel="Schedule"
        pending={scheduleMutation.isPending}
        onConfirm={async () => {
          if (!scheduledFor) return;
          const response = await scheduleMutation.mutateAsync({
            ids: paymentIds,
            scheduledFor,
          });
          setDialog(null);
          presentPayments('Schedule payments', response);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-schedule-date">Scheduled for</Label>
          <Input
            id="bulk-schedule-date"
            type="date"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'edit'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setEditDueDate('');
            setEditInvoiceDate('');
            setEditDescription('');
            setEditEnableDescription(false);
          }
        }}
        title={`Edit ${selectedIds.length} bill${selectedIds.length === 1 ? '' : 's'}`}
        description="Due date, invoice date, and description can be bulk-edited. Leave a field blank to keep it untouched; terminal bills will fail per item."
        confirmLabel="Apply changes"
        pending={editMutation.isPending}
        onConfirm={async () => {
          const fields: {
            dueDate?: string;
            invoiceDate?: string;
            description?: string | null;
          } = {};
          if (editDueDate) fields.dueDate = `${editDueDate}T00:00:00.000Z`;
          if (editInvoiceDate) fields.invoiceDate = `${editInvoiceDate}T00:00:00.000Z`;
          if (editEnableDescription) {
            fields.description = editDescription.trim() === '' ? null : editDescription.trim();
          }
          if (Object.keys(fields).length === 0) {
            // Nothing to send — close silently rather than 400.
            setDialog(null);
            return;
          }
          const response = await editMutation.mutateAsync({ ids: selectedIds, fields });
          setDialog(null);
          setEditDueDate('');
          setEditInvoiceDate('');
          setEditDescription('');
          setEditEnableDescription(false);
          presentBills('Edit bills', response);
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-edit-invoice-date">Invoice date</Label>
            <Input
              id="bulk-edit-invoice-date"
              type="date"
              value={editInvoiceDate}
              onChange={(event) => setEditInvoiceDate(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Useful for batch typo correction across an invoice run.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-edit-due-date">Due date</Label>
            <Input
              id="bulk-edit-due-date"
              type="date"
              value={editDueDate}
              onChange={(event) => setEditDueDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="bulk-edit-description">Description</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editEnableDescription}
                  onChange={(event) => setEditEnableDescription(event.target.checked)}
                  className="size-3.5"
                />
                Apply to selection
              </label>
            </div>
            <Textarea
              id="bulk-edit-description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              placeholder="Leave blank to clear the description on each selected bill."
              disabled={!editEnableDescription}
            />
          </div>
        </div>
      </ConfirmDialog>

      <BulkResultModal
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
        title={result?.title ?? ''}
        response={result?.response ?? null}
        resolveLabel={result?.resolveLabel}
      />
    </>
  );
}

function tomorrowYmd(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface AffordanceProps {
  show: boolean;
  enabled: boolean;
  disabledHint: string;
  children: React.ReactNode;
}

// Re-used "disabled with reason" wrapper. Identical pattern to
// `bill-actions.tsx` so the bulk toolbar matches the inline action
// cluster: disabled buttons stay focusable via a span so the tooltip is
// keyboard reachable.
function Affordance({ show, enabled, disabledHint, children }: AffordanceProps): React.JSX.Element | null {
  if (!show) return null;
  if (enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledHint}</TooltipContent>
    </Tooltip>
  );
}
