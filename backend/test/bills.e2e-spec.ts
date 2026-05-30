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
