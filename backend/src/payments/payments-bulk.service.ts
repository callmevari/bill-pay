import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { runBulk } from '../common/bulk/bulk-runner';
import { PaymentsService } from './payments.service';
import {
  BulkPaymentIdsDto,
  BulkPaymentsResponseDto,
} from './dto/bulk-payments.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';

@Injectable()
export class PaymentsBulkService {
  constructor(private readonly payments: PaymentsService) {}

  release(
    dto: BulkPaymentIdsDto,
    actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return runBulk<PaymentResponseDto>(dto.ids, (id) =>
      this.payments.release(id, actor),
    );
  }

  markAsPaid(
    dto: BulkPaymentIdsDto,
    actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return runBulk<PaymentResponseDto>(dto.ids, (id) =>
      this.payments.markAsPaid(id, actor),
    );
  }

  cancel(
    dto: BulkPaymentIdsDto,
    actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return runBulk<PaymentResponseDto>(dto.ids, (id) =>
      this.payments.cancel(id, actor),
    );
  }
}
