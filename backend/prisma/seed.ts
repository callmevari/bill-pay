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

// Seed inserts activity log rows directly via Prisma, bypassing the
// service helpers that set `createdAt: new Date()` per row in prod.
// Without explicit offsets the rows tie at the millisecond and the UI
// timeline can't preserve lifecycle order. A few minutes between rows
// in the same logical day mirrors how a real transaction would look.
function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
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
  // Per-bill `Bill.paymentMethod` override. When set, beats the
  // vendor's default at approve time; when omitted the vendor default
  // drives the resolved Payment.method. Mirrors the runtime contract.
  paymentMethod?: PaymentMethod;
  scheduledDaysAhead?: number;
  initiatedDaysAgo?: number;
  paidDaysAgo?: number;
  archivedFrom?: 'DRAFT' | 'APPROVED';
  rejectionNote?: string;
  // Drives a payment into a non-happy terminal state after the normal
  // bill-status walk. `FAILED` walks scheduled → initiated → failed and
  // leaves the bill in SCHEDULED (matches the contract: there is no
  // `markAsFailed` endpoint, so the bill never moves back). `CANCELED`
  // walks scheduled → canceled and leaves the bill in APPROVED (direct
  // cancel un-schedules the bill).
  paymentEndState?: 'FAILED' | 'CANCELED';
  failedDaysAgo?: number;
  failureReason?: string;
  canceledDaysAgo?: number;
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
  // 2 SCHEDULED with FAILED payment
  ...failedPaymentBills(),
  // 2 APPROVED with CANCELED payment (direct cancel)
  ...canceledPaymentBills(),
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
      // Per-bill override: Datadog defaults to ACH, but finance flagged
      // this quarter's retention add-on for a wire so it clears before
      // the renewal cutoff. Demonstrates the bill > vendor precedence
      // on a PENDING_APPROVAL bill (override stored before approve
      // runs, applied to the auto-created Payment at approve time).
      invoiceNumber: 'INV-2026-0205',
      vendorIndex: 5,
      description: 'Datadog log retention add-on (WIRE for cutoff timing)',
      status: BillStatus.PENDING_APPROVAL,
      amount: '1900.00',
      lineItems: [{ description: 'Extended retention — 90 days', quantity: '1', unitPrice: '1900.00' }],
      invoiceDaysAgo: 11,
      dueDaysAhead: 19,
      paymentMethod: PaymentMethod.WIRE,
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
    },
    {
      // Per-bill override: Slack defaults to ACH, but finance asked for
      // a wire on this one Connect add-on so AR can match it against an
      // existing partner contract. Demonstrates the bill > vendor
      // precedence on an APPROVED bill.
      invoiceNumber: 'INV-2026-0303',
      vendorIndex: 4,
      description: 'Slack Connect channels add-on (one-off WIRE per finance)',
      status: BillStatus.APPROVED,
      amount: '960.00',
      lineItems: [{ description: 'Add-on for external partners', quantity: '12', unitPrice: '80.00' }],
      invoiceDaysAgo: 13,
      dueDaysAhead: 17,
      paymentMethod: PaymentMethod.WIRE,
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
      scheduledDaysAhead: -25,
      initiatedDaysAgo: 25,
      paidDaysAgo: 22,
    },
    {
      // Per-bill override: Stripe defaults to ACH, but this large April
      // fee tranche was paid by WIRE for same-day settlement. Captures
      // the "Stripe invoice paid by WIRE while the rest go ACH" demo
      // case on a PAID bill so the History tab shows the override.
      invoiceNumber: 'INV-2026-0502',
      vendorIndex: 0,
      description: 'Stripe platform fees — April (WIRE for same-day settle)',
      status: BillStatus.PAID,
      amount: '3980.00',
      lineItems: [{ description: 'Processing fees — April', quantity: '1', unitPrice: '3980.00' }],
      invoiceDaysAgo: 50,
      dueDaysAhead: -20,
      paymentMethod: PaymentMethod.WIRE,
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
      scheduledDaysAhead: -29,
      initiatedDaysAgo: 29,
      paidDaysAgo: 26,
    },
  ];
}

function failedPaymentBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0701',
      vendorIndex: 4,
      description: 'Datadog — May observability',
      status: BillStatus.SCHEDULED,
      amount: '3200.00',
      lineItems: [{ description: 'Pro plan + APM', quantity: '1', unitPrice: '3200.00' }],
      invoiceDaysAgo: 14,
      dueDaysAhead: 1,
      scheduledDaysAhead: -2,
      paymentEndState: 'FAILED',
      failedDaysAgo: 1,
      failureReason: 'Insufficient funds on the receiving account.',
    },
    {
      // Per-bill override: Linear defaults to ACH, this one was wired
      // and the wire was rejected by the intermediary bank — useful for
      // demoing both the override path and the FAILED payment recovery
      // flow in the same row.
      invoiceNumber: 'INV-2026-0702',
      vendorIndex: 6,
      description: 'Twilio — April messaging (WIRE rejected by SWIFT)',
      status: BillStatus.SCHEDULED,
      amount: '845.30',
      lineItems: [{ description: 'SMS + voice minutes', quantity: '1', unitPrice: '845.30' }],
      invoiceDaysAgo: 12,
      dueDaysAhead: 3,
      paymentMethod: PaymentMethod.WIRE,
      scheduledDaysAhead: -3,
      paymentEndState: 'FAILED',
      failedDaysAgo: 2,
      failureReason: 'Wire rejected by intermediary bank (invalid SWIFT code).',
    },
  ];
}

function canceledPaymentBills(): BillSpec[] {
  return [
    {
      invoiceNumber: 'INV-2026-0801',
      vendorIndex: 5,
      description: 'Linear — March licenses',
      status: BillStatus.APPROVED,
      amount: '1680.00',
      lineItems: [{ description: 'Linear seats × 56', quantity: '56', unitPrice: '30.00' }],
      invoiceDaysAgo: 10,
      dueDaysAhead: 5,
      scheduledDaysAhead: 7,
      paymentEndState: 'CANCELED',
      canceledDaysAgo: 1,
    },
    {
      invoiceNumber: 'INV-2026-0802',
      vendorIndex: 7,
      description: 'Sentry — quarterly',
      status: BillStatus.APPROVED,
      amount: '2160.00',
      lineItems: [{ description: 'Team plan × 1 quarter', quantity: '1', unitPrice: '2160.00' }],
      invoiceDaysAgo: 9,
      dueDaysAhead: 6,
      scheduledDaysAhead: 8,
      paymentEndState: 'CANCELED',
      canceledDaysAgo: 2,
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

interface SeededVendor {
  id: string;
  defaultPaymentMethod: PaymentMethod | null;
}

async function seedVendors(): Promise<SeededVendor[]> {
  const vendors: SeededVendor[] = [];
  for (const data of VENDORS_SEED) {
    const vendor = await prisma.vendor.create({ data });
    vendors.push({
      id: vendor.id,
      defaultPaymentMethod: vendor.defaultPaymentMethod,
    });
  }
  return vendors;
}

async function seedBills(vendors: SeededVendor[]): Promise<void> {
  for (const spec of BILLS_SEED) {
    await seedBill(spec, vendors);
  }
}

async function seedBill(spec: BillSpec, vendors: SeededVendor[]): Promise<void> {
  const vendor = vendors[spec.vendorIndex];
  const vendorId = vendor.id;
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
      paymentMethod: spec.paymentMethod ?? null,
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

  // Mirror BillsService.approve's resolution precedence so seeded bills
  // and runtime-approved bills behave identically: bill override beats
  // vendor default beats ACH fallback. `methodSource` is captured on
  // the `payment.created` activity row for the UI to surface why a
  // particular method was chosen on this bill.
  let paymentMethod: PaymentMethod;
  let methodSource: 'bill' | 'vendor' | 'fallback';
  if (spec.paymentMethod) {
    paymentMethod = spec.paymentMethod;
    methodSource = 'bill';
  } else if (vendor.defaultPaymentMethod) {
    paymentMethod = vendor.defaultPaymentMethod;
    methodSource = 'vendor';
  } else {
    paymentMethod = PaymentMethod.ACH;
    methodSource = 'fallback';
  }
  const paymentCreatedAt = plusMinutes(approvedAt, 1);
  const payment = await prisma.payment.create({
    data: {
      billId: bill.id,
      status: PaymentStatus.UNSCHEDULED,
      method: paymentMethod,
      amount: dec(spec.amount),
      currency: 'USD',
      createdAt: paymentCreatedAt,
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
      metadata: { method: paymentMethod, methodSource, billId: bill.id },
      createdAt: paymentCreatedAt,
    },
  });

  // CANCELED end-state: bill stays APPROVED but the payment walked
  // through SCHEDULED -> CANCELED. We have to seed the schedule +
  // cancel events explicitly because the standard SCHEDULED-or-PAID
  // branch below would leave the bill at SCHEDULED.
  if (spec.paymentEndState === 'CANCELED' && spec.canceledDaysAgo !== undefined) {
    const paymentScheduledAt = plusMinutes(approvedAt, 2);
    const billScheduledAt = plusMinutes(approvedAt, 3);
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
      paymentScheduledAt,
    );
    await logBillTransition(
      bill.id,
      'bill.scheduled',
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      billScheduledAt,
    );

    const canceledAt = daysAgo(spec.canceledDaysAgo);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CANCELED, canceledAt, scheduledFor: null },
    });
    await logPaymentTransition(
      payment.id,
      'payment.canceled',
      PaymentStatus.SCHEDULED,
      PaymentStatus.CANCELED,
      canceledAt,
    );
    await logBillTransition(
      bill.id,
      'bill.payment_canceled',
      BillStatus.SCHEDULED,
      BillStatus.APPROVED,
      plusMinutes(canceledAt, 1),
    );
    return;
  }

  if (spec.status === BillStatus.APPROVED) {
    return;
  }

  if (
    spec.status === BillStatus.SCHEDULED ||
    spec.status === BillStatus.PAID
  ) {
    const paymentScheduledAt = plusMinutes(approvedAt, 2);
    const billScheduledAt = plusMinutes(approvedAt, 3);
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
      paymentScheduledAt,
    );
    await logBillTransition(
      bill.id,
      'bill.scheduled',
      BillStatus.APPROVED,
      BillStatus.SCHEDULED,
      billScheduledAt,
    );
  }

  // FAILED end-state: walk SCHEDULED -> INITIATED -> FAILED. The bill
  // stays SCHEDULED — there is no markAsFailed endpoint that would
  // move the bill back, so the seed mirrors that invariant.
  if (
    spec.paymentEndState === 'FAILED' &&
    spec.failedDaysAgo !== undefined &&
    spec.failureReason !== undefined
  ) {
    const initiatedAt = daysAgo(spec.failedDaysAgo + 1);
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

    const failedAt = daysAgo(spec.failedDaysAgo);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failedAt,
        failureReason: spec.failureReason,
      },
    });
    await logPaymentTransition(
      payment.id,
      'payment.failed',
      PaymentStatus.INITIATED,
      PaymentStatus.FAILED,
      failedAt,
    );
    return;
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
      plusMinutes(paidAt, 1),
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
  const vendors = await seedVendors();
  logger.log('Seeding bills...');
  await seedBills(vendors);

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
