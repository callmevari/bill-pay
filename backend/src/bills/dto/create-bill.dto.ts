import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDecimal,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

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
    description: 'Money as decimal string, up to 2 decimal digits.',
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @ApiPropertyOptional({ default: 'USD', example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

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
