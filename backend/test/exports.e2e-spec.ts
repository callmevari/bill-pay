import { INestApplication } from '@nestjs/common';
import {
  BillStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { parse } from 'csv-parse/sync';
import request from 'supertest';
import { App } from 'supertest/types';

import { createTestApp } from './helpers/app';
import { resetDatabase, SeedActors, seedMinimalData } from './helpers/db';

describe('Exports (e2e)', () => {
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

  const insertBill = (overrides: {
    invoiceNumber: string;
    status: BillStatus;
    amount: string;
    description?: string | null;
    vendorName?: string;
  }) =>
    prisma.bill.create({
      data: {
        invoiceNumber: overrides.invoiceNumber,
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: overrides.status,
        amount: new Prisma.Decimal(overrides.amount),
        currency: 'USD',
        description: overrides.description ?? null,
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });

  it('GET /exports/bills.csv responds with CSV content type, today’s filename, the documented header, and only rows matching the active filter', async () => {
    // Update vendor to a name with a comma so escaping is exercised end-to-end.
    await prisma.vendor.update({
      where: { id: actors.vendor.id },
      data: { name: 'Acme, Inc.' },
    });
    const approved = await insertBill({
      invoiceNumber: 'INV-EXP-A',
      status: BillStatus.APPROVED,
      amount: '1234.56',
      description: 'has "quotes", commas, and\nnewline',
    });
    await prisma.payment.create({
      data: {
        billId: approved.id,
        status: PaymentStatus.SCHEDULED,
        method: PaymentMethod.ACH,
        amount: new Prisma.Decimal('1234.56'),
        currency: 'USD',
        scheduledFor: new Date('2026-06-10T00:00:00.000Z'),
      },
    });
    // Should be excluded by the status filter.
    await insertBill({
      invoiceNumber: 'INV-EXP-B',
      status: BillStatus.DRAFT,
      amount: '50.00',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/exports/bills.csv?status=APPROVED&sort=-createdAt')
      .set('x-user-id', actors.admin.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv;\s*charset=utf-8/);

    // Filename uses today's UTC date.
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="bills-${yyyy}-${mm}-${dd}.csv"`,
    );

    const body = res.text;
    // Parse the CSV so the line count is record-accurate (an embedded
    // newline inside a quoted description would otherwise be miscounted
    // as an extra row by a naive split).
    const parsed = parse(body, { columns: true });
    // Only the APPROVED bill is in the body (filter respected).
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: approved.id,
      vendor: 'Acme, Inc.',
      status: 'APPROVED',
      amount: '1234.56',
      dueDate: '2026-05-31T00:00:00.000Z',
      paymentMethod: 'ACH',
      invoiceNumber: 'INV-EXP-A',
      description: 'has "quotes", commas, and\nnewline',
      paymentStatus: 'SCHEDULED',
      paymentScheduledFor: '2026-06-10T00:00:00.000Z',
      paymentPaidAt: '',
    });
    // Raw byte check on the doubled-quote escape (RFC 4180).
    expect(body).toContain('"has ""quotes"", commas, and\nnewline"');
  });

  it('GET /exports/bills.csv is readable by every role (Viewer included)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/exports/bills.csv')
      .set('x-user-id', actors.viewer.id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
  });

  it('GET /exports/bills.csv without x-user-id returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/exports/bills.csv',
    );
    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /exports/bills.csv rejects an unknown sort field with 400 VALIDATION_ERROR (same parser as GET /bills)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/exports/bills.csv?sort=bogus')
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
