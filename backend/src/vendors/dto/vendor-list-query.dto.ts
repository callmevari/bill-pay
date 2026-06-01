import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const VENDOR_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type VendorSortField = (typeof VENDOR_SORT_FIELDS)[number];

export class VendorListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search on name and email.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: `Sort field (one of: ${VENDOR_SORT_FIELDS.join(', ')}). Prefix with "-" for descending.`,
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
