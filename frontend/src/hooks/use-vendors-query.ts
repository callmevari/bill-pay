'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { ListEnvelope, Vendor } from '@/lib/api-types';
import { useRoleStore } from '@/stores/role-store';

// Matches the backend cap on `pageSize` (see `PaginationQueryDto`).
const MAX_PAGE_SIZE = 100;

export interface VendorsQueryParams {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
}

function buildQueryString(params: VendorsQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export function useVendorsQuery(
  params: VendorsQueryParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<ListEnvelope<Vendor>, ApiError> {
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  const query = buildQueryString(params);
  return useQuery<ListEnvelope<Vendor>, ApiError>({
    queryKey: ['vendors', activeUserId, params],
    queryFn: () => apiFetch<ListEnvelope<Vendor>>(`/vendors${query}`),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

// Vendor dropdown source / id→name map. Pages through the backend list
// until every vendor has been collected; the contract caps `pageSize`
// at 100, so larger workspaces are still represented correctly without
// silently truncating the dropdown.
export function useAllVendorsQuery(
  options: { enabled?: boolean } = {},
): UseQueryResult<ListEnvelope<Vendor>, ApiError> {
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  return useQuery<ListEnvelope<Vendor>, ApiError>({
    queryKey: ['vendors-all', activeUserId],
    queryFn: async () => {
      const collected: Vendor[] = [];
      let page = 1;
      let total = 0;
      while (true) {
        const envelope = await apiFetch<ListEnvelope<Vendor>>(
          `/vendors?page=${page}&pageSize=${MAX_PAGE_SIZE}&sort=name`,
        );
        collected.push(...envelope.data);
        total = envelope.meta.total;
        if (collected.length >= total || envelope.data.length === 0) break;
        page += 1;
      }
      return {
        data: collected,
        meta: { page: 1, pageSize: collected.length, total, totalPages: 1 },
      };
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
