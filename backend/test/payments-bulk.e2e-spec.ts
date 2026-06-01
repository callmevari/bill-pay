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

describe('Payments bulk (e2e)', () => {
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

  const seedBillWithPayment = async (overrides: {
    billStatus: BillStatus;
    paymentStatus: PaymentStatus;
    invoiceNumber: string;
    scheduledFor?: Date | null;
  }) => {
    const bill = await prisma.bill.create({
      data: {
        invoiceNumber: overrides.invoiceNumber,
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: overrides.billStatus,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        billId: bill.id,
        status: overrides.paymentStatus,
        method: PaymentMethod.ACH,
        amount: bill.amount,
        currency: bill.currency,
        // UNSCHEDULED payments invariant: scheduledFor must be null.
        // Only SCHEDULED/INITIATED/PAID/FAILED carry a real date.
        scheduledFor:
          overrides.scheduledFor !== undefined
            ? overrides.scheduledFor
            : overrides.paymentStatus === PaymentStatus.UNSCHEDULED
              ? null
              : new Date('2026-06-01T00:00:00.000Z'),
      },
    });
    return { bill, payment };
  };

  // ---- release ----------------------------------------------------

  it('POST /payments/bulk/release transitions every SCHEDULED payment to INITIATED and writes a payment.released activity row per item', async () => {
    const a = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      invoiceNumber: 'INV-BULK-REL-1',
    });
    const b = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      invoiceNumber: 'INV-BULK-REL-2',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/bulk/release')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [a.payment.id, b.payment.id] });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: { id: string; ok: boolean; data?: { status: string } }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(body.results.map((r) => r.data?.status)).toEqual([
      'INITIATED',
      'INITIATED',
    ]);

    const after = await prisma.payment.findMany({
      where: { id: { in: [a.payment.id, b.payment.id] } },
    });
    expect(after.every((p) => p.status === PaymentStatus.INITIATED)).toBe(true);
    expect(after.every((p) => p.initiatedAt !== null)).toBe(true);

    const activity = await prisma.activityLog.findMany({
      where: {
        entityType: 'PAYMENT',
        entityId: { in: [a.payment.id, b.payment.id] },
        action: 'payment.released',
      },
    });
    expect(activity).toHaveLength(2);
  });

  it('POST /payments/bulk/release surfaces per-item failures without affecting the succeeded items', async () => {
    const ok = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      invoiceNumber: 'INV-MIX-OK',
    });
    const bad = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
      invoiceNumber: 'INV-MIX-BAD',
      scheduledFor: undefined,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/bulk/release')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [ok.payment.id, bad.payment.id, 'missing-id'] });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: {
        id: string;
        ok: boolean;
        data?: { status: string };
        error?: { code: string };
      }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 3, succeeded: 1, failed: 2 });
    expect(body.results[0].data?.status).toBe('INITIATED');
    expect(body.results[1].error?.code).toBe('PAYMENT_INVALID_TRANSITION');
    expect(body.results[2].error?.code).toBe('PAYMENT_NOT_FOUND');

    const okAfter = await prisma.payment.findUnique({
      where: { id: ok.payment.id },
    });
    const badAfter = await prisma.payment.findUnique({
      where: { id: bad.payment.id },
    });
    expect(okAfter?.status).toBe(PaymentStatus.INITIATED);
    expect(badAfter?.status).toBe(PaymentStatus.UNSCHEDULED);
  });

  it('POST /payments/bulk/release as Approver returns 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/bulk/release')
      .set('x-user-id', actors.approver.id)
      .send({ ids: ['anything'] });
    expect(res.status).toBe(403);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // ---- mark-as-paid ----------------------------------------------

  it('POST /payments/bulk/mark-as-paid moves payments + cascades bills to PAID for the eligible items', async () => {
    const a = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      invoiceNumber: 'INV-MAP-1',
    });
    const b = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.INITIATED,
      invoiceNumber: 'INV-MAP-2',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/bulk/mark-as-paid')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [a.payment.id, b.payment.id] });

    expect(res.status).toBe(200);
    const body = res.body as {
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });

    const aBillAfter = await prisma.bill.findUnique({
      where: { id: a.bill.id },
    });
    const bBillAfter = await prisma.bill.findUnique({
      where: { id: b.bill.id },
    });
    expect(aBillAfter?.status).toBe(BillStatus.PAID);
    expect(bBillAfter?.status).toBe(BillStatus.PAID);
  });

  // ---- cancel ----------------------------------------------------

  it('POST /payments/bulk/cancel cancels eligible payments and bounces ineligible ones with the documented code', async () => {
    const scheduled = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      invoiceNumber: 'INV-CAN-1',
    });
    const unscheduled = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
      invoiceNumber: 'INV-CAN-2',
      scheduledFor: undefined,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/bulk/cancel')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [scheduled.payment.id, unscheduled.payment.id] });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: {
        id: string;
        ok: boolean;
        error?: { code: string };
      }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.results[0].ok).toBe(true);
    expect(body.results[1].error?.code).toBe('PAYMENT_INVALID_TRANSITION');
  });
});
