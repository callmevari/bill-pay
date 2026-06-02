'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { Bill } from '@/lib/api-types';

export interface CreateBillLineItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface CreateBillInput {
  invoiceNumber: string;
  vendorId: string;
  description: string | null;
  amount: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  lineItems?: CreateBillLineItemInput[];
}

export function useCreateBillMutation(): UseMutationResult<Bill, ApiError, CreateBillInput> {
  const queryClient = useQueryClient();
  return useMutation<Bill, ApiError, CreateBillInput>({
    mutationFn: (input) => apiFetch<Bill>('/bills', { method: 'POST', body: input }),
    onSuccess: (bill) => {
      // Seed the cache for the detail page so navigating to the new
      // bill paints without a refetch flash.
      queryClient.setQueriesData<Bill>({ queryKey: ['bill'] }, (current) =>
        current && current.id === bill.id ? bill : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success(`Bill ${bill.invoiceNumber} created.`);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not create bill.'));
    },
  });
}
