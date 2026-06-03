'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { PaymentMethod, Vendor } from '@/lib/api-types';

// Body shape for create + update. `defaultPaymentMethod` is required on
// create; `undefined` on update means "leave alone" (PATCH semantics).
export interface VendorMutationInput {
  name?: string;
  defaultPaymentMethod?: PaymentMethod;
}

export interface UpdateVendorVariables {
  vendorId: string;
  input: VendorMutationInput;
}

function invalidateVendors(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['vendors'] });
  void queryClient.invalidateQueries({ queryKey: ['vendors-all'] });
}

export function useCreateVendorMutation(): UseMutationResult<Vendor, ApiError, VendorMutationInput> {
  const queryClient = useQueryClient();
  return useMutation<Vendor, ApiError, VendorMutationInput>({
    mutationFn: (input) => apiFetch<Vendor>('/vendors', { method: 'POST', body: input }),
    onSuccess: (vendor) => {
      invalidateVendors(queryClient);
      toast.success(`Vendor ${vendor.name} created.`);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not create vendor.'));
    },
  });
}

export function useUpdateVendorMutation(): UseMutationResult<
  Vendor,
  ApiError,
  UpdateVendorVariables
> {
  const queryClient = useQueryClient();
  return useMutation<Vendor, ApiError, UpdateVendorVariables>({
    mutationFn: ({ vendorId, input }) =>
      apiFetch<Vendor>(`/vendors/${vendorId}`, { method: 'PATCH', body: input }),
    onSuccess: (vendor) => {
      invalidateVendors(queryClient);
      toast.success(`Vendor ${vendor.name} updated.`);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not update vendor.'));
    },
  });
}
