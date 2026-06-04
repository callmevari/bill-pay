'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';
import type { PaymentMethod, Vendor } from '@/lib/api-types';

// Body shape for create + update. `name` and `defaultPaymentMethod` are
// required on create; every other field is optional. On update,
// `undefined` means "leave alone" (PATCH semantics) and an empty string
// is normalised to `null` at the form layer for nullable fields.
export interface VendorMutationInput {
  name?: string;
  defaultPaymentMethod?: PaymentMethod;
  email?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
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
