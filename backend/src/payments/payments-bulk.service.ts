import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { runBulk } from '../common/bulk/bulk-runner';
import { PaymentsService } from './payments.service';
import {
  BulkPaymentIdsDto,
  BulkPaymentsResponseDto,
  BulkSchedulePaymentsDto,
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

  schedule(
    dto: BulkSchedulePaymentsDto,
    actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    const perItem = { scheduledFor: dto.scheduledFor };
    return runBulk<PaymentResponseDto>(dto.ids, (id) =>
      this.payments.schedule(id, perItem, actor),
    );
  }

  retry(
    dto: BulkPaymentIdsDto,
    actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return runBulk<PaymentResponseDto>(dto.ids, (id) =>
      this.payments.retry(id, actor),
    );
  }
}
