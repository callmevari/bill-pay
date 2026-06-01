import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, Prisma } from '@prisma/client';

import {
  buildPaginationMeta,
  PaginationMetaDto,
} from '../common/dto/pagination-meta.dto';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogResponseDto } from '../common/dto/activity-log-response.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { toActivityLogResponse } from './activity.mapper';

// Reads against the polymorphic `ActivityLog` table indexed by
// `(entityType, entityId, createdAt)`. Always returns newest-first;
// `forBill` widens the read to also include `PAYMENT`-typed entries
// for the bill's linked payment so a reviewer reading a bill's activity
// sees the full lifecycle (bill events AND its payment events) without
// having to fetch them from two endpoints. `forPayment` is narrower:
// just the payment's own entries.
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async forBill(
    billId: string,
    query: ActivityQueryDto,
  ): Promise<{ data: ActivityLogResponseDto[]; meta: PaginationMetaDto }> {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: { id: true, payment: { select: { id: true } } },
    });
    if (!bill) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }

    const where: Prisma.ActivityLogWhereInput = bill.payment
      ? {
          OR: [
            {
              entityType: ActivityEntityType.BILL,
              entityId: billId,
            },
            {
              entityType: ActivityEntityType.PAYMENT,
              entityId: bill.payment.id,
            },
          ],
        }
      : {
          entityType: ActivityEntityType.BILL,
          entityId: billId,
        };

    return this.paginate(where, query);
  }

  async forPayment(
    paymentId: string,
    query: ActivityQueryDto,
  ): Promise<{ data: ActivityLogResponseDto[]; meta: PaginationMetaDto }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true },
    });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found.',
      });
    }

    return this.paginate(
      {
        entityType: ActivityEntityType.PAYMENT,
        entityId: paymentId,
      },
      query,
    );
  }

  private async paginate(
    where: Prisma.ActivityLogWhereInput,
    query: ActivityQueryDto,
  ): Promise<{ data: ActivityLogResponseDto[]; meta: PaginationMetaDto }> {
    const { page, pageSize } = query;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data: rows.map(toActivityLogResponse),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }
}
