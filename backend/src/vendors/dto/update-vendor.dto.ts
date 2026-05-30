import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { CreateVendorDto } from './create-vendor.dto';

class OptionalVendorFieldsDto extends PartialType(
  OmitType(CreateVendorDto, ['name'] as const),
) {}

export class UpdateVendorDto extends OptionalVendorFieldsDto {
  @ApiPropertyOptional({ example: 'Stripe, Inc.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
