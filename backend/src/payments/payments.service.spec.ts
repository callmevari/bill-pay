import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentStatus, Role } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

const actor: AuthUser = { id: 'a1', name: 'Admin', role: Role.ADMIN };

interface PrismaMock {
  payment: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
  };
  bill: { updateMany: jest.Mock };
  activityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      bill: { updateMany: jest.fn() },
      activityLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    // Default: interactive $transaction runs the callback with the same
    // Prisma mock (so `tx.*` hits the same jest.fn slots we configured).
    prisma.$transaction.mockImplementation(
      async (cb: (tx: PrismaMock) => Promise<unknown>) => cb(prisma),
    );

    const mod = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(PaymentsService);
  });

  const paymentRow = (status: PaymentStatus) => ({
    id: 'p1',
    billId: 'b1',
    status,
  });

  describe('findOne', () => {
    it('throws 404 PAYMENT_NOT_FOUND when the id does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.findOne('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('schedule (UNSCHEDULED -> SCHEDULED)', () => {
    it.each([
      PaymentStatus.SCHEDULED,
      PaymentStatus.INITIATED,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELED,
    ])(
      'rejects from %s with 409 PAYMENT_INVALID_TRANSITION',
      async (status) => {
        prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
        await expect(
          service.schedule(
            'p1',
            { scheduledFor: '2026-06-15T00:00:00.000Z' },
            actor,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  describe('release (SCHEDULED -> INITIATED)', () => {
    it.each([
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.INITIATED,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELED,
    ])('rejects from %s', async (status) => {
      prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
      await expect(service.release('p1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('markAsPaid (SCHEDULED|INITIATED -> PAID)', () => {
    it.each([
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELED,
    ])('rejects from %s', async (status) => {
      prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
      await expect(service.markAsPaid('p1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel (SCHEDULED|INITIATED|FAILED -> CANCELED)', () => {
    it.each([
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.PAID,
      PaymentStatus.CANCELED,
    ])('rejects from %s', async (status) => {
      prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
      await expect(service.cancel('p1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('retry (FAILED -> SCHEDULED)', () => {
    it.each([
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.SCHEDULED,
      PaymentStatus.INITIATED,
      PaymentStatus.PAID,
      PaymentStatus.CANCELED,
    ])('rejects from %s', async (status) => {
      prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
      await expect(service.retry('p1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('unschedule (SCHEDULED -> UNSCHEDULED)', () => {
    it.each([
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.INITIATED,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELED,
    ])('rejects from %s', async (status) => {
      prisma.payment.findUnique.mockResolvedValue(paymentRow(status));
      await expect(service.unschedule('p1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
