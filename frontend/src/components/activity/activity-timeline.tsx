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
  const verb = humanizeAction(entry.action);

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
              {humanizeEnum(entry.fromStatus)}
              <ArrowRight className="size-3" />
              {humanizeEnum(entry.toStatus)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
      </div>
    </li>
  );
}

function humanizeAction(action: string): string {
  // `bill.line_item_added` → "added a line item". The verb is the last
  // dotted segment; the preceding namespace tells us what the subject is
  // and isn't useful in the verb itself.
  const parts = action.split('.');
  const last = parts[parts.length - 1] ?? action;
  return last
    .split('_')
    .join(' ')
    .replace(/^./, (c) => c.toLowerCase());
}
