'use client';

import { useState } from 'react';
import {
  Ban,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  RotateCcw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

interface PaymentActionsProps {
  payment: BillPayment;
}

function tomorrowYmd(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function PaymentActions({ payment }: PaymentActionsProps): React.JSX.Element {
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

  const isPending =
    scheduleMutation.isPending ||
    unscheduleMutation.isPending ||
    releaseMutation.isPending ||
    markPaidMutation.isPending ||
    cancelMutation.isPending ||
    retryMutation.isPending;

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(tomorrowYmd());
  const [unscheduleOpen, setUnscheduleOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Hide the entire cluster when no action is reachable for this
  // payment's status (terminal or role-restricted), so the detail page
  // doesn't render a wall of disabled buttons for PAID / CANCELED
  // payments or for Viewer / Approver roles.
  const reachable =
    (canSchedule && isPaymentActionAvailable('schedule', payment.status)) ||
    (canUnschedule && isPaymentActionAvailable('unschedule', payment.status)) ||
    (canRelease && isPaymentActionAvailable('release', payment.status)) ||
    (canMark && isPaymentActionAvailable('markAsPaid', payment.status)) ||
    (canCancel && isPaymentActionAvailable('cancel', payment.status)) ||
    (canRetry && isPaymentActionAvailable('retry', payment.status));
  if (!reachable) return <></>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSchedule ? (
        <ActionButton
          action="schedule"
          status={payment.status}
          icon={<CalendarClock className="size-4" />}
          onClick={() => setScheduleOpen(true)}
          disabled={isPending}
        />
      ) : null}
      {canUnschedule ? (
        <ActionButton
          action="unschedule"
          status={payment.status}
          icon={<CalendarOff className="size-4" />}
          onClick={() => setUnscheduleOpen(true)}
          disabled={isPending}
          variant="outline"
        />
      ) : null}
      {canRelease ? (
        <ActionButton
          action="release"
          status={payment.status}
          icon={<Send className="size-4" />}
          onClick={() => setReleaseOpen(true)}
          disabled={isPending}
        />
      ) : null}
      {canMark ? (
        <ActionButton
          action="markAsPaid"
          status={payment.status}
          icon={<CheckCircle2 className="size-4" />}
          onClick={() => setMarkPaidOpen(true)}
          disabled={isPending}
        />
      ) : null}
      {canCancel ? (
        <ActionButton
          action="cancel"
          status={payment.status}
          icon={<Ban className="size-4" />}
          onClick={() => setCancelOpen(true)}
          disabled={isPending}
          variant="outline"
        />
      ) : null}
      {canRetry ? (
        <ActionButton
          action="retry"
          status={payment.status}
          icon={<RotateCcw className="size-4" />}
          onClick={() => retryMutation.mutate({ paymentId: payment.id })}
          disabled={isPending}
          variant="outline"
        />
      ) : null}

      <ConfirmDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title="Schedule payment"
        description="Pick the date the payment should be released. Past dates are allowed for back-dating."
        confirmLabel="Schedule"
        pending={scheduleMutation.isPending}
        onConfirm={async () => {
          if (!scheduledFor) return;
          await scheduleMutation.mutateAsync({
            paymentId: payment.id,
            scheduledFor,
          });
          setScheduleOpen(false);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-date">Scheduled for</Label>
          <Input
            id="schedule-date"
            type="date"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={unscheduleOpen}
        onOpenChange={setUnscheduleOpen}
        title="Unschedule payment?"
        description="The payment will go back to UNSCHEDULED and the linked bill to APPROVED."
        confirmLabel="Unschedule"
        pending={unscheduleMutation.isPending}
        onConfirm={async () => {
          await unscheduleMutation.mutateAsync({ paymentId: payment.id });
          setUnscheduleOpen(false);
        }}
      />

      <ConfirmDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title="Release payment?"
        description="The payment will be marked INITIATED. Use this when funds are leaving the account."
        confirmLabel="Release"
        pending={releaseMutation.isPending}
        onConfirm={async () => {
          await releaseMutation.mutateAsync({ paymentId: payment.id });
          setReleaseOpen(false);
        }}
      />

      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title="Mark as paid?"
        description="The payment will be marked PAID and the linked bill closed."
        confirmLabel="Mark as paid"
        pending={markPaidMutation.isPending}
        onConfirm={async () => {
          await markPaidMutation.mutateAsync({ paymentId: payment.id });
          setMarkPaidOpen(false);
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel payment?"
        description="The payment will be marked CANCELED. The bill returns to APPROVED."
        confirmLabel="Cancel payment"
        destructive
        pending={cancelMutation.isPending}
        onConfirm={async () => {
          await cancelMutation.mutateAsync({ paymentId: payment.id });
          setCancelOpen(false);
        }}
      />
    </div>
  );
}

interface ActionButtonProps {
  action: PaymentAction;
  status: BillPayment['status'];
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline';
}

function ActionButton({
  action,
  status,
  icon,
  onClick,
  disabled,
  variant,
}: ActionButtonProps): React.JSX.Element {
  const available = isPaymentActionAvailable(action, status);
  const button = (
    <Button
      size="sm"
      variant={variant ?? 'default'}
      onClick={onClick}
      disabled={!available || disabled}
    >
      {icon}
      {PAYMENT_ACTION_LABELS[action]}
    </Button>
  );
  if (available) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{paymentActionDisabledReason(action, status)}</TooltipContent>
    </Tooltip>
  );
}
