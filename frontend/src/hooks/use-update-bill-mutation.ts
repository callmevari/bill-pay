'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { Bill, PaymentMethod } from '@/lib/api-types';

export interface UpdateBillInput {
  description?: string | null;
  amount?: string;
  currency?: string;
  // `null` clears the override (falls back to vendor default); omit the
  // field to leave it untouched. Backend treats undefined and null
  // differently — see docs/api-contract.md PATCH /bills/:id.
  paymentMethod?: PaymentMethod | null;
  invoiceDate?: string;
  dueDate?: string;
}

export interface UpdateBillVariables {
  billId: string;
  input: UpdateBillInput;
}

export function useUpdateBillMutation(): UseMutationResult<Bill, ApiError, UpdateBillVariables> {
  const queryClient = useQueryClient();
  return useMutation<Bill, ApiError, UpdateBillVariables>({
    mutationFn: ({ billId, input }) =>
      apiFetch<Bill>(`/bills/${billId}`, { method: 'PATCH', body: input }),
    onSuccess: (bill) => {
      queryClient.setQueriesData<Bill>({ queryKey: ['bill'] }, (current) =>
        current && current.id === bill.id ? bill : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      // Activity key is `['bill-activity', activeUserId, billId, ...]`,
      // so a `[..., bill.id]` prefix never matches. Invalidate by
      // namespace only.
      void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
      toast.success(`Bill ${bill.invoiceNumber} updated.`);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not update bill.'));
    },
  });
}
