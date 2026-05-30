import { ApiProperty } from '@nestjs/swagger';

export class BillLineItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  billId: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ example: '1' })
  quantity: string;

  @ApiProperty({ example: '8200.00' })
  unitPrice: string;

  @ApiProperty({ example: '8200.00' })
  total: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
