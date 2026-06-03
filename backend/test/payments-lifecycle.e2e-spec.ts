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

describe('Payments lifecycle (e2e)', () => {
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

  // Helper: insert a Bill+Approval+Payment at any combination of states.
  const seedBillWithPayment = async (overrides: {
    billStatus: BillStatus;
    paymentStatus: PaymentStatus;
    paymentMethod?: PaymentMethod;
    scheduledFor?: Date;
    initiatedAt?: Date;
    failedAt?: Date;
    failureReason?: string;
  }) => {
    const bill = await prisma.bill.create({
      data: {
        invoiceNumber: `INV-PMT-${Date.now()}-${Math.random()}`,
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
        method: overrides.paymentMethod ?? PaymentMethod.ACH,
        amount: bill.amount,
        currency: bill.currency,
        scheduledFor: overrides.scheduledFor ?? null,
        initiatedAt: overrides.initiatedAt ?? null,
        failedAt: overrides.failedAt ?? null,
        failureReason: overrides.failureReason ?? null,
      },
    });
    return { bill, payment };
  };

  // ---- full chain --------------------------------------------------

  it('full chain via API: DRAFT -> submit -> approve -> schedule -> release -> mark-as-paid; bill ends PAID, payment.paidAt set, activity trail complete', async () => {
    // Create bill via API
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('x-user-id', actors.admin.id)
      .send({
        invoiceNumber: 'INV-CHAIN',
        vendorId: actors.vendor.id,
        amount: '100.00',
        invoiceDate: '2026-05-01T00:00:00.000Z',
        dueDate: '2026-05-31T00:00:00.000Z',
      });
    expect(createRes.status).toBe(201);
    const billId = (createRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/api/v1/bills/${billId}/submit-for-approval`)
      .set('x-user-id', actors.admin.id)
      .expect(200);

    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${billId}/approve`)
      .set('x-user-id', actors.approver.id);
    expect(approveRes.status).toBe(200);
    const paymentId = (approveRes.body as { payment: { id: string } | null })
      .payment!.id;

    // Schedule
    const scheduleRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/schedule`)
      .set('x-user-id', actors.admin.id)
      .send({ scheduledFor: '2026-06-15T00:00:00.000Z' });
    expect(scheduleRes.status).toBe(200);
    expect((scheduleRes.body as { status: string }).status).toBe('SCHEDULED');
    let bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId } });
    expect(bill.status).toBe(BillStatus.SCHEDULED);

    // Release
    const releaseRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/release`)
      .set('x-user-id', actors.admin.id);
    expect(releaseRes.status).toBe(200);
    expect((releaseRes.body as { status: string }).status).toBe('INITIATED');

    // Mark as paid
    const paidRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/mark-as-paid`)
      .set('x-user-id', actors.admin.id);
    expect(paidRes.status).toBe(200);
    const paidBody = paidRes.body as {
      status: string;
      paidAt: string | null;
      initiatedAt: string | null;
    };
    expect(paidBody.status).toBe('PAID');
    expect(paidBody.paidAt).not.toBeNull();
    expect(paidBody.initiatedAt).not.toBeNull();

    bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId } });
    expect(bill.status).toBe(BillStatus.PAID);

    // Activity trail
    const billLogs = await prisma.activityLog.findMany({
      where: { entityType: 'BILL', entityId: billId },
    });
    expect(billLogs.map((l) => l.action).sort()).toEqual(
      [
        'bill.approved',
        'bill.created',
        'bill.paid',
        'bill.scheduled',
        'bill.submitted_for_approval',
      ].sort(),
    );
    const paymentLogs = await prisma.activityLog.findMany({
      where: { entityType: 'PAYMENT', entityId: paymentId },
    });
    expect(paymentLogs.map((l) => l.action).sort()).toEqual(
      [
        'payment.created',
        'payment.scheduled',
        'payment.released',
        'payment.marked_as_paid',
      ].sort(),
    );
  });

  // ---- individual transitions --------------------------------------

  it('reschedule: schedule -> unschedule -> schedule again; bill flips SCHEDULED <-> APPROVED', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/schedule`)
      .set('x-user-id', actors.admin.id)
      .send({ scheduledFor: '2026-06-15T00:00:00.000Z' })
      .expect(200);
    let billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.SCHEDULED);

    const unRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/unschedule`)
      .set('x-user-id', actors.admin.id);
    expect(unRes.status).toBe(200);
    expect(
      (unRes.body as { status: string; scheduledFor: string | null }).status,
    ).toBe('UNSCHEDULED');
    expect(
      (unRes.body as { scheduledFor: string | null }).scheduledFor,
    ).toBeNull();
    billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.APPROVED);

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/schedule`)
      .set('x-user-id', actors.admin.id)
      .send({ scheduledFor: '2026-07-01T00:00:00.000Z' })
      .expect(200);
    billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.SCHEDULED);
  });

  it('cancel from SCHEDULED: payment CANCELED, bill auto-archived, canceledAt set', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/cancel`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    const body = res.body as { status: string; canceledAt: string | null };
    expect(body.status).toBe('CANCELED');
    expect(body.canceledAt).not.toBeNull();

    // The system only creates 1 Payment per Bill; once that Payment is
    // canceled the Bill has no forward motion, so the cascade archives
    // it. The bill.archived activity row records `triggeredBy:
    // 'payment.cancel'` so the trail explains the dead-end.
    const billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.ARCHIVED);
    expect(billAfter.archivedAt).not.toBeNull();
  });

  it('cancel from INITIATED: payment CANCELED, bill auto-archived', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.INITIATED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
      initiatedAt: new Date('2026-06-20T00:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/cancel`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('CANCELED');

    const billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.ARCHIVED);
  });

  it('mark-as-paid direct from SCHEDULED (skip release): payment PAID, bill PAID', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/mark-as-paid`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    const body = res.body as { status: string; paidAt: string | null };
    expect(body.status).toBe('PAID');
    expect(body.paidAt).not.toBeNull();

    const billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.PAID);
  });

  it('cancel from FAILED: payment CANCELED, bill auto-archived', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.FAILED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
      failedAt: new Date('2026-06-16T00:00:00.000Z'),
      failureReason: 'Bank rejected.',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/cancel`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('CANCELED');

    const billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.ARCHIVED);
  });

  it('cancel from UNSCHEDULED: payment CANCELED, bill auto-archived', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/cancel`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('CANCELED');

    const billAfter = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(billAfter.status).toBe(BillStatus.ARCHIVED);
  });

  it('viewer cannot cancel a payment (403)', async () => {
    const { payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/cancel`)
      .set('x-user-id', actors.viewer.id);
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });

  it('retry from FAILED: payment -> SCHEDULED, failedAt and failureReason cleared', async () => {
    const { payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.FAILED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
      failedAt: new Date('2026-06-20T00:00:00.000Z'),
      failureReason: 'Bank rejected.',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/retry`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    const body = res.body as {
      status: string;
      failedAt: string | null;
      failureReason: string | null;
    };
    expect(body.status).toBe('SCHEDULED');
    expect(body.failedAt).toBeNull();
    expect(body.failureReason).toBeNull();
  });

  // ---- illegal transitions ----------------------------------------

  it('release on UNSCHEDULED -> 409 PAYMENT_INVALID_TRANSITION with details.from/to', async () => {
    const { payment } = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/release`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(409);
    const body = res.body as {
      error: { code: string; details: { from: string; to: string } };
    };
    expect(body.error.code).toBe('PAYMENT_INVALID_TRANSITION');
    expect(body.error.details.from).toBe('UNSCHEDULED');
    expect(body.error.details.to).toBe('INITIATED');
  });

  it('schedule on a PAID payment -> 409 PAYMENT_INVALID_TRANSITION', async () => {
    const { payment } = await seedBillWithPayment({
      billStatus: BillStatus.PAID,
      paymentStatus: PaymentStatus.PAID,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/schedule`)
      .set('x-user-id', actors.admin.id)
      .send({ scheduledFor: '2026-06-15T00:00:00.000Z' });
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'PAYMENT_INVALID_TRANSITION',
    );
  });

  // ---- cascade-on-archive (Phase 5 deferral) ----------------------

  it('archive a SCHEDULED bill cascades the Payment to CANCELED and records metadata', async () => {
    const { bill, payment } = await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    const body = res.body as {
      status: string;
      payment: { status: string; canceledAt: string | null } | null;
    };
    expect(body.status).toBe('ARCHIVED');
    expect(body.payment).not.toBeNull();
    expect(body.payment?.status).toBe('CANCELED');
    expect(body.payment?.canceledAt).not.toBeNull();

    // Activity log carries cancelledPayment id
    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    expect(archiveLog.metadata).toEqual({ cancelledPayment: payment.id });

    // Sibling payment.canceled log
    const paymentCancelLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'payment.canceled',
      },
    });
    expect(paymentCancelLog.metadata).toEqual({ triggeredBy: 'bill.archived' });
  });

  // ---- role gating -------------------------------------------------

  it('approver cannot schedule a payment (403)', async () => {
    const { payment } = await seedBillWithPayment({
      billStatus: BillStatus.APPROVED,
      paymentStatus: PaymentStatus.UNSCHEDULED,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payment.id}/schedule`)
      .set('x-user-id', actors.approver.id)
      .send({ scheduledFor: '2026-06-15T00:00:00.000Z' });
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });

  // ---- list / read -------------------------------------------------

  it('GET /payments filters by status and respects pagination', async () => {
    // Two SCHEDULED + one PAID
    await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-15T00:00:00.000Z'),
    });
    await seedBillWithPayment({
      billStatus: BillStatus.SCHEDULED,
      paymentStatus: PaymentStatus.SCHEDULED,
      scheduledFor: new Date('2026-06-20T00:00:00.000Z'),
    });
    await seedBillWithPayment({
      billStatus: BillStatus.PAID,
      paymentStatus: PaymentStatus.PAID,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/payments?status=SCHEDULED&pageSize=10')
      .set('x-user-id', actors.viewer.id);
    expect(res.status).toBe(200);
    const body = res.body as {
      data: { status: string }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(2);
    expect(body.data.every((p) => p.status === 'SCHEDULED')).toBe(true);
  });
});
