import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { BulkResponseDto } from '../../common/dto/bulk-result.dto';
import { BillResponseDto } from './bill-response.dto';

// 100 matches the listing pageSize ceiling; keeps a single bulk request
// from picking up an unbounded selection from the UI.
const BULK_IDS_MAX = 100;

export class BulkBillIdsDto {
  @ApiProperty({
    type: [String],
    description: 'Bill ids to act on. 1-100 entries, deduplicated.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'ids must contain at least one id.' })
  @ArrayMaxSize(BULK_IDS_MAX, {
    message: `ids must contain at most ${BULK_IDS_MAX} entries.`,
  })
  @ArrayUnique({ message: 'ids must not contain duplicates.' })
  @IsString({ each: true })
  ids: string[];
}

// Subset of bill fields that make sense to bulk-edit. Maps to the
// existing single-item `PATCH /bills/:id` surface so the same
// `BillsService.update` flow (including the BILL_NOT_EDITABLE guard and
// the per-bill activity-log row) is reused for every item:
//
//   `memo` → `Bill.description` (we expose `memo` in the wire shape
//   because that's the spec language used in the implementation plan;
//   internally it's stored as `description` — same column, different
//   external name).
//
// `paymentMethod` is intentionally NOT bulk-editable in this MVP:
// payment method lives on the linked `Payment` row, not on the Bill.
// Surfacing it through the bills bulk path would require a parallel
// service method that crosses the bill ↔ payment boundary, with its
// own status guard (only edit if a payment exists and isn't PAID).
// That's a real product use case but not "use the existing single-item
// service methods" as the playbook calls for; see `docs/backend.md`
// for the rationale.
export class BulkEditBillFieldsDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  memo?: string | null;
}

export class BulkEditBillsDto extends BulkBillIdsDto {
  @ApiProperty({ type: BulkEditBillFieldsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => BulkEditBillFieldsDto)
  fields: BulkEditBillFieldsDto;
}

export class BulkBillsResponseDto extends BulkResponseDto<BillResponseDto> {}
