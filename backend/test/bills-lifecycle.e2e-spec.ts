import { INestApplication } from '@nestjs/common';
import {
  ApprovalStatus,
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

describe('Bills lifecycle (e2e)', () => {
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
    status: BillStatus;
    invoiceNumber?: string;
  }) =>
    prisma.bill.create({
      data: {
        invoiceNumber: overrides.invoiceNumber ?? `INV-LC-${Date.now()}`,
        vendorId: actors.vendor.id,
        createdById: actors.admin.id,
        status: overrides.status,
        amount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
      },
    });

  // ---- legal transitions ------------------------------------------

  it('submit then approve creates the Payment, updates Approval, and writes the full activity trail', async () => {
    // Vendor defaults to WIRE so we can assert the Payment picked it up.
    await prisma.vendor.update({
      where: { id: actors.vendor.id },
      data: { defaultPaymentMethod: PaymentMethod.WIRE },
    });
    const bill = await insertBill({ status: BillStatus.DRAFT });

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);
    expect(submitRes.status).toBe(200);
    expect((submitRes.body as { status: string }).status).toBe(
      'PENDING_APPROVAL',
    );

    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/approve`)
      .set('x-user-id', actors.approver.id);
    expect(approveRes.status).toBe(200);
    const approveBody = approveRes.body as {
      status: string;
      payment: {
        id: string;
        status: string;
        method: string;
        amount: string;
      } | null;
    };
    expect(approveBody.status).toBe('APPROVED');
    // Contract: approve surfaces the freshly-created Payment inline so
    // consumers can drive the "approve then schedule inline" flow
    // without a second round-trip.
    expect(approveBody.payment).not.toBeNull();
    expect(approveBody.payment?.status).toBe('UNSCHEDULED');
    expect(approveBody.payment?.method).toBe('WIRE');
    expect(approveBody.payment?.amount).toBe('100.00');
    // And the Approval is surfaced inline too — APPROVED with the
    // acting user as approverId.
    const approveBodyWithApprovals = approveRes.body as {
      approvals: { status: string; approverId: string }[];
    };
    expect(approveBodyWithApprovals.approvals).toHaveLength(1);
    expect(approveBodyWithApprovals.approvals[0].status).toBe('APPROVED');
    expect(approveBodyWithApprovals.approvals[0].approverId).toBe(
      actors.approver.id,
    );

    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.APPROVED);
    expect(approval.approverId).toBe(actors.approver.id);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { billId: bill.id },
    });
    expect(payment.status).toBe(PaymentStatus.UNSCHEDULED);
    expect(payment.method).toBe(PaymentMethod.WIRE);
    expect(payment.amount.toFixed(2)).toBe('100.00');

    const billActivity = await prisma.activityLog.findMany({
      where: { entityType: 'BILL', entityId: bill.id },
    });
    expect(billActivity).toHaveLength(2);
    expect(billActivity.map((a) => a.action)).toEqual(
      expect.arrayContaining(['bill.submitted_for_approval', 'bill.approved']),
    );
    expect(
      billActivity.find((a) => a.action === 'bill.approved')?.actorId,
    ).toBe(actors.approver.id);

    const paymentActivity = await prisma.activityLog.findMany({
      where: { entityType: 'PAYMENT', entityId: payment.id },
    });
    expect(paymentActivity).toHaveLength(1);
    expect(paymentActivity[0].action).toBe('payment.created');
    expect(paymentActivity[0].toStatus).toBe('UNSCHEDULED');
  });

  it('reject works without notes (bare body) and stores null on the Approval', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-REJ-NO-NOTES',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/reject`)
      .set('x-user-id', actors.approver.id)
      .send({});
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('REJECTED');

    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.REJECTED);
    expect(approval.notes).toBeNull();

    const rejectLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.rejected',
      },
    });
    expect(rejectLog.metadata).toBeNull();
  });

  it('archive on a REJECTED bill moves it to ARCHIVED (legal source per docs/backend.md)', async () => {
    const bill = await insertBill({
      status: BillStatus.REJECTED,
      invoiceNumber: 'INV-REJ-ARCH',
    });
    // Seed the corresponding REJECTED Approval row so we can assert
    // that archiving a REJECTED bill does NOT rewrite history.
    await prisma.approval.create({
      data: {
        billId: bill.id,
        approverId: actors.approver.id,
        status: ApprovalStatus.REJECTED,
        notes: 'Already rejected for cause.',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('ARCHIVED');

    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    expect(archiveLog.fromStatus).toBe(BillStatus.REJECTED);
    expect(archiveLog.toStatus).toBe(BillStatus.ARCHIVED);
    // No cancellation when nothing was PENDING.
    expect(archiveLog.metadata).toBeNull();

    // Approval stays REJECTED — historical truth preserved.
    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.REJECTED);
    expect(approval.notes).toBe('Already rejected for cause.');
  });

  // ---- cancel-on-archive matrix ----------------------------------

  it('archive on a DRAFT bill: no approval rows exist, nothing to cancel', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-ARCH-DRAFT',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);

    const approvals = await prisma.approval.findMany({
      where: { billId: bill.id },
    });
    expect(approvals).toHaveLength(0);

    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    expect(archiveLog.metadata).toBeNull();
  });

  it('archive on a PENDING_APPROVAL bill: the PENDING Approval is CANCELED', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-ARCH-PENDING',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    const body = res.body as {
      approvals: { status: string }[];
    };
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0].status).toBe('CANCELED');

    // DB confirms.
    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.CANCELED);

    // Activity log carries `cancelledApprovals: 1`.
    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    expect(archiveLog.metadata).toEqual({ cancelledApprovals: 1 });
  });

  it('archive on an APPROVED bill: the APPROVED Approval stays APPROVED (history preserved)', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-ARCH-APPROVED',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/approve`)
      .set('x-user-id', actors.approver.id);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);

    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.APPROVED);

    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    // Approval was APPROVED so no Approval cancel. But the approve step
    // created a Payment in UNSCHEDULED; archive cascades it to CANCELED
    // (Phase 6) and records the id in metadata.cancelledPayment.
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { billId: bill.id },
    });
    expect(payment.status).toBe('CANCELED');
    expect(archiveLog.metadata).toEqual({ cancelledPayment: payment.id });
  });

  it('reject stores notes on the Approval and writes a rejection log entry', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-REJ',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/reject`)
      .set('x-user-id', actors.approver.id)
      .send({ notes: 'Duplicate of INV-001.' });
    expect(res.status).toBe(200);
    const rejectBody = res.body as {
      status: string;
      approvals: { status: string; notes: string | null }[];
    };
    expect(rejectBody.status).toBe('REJECTED');
    // Notes are surfaced in the response (the gap we shipped on first
    // pass of PR #5 — consumers had no way to see what they sent back).
    expect(rejectBody.approvals).toHaveLength(1);
    expect(rejectBody.approvals[0].status).toBe('REJECTED');
    expect(rejectBody.approvals[0].notes).toBe('Duplicate of INV-001.');

    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.REJECTED);
    expect(approval.notes).toBe('Duplicate of INV-001.');

    const noPayment = await prisma.payment.findUnique({
      where: { billId: bill.id },
    });
    expect(noPayment).toBeNull();
  });

  it('archive sets archivedAt and logs the originating status', async () => {
    const bill = await insertBill({
      status: BillStatus.APPROVED,
      invoiceNumber: 'INV-ARCH',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('ARCHIVED');

    const stored = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(stored.archivedAt).not.toBeNull();

    const archiveLog = await prisma.activityLog.findFirstOrThrow({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.archived',
      },
    });
    expect(archiveLog.fromStatus).toBe(BillStatus.APPROVED);
    expect(archiveLog.toStatus).toBe(BillStatus.ARCHIVED);
  });

  it('concurrent approves on the same PENDING_APPROVAL bill: exactly one succeeds, the other returns 409', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-RACE',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);

    // Fire both approves concurrently. The CAS inside the transaction
    // guarantees only one transition succeeds; the loser sees the
    // already-flipped status reflected in `details.from`.
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/bills/${bill.id}/approve`)
        .set('x-user-id', actors.approver.id),
      request(app.getHttpServer())
        .post(`/api/v1/bills/${bill.id}/approve`)
        .set('x-user-id', actors.approver.id),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const loser = resA.status === 409 ? resA : resB;
    const loserBody = loser.body as {
      error: { code: string; details: { from: string; to: string } };
    };
    expect(loserBody.error.code).toBe('BILL_INVALID_TRANSITION');
    // The loser must report the actual post-race status (APPROVED), not
    // the stale PENDING_APPROVAL the outer pre-check would have seen.
    expect(loserBody.error.details.from).toBe('APPROVED');
    expect(loserBody.error.details.to).toBe('APPROVED');

    // Side effects landed exactly once: one Payment, one APPROVED
    // Approval, one bill.approved activity row.
    const payments = await prisma.payment.findMany({
      where: { billId: bill.id },
    });
    expect(payments).toHaveLength(1);
    const approvedRows = await prisma.approval.findMany({
      where: { billId: bill.id, status: ApprovalStatus.APPROVED },
    });
    expect(approvedRows).toHaveLength(1);
    const approveLogs = await prisma.activityLog.findMany({
      where: {
        entityType: 'BILL',
        entityId: bill.id,
        action: 'bill.approved',
      },
    });
    expect(approveLogs).toHaveLength(1);
  });

  it('reject with truly no request body (no .send) returns 200 and stores null notes', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-REJ-NO-BODY',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.admin.id);

    // Note: no `.send(...)` at all. Defensive default on the controller
    // DTO + the `dto?.notes` guard in the service make this work.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/reject`)
      .set('x-user-id', actors.approver.id);

    expect(res.status).toBe(200);
    const approval = await prisma.approval.findFirstOrThrow({
      where: { billId: bill.id },
    });
    expect(approval.status).toBe(ApprovalStatus.REJECTED);
    expect(approval.notes).toBeNull();
  });

  // ---- illegal transitions ----------------------------------------

  it('approve on a DRAFT bill returns 409 BILL_INVALID_TRANSITION with from/to details', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-BAD-A',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/approve`)
      .set('x-user-id', actors.approver.id);

    expect(res.status).toBe(409);
    const body = res.body as {
      error: { code: string; details: { from: string; to: string } };
    };
    expect(body.error.code).toBe('BILL_INVALID_TRANSITION');
    expect(body.error.details.from).toBe('DRAFT');
    expect(body.error.details.to).toBe('APPROVED');
  });

  it('archive on a PAID bill returns 409 BILL_INVALID_TRANSITION', async () => {
    const bill = await insertBill({
      status: BillStatus.PAID,
      invoiceNumber: 'INV-BAD-P',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.admin.id);

    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'BILL_INVALID_TRANSITION',
    );
  });

  // ---- role gating ------------------------------------------------

  it('viewer cannot submit a bill for approval (403)', async () => {
    const bill = await insertBill({
      status: BillStatus.DRAFT,
      invoiceNumber: 'INV-V',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit-for-approval`)
      .set('x-user-id', actors.viewer.id);

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });

  it('approver cannot archive a bill (403 — Admin only)', async () => {
    const bill = await insertBill({
      status: BillStatus.APPROVED,
      invoiceNumber: 'INV-AP',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/archive`)
      .set('x-user-id', actors.approver.id);

    expect(res.status).toBe(403);
  });
});
