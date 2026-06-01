import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

// Snapshot of the linked Payment surfaced inline on a Bill response so
// consumers can drive the "approve and then schedule the payment"
// inline flow without a second round-trip. The dedicated Payments
// surface (Phase 6) will own the per-payment endpoints; this DTO is
// just the read-only view nested under the bill.
export class BillPaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ example: '100.00' })
  amount: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  scheduledFor: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  initiatedAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  paidAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  failedAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  canceledAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
