'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { ListEnvelope, Vendor } from '@/lib/api-types';
import { useRoleStore } from '@/stores/role-store';

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

// All vendors used as a dropdown source / id→name map. Backend caps
// pageSize at 100; the seed ships ~10 vendors so a single page covers it
// comfortably.
export function useAllVendorsQuery(
  options: { enabled?: boolean } = {},
): UseQueryResult<ListEnvelope<Vendor>, ApiError> {
  return useVendorsQuery({ pageSize: 100, sort: 'name' }, options);
}
