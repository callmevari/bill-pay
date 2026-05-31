import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillStatus } from '@prisma/client';

import { BillApprovalResponseDto } from './bill-approval-response.dto';
import { BillLineItemResponseDto } from './bill-line-item-response.dto';
import { BillPaymentResponseDto } from './bill-payment-response.dto';

export class BillResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  invoiceNumber: string;

  @ApiProperty({ enum: BillStatus })
  status: BillStatus;

  @ApiProperty()
  vendorId: string;

  @ApiProperty()
  createdById: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ example: '12480.55' })
  amount: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ format: 'date-time' })
  invoiceDate: string;

  @ApiProperty({ format: 'date-time' })
  dueDate: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  archivedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;

  @ApiProperty({ type: [BillLineItemResponseDto] })
  lineItems: BillLineItemResponseDto[];

  @ApiProperty({ type: [BillApprovalResponseDto] })
  approvals: BillApprovalResponseDto[];

  @ApiPropertyOptional({ type: BillPaymentResponseDto, nullable: true })
  payment: BillPaymentResponseDto | null;
}
