'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { BulkResponse } from '@/lib/bulk';
import type { Bill } from '@/lib/api-types';

// Bulk hooks for bills. Every hook calls a native bulk endpoint on the
// backend and returns the documented `{ results, summary }` envelope.
//
// On success/settled, the hook invalidates the bill + bills + activity
// caches by namespace so every list query refreshes. The result modal
// renders the envelope; toasts are NOT emitted here — bulk operations
// surface their feedback through the modal so we never compete with it
// from the toast layer.

function invalidateBillCaches(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: ['bill'] });
  void queryClient.invalidateQueries({ queryKey: ['bills'] });
  void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
  void queryClient.invalidateQueries({ queryKey: ['payments'] });
}

export interface BulkBillIdsVariables {
  ids: string[];
}

export function useBulkApproveBillsMutation(): UseMutationResult<
  BulkResponse<Bill>,
  ApiError,
  BulkBillIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<Bill>, ApiError, BulkBillIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<Bill>>('/bills/bulk/approve', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidateBillCaches(queryClient),
  });
}

export function useBulkArchiveBillsMutation(): UseMutationResult<
  BulkResponse<Bill>,
  ApiError,
  BulkBillIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<Bill>, ApiError, BulkBillIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<Bill>>('/bills/bulk/archive', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidateBillCaches(queryClient),
  });
}

export interface BulkEditBillsVariables {
  ids: string[];
  fields: {
    dueDate?: string;
    invoiceDate?: string;
    description?: string | null;
  };
}

export function useBulkEditBillsMutation(): UseMutationResult<
  BulkResponse<Bill>,
  ApiError,
  BulkEditBillsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<Bill>, ApiError, BulkEditBillsVariables>({
    mutationFn: ({ ids, fields }) =>
      apiFetch<BulkResponse<Bill>>('/bills/bulk/edit', {
        method: 'POST',
        body: { ids, fields },
      }),
    onSettled: () => invalidateBillCaches(queryClient),
  });
}

export interface BulkSubmitBillsVariables {
  ids: string[];
}

export function useBulkSubmitBillsMutation(): UseMutationResult<
  BulkResponse<Bill>,
  ApiError,
  BulkSubmitBillsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<Bill>, ApiError, BulkSubmitBillsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<Bill>>('/bills/bulk/submit-for-approval', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidateBillCaches(queryClient),
  });
}

export interface BulkRejectBillsVariables {
  ids: string[];
  notes?: string;
}

export function useBulkRejectBillsMutation(): UseMutationResult<
  BulkResponse<Bill>,
  ApiError,
  BulkRejectBillsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<Bill>, ApiError, BulkRejectBillsVariables>({
    mutationFn: ({ ids, notes }) =>
      apiFetch<BulkResponse<Bill>>('/bills/bulk/reject', {
        method: 'POST',
        body: notes ? { ids, notes } : { ids },
      }),
    onSettled: () => invalidateBillCaches(queryClient),
  });
}
