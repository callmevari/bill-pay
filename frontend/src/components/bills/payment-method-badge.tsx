import { Badge } from '@/components/ui/badge';
import { humanizeEnum } from '@/lib/format';
import type { PaymentMethod } from '@/lib/api-types';

export function PaymentMethodBadge({ method }: { method: PaymentMethod }): React.JSX.Element {
  return <Badge variant="outline">{humanizeEnum(method)}</Badge>;
}
