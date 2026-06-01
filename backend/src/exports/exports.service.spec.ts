import { Test } from '@nestjs/testing';
import {
  BillStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { BillsService } from '../bills/bills.service';
import { ExportsService } from './exports.service';

// Builds a Prisma-shaped Bill row (with vendor + payment) for the
// mocked `BillsService.findAllForExport`. Only the fields the CSV
// projection touches are populated.
const makeRow = (overrides: {
  id: string;
  vendorName: string;
  status: BillStatus;
  amount: string;
  dueDate: Date;
  invoiceNumber: string;
  description: string | null;
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    scheduledFor: Date | null;
    paidAt: Date | null;
  } | null;
  createdAt: Date;
}) => ({
  id: overrides.id,
  invoiceNumber: overrides.invoiceNumber,
  status: overrides.status,
  vendorId: 'v-id',
  createdById: 'u-id',
  description: overrides.description,
  amount: new Prisma.Decimal(overrides.amount),
  currency: 'USD',
  invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
  dueDate: overrides.dueDate,
  archivedAt: null,
  createdAt: overrides.createdAt,
  updatedAt: overrides.createdAt,
  vendor: { name: overrides.vendorName },
  lineItems: [],
  approvals: [],
  payment: overrides.payment
    ? {
        id: 'p-id',
        billId: overrides.id,
        status: overrides.payment.status,
        method: overrides.payment.method,
        amount: new Prisma.Decimal(overrides.amount),
        currency: 'USD',
        scheduledFor: overrides.payment.scheduledFor,
        initiatedAt: null,
        paidAt: overrides.payment.paidAt,
        failedAt: null,
        canceledAt: null,
        failureReason: null,
        createdAt: overrides.createdAt,
        updatedAt: overrides.createdAt,
      }
    : null,
});

describe('ExportsService', () => {
  let service: ExportsService;
  let bills: { findAllForExport: jest.Mock };

  beforeEach(async () => {
    bills = { findAllForExport: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [ExportsService, { provide: BillsService, useValue: bills }],
    }).compile();
    service = mod.get(ExportsService);
  });

  it('emits the documented column header in the documented order on the first line', async () => {
    bills.findAllForExport.mockResolvedValue([]);
    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'id,vendor,status,amount,dueDate,paymentMethod,invoiceNumber,memo,paymentStatus,paymentScheduledFor,paymentPaidAt,createdAt',
    );
  });

  it('writes money as the documented 2dp string and dates as ISO; leaves payment cells empty when no payment exists', async () => {
    bills.findAllForExport.mockResolvedValue([
      makeRow({
        id: 'b1',
        vendorName: 'Stripe, Inc.',
        status: BillStatus.DRAFT,
        amount: '1234.50',
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
        invoiceNumber: 'INV-001',
        description: 'May infra',
        payment: null,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
      }),
    ]);
    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
    const dataRow = csv.split('\n')[1];
    // Vendor "Stripe, Inc." has a comma; csv-stringify must quote it.
    expect(dataRow).toContain('"Stripe, Inc."');
    expect(dataRow).toContain('1234.50');
    expect(dataRow).toContain('2026-05-31T00:00:00.000Z');
    expect(dataRow).toContain('INV-001');
    // Payment columns must be empty cells (consecutive commas with no value).
    expect(dataRow).toMatch(/INV-001,May infra,,,,2026-04-01T12:00:00\.000Z/);
  });

  it('quotes values containing commas, double quotes, and newlines', async () => {
    bills.findAllForExport.mockResolvedValue([
      makeRow({
        id: 'b2',
        vendorName: 'Acme "Quoted, Inc."',
        status: BillStatus.APPROVED,
        amount: '50.00',
        dueDate: new Date('2026-06-01T00:00:00.000Z'),
        invoiceNumber: 'INV-002',
        description: 'Multi\nline\nmemo',
        payment: {
          method: PaymentMethod.ACH,
          status: PaymentStatus.SCHEDULED,
          scheduledFor: new Date('2026-06-10T00:00:00.000Z'),
          paidAt: null,
        },
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ]);
    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
    // Embedded quote must be doubled per RFC 4180.
    expect(csv).toContain('"Acme ""Quoted, Inc."""');
    // Newline-containing field must be wrapped in quotes.
    expect(csv).toContain('"Multi\nline\nmemo"');
    // Payment status renders unwrapped (no special chars).
    expect(csv).toContain('SCHEDULED');
    expect(csv).toContain('ACH');
  });

  it('prefixes cells starting with formula characters with a single quote to block spreadsheet injection', async () => {
    bills.findAllForExport.mockResolvedValue([
      makeRow({
        id: 'b3',
        vendorName: '=cmd|"/c calc"!A0',
        status: BillStatus.DRAFT,
        amount: '10.00',
        dueDate: new Date('2026-06-01T00:00:00.000Z'),
        invoiceNumber: '@injection',
        description: '+1234',
        payment: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ]);
    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
    expect(csv).toContain(`"'=cmd|""/c calc""!A0"`);
    expect(csv).toContain(`'@injection`);
    expect(csv).toContain(`'+1234`);
  });

  it('filenameForToday returns bills-YYYY-MM-DD.csv with the UTC date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T03:00:00.000Z'));
    try {
      expect(service.filenameForToday()).toBe('bills-2026-06-01.csv');
    } finally {
      jest.useRealTimers();
    }
  });
});
