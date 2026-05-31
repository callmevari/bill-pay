import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityEntityType,
  ApprovalStatus,
  BillStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import {
  buildPaginationMeta,
  PaginationMetaDto,
} from '../common/dto/pagination-meta.dto';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import {
  BILL_SORT_FIELDS,
  BillListQueryDto,
  BillSortField,
} from './dto/bill-list-query.dto';
import { BillLineItemResponseDto } from './dto/bill-line-item-response.dto';
import { BillResponseDto } from './dto/bill-response.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreateBillLineItemDto } from './dto/create-bill-line-item.dto';
import { RejectBillDto } from './dto/reject-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { UpdateBillLineItemDto } from './dto/update-bill-line-item.dto';
import {
  BillWithRelations,
  toBillLineItemResponse,
  toBillResponse,
} from './bills.mapper';

const TERMINAL_STATUSES: BillStatus[] = [
  BillStatus.PAID,
  BillStatus.REJECTED,
  BillStatus.ARCHIVED,
];

const BILL_STATUSES = new Set<string>(Object.values(BillStatus));

const billInclude = {
  lineItems: true,
  approvals: { orderBy: { createdAt: 'asc' } },
  payment: true,
} as const;

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- list / read --------------------------------------------------

  async list(
    query: BillListQueryDto,
  ): Promise<{ data: BillResponseDto[]; meta: PaginationMetaDto }> {
    const where = this.buildWhere(query);
    const orderBy = this.parseSort(query.sort);
    const { page, pageSize } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        where,
        orderBy,
        include: billInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bill.count({ where }),
    ]);

    return {
      data: rows.map(toBillResponse),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async findOne(id: string): Promise<BillResponseDto> {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: billInclude,
    });
    if (!bill) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }
    return toBillResponse(bill);
  }

  // ---- create -------------------------------------------------------

  async create(dto: CreateBillDto, actor: AuthUser): Promise<BillResponseDto> {
    const invoiceDate = new Date(dto.invoiceDate);
    const dueDate = new Date(dto.dueDate);
    this.ensureDateOrder(invoiceDate, dueDate);
    await this.ensureVendorExists(dto.vendorId);

    const bill = await this.prisma.$transaction(async (tx) => {
      let created;
      try {
        created = await tx.bill.create({
          data: {
            invoiceNumber: dto.invoiceNumber,
            vendorId: dto.vendorId,
            createdById: actor.id,
            description: dto.description ?? null,
            amount: new Prisma.Decimal(dto.amount),
            currency: dto.currency ?? 'USD',
            invoiceDate,
            dueDate,
            lineItems:
              dto.lineItems && dto.lineItems.length > 0
                ? {
                    create: dto.lineItems.map((li) => ({
                      description: li.description,
                      quantity: new Prisma.Decimal(li.quantity),
                      unitPrice: new Prisma.Decimal(li.unitPrice),
                      total: new Prisma.Decimal(li.quantity).mul(
                        new Prisma.Decimal(li.unitPrice),
                      ),
                    })),
                  }
                : undefined,
          },
          include: billInclude,
        });
      } catch (error) {
        // Race: the vendor may have been deleted between the pre-check
        // and this insert. Translate the FK violation so the contract
        // still returns VENDOR_NOT_FOUND rather than a raw Prisma code.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new NotFoundException({
            code: ErrorCode.VENDOR_NOT_FOUND,
            message: 'Vendor not found.',
          });
        }
        throw error;
      }

      await this.logBillActivity(tx, created.id, actor, 'bill.created', {
        vendorId: created.vendorId,
        invoiceNumber: created.invoiceNumber,
        amount: created.amount.toFixed(2),
        lineItemCount: created.lineItems.length,
      });

      return created;
    });

    return toBillResponse(bill);
  }

  // ---- update -------------------------------------------------------

  async update(
    id: string,
    dto: UpdateBillDto,
    actor: AuthUser,
  ): Promise<BillResponseDto> {
    const current = await this.ensureEditable(id);

    const data: Prisma.BillUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.invoiceDate !== undefined)
      data.invoiceDate = new Date(dto.invoiceDate);
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);

    if (dto.invoiceDate !== undefined || dto.dueDate !== undefined) {
      const nextInvoiceDate =
        dto.invoiceDate !== undefined
          ? new Date(dto.invoiceDate)
          : current.invoiceDate;
      const nextDueDate =
        dto.dueDate !== undefined ? new Date(dto.dueDate) : current.dueDate;
      this.ensureDateOrder(nextInvoiceDate, nextDueDate);
    }

    if (Object.keys(data).length === 0) {
      return toBillResponse(current);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bill.update({
        where: { id },
        data,
        include: billInclude,
      });
      await this.logBillActivity(tx, result.id, actor, 'bill.updated', {
        changedFields: Object.keys(data),
      });
      return result;
    });

    return toBillResponse(updated);
  }

  // ---- line items ---------------------------------------------------

  async listLineItems(billId: string): Promise<BillLineItemResponseDto[]> {
    await this.ensureExists(billId);
    const items = await this.prisma.billLineItem.findMany({
      where: { billId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(toBillLineItemResponse);
  }

  async addLineItem(
    billId: string,
    dto: CreateBillLineItemDto,
    actor: AuthUser,
  ): Promise<BillLineItemResponseDto> {
    await this.ensureEditable(billId);
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.billLineItem.create({
        data: {
          billId,
          description: dto.description,
          quantity: new Prisma.Decimal(dto.quantity),
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          total: new Prisma.Decimal(dto.quantity).mul(
            new Prisma.Decimal(dto.unitPrice),
          ),
        },
      });
      await this.logBillActivity(tx, billId, actor, 'bill.line_item_added', {
        lineItemId: created.id,
        description: created.description,
        total: created.total.toFixed(2),
      });
      return created;
    });
    return toBillLineItemResponse(item);
  }

  async updateLineItem(
    billId: string,
    lineItemId: string,
    dto: UpdateBillLineItemDto,
    actor: AuthUser,
  ): Promise<BillLineItemResponseDto> {
    await this.ensureEditable(billId);
    const existing = await this.prisma.billLineItem.findUnique({
      where: { id: lineItemId },
    });
    if (!existing || existing.billId !== billId) {
      throw new NotFoundException({
        code: ErrorCode.BILL_LINE_ITEM_NOT_FOUND,
        message: 'Line item not found on this bill.',
      });
    }

    const nextQuantity =
      dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : existing.quantity;
    const nextUnitPrice =
      dto.unitPrice !== undefined
        ? new Prisma.Decimal(dto.unitPrice)
        : existing.unitPrice;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.billLineItem.update({
        where: { id: lineItemId },
        data: {
          description: dto.description ?? existing.description,
          quantity: nextQuantity,
          unitPrice: nextUnitPrice,
          total: nextQuantity.mul(nextUnitPrice),
        },
      });
      await this.logBillActivity(tx, billId, actor, 'bill.line_item_updated', {
        lineItemId: result.id,
        total: result.total.toFixed(2),
      });
      return result;
    });

    return toBillLineItemResponse(updated);
  }

  async removeLineItem(
    billId: string,
    lineItemId: string,
    actor: AuthUser,
  ): Promise<void> {
    await this.ensureEditable(billId);
    const existing = await this.prisma.billLineItem.findUnique({
      where: { id: lineItemId },
    });
    if (!existing || existing.billId !== billId) {
      throw new NotFoundException({
        code: ErrorCode.BILL_LINE_ITEM_NOT_FOUND,
        message: 'Line item not found on this bill.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.billLineItem.delete({ where: { id: lineItemId } });
      await this.logBillActivity(tx, billId, actor, 'bill.line_item_removed', {
        lineItemId,
      });
    });
  }

  // ---- lifecycle ----------------------------------------------------

  async submitForApproval(
    id: string,
    actor: AuthUser,
  ): Promise<BillResponseDto> {
    // Outside-tx fast-fail so the common case skips the transaction
    // overhead. The CAS inside the transaction is the actual source of
    // truth and protects against concurrent transitions.
    const bill = await this.loadOrThrow(id);
    this.ensureTransition(
      bill.status,
      [BillStatus.DRAFT],
      BillStatus.PENDING_APPROVAL,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      // Pick the assigned approver inside the transaction so a deletion
      // of the APPROVER user between the lookup and the Approval insert
      // can't produce a partially-applied state. The actual approver who
      // decides is recorded later by `approve` / `reject` (they
      // overwrite this field with `actor.id`).
      const assignedApprover = await tx.user.findFirst({
        where: { role: Role.APPROVER },
        select: { id: true },
      });
      if (!assignedApprover) {
        throw new InternalServerErrorException({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'No user with role APPROVER is available to assign.',
        });
      }

      const { fromStatus } = await this.casTransition(
        tx,
        id,
        [BillStatus.DRAFT],
        BillStatus.PENDING_APPROVAL,
      );

      await tx.approval.create({
        data: {
          billId: id,
          approverId: assignedApprover.id,
          status: ApprovalStatus.PENDING,
        },
      });
      await this.logBillTransition(
        tx,
        id,
        actor,
        'bill.submitted_for_approval',
        fromStatus,
        BillStatus.PENDING_APPROVAL,
      );
      return tx.bill.findUniqueOrThrow({
        where: { id },
        include: billInclude,
      });
    });

    return toBillResponse(updated);
  }

  async approve(id: string, actor: AuthUser): Promise<BillResponseDto> {
    const bill = await this.loadOrThrow(id);
    this.ensureTransition(
      bill.status,
      [BillStatus.PENDING_APPROVAL],
      BillStatus.APPROVED,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus } = await this.casTransition(
        tx,
        id,
        [BillStatus.PENDING_APPROVAL],
        BillStatus.APPROVED,
      );

      // After CAS, read the bill state so vendor lookup and Payment
      // creation see the post-transition view (covers a concurrent PATCH
      // changing amount/currency before the CAS).
      const updatedBill = await tx.bill.findUniqueOrThrow({
        where: { id },
        select: { vendorId: true, amount: true, currency: true },
      });
      const vendor = await tx.vendor.findUnique({
        where: { id: updatedBill.vendorId },
        select: { defaultPaymentMethod: true },
      });
      if (!vendor) {
        throw new NotFoundException({
          code: ErrorCode.VENDOR_NOT_FOUND,
          message: 'Vendor not found.',
        });
      }
      const paymentMethod = vendor.defaultPaymentMethod ?? PaymentMethod.ACH;

      // MVP invariant: exactly one Approval row per bill (created at
      // `submitForApproval`). See `docs/backend.md → Approval`.
      const approval = await tx.approval.findFirstOrThrow({
        where: { billId: id, status: ApprovalStatus.PENDING },
      });
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: ApprovalStatus.APPROVED,
          approverId: actor.id,
        },
      });

      const payment = await tx.payment.create({
        data: {
          billId: id,
          status: PaymentStatus.UNSCHEDULED,
          method: paymentMethod,
          amount: updatedBill.amount,
          currency: updatedBill.currency,
        },
      });

      await this.logBillTransition(
        tx,
        id,
        actor,
        'bill.approved',
        fromStatus,
        BillStatus.APPROVED,
      );
      await tx.activityLog.create({
        data: {
          entityType: ActivityEntityType.PAYMENT,
          entityId: payment.id,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'payment.created',
          toStatus: PaymentStatus.UNSCHEDULED,
          metadata: { method: paymentMethod, billId: id },
        },
      });

      return tx.bill.findUniqueOrThrow({
        where: { id },
        include: billInclude,
      });
    });

    return toBillResponse(updated);
  }

  async reject(
    id: string,
    dto: RejectBillDto,
    actor: AuthUser,
  ): Promise<BillResponseDto> {
    // `dto` may be `undefined` when the client sends an empty body with
    // no JSON content-type (Nest validation runs only if a payload is
    // present). Treat that as "no notes" rather than throwing.
    const notes = dto?.notes ?? null;

    const bill = await this.loadOrThrow(id);
    this.ensureTransition(
      bill.status,
      [BillStatus.PENDING_APPROVAL],
      BillStatus.REJECTED,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus } = await this.casTransition(
        tx,
        id,
        [BillStatus.PENDING_APPROVAL],
        BillStatus.REJECTED,
      );

      // MVP invariant: exactly one Approval row per bill (created at
      // `submitForApproval`). See `docs/backend.md → Approval`.
      const approval = await tx.approval.findFirstOrThrow({
        where: { billId: id, status: ApprovalStatus.PENDING },
      });
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: ApprovalStatus.REJECTED,
          approverId: actor.id,
          notes,
        },
      });

      await this.logBillTransition(
        tx,
        id,
        actor,
        'bill.rejected',
        fromStatus,
        BillStatus.REJECTED,
        notes !== null ? { notes } : undefined,
      );

      return tx.bill.findUniqueOrThrow({
        where: { id },
        include: billInclude,
      });
    });

    return toBillResponse(updated);
  }

  async archive(id: string, actor: AuthUser): Promise<BillResponseDto> {
    const allowedFrom = [
      BillStatus.DRAFT,
      BillStatus.PENDING_APPROVAL,
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      BillStatus.REJECTED,
    ];

    const bill = await this.loadOrThrow(id);
    this.ensureTransition(bill.status, allowedFrom, BillStatus.ARCHIVED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const { fromStatus } = await this.casTransition(
        tx,
        id,
        allowedFrom,
        BillStatus.ARCHIVED,
        { archivedAt: new Date() },
      );
      await this.logBillTransition(
        tx,
        id,
        actor,
        'bill.archived',
        fromStatus,
        BillStatus.ARCHIVED,
      );
      return tx.bill.findUniqueOrThrow({
        where: { id },
        include: billInclude,
      });
    });

    return toBillResponse(updated);
  }

  // ---- helpers ------------------------------------------------------

  // Compare-and-swap on `Bill.status`: read the current status inside
  // the transaction, validate it against the allowed-from set, and only
  // flip the status if it has not changed since the read. If a
  // concurrent transition wins the race, `updateMany.count` is 0; we
  // re-read the bill and surface the actual current status in
  // `details.from` so the caller sees the same shape as the regular
  // pre-check error. Returns the pre-update status so callers can use
  // it as the `fromStatus` of their `ActivityLog` row.
  private async casTransition(
    tx: Prisma.TransactionClient,
    id: string,
    allowedFrom: BillStatus[],
    to: BillStatus,
    extraData: Omit<Prisma.BillUncheckedUpdateInput, 'status'> = {},
  ): Promise<{ fromStatus: BillStatus }> {
    const fresh = await tx.bill.findUnique({
      where: { id },
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
        message: `Cannot transition bill from ${fresh.status} to ${to}.`,
        details: { from: fresh.status, to, allowedFrom },
      });
    }

    const cas = await tx.bill.updateMany({
      where: { id, status: fresh.status },
      data: { ...extraData, status: to },
    });

    if (cas.count === 0) {
      const after = await tx.bill.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      throw new ConflictException({
        code: ErrorCode.BILL_INVALID_TRANSITION,
        message: `Cannot transition bill from ${after.status} to ${to}.`,
        details: { from: after.status, to, allowedFrom },
      });
    }

    return { fromStatus: fresh.status };
  }

  private async loadOrThrow(id: string): Promise<BillWithRelations> {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: billInclude,
    });
    if (!bill) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }
    return bill;
  }

  private ensureTransition(
    current: BillStatus,
    allowedFrom: BillStatus[],
    to: BillStatus,
  ): void {
    if (!allowedFrom.includes(current)) {
      throw new ConflictException({
        code: ErrorCode.BILL_INVALID_TRANSITION,
        message: `Cannot transition bill from ${current} to ${to}.`,
        details: { from: current, to, allowedFrom },
      });
    }
  }

  private async logBillTransition(
    tx: Prisma.TransactionClient,
    billId: string,
    actor: AuthUser,
    action: string,
    fromStatus: BillStatus,
    toStatus: BillStatus,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        entityType: ActivityEntityType.BILL,
        entityId: billId,
        actorId: actor.id,
        actorRole: actor.role,
        action,
        fromStatus,
        toStatus,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async ensureVendorExists(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException({
        code: ErrorCode.VENDOR_NOT_FOUND,
        message: 'Vendor not found.',
      });
    }
  }

  private ensureDateOrder(invoiceDate: Date, dueDate: Date): void {
    if (dueDate.getTime() < invoiceDate.getTime()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'dueDate must be on or after invoiceDate.',
      });
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.bill.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }
  }

  private async ensureEditable(id: string): Promise<BillWithRelations> {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: billInclude,
    });
    if (!bill) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Bill not found.',
      });
    }
    if (TERMINAL_STATUSES.includes(bill.status)) {
      throw new ConflictException({
        code: ErrorCode.BILL_NOT_EDITABLE,
        message: `Bill in ${bill.status} cannot be edited.`,
        details: { status: bill.status },
      });
    }
    return bill;
  }

  private async logBillActivity(
    tx: Prisma.TransactionClient,
    billId: string,
    actor: AuthUser,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        entityType: ActivityEntityType.BILL,
        entityId: billId,
        actorId: actor.id,
        actorRole: actor.role,
        action,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private buildWhere(query: BillListQueryDto): Prisma.BillWhereInput {
    const where: Prisma.BillWhereInput = {};

    if (query.status) {
      const values = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = values.filter((v) => !BILL_STATUSES.has(v));
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Invalid status values: ${invalid.join(', ')}. Allowed: ${[...BILL_STATUSES].join(', ')}.`,
        });
      }
      where.status = { in: values as BillStatus[] };
    }

    if (query.vendorId) where.vendorId = query.vendorId;

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const amountFilter: Prisma.DecimalFilter = {};
      if (query.minAmount !== undefined)
        amountFilter.gte = new Prisma.Decimal(query.minAmount);
      if (query.maxAmount !== undefined)
        amountFilter.lte = new Prisma.Decimal(query.maxAmount);
      where.amount = amountFilter;
    }

    if (query.dueDateFrom !== undefined || query.dueDateTo !== undefined) {
      const dueDateFilter: Prisma.DateTimeFilter = {};
      if (query.dueDateFrom !== undefined)
        dueDateFilter.gte = new Date(query.dueDateFrom);
      if (query.dueDateTo !== undefined)
        dueDateFilter.lte = new Date(query.dueDateTo);
      where.dueDate = dueDateFilter;
    }

    if (query.paymentMethod) {
      where.payment = { method: query.paymentMethod };
    }

    if (query.q) {
      where.OR = [
        { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { vendor: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private parseSort(sort?: string): Prisma.BillOrderByWithRelationInput {
    if (!sort) return { createdAt: 'desc' };
    const desc = sort.startsWith('-');
    const field = (desc ? sort.slice(1) : sort) as BillSortField;
    if (!BILL_SORT_FIELDS.includes(field)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid sort field "${field}". Allowed: ${BILL_SORT_FIELDS.join(', ')}.`,
      });
    }
    const order: Prisma.SortOrder = desc ? 'desc' : 'asc';
    if (field === 'vendor') {
      return { vendor: { name: order } };
    }
    return { [field]: order };
  }
}
