import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVendorDto {
  // `name` and `defaultPaymentMethod` are required: class-validator
  // already rejects `undefined` on a non-`@IsOptional` property, but
  // `@IsDefined` + `@IsNotEmpty` make the contract explicit in the DTO
  // itself so an external reviewer reading the file does not have to
  // know the implicit class-validator default.

  @ApiProperty({ example: 'Stripe, Inc.' })
  @IsDefined({ message: 'name is required.' })
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty.' })
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'ap@stripe.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsDefined({ message: 'defaultPaymentMethod is required.' })
  @IsEnum(PaymentMethod)
  defaultPaymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: '510 Townsend Street' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  streetAddress?: string;

  @ApiPropertyOptional({ example: 'San Francisco' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'CA' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ example: '94103' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
