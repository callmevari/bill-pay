'use client';

import { FileText, CreditCard, Circle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, humanizeEnum } from '@/lib/format';
import type { ActivityEntityType, ActivityLogEntry } from '@/lib/api-types';

interface ActivityTimelineProps {
  entries: ActivityLogEntry[];
}

const ENTITY_ICONS: Record<ActivityEntityType, React.ComponentType<{ className?: string }>> = {
  BILL: FileText,
  PAYMENT: CreditCard,
  VENDOR: Circle,
  APPROVAL: Circle,
};

export function ActivityTimeline({ entries }: ActivityTimelineProps): React.JSX.Element {
  return (
    <ol className="flex flex-col gap-0">
      {entries.map((entry, index) => (
        <ActivityRow key={entry.id} entry={entry} isLast={index === entries.length - 1} />
      ))}
    </ol>
  );
}

interface ActivityRowProps {
  entry: ActivityLogEntry;
  isLast: boolean;
}

function ActivityRow({ entry, isLast }: ActivityRowProps): React.JSX.Element {
  // Unknown entity types fall back to a generic dot rather than crashing
  // — new activity verbs land regularly and the timeline must stay
  // resilient to them.
  const Icon = ENTITY_ICONS[entry.entityType] ?? Circle;
  const verb = humanizeAction(entry);
  const overrideBadge = readBillOverride(entry);
  const archiveCascade = readArchiveCascade(entry);

  return (
    <li className="flex gap-3 pb-4">
      <div className="flex flex-col items-center">
        <div
          className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          aria-label={`${entry.entityType.toLowerCase()} event`}
        >
          <Icon className="size-3.5" />
        </div>
        {isLast ? null : <div className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
      </div>
      <div className="flex flex-col gap-1 pb-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{entry.actorName}</span>
          <Badge variant="outline" className="text-[10px]">
            {entry.actorRole}
          </Badge>
          <span className="text-muted-foreground">{verb}</span>
          {entry.fromStatus && entry.toStatus ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              ({humanizeEnum(entry.fromStatus)}
              <ArrowRight className="size-3" />
              {humanizeEnum(entry.toStatus)})
            </span>
          ) : null}
          {overrideBadge ? (
            <Badge variant="secondary" className="text-[10px]">
              {overrideBadge}
            </Badge>
          ) : null}
        </div>
        {archiveCascade ? (
          <p className="text-xs text-muted-foreground">Side effects: {archiveCascade}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
      </div>
    </li>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Surfaces the `payment.created` metadata the backend emits — when the
// resolved method came from the bill override (rather than the vendor
// default or the ACH fallback) we show a small badge so reviewers can
// understand why this particular payment used a non-default method. See
// `docs/api-contract.md → POST /bills/:id/approve`.
function readBillOverride(entry: ActivityLogEntry): string | null {
  if (entry.action !== 'payment.created') return null;
  if (!isPlainObject(entry.metadata)) return null;
  const source = entry.metadata.methodSource;
  if (source !== 'bill') return null;
  const method = entry.metadata.method;
  return typeof method === 'string' ? `Bill override · ${method}` : 'Bill override';
}

// `bill.archived` carries the side-effect counters from the cancel-on-
// archive cascade. We surface them as a terse muted line so the audit
// trail shows the user what the click actually triggered — and pluralise
// the approvals counter naturally rather than echoing the raw JSON.
function readArchiveCascade(entry: ActivityLogEntry): string | null {
  if (entry.action !== 'bill.archived') return null;
  if (!isPlainObject(entry.metadata)) return null;
  const parts: string[] = [];
  const cancelledApprovals = entry.metadata.cancelledApprovals;
  if (typeof cancelledApprovals === 'number' && cancelledApprovals > 0) {
    parts.push(
      `${cancelledApprovals} approval${cancelledApprovals === 1 ? '' : 's'} cancelled`,
    );
  }
  if (typeof entry.metadata.cancelledPayment === 'string') {
    parts.push('linked payment cancelled');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function humanizeAction(entry: ActivityLogEntry): string {
  // Prepend the entity name so "Bill created" and "Payment created" are
  // visually distinct beyond just the icon. The verb is the last dotted
  // segment of `action`; the namespace usually restates the entity, so we
  // drop it in favour of `entityType` which is always present.
  const parts = entry.action.split('.');
  const verb = (parts[parts.length - 1] ?? entry.action).split('_').join(' ');
  const entity =
    entry.entityType.charAt(0) + entry.entityType.slice(1).toLowerCase();
  return `${entity} ${verb}`;
}
