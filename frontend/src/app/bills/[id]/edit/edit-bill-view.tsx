'use client';

import { Forbidden } from '@/components/states/forbidden';
import { Loading } from '@/components/states/loading';
import { ErrorState } from '@/components/states/error-state';
import { Empty } from '@/components/states/empty';
import { BillForm } from '@/components/bills/bill-form';
import { useCan } from '@/hooks/use-can';
import { useBillQuery } from '@/hooks/use-bill-query';
import { useRoleHydrated } from '@/stores/role-store';
import { ErrorCode } from '@/lib/api';

interface EditBillViewProps {
  billId: string;
}

export function EditBillView({ billId }: EditBillViewProps): React.JSX.Element {
  const hydrated = useRoleHydrated();
  const canUpdate = useCan('bill.update');
  const billQuery = useBillQuery(billId, { enabled: hydrated });

  if (!hydrated || billQuery.isPending) return <Loading rows={6} />;
  if (!canUpdate) return <Forbidden />;

  if (billQuery.error) {
    if (billQuery.error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) return <Forbidden />;
    if (billQuery.error.code === ErrorCode.NOT_FOUND) {
      return <Empty title="Bill not found" description="It may have been archived or the link is wrong." />;
    }
    return (
      <ErrorState
        error={billQuery.error}
        title="Could not load this bill"
        onRetry={() => void billQuery.refetch()}
      />
    );
  }

  const bill = billQuery.data;
  if (bill.status === 'PAID' || bill.status === 'REJECTED' || bill.status === 'ARCHIVED') {
    return (
      <Empty
        title="This bill is no longer editable"
        description={`Bills in ${bill.status} status are read-only.`}
      />
    );
  }

  return <BillForm mode="edit" bill={bill} />;
}
