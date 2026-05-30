import { Bill, BillLineItem } from '@prisma/client';

import { BillLineItemResponseDto } from './dto/bill-line-item-response.dto';
import { BillResponseDto } from './dto/bill-response.dto';

export type BillWithLineItems = Bill & { lineItems: BillLineItem[] };

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

export function toBillResponse(bill: BillWithLineItems): BillResponseDto {
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
  };
}
