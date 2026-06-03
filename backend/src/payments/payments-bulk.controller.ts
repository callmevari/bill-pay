import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  BulkPaymentIdsDto,
  BulkPaymentsResponseDto,
  BulkSchedulePaymentsDto,
} from './dto/bulk-payments.dto';
import { PaymentsBulkService } from './payments-bulk.service';

// Mounted under a separate route prefix so `bulk` never collides with
// the `:id` parameter on the main payments controller. Each action
// returns 200 with a per-item result envelope.
@ApiTags('payments')
@Controller('payments/bulk')
export class PaymentsBulkController {
  constructor(private readonly bulk: PaymentsBulkService) {}

  @Post('release')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Release a batch of SCHEDULED payments (Admin only). Per-item result.',
  })
  @ApiOkResponse({ type: BulkPaymentsResponseDto })
  release(
    @Body() dto: BulkPaymentIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return this.bulk.release(dto, actor);
  }

  @Post('mark-as-paid')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark a batch of SCHEDULED or INITIATED payments as PAID (Admin only). Per-item result; cascades each bill to PAID.',
  })
  @ApiOkResponse({ type: BulkPaymentsResponseDto })
  markAsPaid(
    @Body() dto: BulkPaymentIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return this.bulk.markAsPaid(dto, actor);
  }

  @Post('cancel')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel a batch of in-flight payments (Admin only). Per-item result.',
  })
  @ApiOkResponse({ type: BulkPaymentsResponseDto })
  cancel(
    @Body() dto: BulkPaymentIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return this.bulk.cancel(dto, actor);
  }

  @Post('schedule')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Schedule a batch of UNSCHEDULED payments for the same date (Admin only). Per-item result.',
  })
  @ApiOkResponse({ type: BulkPaymentsResponseDto })
  schedule(
    @Body() dto: BulkSchedulePaymentsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return this.bulk.schedule(dto, actor);
  }

  @Post('retry')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a batch of FAILED payments (Admin only). Per-item result.',
  })
  @ApiOkResponse({ type: BulkPaymentsResponseDto })
  retry(
    @Body() dto: BulkPaymentIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkPaymentsResponseDto> {
    return this.bulk.retry(dto, actor);
  }
}
