import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { IsCurrencyCode } from '../../common/dto/currency';
import { IsDecimal12_2 } from '../../common/dto/decimal-string';

// Omits `vendorId` and `invoiceNumber` (immutable post-create) and
// `lineItems` (has its own sub-resource). Each remaining non-null field
// uses `@ValidateIf(v !== undefined)` so `null` is rejected before it
// reaches Prisma; nullable fields use `@IsOptional` (null is a valid
// "clear the field" intent).
export class UpdateBillDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: '12480.55' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDecimal12_2()
  amount?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @ValidateIf((_, value) => value !== undefined)
  @IsCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  dueDate?: string;

  // Per-bill payment-method override. Nullable on update (send `null` to
  // clear and fall back to the vendor's non-null `defaultPaymentMethod`
  // at approve time); accepts the same `PaymentMethod` enum.
  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;
}
