import { INestApplication } from '@nestjs/common';
import {
  ApprovalStatus,
  BillStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { createTestApp } from './helpers/app';
import { resetDatabase, SeedActors, seedMinimalData } from './helpers/db';

describe('Bills bulk (e2e)', () => {
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

  const insertBill = async (status: BillStatus, invoiceNumber: string) => {
    const bill = await prisma.bill.create({
      data: {
        invoiceNumber,
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });
    if (status === BillStatus.PENDING_APPROVAL) {
      await prisma.approval.create({
        data: {
          billId: bill.id,
          approverId: actors.approver.id,
          status: ApprovalStatus.PENDING,
        },
      });
    }
    return bill;
  };

  // ---- approve ----------------------------------------------------

  it('POST /bills/bulk/approve transitions every PENDING_APPROVAL bill, creates a Payment per item, and writes bill.approved + payment.created activity rows', async () => {
    const b1 = await insertBill(BillStatus.PENDING_APPROVAL, 'INV-BULK-A1');
    const b2 = await insertBill(BillStatus.PENDING_APPROVAL, 'INV-BULK-A2');

    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/approve')
      .set('x-user-id', actors.approver.id)
      .send({ ids: [b1.id, b2.id] });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: { id: string; ok: boolean; data?: { status: string } }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(body.results.every((r) => r.ok)).toBe(true);
    expect(body.results.map((r) => r.data?.status)).toEqual([
      'APPROVED',
      'APPROVED',
    ]);

    const after = await prisma.bill.findMany({
      where: { id: { in: [b1.id, b2.id] } },
      include: { payment: true },
    });
    expect(after.every((b) => b.status === BillStatus.APPROVED)).toBe(true);
    expect(
      after.every((b) => b.payment?.status === PaymentStatus.UNSCHEDULED),
    ).toBe(true);

    const billActivity = await prisma.activityLog.findMany({
      where: {
        entityType: 'BILL',
        entityId: { in: [b1.id, b2.id] },
        action: 'bill.approved',
      },
    });
    expect(billActivity).toHaveLength(2);

    const paymentIds = after
      .map((b) => b.payment?.id)
      .filter((id): id is string => Boolean(id));
    const paymentActivity = await prisma.activityLog.findMany({
      where: {
        entityType: 'PAYMENT',
        entityId: { in: paymentIds },
        action: 'payment.created',
      },
    });
    expect(paymentActivity).toHaveLength(2);
  });

  it('POST /bills/bulk/approve surfaces per-item failures without rolling back the succeeded items', async () => {
    const okBill = await insertBill(BillStatus.PENDING_APPROVAL, 'INV-BULK-OK');
    const badBill = await insertBill(BillStatus.DRAFT, 'INV-BULK-DRAFT');

    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/approve')
      .set('x-user-id', actors.approver.id)
      .send({ ids: [okBill.id, badBill.id, 'nonexistent-id'] });

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
    expect(body.results[0]).toMatchObject({ id: okBill.id, ok: true });
    expect(body.results[0].data?.status).toBe('APPROVED');
    expect(body.results[1]).toMatchObject({
      id: badBill.id,
      ok: false,
      error: { code: 'BILL_INVALID_TRANSITION' },
    });
    expect(body.results[2]).toMatchObject({
      id: 'nonexistent-id',
      ok: false,
      error: { code: 'NOT_FOUND' },
    });

    // Persistence: only the okBill flipped status, the badBill stays as DRAFT.
    const okAfter = await prisma.bill.findUnique({ where: { id: okBill.id } });
    const badAfter = await prisma.bill.findUnique({
      where: { id: badBill.id },
    });
    expect(okAfter?.status).toBe(BillStatus.APPROVED);
    expect(badAfter?.status).toBe(BillStatus.DRAFT);
  });

  it('POST /bills/bulk/approve as Viewer returns 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/approve')
      .set('x-user-id', actors.viewer.id)
      .send({ ids: ['anything'] });

    expect(res.status).toBe(403);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // ---- archive ----------------------------------------------------

  it('POST /bills/bulk/archive flips eligible bills to ARCHIVED and rejects PAID with BILL_INVALID_TRANSITION', async () => {
    const draftBill = await insertBill(BillStatus.DRAFT, 'INV-BULK-AR1');
    const paidBill = await insertBill(BillStatus.PAID, 'INV-BULK-AR2');

    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/archive')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [draftBill.id, paidBill.id] });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: { id: string; ok: boolean; error?: { code: string } }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.results[0]).toMatchObject({ id: draftBill.id, ok: true });
    expect(body.results[1]).toMatchObject({
      id: paidBill.id,
      ok: false,
      error: { code: 'BILL_INVALID_TRANSITION' },
    });

    const after = await prisma.bill.findMany({
      where: { id: { in: [draftBill.id, paidBill.id] } },
    });
    const draftAfter = after.find((b) => b.id === draftBill.id);
    const paidAfter = after.find((b) => b.id === paidBill.id);
    expect(draftAfter?.status).toBe(BillStatus.ARCHIVED);
    expect(draftAfter?.archivedAt).not.toBeNull();
    expect(paidAfter?.status).toBe(BillStatus.PAID);
  });

  it('POST /bills/bulk/archive as Approver returns 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/archive')
      .set('x-user-id', actors.approver.id)
      .send({ ids: ['anything'] });

    expect(res.status).toBe(403);
  });

  // ---- edit -------------------------------------------------------

  it('POST /bills/bulk/edit applies dueDate and memo to every editable bill, leaves the terminal bill untouched, and writes one bill.updated activity row per success', async () => {
    const draftBill = await insertBill(BillStatus.DRAFT, 'INV-BULK-E1');
    const approvedBill = await insertBill(BillStatus.APPROVED, 'INV-BULK-E2');
    const paidBill = await insertBill(BillStatus.PAID, 'INV-BULK-E3');

    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/edit')
      .set('x-user-id', actors.admin.id)
      .send({
        ids: [draftBill.id, approvedBill.id, paidBill.id],
        fields: {
          dueDate: '2026-08-15T00:00:00.000Z',
          memo: 'Updated in bulk',
        },
      });

    expect(res.status).toBe(200);
    const body = res.body as {
      results: { id: string; ok: boolean; error?: { code: string } }[];
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(body.summary).toEqual({ total: 3, succeeded: 2, failed: 1 });
    expect(body.results.find((r) => r.id === paidBill.id)?.error?.code).toBe(
      'BILL_NOT_EDITABLE',
    );

    const draftAfter = await prisma.bill.findUnique({
      where: { id: draftBill.id },
    });
    const approvedAfter = await prisma.bill.findUnique({
      where: { id: approvedBill.id },
    });
    const paidAfter = await prisma.bill.findUnique({
      where: { id: paidBill.id },
    });
    expect(draftAfter?.description).toBe('Updated in bulk');
    expect(draftAfter?.dueDate.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(approvedAfter?.description).toBe('Updated in bulk');
    expect(approvedAfter?.dueDate.toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
    expect(paidAfter?.description).toBeNull();

    const updatedActivity = await prisma.activityLog.findMany({
      where: {
        entityType: 'BILL',
        action: 'bill.updated',
        entityId: { in: [draftBill.id, approvedBill.id, paidBill.id] },
      },
    });
    expect(updatedActivity).toHaveLength(2);
  });

  it('POST /bills/bulk/edit with an empty fields object returns 400 VALIDATION_ERROR', async () => {
    const draftBill = await insertBill(BillStatus.DRAFT, 'INV-BULK-E-EMPTY');
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/edit')
      .set('x-user-id', actors.admin.id)
      .send({ ids: [draftBill.id], fields: {} });
    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /bills/bulk/edit as Approver returns 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills/bulk/edit')
      .set('x-user-id', actors.approver.id)
      .send({
        ids: ['anything'],
        fields: { memo: 'no' },
      });
    expect(res.status).toBe(403);
  });
});
