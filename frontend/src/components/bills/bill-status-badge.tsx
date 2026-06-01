import { Badge } from '@/components/ui/badge';
import { humanizeEnum } from '@/lib/format';
import type { BillStatus } from '@/lib/api-types';

// Color tokens stay restrained on purpose — neutral for in-progress
// states, success for the terminal positive, warning for review,
// destructive for the terminal negative. Anything more saturated reads as
// noise in a dense table.
const VARIANTS: Record<BillStatus, 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  SCHEDULED: 'secondary',
  PAID: 'success',
  REJECTED: 'destructive',
  ARCHIVED: 'outline',
};

export function BillStatusBadge({ status }: { status: BillStatus }): React.JSX.Element {
  return <Badge variant={VARIANTS[status]}>{humanizeEnum(status)}</Badge>;
}
