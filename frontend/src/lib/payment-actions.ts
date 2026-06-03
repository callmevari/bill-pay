// Permission + state-machine matrix for the payment lifecycle. Mirrors the
// table in `docs/api-contract.md` so the FE never offers an action the
// backend would reject for state reasons. Roles are still enforced
// separately by `useCan(...)` — this is purely the status guard.

import type { PaymentStatus } from './api-types';

export type PaymentAction =
  | 'schedule'
  | 'unschedule'
  | 'release'
  | 'markAsPaid'
  | 'cancel'
  | 'retry'
  | 'changeMethod';

const ALLOWED_FROM: Record<PaymentAction, ReadonlySet<PaymentStatus>> = {
  schedule: new Set<PaymentStatus>(['UNSCHEDULED']),
  unschedule: new Set<PaymentStatus>(['SCHEDULED']),
  release: new Set<PaymentStatus>(['SCHEDULED']),
  // UNSCHEDULED covers the OFF_PLATFORM case (paid externally, recorded
  // after the fact); SCHEDULED / INITIATED are the rail-driven path.
  markAsPaid: new Set<PaymentStatus>(['UNSCHEDULED', 'SCHEDULED', 'INITIATED']),
  // UNSCHEDULED is cancelable — "we decided not to pay this approved
  // bill" is a common operator action.
  cancel: new Set<PaymentStatus>([
    'UNSCHEDULED',
    'SCHEDULED',
    'INITIATED',
    'FAILED',
  ]),
  retry: new Set<PaymentStatus>(['FAILED']),
  // Method is mutable while the rail hasn't been committed (UNSCHEDULED
  // or SCHEDULED). Once it's INITIATED / PAID / FAILED / CANCELED, the
  // operator already chose the rail.
  changeMethod: new Set<PaymentStatus>(['UNSCHEDULED', 'SCHEDULED']),
};

export function isPaymentActionAvailable(
  action: PaymentAction,
  status: PaymentStatus,
): boolean {
  return ALLOWED_FROM[action].has(status);
}

export function paymentActionDisabledReason(
  action: PaymentAction,
  status: PaymentStatus,
): string {
  return `Not available from ${status}.`;
}

export const PAYMENT_ACTION_LABELS: Record<PaymentAction, string> = {
  schedule: 'Schedule',
  unschedule: 'Unschedule',
  release: 'Release',
  markAsPaid: 'Mark as paid',
  cancel: 'Cancel',
  retry: 'Retry',
  changeMethod: 'Change method',
};
