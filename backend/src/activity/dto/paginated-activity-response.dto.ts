import { ApiProperty } from '@nestjs/swagger';

import { ActivityLogResponseDto } from '../../common/dto/activity-log-response.dto';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';

export class PaginatedActivityResponseDto {
  @ApiProperty({ type: [ActivityLogResponseDto] })
  data: ActivityLogResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
