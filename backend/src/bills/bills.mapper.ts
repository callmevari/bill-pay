import { Approval, Bill, BillLineItem, Payment } from '@prisma/client';

import { BillApprovalResponseDto } from './dto/bill-approval-response.dto';
import { BillLineItemResponseDto } from './dto/bill-line-item-response.dto';
import { BillPaymentResponseDto } from './dto/bill-payment-response.dto';
import { BillResponseDto } from './dto/bill-response.dto';

export type BillWithRelations = Bill & {
  lineItems: BillLineItem[];
  approvals: Approval[];
  payment: Payment | null;
};

// Retained alias so existing call sites that only use the lineItems
// projection don't need to widen their type. New code should prefer
// `BillWithRelations`, which also carries approvals + the payment.
export type BillWithLineItems = BillWithRelations;

export function toBillLineItemResponse(
  lineItem: BillLineItem,
): BillLineItemResponseDto {
  return {
    id: lineItem.id,
    billId: lineItem.billId,
    description: lineItem.description,
    quantity: lineItem.quantity.toFixed(2),
    unitPrice: lineItem.unitPrice.toFixed(2),
    total: lineItem.total.toFixed(2),
    createdAt: lineItem.createdAt.toISOString(),
    updatedAt: lineItem.updatedAt.toISOString(),
  };
}

export function toBillApprovalResponse(
  approval: Approval,
): BillApprovalResponseDto {
  return {
    id: approval.id,
    billId: approval.billId,
    approverId: approval.approverId,
    status: approval.status,
    notes: approval.notes,
    createdAt: approval.createdAt.toISOString(),
    updatedAt: approval.updatedAt.toISOString(),
  };
}

export function toBillPaymentResponse(
  payment: Payment,
): BillPaymentResponseDto {
  return {
    id: payment.id,
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

export function toBillResponse(bill: BillWithRelations): BillResponseDto {
  return {
    id: bill.id,
    invoiceNumber: bill.invoiceNumber,
    status: bill.status,
    vendorId: bill.vendorId,
    createdById: bill.createdById,
    description: bill.description,
    amount: bill.amount.toFixed(2),
    currency: bill.currency,
    invoiceDate: bill.invoiceDate.toISOString(),
    dueDate: bill.dueDate.toISOString(),
    archivedAt: bill.archivedAt ? bill.archivedAt.toISOString() : null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    lineItems: bill.lineItems.map(toBillLineItemResponse),
    approvals: bill.approvals.map(toBillApprovalResponse),
    payment: bill.payment ? toBillPaymentResponse(bill.payment) : null,
  };
}
