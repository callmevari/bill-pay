'use client';

import { Forbidden } from '@/components/states/forbidden';
import { BillForm } from '@/components/bills/bill-form';
import { useCan } from '@/hooks/use-can';
import { useRoleHydrated } from '@/stores/role-store';
import { Loading } from '@/components/states/loading';

export function NewBillView(): React.JSX.Element {
  const hydrated = useRoleHydrated();
  const canCreate = useCan('bill.create');

  if (!hydrated) return <Loading rows={6} />;
  if (!canCreate) return <Forbidden />;
  return <BillForm mode="create" />;
}
