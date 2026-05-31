import { INestApplication } from '@nestjs/common';
import { BillStatus, Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { createTestApp } from './helpers/app';
import { resetDatabase, SeedActors, seedMinimalData } from './helpers/db';

describe('Bills (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let actors: SeedActors;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = (await createTestApp()) as INestApplication<App>;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    actors = await seedMinimalData(prisma);
  });

  const baseBillBody = (overrides: Record<string, unknown> = {}) => ({
    invoiceNumber: 'INV-E2E-001',
    vendorId: actors.vendor.id,
    amount: '100.00',
    invoiceDate: '2026-05-01T00:00:00.000Z',
    dueDate: '2026-05-31T00:00:00.000Z',
    ...overrides,
  });

  it('POST /bills persists the bill, its line items with computed totals, and one activity-log entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('x-user-id', actors.admin.id)
      .send(
        baseBillBody({
          invoiceNumber: 'INV-HAPPY-001',
          amount: '12480.55',
          currency: 'USD',
          lineItems: [
            { description: 'EC2 compute', quantity: '1', unitPrice: '8200.00' },
            { description: 'S3 storage', quantity: '1', unitPrice: '1980.55' },
            {
              description: 'CloudFront egress',
              quantity: '1',
              unitPrice: '2300.00',
            },
          ],
        }),
      );

    expect(res.status).toBe(201);
    const responseBody = res.body as {
      id: string;
      status: string;
      amount: string;
      currency: string;
      createdById: string;
      lineItems: { description: string; total: string }[];
    };
    expect(responseBody.status).toBe('DRAFT');
    expect(responseBody.amount).toBe('12480.55');
    expect(responseBody.currency).toBe('USD');
    expect(responseBody.createdById).toBe(actors.admin.id);
    expect(responseBody.lineItems).toHaveLength(3);

    const stored = await prisma.bill.findUnique({
      where: { id: responseBody.id },
      include: { lineItems: { orderBy: { createdAt: 'asc' } } },
    });
    expect(stored).not.toBeNull();
    expect(stored?.amount.toFixed(2)).toBe('12480.55');
    expect(stored?.currency).toBe('USD');
    expect(stored?.vendorId).toBe(actors.vendor.id);
    expect(stored?.lineItems.map((li) => li.total.toFixed(2))).toEqual([
      '8200.00',
      '1980.55',
      '2300.00',
    ]);

    const activity = await prisma.activityLog.findMany({
      where: { entityType: 'BILL', entityId: responseBody.id },
    });
    expect(activity).toHaveLength(1);
    expect(activity[0].action).toBe('bill.created');
    expect(activity[0].actorId).toBe(actors.admin.id);
    expect(activity[0].actorRole).toBe('ADMIN');
  });

  it('GET /bills paginates, filters by status, and sorts by amount ascending', async () => {
    const billRow = (overrides: {
      invoiceNumber: string;
      status: BillStatus;
      amount: string;
    }) => ({
      invoiceNumber: overrides.invoiceNumber,
      status: overrides.status,
      vendorId: actors.vendor.id,
      createdById: actors.admin.id,
      amount: new Prisma.Decimal(overrides.amount),
      currency: 'USD',
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: new Date('2026-05-31T00:00:00.000Z'),
    });
    await prisma.bill.create({
      data: billRow({
        invoiceNumber: 'A',
        status: BillStatus.DRAFT,
        amount: '300.00',
      }),
    });
    await prisma.bill.create({
      data: billRow({
        invoiceNumber: 'B',
        status: BillStatus.APPROVED,
        amount: '100.00',
      }),
    });
    await prisma.bill.create({
      data: billRow({
        invoiceNumber: 'C',
        status: BillStatus.APPROVED,
        amount: '200.00',
      }),
    });
    await prisma.bill.create({
      data: billRow({
        invoiceNumber: 'D',
        status: BillStatus.PAID,
        amount: '999.00',
      }),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/bills?status=APPROVED&sort=amount&pageSize=10')
      .set('x-user-id', actors.viewer.id);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { invoiceNumber: string; amount: string; status: string }[];
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
      total: 2,
      totalPages: 1,
    });
    expect(body.data.map((b) => b.invoiceNumber)).toEqual(['B', 'C']);
    expect(body.data.every((b) => b.status === 'APPROVED')).toBe(true);
    expect(body.data.map((b) => b.amount)).toEqual(['100.00', '200.00']);
  });

  it('POST /bills returns 404 VENDOR_NOT_FOUND when vendorId does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('x-user-id', actors.admin.id)
      .send(baseBillBody({ vendorId: 'asd' }));

    expect(res.status).toBe(404);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('VENDOR_NOT_FOUND');
  });

  it('POST /bills returns 400 VALIDATION_ERROR when amount exceeds Decimal(12, 2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('x-user-id', actors.admin.id)
      .send(baseBillBody({ amount: '99999999999.00' }));

    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/amount/);
  });

  it('PATCH /bills/:id returns 409 BILL_NOT_EDITABLE when the bill is in a terminal status', async () => {
    const paidBill = await prisma.bill.create({
      data: {
        invoiceNumber: 'INV-PAID',
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: BillStatus.PAID,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-04-01T00:00:00.000Z'),
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/bills/${paidBill.id}`)
      .set('x-user-id', actors.admin.id)
      .send({ description: 'should not stick' });

    expect(res.status).toBe(409);
    const body = res.body as {
      error: { code: string; details: { status: string } };
    };
    expect(body.error.code).toBe('BILL_NOT_EDITABLE');
    expect(body.error.details.status).toBe('PAID');
  });
});
