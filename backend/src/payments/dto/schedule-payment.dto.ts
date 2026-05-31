import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class SchedulePaymentDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-06-15T00:00:00.000Z',
    description: 'ISO 8601 timestamp at which the payment will be released.',
  })
  @IsISO8601()
  scheduledFor: string;
}
