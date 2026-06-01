import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { BillResponseDto } from './bill-response.dto';

export class PaginatedBillsResponseDto {
  @ApiProperty({ type: [BillResponseDto] })
  data: BillResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
