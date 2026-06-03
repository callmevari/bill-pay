import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { ActivityQueryDto } from '../activity/dto/activity-query.dto';
import { PaginatedActivityResponseDto } from '../activity/dto/paginated-activity-response.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ChangePaymentMethodDto } from './dto/change-payment-method.dto';
import { PaginatedPaymentsResponseDto } from './dto/paginated-payments-response.dto';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { SchedulePaymentDto } from './dto/schedule-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List payments (paginated, filterable, sortable)' })
  @ApiOkResponse({ type: PaginatedPaymentsResponseDto })
  list(
    @Query() query: PaymentListQueryDto,
  ): Promise<PaginatedPaymentsResponseDto> {
    return this.payments.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payment by id' })
  @ApiOkResponse({ type: PaymentResponseDto })
  findOne(@Param('id') id: string): Promise<PaymentResponseDto> {
    return this.payments.findOne(id);
  }

  @Post(':id/schedule')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Schedule a payment (Admin only). UNSCHEDULED -> SCHEDULED; bill APPROVED -> SCHEDULED.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  schedule(
    @Param('id') id: string,
    @Body() dto: SchedulePaymentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.schedule(id, dto, actor);
  }

  @Post(':id/unschedule')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Unschedule a SCHEDULED payment (Admin only). Clears scheduledFor; bill SCHEDULED -> APPROVED.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  unschedule(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.unschedule(id, actor);
  }

  @Post(':id/release')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Release a SCHEDULED payment (Admin only). SCHEDULED -> INITIATED; bill stays SCHEDULED.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  release(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.release(id, actor);
  }

  @Post(':id/mark-as-paid')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark a SCHEDULED or INITIATED payment as PAID (Admin only). Bill -> PAID.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  markAsPaid(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.markAsPaid(id, actor);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel an in-flight payment (Admin only). SCHEDULED/INITIATED/FAILED -> CANCELED; bill SCHEDULED -> APPROVED.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  cancel(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.cancel(id, actor);
  }

  @Post(':id/change-method')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Change the method of an UNSCHEDULED or SCHEDULED payment (Admin only). Logs payment.method_changed with {from, to}.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  changeMethod(
    @Param('id') id: string,
    @Body() dto: ChangePaymentMethodDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.changeMethod(id, dto.method, actor);
  }

  @Post(':id/retry')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retry a FAILED payment (Admin only). FAILED -> SCHEDULED; clears failedAt and failureReason.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  retry(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.payments.retry(id, actor);
  }

  @Get(':id/activity')
  @ApiOperation({
    summary: 'List the activity log for a payment (newest first).',
  })
  @ApiOkResponse({ type: PaginatedActivityResponseDto })
  listActivity(
    @Param('id') id: string,
    @Query() query: ActivityQueryDto,
  ): Promise<PaginatedActivityResponseDto> {
    return this.activity.forPayment(id, query);
  }
}
