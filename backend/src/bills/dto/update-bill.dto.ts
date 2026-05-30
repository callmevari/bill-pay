import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  dueDate?: string;
}
