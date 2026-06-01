'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { Bill } from '@/lib/api-types';
import { useRoleStore } from '@/stores/role-store';

export function useBillQuery(
  billId: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<Bill, ApiError> {
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  return useQuery<Bill, ApiError>({
    queryKey: ['bill', activeUserId, billId],
    queryFn: () => apiFetch<Bill>(`/bills/${billId}`),
    enabled: Boolean(billId) && (options.enabled ?? true),
  });
}
