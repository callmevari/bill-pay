import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsString,
} from 'class-validator';

import { BulkResponseDto } from '../../common/dto/bulk-result.dto';
import { PaymentResponseDto } from './payment-response.dto';

const BULK_IDS_MAX = 100;

export class BulkPaymentIdsDto {
  @ApiProperty({
    type: [String],
    description: 'Payment ids to act on. 1-100 entries, deduplicated.',
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

// Bulk schedule applies the same `scheduledFor` date to every selected
// payment. Per-item dates are out of scope: the bulk action is for
// "schedule all of these for the same day".
export class BulkSchedulePaymentsDto extends BulkPaymentIdsDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-06-15T00:00:00.000Z',
    description: 'ISO 8601 timestamp applied uniformly to every payment.',
  })
  @IsISO8601()
  scheduledFor: string;
}

export class BulkPaymentsResponseDto extends BulkResponseDto<PaymentResponseDto> {}
