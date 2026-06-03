import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IsCurrencyCode } from '../../common/dto/currency';
import { IsDecimal12_2 } from '../../common/dto/decimal-string';
import { CreateBillLineItemDto } from './create-bill-line-item.dto';

// Permissive on purpose — invoice numbers come from the vendor, not us,
// and real-world formats include slashes, dots, hashes, parens, and
// spaces. We block the obviously-dangerous characters (`?`, `$`, `%`,
// `&`, `!`, `*`, quotes, brackets, etc.) so a bad header doesn't sneak
// through into CSV exports or URLs.
const INVOICE_NUMBER_PATTERN = /^[\w\-._/# ()]+$/;
const INVOICE_NUMBER_MESSAGE =
  'invoiceNumber may only contain letters, digits, spaces, and the characters - _ . / # ( ).';

export class CreateBillDto {
  @ApiProperty({ example: 'INV-2026-0099' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(INVOICE_NUMBER_PATTERN, { message: INVOICE_NUMBER_MESSAGE })
  invoiceNumber: string;

  @ApiProperty({
    example: 'qn4ajdh15g2nvdgrv2srksqe',
    description: 'Vendor CUID v2.',
  })
  @IsString()
  @MinLength(1)
  vendorId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    example: '12480.55',
    description:
      'Non-negative money as decimal string with up to 10 integer digits and 2 decimal digits.',
  })
  @IsDecimal12_2()
  amount: string;

  @ApiPropertyOptional({ default: 'USD', example: 'USD' })
  @ValidateIf((_, value) => value !== undefined)
  @IsCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description:
      'Optional per-bill override. Resolved at approve time as bill > vendor.defaultPaymentMethod.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ format: 'date-time', example: '2026-05-01T00:00:00.000Z' })
  @IsISO8601()
  invoiceDate: string;

  @ApiProperty({ format: 'date-time', example: '2026-05-31T00:00:00.000Z' })
  @IsISO8601()
  dueDate: string;

  @ApiPropertyOptional({ type: [CreateBillLineItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBillLineItemDto)
  lineItems?: CreateBillLineItemDto[];
}
