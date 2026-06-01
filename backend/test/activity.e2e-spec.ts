import { INestApplication } from '@nestjs/common';
import {
  BillStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { createTestApp } from './helpers/app';
import { resetDatabase, SeedActors, seedMinimalData } from './helpers/db';

describe('Activity reads (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let actors: SeedActors;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = (await createTestApp()) as INestApplication<App>;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    actors = await seedMinimalData(prisma);
  });

  // ---- /bills/:id/activity ---------------------------------------

  it('GET /bills/:id/activity returns the bill events and the linked payment events newest-first, with actor names resolved', async () => {
    const bill = await prisma.bill.create({
      data: {
        invoiceNumber: 'INV-ACT-1',
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: BillStatus.APPROVED,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        billId: bill.id,
        status: PaymentStatus.UNSCHEDULED,
        method: PaymentMethod.ACH,
        amount: bill.amount,
        currency: bill.currency,
      },
    });
    // Use sequential createdAt timestamps so we can assert ordering deterministically.
    await prisma.activityLog.create({
      data: {
        entityType: 'BILL',
        entityId: bill.id,
        actorId: actors.admin.id,
        actorRole: 'ADMIN',
        action: 'bill.created',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    });
    await prisma.activityLog.create({
      data: {
        entityType: 'BILL',
        entityId: bill.id,
        actorId: actors.admin.id,
        actorRole: 'ADMIN',
        action: 'bill.submitted_for_approval',
        fromStatus: 'DRAFT',
        toStatus: 'PENDING_APPROVAL',
        createdAt: new Date('2026-05-01T11:00:00.000Z'),
      },
    });
    await prisma.activityLog.create({
      data: {
        entityType: 'BILL',
        entityId: bill.id,
        actorId: actors.approver.id,
        actorRole: 'APPROVER',
        action: 'bill.approved',
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'APPROVED',
        createdAt: new Date('2026-05-01T12:00:00.000Z'),
      },
    });
    await prisma.activityLog.create({
      data: {
        entityType: 'PAYMENT',
        entityId: payment.id,
        actorId: actors.approver.id,
        actorRole: 'APPROVER',
        action: 'payment.created',
        toStatus: 'UNSCHEDULED',
        createdAt: new Date('2026-05-01T12:00:01.000Z'),
      },
    });
    // Noise: an unrelated activity row for a different bill/payment.
    await prisma.activityLog.create({
      data: {
        entityType: 'BILL',
        entityId: 'unrelated-bill',
        actorId: actors.admin.id,
        actorRole: 'ADMIN',
        action: 'bill.created',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/bills/${bill.id}/activity?pageSize=10`)
      .set('x-user-id', actors.viewer.id);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        action: string;
        actorName: string;
        actorRole: string;
        entityType: string;
        entityId: string;
      }[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    };
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 4,
      totalPages: 1,
    });
    // Newest-first ordering.
    expect(body.data.map((e) => e.action)).toEqual([
      'payment.created',
      'bill.approved',
      'bill.submitted_for_approval',
      'bill.created',
    ]);
    // Actor names resolved from the User join.
    expect(body.data[0].actorName).toBe('Test Approver');
    expect(body.data[0].actorRole).toBe('APPROVER');
    expect(body.data[3].actorName).toBe('Test Admin');
    // Polymorphic shape preserved.
    expect(body.data[0].entityType).toBe('PAYMENT');
    expect(body.data[0].entityId).toBe(payment.id);
  });

  it('GET /bills/:id/activity returns 404 NOT_FOUND for an unknown bill id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/bills/nonexistent/activity')
      .set('x-user-id', actors.viewer.id);
    expect(res.status).toBe(404);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ---- /payments/:id/activity ------------------------------------

  it('GET /payments/:id/activity returns only that payment’s activity, paginated', async () => {
    const bill = await prisma.bill.create({
      data: {
        invoiceNumber: 'INV-PA-1',
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: BillStatus.SCHEDULED,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        billId: bill.id,
        status: PaymentStatus.SCHEDULED,
        method: PaymentMethod.ACH,
        amount: bill.amount,
        currency: bill.currency,
      },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.activityLog.create({
        data: {
          entityType: 'PAYMENT',
          entityId: payment.id,
          actorId: actors.admin.id,
          actorRole: 'ADMIN',
          action: `payment.event_${i}`,
          createdAt: new Date(`2026-05-01T1${i}:00:00.000Z`),
        },
      });
    }
    // Noise: a BILL entry that should NOT appear in the payment feed.
    await prisma.activityLog.create({
      data: {
        entityType: 'BILL',
        entityId: bill.id,
        actorId: actors.admin.id,
        actorRole: 'ADMIN',
        action: 'bill.scheduled',
        fromStatus: 'APPROVED',
        toStatus: 'SCHEDULED',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/payments/${payment.id}/activity`)
      .set('x-user-id', actors.viewer.id);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { entityType: string; action: string }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(3);
    expect(body.data.every((e) => e.entityType === 'PAYMENT')).toBe(true);
    // Newest-first.
    expect(body.data.map((e) => e.action)).toEqual([
      'payment.event_2',
      'payment.event_1',
      'payment.event_0',
    ]);
  });

  it('GET /payments/:id/activity returns 404 PAYMENT_NOT_FOUND for an unknown payment id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/payments/nonexistent/activity')
      .set('x-user-id', actors.viewer.id);
    expect(res.status).toBe(404);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('PAYMENT_NOT_FOUND');
  });
});
