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
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IsCurrencyCode } from '../../common/dto/currency';
import { IsDecimal12_2 } from '../../common/dto/decimal-string';
import { CreateBillLineItemDto } from './create-bill-line-item.dto';

export class CreateBillDto {
  @ApiProperty({ example: 'INV-2026-0099' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
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
      'Optional per-bill override. Resolved at approve time as bill > vendor.defaultPaymentMethod > ACH.',
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
