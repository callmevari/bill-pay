import { Badge } from '@/components/ui/badge';
import { humanizeEnum } from '@/lib/format';
import type { PaymentStatus } from '@/lib/api-types';

const VARIANTS: Record<PaymentStatus, 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  UNSCHEDULED: 'secondary',
  SCHEDULED: 'warning',
  INITIATED: 'warning',
  PAID: 'success',
  FAILED: 'destructive',
  CANCELED: 'outline',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }): React.JSX.Element {
  return <Badge variant={VARIANTS[status]}>{humanizeEnum(status)}</Badge>;
}
