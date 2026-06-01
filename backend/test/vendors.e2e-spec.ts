import { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { createTestApp } from './helpers/app';
import { resetDatabase, SeedActors, seedMinimalData } from './helpers/db';

describe('Vendors (e2e)', () => {
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

  it('POST /vendors persists a vendor with the right fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('x-user-id', actors.admin.id)
      .send({
        name: 'Acme Corp',
        email: 'ap@acme.test',
        defaultPaymentMethod: 'ACH',
        streetAddress: '1 Market St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      });

    expect(res.status).toBe(201);
    const body = res.body as { id: string; name: string };
    expect(body.name).toBe('Acme Corp');

    const stored = await prisma.vendor.findUnique({ where: { id: body.id } });
    expect(stored).not.toBeNull();
    expect(stored?.email).toBe('ap@acme.test');
    expect(stored?.defaultPaymentMethod).toBe('ACH');
    expect(stored?.city).toBe('San Francisco');
    expect(stored?.notes).toBeNull();
  });

  it('DELETE /vendors/:id returns 409 VENDOR_HAS_BILLS when a bill references the vendor', async () => {
    await prisma.bill.create({
      data: {
        invoiceNumber: 'INV-REF',
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/vendors/${actors.vendor.id}`)
      .set('x-user-id', actors.admin.id);

    expect(res.status).toBe(409);
    const body = res.body as {
      error: { code: string; details: { billCount: number } };
    };
    expect(body.error.code).toBe('VENDOR_HAS_BILLS');
    expect(body.error.details.billCount).toBe(1);
  });

  it('POST /vendors as Viewer returns 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .set('x-user-id', actors.viewer.id)
      .send({ name: 'Blocked Vendor' });

    expect(res.status).toBe(403);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});
