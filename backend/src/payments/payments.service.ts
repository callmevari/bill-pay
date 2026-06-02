import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityEntityType,
  BillStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import {
  buildPaginationMeta,
  PaginationMetaDto,
} from '../common/dto/pagination-meta.dto';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_SORT_FIELDS,
  PaymentListQueryDto,
  PaymentSortField,
} from './dto/payment-list-query.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { SchedulePaymentDto } from './dto/schedule-payment.dto';
import { toPaymentResponse } from './payments.mapper';

const PAYMENT_STATUSES = new Set<string>(Object.values(PaymentStatus));

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- list / read --------------------------------------------------

  async list(
    query: PaymentListQueryDto,
  ): Promise<{ data: PaymentResponseDto[]; meta: PaginationMetaDto }> {
    const where = this.buildWhere(query);
    const orderBy = this.parseSort(query.sort);
    const { page, pageSize } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: rows.map(toPaymentResponse),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found.',
      });
    }
    return toPaymentResponse(payment);
  }

  // ---- lifecycle ----------------------------------------------------

  async schedule(
    id: string,
    dto: SchedulePaymentDto,
    actor: AuthUser,
  ): Promise<PaymentResponseDto> {
    const scheduledFor = new Date(dto.scheduledFor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus, payment } = await this.casPaymentTransition(
        tx,
        id,
        [PaymentStatus.UNSCHEDULED],
        PaymentStatus.SCHEDULED,
        { scheduledFor },
      );

      // Log the payment action BEFORE the bill cascade so the activity
      // timeline reflects lifecycle causality (the payment moved, that
      // caused the bill to follow). The CAS already happened; this is
      // just the audit order.
      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.scheduled',
        fromStatus,
        PaymentStatus.SCHEDULED,
        { scheduledFor: scheduledFor.toISOString() },
      );

      // Propagate to Bill: APPROVED -> SCHEDULED.
      await this.casBillFromPayment(
        tx,
        payment.billId,
        [BillStatus.APPROVED],
        BillStatus.SCHEDULED,
        actor,
        'bill.scheduled',
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });

    return toPaymentResponse(updated);
  }

  async unschedule(id: string, actor: AuthUser): Promise<PaymentResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus, payment } = await this.casPaymentTransition(
        tx,
        id,
        [PaymentStatus.SCHEDULED],
        PaymentStatus.UNSCHEDULED,
        { scheduledFor: null },
      );

      // Log payment action before propagating (lifecycle causality).
      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.unscheduled',
        fromStatus,
        PaymentStatus.UNSCHEDULED,
      );

      // Bill SCHEDULED -> APPROVED.
      await this.casBillFromPayment(
        tx,
        payment.billId,
        [BillStatus.SCHEDULED],
        BillStatus.APPROVED,
        actor,
        'bill.unscheduled',
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });
    return toPaymentResponse(updated);
  }

  async release(id: string, actor: AuthUser): Promise<PaymentResponseDto> {
    const initiatedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus } = await this.casPaymentTransition(
        tx,
        id,
        [PaymentStatus.SCHEDULED],
        PaymentStatus.INITIATED,
        { initiatedAt },
      );

      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.released',
        fromStatus,
        PaymentStatus.INITIATED,
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });
    return toPaymentResponse(updated);
  }

  async markAsPaid(id: string, actor: AuthUser): Promise<PaymentResponseDto> {
    const paidAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus, payment } = await this.casPaymentTransition(
        tx,
        id,
        [PaymentStatus.SCHEDULED, PaymentStatus.INITIATED],
        PaymentStatus.PAID,
        { paidAt },
      );

      // Log payment action before propagating (lifecycle causality).
      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.marked_as_paid',
        fromStatus,
        PaymentStatus.PAID,
      );

      // Bill -> PAID (from SCHEDULED).
      await this.casBillFromPayment(
        tx,
        payment.billId,
        [BillStatus.SCHEDULED],
        BillStatus.PAID,
        actor,
        'bill.paid',
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });
    return toPaymentResponse(updated);
  }

  async cancel(id: string, actor: AuthUser): Promise<PaymentResponseDto> {
    const canceledAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus, payment } = await this.casPaymentTransition(
        tx,
        id,
        [
          PaymentStatus.SCHEDULED,
          PaymentStatus.INITIATED,
          PaymentStatus.FAILED,
        ],
        PaymentStatus.CANCELED,
        { canceledAt },
      );

      // Log payment action before propagating (lifecycle causality).
      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.canceled',
        fromStatus,
        PaymentStatus.CANCELED,
      );

      // Bill SCHEDULED -> APPROVED (un-schedules the bill).
      await this.casBillFromPayment(
        tx,
        payment.billId,
        [BillStatus.SCHEDULED],
        BillStatus.APPROVED,
        actor,
        'bill.payment_canceled',
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });
    return toPaymentResponse(updated);
  }

  async retry(id: string, actor: AuthUser): Promise<PaymentResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus } = await this.casPaymentTransition(
        tx,
        id,
        [PaymentStatus.FAILED],
        PaymentStatus.SCHEDULED,
        { failedAt: null, failureReason: null },
      );

      await this.logPaymentTransition(
        tx,
        id,
        actor,
        'payment.retried',
        fromStatus,
        PaymentStatus.SCHEDULED,
      );

      return tx.payment.findUniqueOrThrow({ where: { id } });
    });
    return toPaymentResponse(updated);
  }

  // ---- helpers ------------------------------------------------------

  // CAS on Payment.status: read inside tx, validate, conditional
  // updateMany. On race re-reads the row and surfaces the actual status
  // in details.from.
  private async casPaymentTransition(
    tx: Prisma.TransactionClient,
    id: string,
    allowedFrom: PaymentStatus[],
    to: PaymentStatus,
    extraData: Omit<Prisma.PaymentUncheckedUpdateInput, 'status'> = {},
  ): Promise<{
    fromStatus: PaymentStatus;
    payment: { billId: string };
  }> {
    const fresh = await tx.payment.findUnique({
      where: { id },
      select: { status: true, billId: true },
    });
    if (!fresh) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found.',
      });
    }
    if (!allowedFrom.includes(fresh.status)) {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_TRANSITION,
        message: `Cannot transition payment from ${fresh.status} to ${to}.`,
        details: { from: fresh.status, to, allowedFrom },
      });
    }

    const cas = await tx.payment.updateMany({
      where: { id, status: fresh.status },
      data: { ...extraData, status: to },
    });

    if (cas.count === 0) {
      const after = await tx.payment.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_TRANSITION,
        message: `Cannot transition payment from ${after.status} to ${to}.`,
        details: { from: after.status, to, allowedFrom },
      });
    }

    return { fromStatus: fresh.status, payment: { billId: fresh.billId } };
  }

  // CAS the Bill side of a Payment lifecycle action: read inside the
  // tx, validate against allowed-from, conditional updateMany. If the
  // Bill is not in an expected state (concurrent archive or another
  // Payment-side action raced us), the whole Payment transition is
  // aborted with 409 BILL_INVALID_TRANSITION rather than swallowing
  // the divergence — silent skip would leave a Payment in (say)
  // SCHEDULED under an ARCHIVED Bill with no audit row explaining it.
  // The log records the *real* pre-update bill status, not
  // `allowedFrom[0]`, so any future caller with a multi-element
  // allowed-from set cannot silently log the wrong value.
  private async casBillFromPayment(
    tx: Prisma.TransactionClient,
    billId: string,
    allowedFrom: BillStatus[],
    to: BillStatus,
    actor: AuthUser,
    action: string,
  ): Promise<void> {
    const fresh = await tx.bill.findUnique({
      where: { id: billId },
      select: { status: true },
    });
    if (!fresh) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }
    if (!allowedFrom.includes(fresh.status)) {
      throw new ConflictException({
        code: ErrorCode.BILL_INVALID_TRANSITION,
        message: `Cannot transition bill from ${fresh.status} to ${to} as a side effect of the payment action.`,
        details: {
          from: fresh.status,
          to,
          allowedFrom,
          triggeredBy: 'payment',
        },
      });
    }
    const cas = await tx.bill.updateMany({
      where: { id: billId, status: fresh.status },
      data: { status: to },
    });
    if (cas.count === 0) {
      const after = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        select: { status: true },
      });
      throw new ConflictException({
        code: ErrorCode.BILL_INVALID_TRANSITION,
        message: `Cannot transition bill from ${after.status} to ${to} as a side effect of the payment action.`,
        details: {
          from: after.status,
          to,
          allowedFrom,
          triggeredBy: 'payment',
        },
      });
    }
    // Explicit `new Date()` instead of `@default(now())`: see the
    // matching note on `BillsService.logBillTransition` — Postgres'
    // transaction_timestamp ties for every row in the same tx, which
    // breaks lifecycle ordering when a payment action propagates to
    // the bill.
    await tx.activityLog.create({
      data: {
        entityType: ActivityEntityType.BILL,
        entityId: billId,
        actorId: actor.id,
        actorRole: actor.role,
        action,
        fromStatus: fresh.status,
        toStatus: to,
        metadata: { triggeredBy: 'payment' },
        createdAt: new Date(),
      },
    });
  }

  private async logPaymentTransition(
    tx: Prisma.TransactionClient,
    paymentId: string,
    actor: AuthUser,
    action: string,
    fromStatus: PaymentStatus,
    toStatus: PaymentStatus,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        entityType: ActivityEntityType.PAYMENT,
        entityId: paymentId,
        actorId: actor.id,
        actorRole: actor.role,
        action,
        fromStatus,
        toStatus,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: new Date(),
      },
    });
  }

  private buildWhere(query: PaymentListQueryDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      const values = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = values.filter((v) => !PAYMENT_STATUSES.has(v));
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Invalid status values: ${invalid.join(', ')}. Allowed: ${[...PAYMENT_STATUSES].join(', ')}.`,
        });
      }
      where.status = { in: values as PaymentStatus[] };
    }

    if (query.method) where.method = query.method;
    if (query.billId) where.billId = query.billId;
    if (query.vendorId) where.bill = { vendorId: query.vendorId };

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const amountFilter: Prisma.DecimalFilter = {};
      if (query.minAmount !== undefined)
        amountFilter.gte = new Prisma.Decimal(query.minAmount);
      if (query.maxAmount !== undefined)
        amountFilter.lte = new Prisma.Decimal(query.maxAmount);
      where.amount = amountFilter;
    }

    if (
      query.scheduledForFrom !== undefined ||
      query.scheduledForTo !== undefined
    ) {
      const f: Prisma.DateTimeNullableFilter = {};
      if (query.scheduledForFrom !== undefined)
        f.gte = new Date(query.scheduledForFrom);
      if (query.scheduledForTo !== undefined)
        f.lte = new Date(query.scheduledForTo);
      where.scheduledFor = f;
    }

    return where;
  }

  private parseSort(sort?: string): Prisma.PaymentOrderByWithRelationInput {
    if (!sort) return { createdAt: 'desc' };
    const desc = sort.startsWith('-');
    const field = (desc ? sort.slice(1) : sort) as PaymentSortField;
    if (!PAYMENT_SORT_FIELDS.includes(field)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid sort field "${field}". Allowed: ${PAYMENT_SORT_FIELDS.join(', ')}.`,
      });
    }
    return { [field]: desc ? 'desc' : 'asc' };
  }
}
