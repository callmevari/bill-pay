'use client';

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { Bill, BillStatus } from '@/lib/api-types';

// Shared factory for the four bill lifecycle actions. Each action targets
// a single endpoint, returns the updated `BillResponse`, and gets an
// optimistic status flip on the cached detail row — the table row is
// refreshed via invalidation since multiple list queries may exist.

export interface BillLifecycleVariables {
  billId: string;
  notes?: string;
}

interface BillLifecycleOptions {
  endpoint: string;
  optimisticStatus: BillStatus;
  successMessage: (bill: Bill) => string;
  errorFallback: string;
  hasNotes?: boolean;
}

interface MutationContext {
  // Snapshot of every `['bill', ..., billId]` entry we touched so we can
  // roll the cache back exactly when the request fails.
  snapshots: Array<{ key: QueryKey; data: Bill | undefined }>;
}

function buildBody(variables: BillLifecycleVariables, hasNotes: boolean): unknown {
  if (!hasNotes) return undefined;
  if (variables.notes === undefined || variables.notes === null || variables.notes === '') {
    return {};
  }
  return { notes: variables.notes };
}

function useBillLifecycleMutation(
  options: BillLifecycleOptions,
): UseMutationResult<Bill, ApiError, BillLifecycleVariables, MutationContext> {
  const queryClient = useQueryClient();
  return useMutation<Bill, ApiError, BillLifecycleVariables, MutationContext>({
    mutationFn: ({ billId, notes }) =>
      apiFetch<Bill>(`/bills/${billId}${options.endpoint}`, {
        method: 'POST',
        body: buildBody({ billId, notes }, Boolean(options.hasNotes)),
      }),
    onMutate: async ({ billId }) => {
      // Cancel any in-flight detail fetch so it does not overwrite the
      // optimistic state mid-request.
      await queryClient.cancelQueries({ queryKey: ['bill'] });
      const matches = queryClient.getQueriesData<Bill>({ queryKey: ['bill'] });
      const snapshots: MutationContext['snapshots'] = [];
      for (const [key, data] of matches) {
        if (!data || data.id !== billId) continue;
        snapshots.push({ key, data });
        queryClient.setQueryData<Bill>(key, { ...data, status: options.optimisticStatus });
      }
      return { snapshots };
    },
    onError: (error, _variables, context) => {
      if (context) {
        for (const snapshot of context.snapshots) {
          queryClient.setQueryData(snapshot.key, snapshot.data);
        }
      }
      toast.error(describeMutationError(error, options.errorFallback));
    },
    onSuccess: (bill) => {
      queryClient.setQueriesData<Bill>({ queryKey: ['bill'] }, (current) =>
        current && current.id === bill.id ? bill : current,
      );
      toast.success(options.successMessage(bill));
    },
    onSettled: (bill) => {
      // Bills list rows depend on filters and sorts so a refetch is the
      // cheapest way to keep them in sync; the cancel-on-archive path
      // also touches the linked payment so we refresh that too.
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      if (bill) {
        // Activity queries are keyed by activeUserId + billId, so we
        // invalidate by the `'bill-activity'` prefix and let TanStack
        // refresh whichever variants are mounted.
        void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
        if (bill.payment) {
          void queryClient.invalidateQueries({ queryKey: ['payments'] });
        }
      }
    },
  });
}

export function useSubmitBillMutation(): UseMutationResult<
  Bill,
  ApiError,
  BillLifecycleVariables,
  MutationContext
> {
  return useBillLifecycleMutation({
    endpoint: '/submit-for-approval',
    optimisticStatus: 'PENDING_APPROVAL',
    successMessage: (bill) => `Bill ${bill.invoiceNumber} submitted for approval.`,
    errorFallback: 'Could not submit this bill.',
  });
}

export function useApproveBillMutation(): UseMutationResult<
  Bill,
  ApiError,
  BillLifecycleVariables,
  MutationContext
> {
  return useBillLifecycleMutation({
    endpoint: '/approve',
    optimisticStatus: 'APPROVED',
    successMessage: (bill) => `Bill ${bill.invoiceNumber} approved.`,
    errorFallback: 'Could not approve this bill.',
  });
}

export function useRejectBillMutation(): UseMutationResult<
  Bill,
  ApiError,
  BillLifecycleVariables,
  MutationContext
> {
  return useBillLifecycleMutation({
    endpoint: '/reject',
    optimisticStatus: 'REJECTED',
    successMessage: (bill) => `Bill ${bill.invoiceNumber} rejected.`,
    errorFallback: 'Could not reject this bill.',
    hasNotes: true,
  });
}

export function useArchiveBillMutation(): UseMutationResult<
  Bill,
  ApiError,
  BillLifecycleVariables,
  MutationContext
> {
  return useBillLifecycleMutation({
    endpoint: '/archive',
    optimisticStatus: 'ARCHIVED',
    successMessage: (bill) => `Bill ${bill.invoiceNumber} archived.`,
    errorFallback: 'Could not archive this bill.',
  });
}
