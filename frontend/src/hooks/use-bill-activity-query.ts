'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { ActivityLogEntry, ListEnvelope } from '@/lib/api-types';
import { useRoleStore } from '@/stores/role-store';

export function useBillActivityQuery(
  billId: string | undefined,
  options: { enabled?: boolean; pageSize?: number } = {},
): UseQueryResult<ListEnvelope<ActivityLogEntry>, ApiError> {
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  const pageSize = options.pageSize ?? 50;
  return useQuery<ListEnvelope<ActivityLogEntry>, ApiError>({
    queryKey: ['bill-activity', activeUserId, billId, pageSize],
    queryFn: () =>
      apiFetch<ListEnvelope<ActivityLogEntry>>(`/bills/${billId}/activity?pageSize=${pageSize}`),
    enabled: Boolean(billId) && (options.enabled ?? true),
  });
}
