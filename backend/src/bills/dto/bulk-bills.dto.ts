import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDefined,
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
// `BillsService.update` flow (including the BILL_NOT_EDITABLE guard,
// the post-payment field lock, and the per-bill activity-log row) is
// reused for every item.
//
// Editable in bulk: `dueDate`, `invoiceDate`, `description`. AP teams
// use them for mass-reschedule (`dueDate`), batch typo correction
// (`invoiceDate`), and reclassification tags (`description`).
//
// `amount` is intentionally NOT bulk-editable even though the spec
// lists it: bulk-setting the same monetary value across N distinct
// invoices is almost never the correct operation, and AP teams that
// truly need batch amount changes reach for a CSV import flow that is
// out of scope for the MVP. See `docs/backend.md` for the rationale.
//
// `paymentMethod` is intentionally NOT bulk-editable in this MVP:
// payment method lives on the linked `Payment` row, not on the Bill.
export class BulkEditBillFieldsDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class BulkEditBillsDto extends BulkBillIdsDto {
  @ApiProperty({ type: BulkEditBillFieldsDto })
  @IsDefined({ message: 'fields is required.' })
  @IsObject()
  @ValidateNested()
  @Type(() => BulkEditBillFieldsDto)
  fields: BulkEditBillFieldsDto;
}

export class BulkBillsResponseDto extends BulkResponseDto<BillResponseDto> {}
