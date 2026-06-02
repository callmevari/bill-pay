'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { Bill, BillLineItem } from '@/lib/api-types';

export interface LineItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface AddVariables {
  billId: string;
  input: LineItemInput;
}

interface UpdateVariables {
  billId: string;
  lineItemId: string;
  input: Partial<LineItemInput>;
}

interface RemoveVariables {
  billId: string;
  lineItemId: string;
}

function invalidateBill(queryClient: ReturnType<typeof useQueryClient>, _billId: string): void {
  // Invalidate by top-level prefix only — the actual query keys carry
  // `activeUserId` between the namespace and the id
  // (`['bill', activeUserId, billId]`, `['bill-activity', activeUserId,
  // billId, pageSize]`), so a `['bill', billId]` prefix would never
  // match. Letting every mounted variant refetch is cheap; the user
  // sees the line items update without a manual refresh.
  void queryClient.invalidateQueries({ queryKey: ['bill'] });
  void queryClient.invalidateQueries({ queryKey: ['bills'] });
  void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
}

export function useAddLineItemMutation(): UseMutationResult<BillLineItem, ApiError, AddVariables> {
  const queryClient = useQueryClient();
  return useMutation<BillLineItem, ApiError, AddVariables>({
    mutationFn: ({ billId, input }) =>
      apiFetch<BillLineItem>(`/bills/${billId}/line-items`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_data, { billId }) => {
      invalidateBill(queryClient, billId);
      toast.success('Line item added.');
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not add line item.'));
    },
  });
}

export function useUpdateLineItemMutation(): UseMutationResult<
  BillLineItem,
  ApiError,
  UpdateVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BillLineItem, ApiError, UpdateVariables>({
    mutationFn: ({ billId, lineItemId, input }) =>
      apiFetch<BillLineItem>(`/bills/${billId}/line-items/${lineItemId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (_data, { billId }) => {
      invalidateBill(queryClient, billId);
      toast.success('Line item updated.');
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not update line item.'));
    },
  });
}

export function useRemoveLineItemMutation(): UseMutationResult<void, ApiError, RemoveVariables> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, RemoveVariables>({
    mutationFn: ({ billId, lineItemId }) =>
      apiFetch<void>(`/bills/${billId}/line-items/${lineItemId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, { billId }) => {
      invalidateBill(queryClient, billId);
      toast.success('Line item removed.');
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not remove line item.'));
    },
  });
}

// Helper used by `Bill` consumers: only the editable statuses accept
// line-item mutations on the backend (`ensureEditable` rejects terminal
// states). Mirror that rule client-side so disabled / hidden states stay
// in sync with the API.
export const EDITABLE_BILL_STATUSES: readonly Bill['status'][] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
];
