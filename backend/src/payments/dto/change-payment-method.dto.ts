import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Body for `POST /payments/:id/change-method`. Only the method is
// editable post-creation; amount / currency / scheduledFor have their
// own lifecycle actions or are immutable.
export class ChangePaymentMethodDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
