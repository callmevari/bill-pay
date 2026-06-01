import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  billId: string;

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
