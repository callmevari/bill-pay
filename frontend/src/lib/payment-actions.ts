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
  | 'retry';

const ALLOWED_FROM: Record<PaymentAction, ReadonlySet<PaymentStatus>> = {
  schedule: new Set<PaymentStatus>(['UNSCHEDULED']),
  unschedule: new Set<PaymentStatus>(['SCHEDULED']),
  release: new Set<PaymentStatus>(['SCHEDULED']),
  // UNSCHEDULED covers the OFF_PLATFORM path (paid externally with
  // cash / check) and back-dated rail payments recorded after the
  // fact. Bill cascades APPROVED -> PAID on the backend in that case.
  markAsPaid: new Set<PaymentStatus>(['UNSCHEDULED', 'SCHEDULED', 'INITIATED']),
  // UNSCHEDULED is cancelable — "we decided not to pay this approved
  // bill" is a common operator action. Backend cascades the bill to
  // ARCHIVED on cancel because the system only creates one Payment
  // per Bill.
  cancel: new Set<PaymentStatus>([
    'UNSCHEDULED',
    'SCHEDULED',
    'INITIATED',
    'FAILED',
  ]),
  retry: new Set<PaymentStatus>(['FAILED']),
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
};
