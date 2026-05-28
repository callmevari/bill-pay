import { Logger } from '@nestjs/common';
import {
  ActivityEntityType,
  ApprovalStatus,
  BillStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';

import { SEED_USER_IDS } from './seed-ids';

const prisma = new PrismaClient();
const logger = new Logger('Seed');

const NOW = new Date();

function daysAgo(days: number): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  return date;
}

function daysAhead(days: number): Date {
  return daysAgo(-days);
}

function dec(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

interface SeedVendor {
  name: string;
  email: string;
  defaultPaymentMethod: PaymentMethod;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const VENDORS_SEED: SeedVendor[] = [
  {
    name: 'Stripe, Inc.',
    email: 'ap@stripe.com',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '510 Townsend Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94103',
    country: 'US',
  },
  {
    name: 'Amazon Web Services, Inc.',
    email: 'billing@aws.amazon.com',
    defaultPaymentMethod: PaymentMethod.WIRE,
    streetAddress: '410 Terry Avenue North',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98109',
    country: 'US',
  },
  {
    name: 'Atlassian Pty Ltd',
    email: 'accounts@atlassian.com',
    defaultPaymentMethod: PaymentMethod.WIRE,
    streetAddress: '341 George Street',
    city: 'Sydney',
    state: 'NSW',
    postalCode: '2000',
    country: 'AU',
  },
  {
    name: 'Notion Labs, Inc.',
    email: 'billing@notion.so',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '548 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94104',
    country: 'US',
  },
  {
    name: 'Slack Technologies, LLC',
    email: 'billing@slack.com',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '500 Howard Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  },
  {
    name: 'Datadog, Inc.',
    email: 'billing@datadoghq.com',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '620 8th Avenue',
    city: 'New York',
    state: 'NY',
    postalCode: '10018',
    country: 'US',
  },
  {
    name: 'Linear Orbit, Inc.',
    email: 'finance@linear.app',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '1 Letterman Drive',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94129',
    country: 'US',
  },
  {
    name: 'Vercel Inc.',
    email: 'billing@vercel.com',
    defaultPaymentMethod: PaymentMethod.ACH,
    streetAddress: '440 N Wolfe Road',
    city: 'Sunnyvale',
    state: 'CA',
    postalCode: '94085',
    country: 'US',
  },
  {
    name: 'Figma, Inc.',
    email: 'billing@figma.com',
    defaultPaymentMethod: PaymentMethod.CARD,
    streetAddress: '760 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94102',
    country: 'US',
  },
  {
    name: 'GitHub, Inc.',
    email: 'billing@github.com',
    defaultPaymentMethod: PaymentMethod.CHECK,
    streetAddress: '88 Colin P Kelly Jr Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94107',
    country: 'US',
  },
];

interface BillSpec {
  invoiceNumber: string;
  vendorIndex: number;
  description: string;
  status: BillStatus;
  amount: string;
  lineItems: { description: string; quantity: string; unitPrice: string }[];
  invoiceDaysAgo: number;
  dueDaysAhead: number;
  paymentMethod?: PaymentMethod;
  scheduledDaysAhead?: number;
  initiatedDaysAgo?: number;
  paidDaysAgo?: number;
  archivedFrom?: 'DRAFT' | 'APPROVED';
  rejectionNote?: string;
}

const BILLS_SEED: BillSpec[] = [
  // 6 DRAFT
  ...draftBills(),
  // 5 PENDING_APPROVAL
  ...pendingApprovalBills(),
  // 5 APPROVED
  ...approvedBills(),
  // 5 SCHEDULED
  ...scheduledBills(),
  // 8 PAID
  ...paidBills(),
  // 3 REJECTED
  ...rejectedBills(),
  // 3 ARCHIVED
  ...archivedBills(),
];

function draftBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0101',
      vendorIndex: 0,
      description: 'Stripe platform fees — May 2026',
      status: BillStatus.DRAFT,
      amount: '4250.00',
      lineItems: [{ description: 'Processing fees — May', quantity: '1', unitPrice: '4250.00' }],
      invoiceDaysAgo: 4,
      dueDaysAhead: 26,
    },
    {
      invoiceNumber: 'INV-2026-0102',
      vendorIndex: 1,
      description: 'AWS infrastructure — May 2026',
      status: BillStatus.DRAFT,
      amount: '12480.55',
      lineItems: [
        { description: 'EC2 compute', quantity: '1', unitPrice: '8200.00' },
        { description: 'S3 storage', quantity: '1', unitPrice: '1980.55' },
        { description: 'CloudFront egress', quantity: '1', unitPrice: '2300.00' },
      ],
      invoiceDaysAgo: 3,
      dueDaysAhead: 27,
    },
    {
      invoiceNumber: 'INV-2026-0103',
      vendorIndex: 5,
      description: 'Datadog observability — Q2 2026',
      status: BillStatus.DRAFT,
      amount: '6800.00',
      lineItems: [
        { description: 'APM seats', quantity: '40', unitPrice: '120.00' },
        { description: 'Log indexing', quantity: '1', unitPrice: '2000.00' },
      ],
      invoiceDaysAgo: 2,
      dueDaysAhead: 28,
    },
    {
      invoiceNumber: 'INV-2026-0104',
      vendorIndex: 6,
      description: 'Linear annual subscription',
      status: BillStatus.DRAFT,
      amount: '3600.00',
      lineItems: [{ description: '24 seats — annual', quantity: '24', unitPrice: '150.00' }],
      invoiceDaysAgo: 1,
      dueDaysAhead: 29,
    },
    {
      invoiceNumber: 'INV-2026-0105',
      vendorIndex: 3,
      description: 'Notion team workspace — Q2',
      status: BillStatus.DRAFT,
      amount: '1440.00',
      lineItems: [{ description: '32 seats × 3 months', quantity: '96', unitPrice: '15.00' }],
      invoiceDaysAgo: 5,
      dueDaysAhead: 25,
    },
    {
      invoiceNumber: 'INV-2026-0106',
      vendorIndex: 4,
      description: 'Slack Business+ — May',
      status: BillStatus.DRAFT,
      amount: '2150.00',
      lineItems: [{ description: '50 seats × $43', quantity: '50', unitPrice: '43.00' }],
      invoiceDaysAgo: 6,
      dueDaysAhead: 24,
    },
  ];
}

function pendingApprovalBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0201',
      vendorIndex: 2,
      description: 'Jira Cloud — annual renewal',
      status: BillStatus.PENDING_APPROVAL,
      amount: '8400.00',
      lineItems: [{ description: 'Standard plan × 100 seats', quantity: '100', unitPrice: '84.00' }],
      invoiceDaysAgo: 10,
      dueDaysAhead: 20,
    },
    {
      invoiceNumber: 'INV-2026-0202',
      vendorIndex: 7,
      description: 'Vercel Pro — May',
      status: BillStatus.PENDING_APPROVAL,
      amount: '780.00',
      lineItems: [{ description: 'Pro team seats', quantity: '13', unitPrice: '60.00' }],
      invoiceDaysAgo: 9,
      dueDaysAhead: 21,
    },
    {
      invoiceNumber: 'INV-2026-0203',
      vendorIndex: 8,
      description: 'Figma Organization seats',
      status: BillStatus.PENDING_APPROVAL,
      amount: '2400.00',
      lineItems: [{ description: '16 designer seats — annual', quantity: '16', unitPrice: '150.00' }],
      invoiceDaysAgo: 8,
      dueDaysAhead: 22,
    },
    {
      invoiceNumber: 'INV-2026-0204',
      vendorIndex: 9,
      description: 'GitHub Enterprise — May',
      status: BillStatus.PENDING_APPROVAL,
      amount: '5040.00',
      lineItems: [{ description: '120 seats × $42', quantity: '120', unitPrice: '42.00' }],
      invoiceDaysAgo: 7,
      dueDaysAhead: 23,
    },
    {
      invoiceNumber: 'INV-2026-0205',
      vendorIndex: 5,
      description: 'Datadog log retention add-on',
      status: BillStatus.PENDING_APPROVAL,
      amount: '1900.00',
      lineItems: [{ description: 'Extended retention — 90 days', quantity: '1', unitPrice: '1900.00' }],
      invoiceDaysAgo: 11,
      dueDaysAhead: 19,
    },
  ];
}

function approvedBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0301',
      vendorIndex: 1,
      description: 'AWS reserved instances — annual',
      status: BillStatus.APPROVED,
      amount: '24000.00',
      lineItems: [{ description: 'Reserved instance commit', quantity: '1', unitPrice: '24000.00' }],
      invoiceDaysAgo: 14,
      dueDaysAhead: 16,
      paymentMethod: PaymentMethod.WIRE,
    },
    {
      invoiceNumber: 'INV-2026-0302',
      vendorIndex: 0,
      description: 'Stripe Atlas — corporate setup',
      status: BillStatus.APPROVED,
      amount: '500.00',
      lineItems: [{ description: 'Atlas annual maintenance', quantity: '1', unitPrice: '500.00' }],
      invoiceDaysAgo: 12,
      dueDaysAhead: 18,
      paymentMethod: PaymentMethod.ACH,
    },
    {
      invoiceNumber: 'INV-2026-0303',
      vendorIndex: 4,
      description: 'Slack Connect channels add-on',
      status: BillStatus.APPROVED,
      amount: '960.00',
      lineItems: [{ description: 'Add-on for external partners', quantity: '12', unitPrice: '80.00' }],
      invoiceDaysAgo: 13,
      dueDaysAhead: 17,
      paymentMethod: PaymentMethod.ACH,
    },
    {
      invoiceNumber: 'INV-2026-0304',
      vendorIndex: 7,
      description: 'Vercel Enterprise — bandwidth overage',
      status: BillStatus.APPROVED,
      amount: '3200.00',
      lineItems: [{ description: 'Bandwidth — April overage', quantity: '1', unitPrice: '3200.00' }],
      invoiceDaysAgo: 15,
      dueDaysAhead: 15,
      paymentMethod: PaymentMethod.ACH,
    },
    {
      invoiceNumber: 'INV-2026-0305',
      vendorIndex: 6,
      description: 'Linear — engineering plus tier upgrade',
      status: BillStatus.APPROVED,
      amount: '1800.00',
      lineItems: [{ description: 'Plus seats add-on', quantity: '12', unitPrice: '150.00' }],
      invoiceDaysAgo: 16,
      dueDaysAhead: 14,
      paymentMethod: PaymentMethod.ACH,
    },
  ];
}

function scheduledBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0401',
      vendorIndex: 1,
      description: 'AWS — April infrastructure',
      status: BillStatus.SCHEDULED,
      amount: '11320.40',
      lineItems: [{ description: 'Compute + storage', quantity: '1', unitPrice: '11320.40' }],
      invoiceDaysAgo: 22,
      dueDaysAhead: 8,
      paymentMethod: PaymentMethod.WIRE,
      scheduledDaysAhead: 5,
    },
    {
      invoiceNumber: 'INV-2026-0402',
      vendorIndex: 2,
      description: 'Confluence Cloud — annual',
      status: BillStatus.SCHEDULED,
      amount: '4200.00',
      lineItems: [{ description: '100 seats — Confluence Premium', quantity: '100', unitPrice: '42.00' }],
      invoiceDaysAgo: 20,
      dueDaysAhead: 10,
      paymentMethod: PaymentMethod.WIRE,
      scheduledDaysAhead: 7,
    },
    {
      invoiceNumber: 'INV-2026-0403',
      vendorIndex: 3,
      description: 'Notion AI add-on — quarterly',
      status: BillStatus.SCHEDULED,
      amount: '960.00',
      lineItems: [{ description: 'AI add-on × 32 seats × 3 months', quantity: '96', unitPrice: '10.00' }],
      invoiceDaysAgo: 18,
      dueDaysAhead: 12,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: 9,
    },
    {
      invoiceNumber: 'INV-2026-0404',
      vendorIndex: 8,
      description: 'Figma FigJam — annual',
      status: BillStatus.SCHEDULED,
      amount: '720.00',
      lineItems: [{ description: 'FigJam seats × 16', quantity: '16', unitPrice: '45.00' }],
      invoiceDaysAgo: 19,
      dueDaysAhead: 11,
      paymentMethod: PaymentMethod.CARD,
      scheduledDaysAhead: 4,
    },
    {
      invoiceNumber: 'INV-2026-0405',
      vendorIndex: 9,
      description: 'GitHub Advanced Security',
      status: BillStatus.SCHEDULED,
      amount: '2400.00',
      lineItems: [{ description: 'Advanced Security × 120 seats', quantity: '120', unitPrice: '20.00' }],
      invoiceDaysAgo: 21,
      dueDaysAhead: 9,
      paymentMethod: PaymentMethod.CHECK,
      scheduledDaysAhead: 6,
    },
  ];
}

function paidBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0501',
      vendorIndex: 1,
      description: 'AWS — March infrastructure',
      status: BillStatus.PAID,
      amount: '10940.10',
      lineItems: [{ description: 'Compute + storage', quantity: '1', unitPrice: '10940.10' }],
      invoiceDaysAgo: 52,
      dueDaysAhead: -22,
      paymentMethod: PaymentMethod.WIRE,
      scheduledDaysAhead: -25,
      initiatedDaysAgo: 25,
      paidDaysAgo: 22,
    },
    {
      invoiceNumber: 'INV-2026-0502',
      vendorIndex: 0,
      description: 'Stripe platform fees — April',
      status: BillStatus.PAID,
      amount: '3980.00',
      lineItems: [{ description: 'Processing fees — April', quantity: '1', unitPrice: '3980.00' }],
      invoiceDaysAgo: 50,
      dueDaysAhead: -20,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: -23,
      initiatedDaysAgo: 23,
      paidDaysAgo: 20,
    },
    {
      invoiceNumber: 'INV-2026-0503',
      vendorIndex: 5,
      description: 'Datadog — April observability',
      status: BillStatus.PAID,
      amount: '6720.00',
      lineItems: [{ description: 'APM + logs', quantity: '1', unitPrice: '6720.00' }],
      invoiceDaysAgo: 48,
      dueDaysAhead: -18,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: -21,
      initiatedDaysAgo: 21,
      paidDaysAgo: 18,
    },
    {
      invoiceNumber: 'INV-2026-0504',
      vendorIndex: 4,
      description: 'Slack — April',
      status: BillStatus.PAID,
      amount: '2150.00',
      lineItems: [{ description: '50 seats × $43', quantity: '50', unitPrice: '43.00' }],
      invoiceDaysAgo: 46,
      dueDaysAhead: -16,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: -19,
      initiatedDaysAgo: 19,
      paidDaysAgo: 16,
    },
    {
      invoiceNumber: 'INV-2026-0505',
      vendorIndex: 7,
      description: 'Vercel — March',
      status: BillStatus.PAID,
      amount: '780.00',
      lineItems: [{ description: 'Pro team seats', quantity: '13', unitPrice: '60.00' }],
      invoiceDaysAgo: 60,
      dueDaysAhead: -30,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: -33,
      initiatedDaysAgo: 33,
      paidDaysAgo: 30,
    },
    {
      invoiceNumber: 'INV-2026-0506',
      vendorIndex: 6,
      description: 'Linear — March',
      status: BillStatus.PAID,
      amount: '1800.00',
      lineItems: [{ description: '12 plus seats × $150', quantity: '12', unitPrice: '150.00' }],
      invoiceDaysAgo: 58,
      dueDaysAhead: -28,
      paymentMethod: PaymentMethod.ACH,
      scheduledDaysAhead: -31,
      initiatedDaysAgo: 31,
      paidDaysAgo: 28,
    },
    {
      invoiceNumber: 'INV-2026-0507',
      vendorIndex: 2,
      description: 'Jira — March add-ons',
      status: BillStatus.PAID,
      amount: '1200.00',
      lineItems: [{ description: 'Plugin licenses', quantity: '1', unitPrice: '1200.00' }],
      invoiceDaysAgo: 55,
      dueDaysAhead: -25,
      paymentMethod: PaymentMethod.WIRE,
      scheduledDaysAhead: -28,
      initiatedDaysAgo: 28,
      paidDaysAgo: 25,
    },
    {
      invoiceNumber: 'INV-2026-0508',
      vendorIndex: 9,
      description: 'GitHub Enterprise — March',
      status: BillStatus.PAID,
      amount: '5040.00',
      lineItems: [{ description: '120 seats × $42', quantity: '120', unitPrice: '42.00' }],
      invoiceDaysAgo: 56,
      dueDaysAhead: -26,
      paymentMethod: PaymentMethod.CHECK,
      scheduledDaysAhead: -29,
      initiatedDaysAgo: 29,
      paidDaysAgo: 26,
    },
  ];
}

function rejectedBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0601',
      vendorIndex: 8,
      description: 'Figma — duplicate line items detected',
      status: BillStatus.REJECTED,
      amount: '1620.00',
      lineItems: [{ description: 'Designer seats × 18', quantity: '18', unitPrice: '90.00' }],
      invoiceDaysAgo: 30,
      dueDaysAhead: 0,
      rejectionNote: 'Vendor already billed for these seats on INV-2026-0203.',
    },
    {
      invoiceNumber: 'INV-2026-0602',
      vendorIndex: 6,
      description: 'Linear — unauthorized plan upgrade',
      status: BillStatus.REJECTED,
      amount: '2400.00',
      lineItems: [{ description: 'Business tier × 16 seats', quantity: '16', unitPrice: '150.00' }],
      invoiceDaysAgo: 28,
      dueDaysAhead: 2,
      rejectionNote: 'Plan change was not approved by finance.',
    },
    {
      invoiceNumber: 'INV-2026-0603',
      vendorIndex: 3,
      description: 'Notion — wrong entity billed',
      status: BillStatus.REJECTED,
      amount: '840.00',
      lineItems: [{ description: 'Notion AI × 56 seats', quantity: '56', unitPrice: '15.00' }],
      invoiceDaysAgo: 25,
      dueDaysAhead: 5,
      rejectionNote: 'Bill addressed to the wrong legal entity.',
    },
  ];
}

function archivedBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0701',
      vendorIndex: 5,
      description: 'Datadog — pilot trial (cancelled)',
      status: BillStatus.ARCHIVED,
      amount: '320.00',
      lineItems: [{ description: 'Trial conversion fee', quantity: '1', unitPrice: '320.00' }],
      invoiceDaysAgo: 40,
      dueDaysAhead: -10,
      archivedFrom: 'DRAFT',
    },
    {
      invoiceNumber: 'INV-2026-0702',
      vendorIndex: 7,
      description: 'Vercel — duplicate billing closed',
      status: BillStatus.ARCHIVED,
      amount: '780.00',
      lineItems: [{ description: 'Pro team seats — duplicate', quantity: '13', unitPrice: '60.00' }],
      invoiceDaysAgo: 35,
      dueDaysAhead: -5,
      paymentMethod: PaymentMethod.ACH,
      archivedFrom: 'APPROVED',
    },
    {
      invoiceNumber: 'INV-2026-0703',
      vendorIndex: 0,
      description: 'Stripe — superseded by negotiated rate',
      status: BillStatus.ARCHIVED,
      amount: '4250.00',
      lineItems: [{ description: 'Processing fees — pre-discount', quantity: '1', unitPrice: '4250.00' }],
      invoiceDaysAgo: 42,
      dueDaysAhead: -12,
      archivedFrom: 'DRAFT',
    },
  ];
}

async function wipe(): Promise<void> {
  await prisma.activityLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.billLineItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers(): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: SEED_USER_IDS.admin,
        name: 'María Sosa',
        email: 'maria.sosa@billpay.dev',
        role: Role.ADMIN,
      },
      {
        id: SEED_USER_IDS.approver,
        name: 'Carlos Lima',
        email: 'carlos.lima@billpay.dev',
        role: Role.APPROVER,
      },
      {
        id: SEED_USER_IDS.viewer,
        name: 'Ana Fischer',
        email: 'ana.fischer@billpay.dev',
        role: Role.VIEWER,
      },
    ],
  });
}

async function seedVendors(): Promise<string[]> {
  const vendorIds: string[] = [];
  for (const data of VENDORS_SEED) {
    const vendor = await prisma.vendor.create({ data });
    vendorIds.push(vendor.id);
  }
  return vendorIds;
}

async function seedBills(vendorIds: string[]): Promise<void> {
  for (const spec of BILLS_SEED) {
    await seedBill(spec, vendorIds);
  }
}

async function seedBill(spec: BillSpec, vendorIds: string[]): Promise<void> {
  const vendorId = vendorIds[spec.vendorIndex];
  const invoiceDate = daysAgo(spec.invoiceDaysAgo);
  const dueDate = daysAhead(spec.dueDaysAhead);
  const archivedAt = spec.status === BillStatus.ARCHIVED ? daysAgo(2) : null;

  const bill = await prisma.bill.create({
    data: {
      invoiceNumber: spec.invoiceNumber,
      status: spec.status,
      vendorId,
      createdById: SEED_USER_IDS.admin,
      description: spec.description,
      amount: dec(spec.amount),
      currency: 'USD',
      invoiceDate,
      dueDate,
      archivedAt,
      lineItems: {
        create: spec.lineItems.map((line) => ({
          description: line.description,
          quantity: dec(line.quantity),
          unitPrice: dec(line.unitPrice),
          total: dec(line.quantity).mul(dec(line.unitPrice)),
        })),
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      entityType: ActivityEntityType.BILL,
      entityId: bill.id,
      actorId: SEED_USER_IDS.admin,
      actorRole: Role.ADMIN,
      action: 'bill.created',
      toStatus: BillStatus.DRAFT,
      createdAt: invoiceDate,
    },
  });

  if (
    spec.status === BillStatus.DRAFT ||
    (spec.status === BillStatus.ARCHIVED && spec.archivedFrom === 'DRAFT')
  ) {
    if (spec.status === BillStatus.ARCHIVED) {
      await logBillTransition(bill.id, 'bill.archived', BillStatus.DRAFT, BillStatus.ARCHIVED, archivedAt!);
    }
    return;
  }

  const submittedAt = daysAgo(spec.invoiceDaysAgo - 1);
  await prisma.approval.create({
    data: {
      billId: bill.id,
      approverId: SEED_USER_IDS.approver,
      status:
        spec.status === BillStatus.REJECTED
          ? ApprovalStatus.REJECTED
          : spec.status === BillStatus.PENDING_APPROVAL
            ? ApprovalStatus.PENDING
            : ApprovalStatus.APPROVED,
      notes: spec.rejectionNote ?? null,
      createdAt: submittedAt,
      updatedAt:
        spec.status === BillStatus.PENDING_APPROVAL
          ? submittedAt
          : daysAgo(spec.invoiceDaysAgo - 2),
    },
  });

  await logBillTransition(
    bill.id,
    'bill.submitted_for_approval',
    BillStatus.DRAFT,
    BillStatus.PENDING_APPROVAL,
    submittedAt,
  );

  if (spec.status === BillStatus.PENDING_APPROVAL) {
    return;
  }

  if (spec.status === BillStatus.REJECTED) {
    await logBillTransition(
      bill.id,
      'bill.rejected',
      BillStatus.PENDING_APPROVAL,
      BillStatus.REJECTED,
      daysAgo(spec.invoiceDaysAgo - 2),
      Role.APPROVER,
      SEED_USER_IDS.approver,
      { notes: spec.rejectionNote },
    );
    return;
  }

  const approvedAt = daysAgo(spec.invoiceDaysAgo - 2);
  await logBillTransition(
    bill.id,
    'bill.approved',
    BillStatus.PENDING_APPROVAL,
    BillStatus.APPROVED,
    approvedAt,
    Role.APPROVER,
    SEED_USER_IDS.approver,
  );

  if (spec.status === BillStatus.ARCHIVED && spec.archivedFrom === 'APPROVED') {
    await logBillTransition(bill.id, 'bill.archived', BillStatus.APPROVED, BillStatus.ARCHIVED, archivedAt!);
    return;
  }

  const paymentMethod = spec.paymentMethod ?? PaymentMethod.ACH;
  const payment = await prisma.payment.create({
    data: {
      billId: bill.id,
      status: PaymentStatus.UNSCHEDULED,
      method: paymentMethod,
      amount: dec(spec.amount),
      currency: 'USD',
      createdAt: approvedAt,
    },
  });

  await prisma.activityLog.create({
    data: {
      entityType: ActivityEntityType.PAYMENT,
      entityId: payment.id,
      actorId: SEED_USER_IDS.admin,
      actorRole: Role.ADMIN,
      action: 'payment.created',
      toStatus: PaymentStatus.UNSCHEDULED,
      createdAt: approvedAt,
    },
  });

  if (spec.status === BillStatus.APPROVED) {
    return;
  }

  if (
    spec.status === BillStatus.SCHEDULED ||
    spec.status === BillStatus.PAID
  ) {
    const scheduledAt = approvedAt;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SCHEDULED,
        scheduledFor:
          spec.scheduledDaysAhead !== undefined ? daysAhead(spec.scheduledDaysAhead) : null,
      },
    });
    await logPaymentTransition(
      payment.id,
      'payment.scheduled',
      PaymentStatus.UNSCHEDULED,
      PaymentStatus.SCHEDULED,
      scheduledAt,
    );
    await logBillTransition(
      bill.id,
      'bill.scheduled',
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      scheduledAt,
    );
  }

  if (spec.status === BillStatus.PAID && spec.initiatedDaysAgo !== undefined) {
    const initiatedAt = daysAgo(spec.initiatedDaysAgo);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.INITIATED, initiatedAt },
    });
    await logPaymentTransition(
      payment.id,
      'payment.released',
      PaymentStatus.SCHEDULED,
      PaymentStatus.INITIATED,
      initiatedAt,
    );
  }

  if (spec.status === BillStatus.PAID && spec.paidDaysAgo !== undefined) {
    const paidAt = daysAgo(spec.paidDaysAgo);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PAID, paidAt },
    });
    await logPaymentTransition(
      payment.id,
      'payment.marked_as_paid',
      PaymentStatus.INITIATED,
      PaymentStatus.PAID,
      paidAt,
    );
    await logBillTransition(
      bill.id,
      'bill.paid',
      BillStatus.SCHEDULED,
      BillStatus.PAID,
      paidAt,
    );
  }
}

async function logBillTransition(
  billId: string,
  action: string,
  fromStatus: BillStatus,
  toStatus: BillStatus,
  at: Date,
  actorRole: Role = Role.ADMIN,
  actorId: string = SEED_USER_IDS.admin,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      entityType: ActivityEntityType.BILL,
      entityId: billId,
      actorId,
      actorRole,
      action,
      fromStatus,
      toStatus,
      metadata,
      createdAt: at,
    },
  });
}

async function logPaymentTransition(
  paymentId: string,
  action: string,
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus,
  at: Date,
  actorRole: Role = Role.ADMIN,
  actorId: string = SEED_USER_IDS.admin,
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      entityType: ActivityEntityType.PAYMENT,
      entityId: paymentId,
      actorId,
      actorRole,
      action,
      fromStatus,
      toStatus,
      createdAt: at,
    },
  });
}

async function main(): Promise<void> {
  logger.log('Wiping existing data...');
  await wipe();
  logger.log('Seeding users...');
  await seedUsers();
  logger.log('Seeding vendors...');
  const vendorIds = await seedVendors();
  logger.log('Seeding bills...');
  await seedBills(vendorIds);

  const counts = {
    users: await prisma.user.count(),
    vendors: await prisma.vendor.count(),
    bills: await prisma.bill.count(),
    lineItems: await prisma.billLineItem.count(),
    approvals: await prisma.approval.count(),
    payments: await prisma.payment.count(),
    activity: await prisma.activityLog.count(),
  };
  logger.log(`Seed complete: ${JSON.stringify(counts)}`);
}

main()
  .catch((error) => {
    logger.error('Seed failed', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
