import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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

export class BulkPaymentsResponseDto extends BulkResponseDto<PaymentResponseDto> {}
