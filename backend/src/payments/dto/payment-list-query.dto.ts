import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

import { IsDecimal12_2 } from '../../common/dto/decimal-string';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const PAYMENT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'scheduledFor',
  'paidAt',
  'amount',
  'status',
] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export class PaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated PaymentStatus values.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Filter by linked bill id.' })
  @IsOptional()
  @IsString()
  billId?: string;

  @ApiPropertyOptional({ description: 'Filter by the bill vendor id.' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @IsDecimal12_2()
  minAmount?: string;

  @ApiPropertyOptional({ example: '10000.00' })
  @IsOptional()
  @IsDecimal12_2()
  maxAmount?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledForFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  scheduledForTo?: string;

  @ApiPropertyOptional({
    description: `Sort field (one of: ${PAYMENT_SORT_FIELDS.join(', ')}). Prefix with "-" for descending.`,
    example: '-createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
