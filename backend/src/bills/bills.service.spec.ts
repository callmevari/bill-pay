import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillStatus, Prisma, Role } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { BillsService } from './bills.service';

const actor: AuthUser = { id: 'a1', name: 'Admin', role: Role.ADMIN };

interface PrismaMock {
  bill: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  billLineItem: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  activityLog: { create: jest.Mock };
  user: { findFirst: jest.Mock };
  $transaction: jest.Mock;
}

describe('BillsService', () => {
  let service: BillsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      bill: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      billLineItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      activityLog: { create: jest.fn() },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      providers: [BillsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(BillsService);
  });

  describe('list', () => {
    it('rejects an unknown sort field with 400 VALIDATION_ERROR', async () => {
      await expect(
        service.list({ page: 1, pageSize: 25, sort: 'bogus' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown status value with 400 VALIDATION_ERROR', async () => {
      await expect(
        service.list({ page: 1, pageSize: 25, status: 'NOT_A_STATUS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it.each([BillStatus.PAID, BillStatus.REJECTED, BillStatus.ARCHIVED])(
      'throws 409 BILL_NOT_EDITABLE when status is %s',
      async (status) => {
        prisma.bill.findUnique.mockResolvedValue({
          id: 'b1',
          status,
          lineItems: [],
        });
        await expect(
          service.update('b1', { amount: '100.00' }, actor),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it('throws 400 VALIDATION_ERROR when patched dueDate is before invoiceDate', async () => {
      prisma.bill.findUnique.mockResolvedValue({
        id: 'b1',
        status: BillStatus.DRAFT,
        invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
        dueDate: new Date('2026-06-30T00:00:00.000Z'),
        lineItems: [],
      });
      await expect(
        service.update('b1', { dueDate: '2026-05-01T00:00:00.000Z' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    it('throws 400 VALIDATION_ERROR when dueDate is before invoiceDate', async () => {
      await expect(
        service.create(
          {
            invoiceNumber: 'INV-X',
            vendorId: 'v1',
            amount: '100.00',
            invoiceDate: '2026-06-01T00:00:00.000Z',
            dueDate: '2026-05-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 404 VENDOR_NOT_FOUND when vendorId does not reference a vendor', async () => {
      const prismaWithVendor = prisma as PrismaMock & {
        vendor: { findUnique: jest.Mock };
      };
      prismaWithVendor.vendor = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      await expect(
        service.create(
          {
            invoiceNumber: 'INV-Y',
            vendorId: 'asd',
            amount: '100.00',
            invoiceDate: '2026-05-01T00:00:00.000Z',
            dueDate: '2026-05-31T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addLineItem', () => {
    it('computes total = quantity * unitPrice', async () => {
      prisma.bill.findUnique.mockResolvedValue({
        id: 'b1',
        status: BillStatus.DRAFT,
        lineItems: [],
      });
      prisma.$transaction.mockImplementation(
        async (cb: (tx: PrismaMock) => Promise<unknown>) => cb(prisma),
      );

      interface LineItemCreateArgs {
        data: {
          billId: string;
          description: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          total: Prisma.Decimal;
        };
      }
      prisma.billLineItem.create.mockImplementation(
        (args: LineItemCreateArgs) => {
          const date = new Date('2026-01-01T00:00:00.000Z');
          return Promise.resolve({
            id: 'li1',
            billId: args.data.billId,
            description: args.data.description,
            quantity: args.data.quantity,
            unitPrice: args.data.unitPrice,
            total: args.data.total,
            createdAt: date,
            updatedAt: date,
          });
        },
      );

      const result = await service.addLineItem(
        'b1',
        { description: 'EC2', quantity: '3', unitPrice: '100.50' },
        actor,
      );
      expect(result.total).toBe('301.50');
    });
  });

  // ---- lifecycle transition guards --------------------------------
  // Service-layer state-machine assertions. Each transition method
  // pre-checks the current status and throws 409 BILL_INVALID_TRANSITION
  // before opening the Prisma transaction, so these tests need no
  // transaction mocking. End-to-end coverage of the legal paths
  // (Approval/Payment side effects, activity log) lives in the e2e suite.

  const lifecycleBill = (status: BillStatus) => ({
    id: 'b1',
    status,
    vendorId: 'v1',
    lineItems: [],
  });

  describe('submitForApproval', () => {
    it.each([
      BillStatus.PENDING_APPROVAL,
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      BillStatus.PAID,
      BillStatus.REJECTED,
      BillStatus.ARCHIVED,
    ])('throws 409 BILL_INVALID_TRANSITION from %s', async (status) => {
      prisma.bill.findUnique.mockResolvedValue(lifecycleBill(status));
      await expect(
        service.submitForApproval('b1', actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 500 when no APPROVER user exists to assign', async () => {
      prisma.bill.findUnique.mockResolvedValue(lifecycleBill(BillStatus.DRAFT));
      prisma.user.findFirst.mockResolvedValue(null);
      // The approver lookup runs INSIDE the $transaction now (BLOCKER-1
      // fix from the reviewer pass), so we have to invoke the callback
      // with the same Prisma mock to reach it.
      prisma.$transaction.mockImplementation(
        async (cb: (tx: PrismaMock) => Promise<unknown>) => cb(prisma),
      );
      await expect(
        service.submitForApproval('b1', actor),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('approve', () => {
    it.each([
      BillStatus.DRAFT,
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      BillStatus.PAID,
      BillStatus.REJECTED,
      BillStatus.ARCHIVED,
    ])('throws 409 BILL_INVALID_TRANSITION from %s', async (status) => {
      prisma.bill.findUnique.mockResolvedValue(lifecycleBill(status));
      await expect(service.approve('b1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('reject', () => {
    it.each([
      BillStatus.DRAFT,
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      BillStatus.PAID,
      BillStatus.REJECTED,
      BillStatus.ARCHIVED,
    ])('throws 409 BILL_INVALID_TRANSITION from %s', async (status) => {
      prisma.bill.findUnique.mockResolvedValue(lifecycleBill(status));
      await expect(service.reject('b1', {}, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('archive', () => {
    it.each([BillStatus.PAID, BillStatus.ARCHIVED])(
      'throws 409 BILL_INVALID_TRANSITION from %s',
      async (status) => {
        prisma.bill.findUnique.mockResolvedValue(lifecycleBill(status));
        await expect(service.archive('b1', actor)).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it('exposes the allowedFrom set in error details', async () => {
      prisma.bill.findUnique.mockResolvedValue(lifecycleBill(BillStatus.PAID));
      let caught: ConflictException | undefined;
      try {
        await service.archive('b1', actor);
      } catch (e) {
        caught = e as ConflictException;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      const payload = caught?.getResponse() as {
        code: string;
        details: { from: string; to: string; allowedFrom: string[] };
      };
      expect(payload.code).toBe('BILL_INVALID_TRANSITION');
      expect(payload.details.from).toBe('PAID');
      expect(payload.details.to).toBe('ARCHIVED');
      expect(payload.details.allowedFrom).toEqual(
        expect.arrayContaining([
          BillStatus.DRAFT,
          BillStatus.PENDING_APPROVAL,
          BillStatus.APPROVED,
          BillStatus.SCHEDULED,
          BillStatus.REJECTED,
        ]),
      );
    });
  });
});
