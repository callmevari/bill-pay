'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { BulkResponse } from '@/lib/bulk';
import { toWireDate } from '@/lib/wire';
import type { BillPayment } from '@/lib/api-types';

// Bulk hooks for payments. Every hook calls a native bulk endpoint and
// returns the documented envelope. Cache invalidation runs in
// `onSettled` so a partial failure still refreshes the lists. The
// result modal owns the user-facing summary, so we do not toast here.

function invalidatePaymentCaches(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: ['bill'] });
  void queryClient.invalidateQueries({ queryKey: ['bills'] });
  void queryClient.invalidateQueries({ queryKey: ['payments'] });
  void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
  void queryClient.invalidateQueries({ queryKey: ['payment-activity'] });
}

export interface BulkPaymentIdsVariables {
  ids: string[];
}

export function useBulkReleasePaymentsMutation(): UseMutationResult<
  BulkResponse<BillPayment>,
  ApiError,
  BulkPaymentIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<BillPayment>, ApiError, BulkPaymentIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<BillPayment>>('/payments/bulk/release', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidatePaymentCaches(queryClient),
  });
}

export function useBulkMarkPaymentsPaidMutation(): UseMutationResult<
  BulkResponse<BillPayment>,
  ApiError,
  BulkPaymentIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<BillPayment>, ApiError, BulkPaymentIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<BillPayment>>('/payments/bulk/mark-as-paid', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidatePaymentCaches(queryClient),
  });
}

export function useBulkCancelPaymentsMutation(): UseMutationResult<
  BulkResponse<BillPayment>,
  ApiError,
  BulkPaymentIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<BillPayment>, ApiError, BulkPaymentIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<BillPayment>>('/payments/bulk/cancel', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidatePaymentCaches(queryClient),
  });
}

export interface BulkSchedulePaymentsVariables {
  ids: string[];
  // `YYYY-MM-DD` from the picker; normalised to ISO inside the hook.
  scheduledFor: string;
}

export function useBulkSchedulePaymentsMutation(): UseMutationResult<
  BulkResponse<BillPayment>,
  ApiError,
  BulkSchedulePaymentsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<BillPayment>, ApiError, BulkSchedulePaymentsVariables>({
    mutationFn: ({ ids, scheduledFor }) =>
      apiFetch<BulkResponse<BillPayment>>('/payments/bulk/schedule', {
        method: 'POST',
        body: { ids, scheduledFor: toWireDate(scheduledFor) },
      }),
    onSettled: () => invalidatePaymentCaches(queryClient),
  });
}

export function useBulkRetryPaymentsMutation(): UseMutationResult<
  BulkResponse<BillPayment>,
  ApiError,
  BulkPaymentIdsVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BulkResponse<BillPayment>, ApiError, BulkPaymentIdsVariables>({
    mutationFn: ({ ids }) =>
      apiFetch<BulkResponse<BillPayment>>('/payments/bulk/retry', {
        method: 'POST',
        body: { ids },
      }),
    onSettled: () => invalidatePaymentCaches(queryClient),
  });
}
