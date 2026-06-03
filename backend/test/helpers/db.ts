import {
  PaymentMethod,
  PrismaClient,
  Role,
  User,
  Vendor,
} from '@prisma/client';

export interface SeedActors {
  admin: User;
  approver: User;
  viewer: User;
  vendor: Vendor;
}

// Deletes every row in dependency order so the next test starts on a
// fresh slate. The migrations live in the `test_e2e` schema, so the
// `public` schema (dev data) is never touched.
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.activityLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.billLineItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
}

// Inserts the minimum actors every e2e spec needs — one user per role
// and one vendor. Returns the created rows so tests can reference them
// by id without hardcoding seed values.
export async function seedMinimalData(
  prisma: PrismaClient,
): Promise<SeedActors> {
  const admin = await prisma.user.create({
    data: { name: 'Test Admin', email: 'admin@e2e.test', role: Role.ADMIN },
  });
  const approver = await prisma.user.create({
    data: {
      name: 'Test Approver',
      email: 'approver@e2e.test',
      role: Role.APPROVER,
    },
  });
  const viewer = await prisma.user.create({
    data: { name: 'Test Viewer', email: 'viewer@e2e.test', role: Role.VIEWER },
  });
  const vendor = await prisma.vendor.create({
    data: {
      name: 'E2E Test Vendor',
      email: 'vendor@e2e.test',
      defaultPaymentMethod: PaymentMethod.ACH,
    },
  });
  return { admin, approver, viewer, vendor };
}
