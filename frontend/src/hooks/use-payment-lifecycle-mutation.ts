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
import { toWireDate } from '@/lib/wire';
import type { Bill, BillPayment, PaymentStatus } from '@/lib/api-types';

// Payment lifecycle hits `POST /payments/:id/<action>` and propagates the
// linked Bill on the backend. The response is the updated Payment;
// invalidation re-reads the bill (with its embedded payment snapshot) and
// the bills list. Scheduling is the only optimistic surface — flipping
// `payment.status` and `payment.scheduledFor` is a deterministic change
// with a trivial rollback.

export interface PaymentLifecycleVariables {
  paymentId: string;
  // For `schedule`, the date the user picked, accepted in `YYYY-MM-DD`
  // form from the picker and converted to ISO-8601 by this hook so call
  // sites never have to know the wire convention.
  scheduledFor?: string;
  // Optional billId hint so the optimistic update can also patch the
  // cached bill response in place.
  billId?: string;
}

interface PaymentLifecycleOptions {
  endpoint: string;
  optimisticStatus: PaymentStatus;
  patchBillPayment?: (
    payment: BillPayment,
    variables: PaymentLifecycleVariables,
  ) => BillPayment;
  successMessage: () => string;
  errorFallback: string;
  requiresScheduledFor?: boolean;
}

interface MutationContext {
  snapshots: Array<{ key: QueryKey; data: Bill | undefined }>;
}

function usePaymentLifecycleMutation(
  options: PaymentLifecycleOptions,
): UseMutationResult<BillPayment, ApiError, PaymentLifecycleVariables, MutationContext> {
  const queryClient = useQueryClient();
  return useMutation<BillPayment, ApiError, PaymentLifecycleVariables, MutationContext>({
    mutationFn: ({ paymentId, scheduledFor }) => {
      const body =
        options.requiresScheduledFor && scheduledFor
          ? { scheduledFor: toWireDate(scheduledFor) }
          : undefined;
      return apiFetch<BillPayment>(`/payments/${paymentId}${options.endpoint}`, {
        method: 'POST',
        body,
      });
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['bill'] });
      const matches = queryClient.getQueriesData<Bill>({ queryKey: ['bill'] });
      const snapshots: MutationContext['snapshots'] = [];
      for (const [key, data] of matches) {
        if (!data || !data.payment || data.payment.id !== variables.paymentId) continue;
        snapshots.push({ key, data });
        const nextPayment = options.patchBillPayment
          ? options.patchBillPayment(data.payment, variables)
          : { ...data.payment, status: options.optimisticStatus };
        queryClient.setQueryData<Bill>(key, { ...data, payment: nextPayment });
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
    onSuccess: () => {
      toast.success(options.successMessage());
    },
    onSettled: () => {
      // Payment actions cascade the linked bill on the server, so we
      // re-read both surfaces from the server rather than juggling the
      // bill status optimistically as well.
      void queryClient.invalidateQueries({ queryKey: ['bill'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-activity'] });
    },
  });
}

export function useSchedulePaymentMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/schedule',
    optimisticStatus: 'SCHEDULED',
    patchBillPayment: (payment, variables) => ({
      ...payment,
      status: 'SCHEDULED',
      scheduledFor: variables.scheduledFor ? toWireDate(variables.scheduledFor) : payment.scheduledFor,
    }),
    successMessage: () => 'Payment scheduled.',
    errorFallback: 'Could not schedule this payment.',
    requiresScheduledFor: true,
  });
}

export function useUnschedulePaymentMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/unschedule',
    optimisticStatus: 'UNSCHEDULED',
    patchBillPayment: (payment) => ({ ...payment, status: 'UNSCHEDULED', scheduledFor: null }),
    successMessage: () => 'Payment unscheduled.',
    errorFallback: 'Could not unschedule this payment.',
  });
}

export function useReleasePaymentMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/release',
    optimisticStatus: 'INITIATED',
    successMessage: () => 'Payment released.',
    errorFallback: 'Could not release this payment.',
  });
}

export function useMarkPaymentPaidMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/mark-as-paid',
    optimisticStatus: 'PAID',
    successMessage: () => 'Payment marked as paid.',
    errorFallback: 'Could not mark this payment as paid.',
  });
}

export function useCancelPaymentMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/cancel',
    optimisticStatus: 'CANCELED',
    successMessage: () => 'Payment canceled.',
    errorFallback: 'Could not cancel this payment.',
  });
}

export function useRetryPaymentMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  PaymentLifecycleVariables,
  MutationContext
> {
  return usePaymentLifecycleMutation({
    endpoint: '/retry',
    optimisticStatus: 'SCHEDULED',
    successMessage: () => 'Payment retry queued.',
    errorFallback: 'Could not retry this payment.',
  });
}

interface ChangeMethodVariables {
  paymentId: string;
  method: import('@/lib/api-types').PaymentMethod;
}

export function useChangePaymentMethodMutation(): UseMutationResult<
  BillPayment,
  ApiError,
  ChangeMethodVariables
> {
  const queryClient = useQueryClient();
  return useMutation<BillPayment, ApiError, ChangeMethodVariables>({
    mutationFn: ({ paymentId, method }) =>
      apiFetch<BillPayment>(`/payments/${paymentId}/change-method`, {
        method: 'POST',
        body: { method },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bill'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bill-activity'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-activity'] });
      toast.success('Payment method updated.');
    },
    onError: (error) => {
      toast.error(describeMutationError(error, 'Could not change payment method.'));
    },
  });
}
