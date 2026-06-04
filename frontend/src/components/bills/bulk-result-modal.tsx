'use client';

import { useMemo } from 'react';
import { CheckCircle2, ClipboardCopy, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BulkResponse } from '@/lib/bulk';
import type { Bill, BillPayment } from '@/lib/api-types';
import { cn } from '@/lib/utils';

// Shared result view for every bulk action. Renders the per-item outcome
// list with success / failure indicators, the documented error code on
// failures, and a "Copy failed ids" affordance so the user can retry
// from a fresh selection. The data shape is the documented
// `{ results, summary }` envelope (see `docs/api-contract.md → Bulk
// operations`) — true for both backend bulk endpoints and our
// client-side fan-outs.

type BulkResultEntity = Bill | BillPayment;

interface BulkResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // The bulk response. `null` means "no result yet" — the modal stays
  // hidden via `open={false}` in that case.
  response: BulkResponse<BulkResultEntity> | null;
  // Optional label resolver so the list shows invoice numbers / human
  // identifiers instead of opaque cuids. Falls back to the id when not
  // resolved.
  resolveLabel?: (item: { id: string; data?: BulkResultEntity }) => string;
}

export function BulkResultModal({
  open,
  onOpenChange,
  title,
  response,
  resolveLabel,
}: BulkResultModalProps): React.JSX.Element {
  const summary = response?.summary;
  const results = useMemo(() => response?.results ?? [], [response]);

  const failedIds = useMemo(
    () => results.filter((r) => !r.ok).map((r) => r.id),
    [results],
  );

  const copyFailedIds = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(failedIds.join('\n'));
      toast.success(`Copied ${failedIds.length} failed id${failedIds.length === 1 ? '' : 's'}.`);
    } catch {
      toast.error('Copy failed. Your browser blocked clipboard access.');
    }
  };

  const description = summary
    ? `${summary.succeeded} succeeded · ${summary.failed} failed`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {summary ? (
            <DialogDescription aria-live="polite">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items were processed.</p>
        ) : (
          <ol
            className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-card/40 p-2"
            aria-label="Bulk action results"
          >
            {results.map((item) => {
              const label = resolveLabel?.({ id: item.id, data: item.data }) ?? item.id;
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {item.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{label}</span>
                      {item.ok ? null : (
                        <span className="truncate text-xs text-muted-foreground">
                          {item.error?.message ?? 'Failed.'}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={item.ok ? 'success' : 'destructive'}
                    className={cn('shrink-0 font-mono text-[10px]')}
                  >
                    {item.ok ? 'OK' : item.error?.code ?? 'ERROR'}
                  </Badge>
                </li>
              );
            })}
          </ol>
        )}

        <DialogFooter>
          {failedIds.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyFailedIds()}
            >
              <ClipboardCopy className="size-4" />
              Copy failed ids
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
