import { Payment } from '@prisma/client';

import { PaymentResponseDto } from './dto/payment-response.dto';

export function toPaymentResponse(payment: Payment): PaymentResponseDto {
  return {
    id: payment.id,
    billId: payment.billId,
    status: payment.status,
    method: payment.method,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
    scheduledFor: payment.scheduledFor
      ? payment.scheduledFor.toISOString()
      : null,
    initiatedAt: payment.initiatedAt ? payment.initiatedAt.toISOString() : null,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    failedAt: payment.failedAt ? payment.failedAt.toISOString() : null,
    canceledAt: payment.canceledAt ? payment.canceledAt.toISOString() : null,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
