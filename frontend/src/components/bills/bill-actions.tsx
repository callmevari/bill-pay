'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, FileEdit, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useApproveBillMutation,
  useArchiveBillMutation,
  useRejectBillMutation,
  useSubmitBillMutation,
} from '@/hooks/use-bill-lifecycle-mutation';
import { useCan } from '@/hooks/use-can';
import type { Bill } from '@/lib/api-types';

interface BillActionsProps {
  bill: Bill;
}

// Inline action cluster on the bill detail page. Each affordance is gated
// by the role permission matrix AND the bill status — the disabled state
// uses a tooltip to explain why so users do not chase ghost buttons. The
// destructive moves (reject, archive) require explicit confirmation.
export function BillActions({ bill }: BillActionsProps): React.JSX.Element {
  const canSubmit = useCan('bill.submitForApproval');
  const canApprove = useCan('bill.approve');
  const canReject = useCan('bill.reject');
  const canArchive = useCan('bill.archive');
  const canEdit = useCan('bill.update');

  const submitMutation = useSubmitBillMutation();
  const approveMutation = useApproveBillMutation();
  const rejectMutation = useRejectBillMutation();
  const archiveMutation = useArchiveBillMutation();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const isPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    archiveMutation.isPending;

  const canSubmitNow = bill.status === 'DRAFT';
  const canDecideNow = bill.status === 'PENDING_APPROVAL';
  const canArchiveNow = bill.status !== 'PAID' && bill.status !== 'ARCHIVED';
  const canEditNow =
    bill.status !== 'PAID' && bill.status !== 'REJECTED' && bill.status !== 'ARCHIVED';

  const hasAnyAction = canSubmit || canApprove || canReject || canArchive || canEdit;
  if (!hasAnyAction) return <></>;

  const archiveCascade: string[] = [];
  if (bill.status === 'PENDING_APPROVAL') archiveCascade.push('cancel the pending approval');
  if (
    bill.payment &&
    (bill.payment.status === 'UNSCHEDULED' ||
      bill.payment.status === 'SCHEDULED' ||
      bill.payment.status === 'INITIATED' ||
      bill.payment.status === 'FAILED')
  ) {
    archiveCascade.push('cancel the in-flight payment');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Affordance
          enabled={canEditNow}
          disabledHint={`Bills in ${bill.status} cannot be edited.`}
        >
          {canEditNow ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/bills/${bill.id}/edit`}>
                <FileEdit className="size-4" />
                Edit
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <FileEdit className="size-4" />
              Edit
            </Button>
          )}
        </Affordance>
      ) : null}

      {canSubmit ? (
        <Affordance
          enabled={canSubmitNow}
          disabledHint={`Only DRAFT bills can be submitted. This one is ${bill.status}.`}
        >
          <Button
            size="sm"
            disabled={!canSubmitNow || isPending}
            onClick={() => submitMutation.mutate({ billId: bill.id })}
          >
            <Send className="size-4" />
            Submit for approval
          </Button>
        </Affordance>
      ) : null}

      {canApprove ? (
        <Affordance
          enabled={canDecideNow}
          disabledHint={`Only PENDING_APPROVAL bills can be approved. This one is ${bill.status}.`}
        >
          <Button
            size="sm"
            disabled={!canDecideNow || isPending}
            onClick={() => approveMutation.mutate({ billId: bill.id })}
          >
            <Check className="size-4" />
            Approve
          </Button>
        </Affordance>
      ) : null}

      {canReject ? (
        <Affordance
          enabled={canDecideNow}
          disabledHint={`Only PENDING_APPROVAL bills can be rejected. This one is ${bill.status}.`}
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!canDecideNow || isPending}
            onClick={() => setRejectOpen(true)}
          >
            <X className="size-4" />
            Reject
          </Button>
        </Affordance>
      ) : null}

      {canArchive ? (
        <Affordance
          enabled={canArchiveNow}
          disabledHint={`Bills in ${bill.status} cannot be archived.`}
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!canArchiveNow || isPending}
            onClick={() => setArchiveOpen(true)}
          >
            <Trash2 className="size-4" />
            Archive
          </Button>
        </Affordance>
      ) : null}

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectNotes('');
        }}
        title={`Reject ${bill.invoiceNumber}?`}
        description="The approval row will be marked REJECTED. This cannot be undone."
        confirmLabel="Reject bill"
        destructive
        pending={rejectMutation.isPending}
        onConfirm={async () => {
          await rejectMutation.mutateAsync({ billId: bill.id, notes: rejectNotes.trim() });
          setRejectOpen(false);
          setRejectNotes('');
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-notes">Notes (optional)</Label>
          <Textarea
            id="reject-notes"
            value={rejectNotes}
            onChange={(event) => setRejectNotes(event.target.value)}
            placeholder="Why is this bill being rejected?"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${bill.invoiceNumber}?`}
        description={
          archiveCascade.length > 0
            ? `This will also ${archiveCascade.join(' and ')}. Archival is permanent.`
            : 'Archival is permanent — the bill cannot be un-archived.'
        }
        confirmLabel="Archive bill"
        destructive
        pending={archiveMutation.isPending}
        onConfirm={async () => {
          await archiveMutation.mutateAsync({ billId: bill.id });
          setArchiveOpen(false);
        }}
      />
    </div>
  );
}

interface AffordanceProps {
  enabled: boolean;
  disabledHint: string;
  children: React.ReactNode;
}

// Wraps a button so its disabled state still announces a reason. Radix
// tooltips refuse to attach to disabled triggers; wrapping in a `span`
// keeps the tooltip hoverable while the button stays semantically
// disabled.
function Affordance({ enabled, disabledHint, children }: AffordanceProps): React.JSX.Element {
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
