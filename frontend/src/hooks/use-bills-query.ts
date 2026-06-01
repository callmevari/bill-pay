'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { Bill, ListEnvelope } from '@/lib/api-types';
import { useRoleStore } from '@/stores/role-store';

export interface BillsQueryParams {
  page?: number;
  pageSize?: number;
  status?: string;
  vendorId?: string;
  minAmount?: string;
  maxAmount?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paymentMethod?: string;
  q?: string;
  sort?: string;
}

function buildQueryString(params: BillsQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export function useBillsQuery(
  params: BillsQueryParams,
  options: { enabled?: boolean } = {},
): UseQueryResult<ListEnvelope<Bill>, ApiError> {
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  const query = buildQueryString(params);

  return useQuery<ListEnvelope<Bill>, ApiError>({
    queryKey: ['bills', activeUserId, params],
    queryFn: () => apiFetch<ListEnvelope<Bill>>(`/bills${query}`),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
