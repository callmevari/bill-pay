import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

import { IsDecimal12_2 } from '../../common/dto/decimal-string';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const BILL_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'amount',
  'status',
  'dueDate',
  'invoiceDate',
  'invoiceNumber',
  'vendor',
] as const;
export type BillSortField = (typeof BILL_SORT_FIELDS)[number];

export class BillListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Comma-separated BillStatus values (e.g. `APPROVED,SCHEDULED`).',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Vendor CUID v2.' })
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
  dueDateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDateTo?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description:
      'Filters by the linked payment method (bills without a payment are excluded).',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Free-text search on invoice number, description, and vendor name.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: `Sort field (one of: ${BILL_SORT_FIELDS.join(', ')}). Prefix with "-" for descending.`,
    example: '-createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
