import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDecimal,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// All three fields are non-null in schema. We deliberately do NOT use
// `PartialType` here so `@IsOptional` does not allow `null` to slip past
// validation and reach Prisma. `@ValidateIf(v !== undefined)` skips
// validation only when the field is omitted entirely.
export class UpdateBillLineItemDto {
  @ApiPropertyOptional({ example: 'EC2 compute' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ example: '2' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  quantity?: string;

  @ApiPropertyOptional({ example: '4000.00' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  unitPrice?: string;
}
