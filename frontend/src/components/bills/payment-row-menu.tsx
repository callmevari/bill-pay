'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useCancelPaymentMutation,
  useMarkPaymentPaidMutation,
  useReleasePaymentMutation,
  useRetryPaymentMutation,
  useSchedulePaymentMutation,
  useUnschedulePaymentMutation,
} from '@/hooks/use-payment-lifecycle-mutation';
import { useCan } from '@/hooks/use-can';
import {
  PAYMENT_ACTION_LABELS,
  isPaymentActionAvailable,
  paymentActionDisabledReason,
  type PaymentAction,
} from '@/lib/payment-actions';
import type { BillPayment } from '@/lib/api-types';

interface PaymentRowMenuProps {
  payment: BillPayment;
}

type DialogKind = null | 'schedule' | 'unschedule' | 'release' | 'markPaid' | 'cancel';

function tomorrowYmd(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Row-level action menu rendered on the For Payment and History tabs.
// Disabled items render in place (greyed out) so the surface stays
// predictable across rows — clicking them never silently no-ops; they
// surface the reason on hover.
export function PaymentRowMenu({ payment }: PaymentRowMenuProps): React.JSX.Element {
  const canSchedule = useCan('payment.schedule');
  const canUnschedule = useCan('payment.unschedule');
  const canRelease = useCan('payment.release');
  const canMark = useCan('payment.markAsPaid');
  const canCancel = useCan('payment.cancel');
  const canRetry = useCan('payment.retry');

  const scheduleMutation = useSchedulePaymentMutation();
  const unscheduleMutation = useUnschedulePaymentMutation();
  const releaseMutation = useReleasePaymentMutation();
  const markPaidMutation = useMarkPaymentPaidMutation();
  const cancelMutation = useCancelPaymentMutation();
  const retryMutation = useRetryPaymentMutation();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [scheduledFor, setScheduledFor] = useState(tomorrowYmd());

  // Hide the menu entirely when no action is reachable for this payment
  // — either because the user's role allows none of them OR because the
  // payment is in a terminal/inactive state (PAID, CANCELED) where every
  // transition would be invalid. Matches the behaviour for bills with no
  // payment at all (REJECTED, DRAFT-archived), keeping the History tab
  // consistent.
  const reachable =
    (canSchedule && isPaymentActionAvailable('schedule', payment.status)) ||
    (canUnschedule && isPaymentActionAvailable('unschedule', payment.status)) ||
    (canRelease && isPaymentActionAvailable('release', payment.status)) ||
    (canMark && isPaymentActionAvailable('markAsPaid', payment.status)) ||
    (canCancel && isPaymentActionAvailable('cancel', payment.status)) ||
    (canRetry && isPaymentActionAvailable('retry', payment.status));
  if (!reachable) return <></>;

  const close = (): void => setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Payment actions"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Payment</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canSchedule ? (
            <ActionItem
              action="schedule"
              status={payment.status}
              onSelect={() => setDialog('schedule')}
            />
          ) : null}
          {canUnschedule ? (
            <ActionItem
              action="unschedule"
              status={payment.status}
              onSelect={() => setDialog('unschedule')}
            />
          ) : null}
          {canRelease ? (
            <ActionItem
              action="release"
              status={payment.status}
              onSelect={() => setDialog('release')}
            />
          ) : null}
          {canMark ? (
            <ActionItem
              action="markAsPaid"
              status={payment.status}
              onSelect={() => setDialog('markPaid')}
            />
          ) : null}
          {canCancel ? (
            <ActionItem
              action="cancel"
              status={payment.status}
              onSelect={() => setDialog('cancel')}
            />
          ) : null}
          {canRetry ? (
            <ActionItem
              action="retry"
              status={payment.status}
              onSelect={() => retryMutation.mutate({ paymentId: payment.id })}
            />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === 'schedule'}
        onOpenChange={(open) => (open ? setDialog('schedule') : close())}
        title="Schedule payment"
        description="Pick the date the payment should be released."
        confirmLabel="Schedule"
        pending={scheduleMutation.isPending}
        onConfirm={async () => {
          if (!scheduledFor) return;
          await scheduleMutation.mutateAsync({
            paymentId: payment.id,
            scheduledFor,
          });
          close();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="row-schedule-date">Scheduled for</Label>
          <Input
            id="row-schedule-date"
            type="date"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'unschedule'}
        onOpenChange={(open) => (open ? setDialog('unschedule') : close())}
        title="Unschedule payment?"
        description="The payment goes back to UNSCHEDULED and the bill returns to APPROVED."
        confirmLabel="Unschedule"
        pending={unscheduleMutation.isPending}
        onConfirm={async () => {
          await unscheduleMutation.mutateAsync({ paymentId: payment.id });
          close();
        }}
      />

      <ConfirmDialog
        open={dialog === 'release'}
        onOpenChange={(open) => (open ? setDialog('release') : close())}
        title="Release payment?"
        description="The payment will be marked INITIATED."
        confirmLabel="Release"
        pending={releaseMutation.isPending}
        onConfirm={async () => {
          await releaseMutation.mutateAsync({ paymentId: payment.id });
          close();
        }}
      />

      <ConfirmDialog
        open={dialog === 'markPaid'}
        onOpenChange={(open) => (open ? setDialog('markPaid') : close())}
        title="Mark as paid?"
        description="The payment will be marked PAID and the linked bill closed."
        confirmLabel="Mark as paid"
        pending={markPaidMutation.isPending}
        onConfirm={async () => {
          await markPaidMutation.mutateAsync({ paymentId: payment.id });
          close();
        }}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => (open ? setDialog('cancel') : close())}
        title="Cancel payment?"
        description="The payment will be marked CANCELED."
        confirmLabel="Cancel payment"
        destructive
        pending={cancelMutation.isPending}
        onConfirm={async () => {
          await cancelMutation.mutateAsync({ paymentId: payment.id });
          close();
        }}
      />
    </>
  );
}

interface ActionItemProps {
  action: PaymentAction;
  status: BillPayment['status'];
  onSelect: () => void;
}

function ActionItem({ action, status, onSelect }: ActionItemProps): React.JSX.Element {
  const available = isPaymentActionAvailable(action, status);
  return (
    <DropdownMenuItem
      disabled={!available}
      onSelect={(event) => {
        // Only block the default close behaviour when the item is
        // disabled — for enabled items we want Radix to dismiss the
        // menu so the confirmation dialog isn't rendered behind a
        // still-open dropdown.
        if (!available) {
          event.preventDefault();
          return;
        }
        onSelect();
      }}
      title={available ? undefined : paymentActionDisabledReason(action, status)}
    >
      {PAYMENT_ACTION_LABELS[action]}
    </DropdownMenuItem>
  );
}
