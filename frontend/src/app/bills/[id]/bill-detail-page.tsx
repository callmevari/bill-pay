'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loading } from '@/components/states/loading';
import { Empty } from '@/components/states/empty';
import { ErrorState } from '@/components/states/error-state';
import { Forbidden } from '@/components/states/forbidden';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { PaymentStatusBadge } from '@/components/bills/payment-status-badge';
import { PaymentMethodBadge } from '@/components/bills/payment-method-badge';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { useBillQuery } from '@/hooks/use-bill-query';
import { useBillActivityQuery } from '@/hooks/use-bill-activity-query';
import { useAllVendorsQuery } from '@/hooks/use-vendors-query';
import { useRoleHydrated } from '@/stores/role-store';
import { ApiError, ErrorCode } from '@/lib/api';
import { formatDate, formatMoney, humanizeEnum } from '@/lib/format';
import type { ActivityLogEntry, Bill, BillApproval, BillPayment } from '@/lib/api-types';

interface BillDetailPageProps {
  billId: string;
}

export function BillDetailPage({ billId }: BillDetailPageProps): React.JSX.Element {
  const hydrated = useRoleHydrated();
  const billQuery = useBillQuery(billId, { enabled: hydrated });
  const vendorsQuery = useAllVendorsQuery({ enabled: hydrated });
  const activityQuery = useBillActivityQuery(billId, { enabled: hydrated });

  if (billQuery.error) {
    if (billQuery.error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      return <Forbidden />;
    }
    if (billQuery.error.code === ErrorCode.NOT_FOUND) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink />
          <Empty
            title="Bill not found"
            description="It may have been archived or the link is wrong."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/">Back to bills</Link>
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState
          error={billQuery.error}
          title="Could not load this bill"
          onRetry={() => void billQuery.refetch()}
        />
      </div>
    );
  }

  if (!hydrated || billQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Loading rows={6} />
      </div>
    );
  }

  const bill = billQuery.data;
  const vendorName = vendorsQuery.data?.data.find((v) => v.id === bill.vendorId)?.name ?? '—';

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <BillHeader bill={bill} vendorName={vendorName} />

      <section className="flex flex-col gap-3" aria-labelledby="line-items-heading">
        <h2 id="line-items-heading" className="text-sm font-semibold text-foreground">
          Line items
        </h2>
        {bill.lineItems.length === 0 ? (
          <Empty title="No line items on this bill" />
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bill.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">{item.description}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(item.unitPrice, bill.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(item.total, bill.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="text-sm font-semibold text-foreground">
          Payment
        </h2>
        <PaymentBlock payment={bill.payment} billCurrency={bill.currency} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="approvals-heading">
        <h2 id="approvals-heading" className="text-sm font-semibold text-foreground">
          Approvals
        </h2>
        <ApprovalsBlock approvals={bill.approvals} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-semibold text-foreground">
          Activity
        </h2>
        <ActivityBlock
          activity={activityQuery.data?.data ?? []}
          isPending={activityQuery.isPending}
          error={activityQuery.error}
          onRetry={() => void activityQuery.refetch()}
        />
      </section>
    </div>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start -ml-2">
      <Link href="/" aria-label="Back to bills">
        <ChevronLeft className="size-4" />
        Bills
      </Link>
    </Button>
  );
}

function BillHeader({ bill, vendorName }: { bill: Bill; vendorName: string }): React.JSX.Element {
  return (
    <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase text-muted-foreground">{bill.invoiceNumber}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{vendorName}</h1>
          {bill.description ? (
            <p className="text-sm text-muted-foreground">{bill.description}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <BillStatusBadge status={bill.status} />
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatMoney(bill.amount, bill.currency)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 text-xs md:grid-cols-4">
        <Field label="Invoice date" value={formatDate(bill.invoiceDate)} />
        <Field label="Due date" value={formatDate(bill.dueDate)} />
        <Field label="Currency" value={bill.currency} />
        <Field label="Created" value={formatDate(bill.createdAt)} />
      </dl>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function PaymentBlock({
  payment,
  billCurrency,
}: {
  payment: BillPayment | null;
  billCurrency: string;
}): React.JSX.Element {
  if (!payment) {
    return (
      <Empty
        title="No payment scheduled yet"
        description="A payment is created automatically when the bill is approved."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={payment.status} />
          <PaymentMethodBadge method={payment.method} />
        </div>
        <p className="font-mono text-sm tabular-nums">
          {formatMoney(payment.amount, payment.currency || billCurrency)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-3">
        <Field label="Scheduled for" value={formatDate(payment.scheduledFor)} />
        <Field label="Initiated" value={formatDate(payment.initiatedAt)} />
        <Field label="Paid" value={formatDate(payment.paidAt)} />
        <Field label="Failed" value={formatDate(payment.failedAt)} />
        <Field label="Canceled" value={formatDate(payment.canceledAt)} />
      </dl>
      {payment.failureReason ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground/90">
          <p className="text-xs font-semibold uppercase text-destructive">Failure reason</p>
          <p className="mt-1">{payment.failureReason}</p>
        </div>
      ) : null}
    </div>
  );
}

function ApprovalsBlock({ approvals }: { approvals: BillApproval[] }): React.JSX.Element {
  if (approvals.length === 0) {
    return (
      <Empty
        title="No approvals yet"
        description="An approval is opened when the bill is submitted for review."
      />
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Approver</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => (
            <TableRow key={approval.id}>
              <TableCell>
                <Badge variant={approvalVariant(approval.status)}>{humanizeEnum(approval.status)}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{approval.approverId}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {approval.notes ?? '—'}
              </TableCell>
              <TableCell className="text-sm">{formatDate(approval.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function approvalVariant(
  status: BillApproval['status'],
): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'destructive';
    case 'PENDING':
      return 'warning';
    case 'CANCELED':
      return 'outline';
  }
}

interface ActivityBlockProps {
  activity: ActivityLogEntry[];
  isPending: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

function ActivityBlock({
  activity,
  isPending,
  error,
  onRetry,
}: ActivityBlockProps): React.JSX.Element {
  if (error) {
    if (error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      return <Forbidden />;
    }
    return <ErrorState error={error} title="Could not load activity" onRetry={onRetry} />;
  }
  if (isPending) {
    return <Loading rows={4} />;
  }
  if (activity.length === 0) {
    return <Empty title="No activity recorded yet" />;
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <ActivityTimeline entries={activity} />
    </div>
  );
}
