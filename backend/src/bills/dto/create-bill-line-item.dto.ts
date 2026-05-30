import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBillLineItemDto {
  @ApiProperty({ example: 'EC2 compute' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description: string;

  @ApiProperty({
    example: '1',
    description: 'Decimal string, up to 2 decimal digits.',
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  quantity: string;

  @ApiProperty({
    example: '8200.00',
    description: 'Decimal string, up to 2 decimal digits.',
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  unitPrice: string;
}
