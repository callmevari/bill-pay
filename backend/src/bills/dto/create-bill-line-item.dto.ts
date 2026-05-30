import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { IsDecimal12_2 } from '../../common/dto/decimal-string';

export class CreateBillLineItemDto {
  @ApiProperty({ example: 'EC2 compute' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description: string;

  @ApiProperty({
    example: '1',
    description:
      'Non-negative decimal string, up to 10 integer and 2 decimal digits.',
  })
  @IsDecimal12_2()
  quantity: string;

  @ApiProperty({
    example: '8200.00',
    description:
      'Non-negative decimal string, up to 10 integer and 2 decimal digits.',
  })
  @IsDecimal12_2()
  unitPrice: string;
}
