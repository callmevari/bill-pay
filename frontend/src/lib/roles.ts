// Role + action vocabulary shared by the API client, the role context, and
// `useCan`. Codes mirror what the backend enforces in
// `docs/api-contract.md` → Permission matrix. Keep the union literal so the
// type system catches every new action at the call sites.

export type Role = 'ADMIN' | 'APPROVER' | 'VIEWER';

export type PermissionAction =
  // Vendors
  | 'vendor.read'
  | 'vendor.create'
  | 'vendor.update'
  | 'vendor.delete'
  // Bills
  | 'bill.read'
  | 'bill.create'
  | 'bill.update'
  | 'bill.lineItem.write'
  | 'bill.submitForApproval'
  | 'bill.approve'
  | 'bill.reject'
  | 'bill.archive'
  | 'bill.bulkApprove'
  | 'bill.bulkArchive'
  | 'bill.bulkEdit'
  // Payments
  | 'payment.read'
  | 'payment.schedule'
  | 'payment.unschedule'
  | 'payment.release'
  | 'payment.markAsPaid'
  | 'payment.cancel'
  | 'payment.retry'
  | 'payment.bulkRelease'
  | 'payment.bulkMarkAsPaid'
  | 'payment.bulkCancel'
  // Activity + exports
  | 'activity.read'
  | 'export.bills';

// Single source of truth for the FE permission matrix. Mirrors the table in
// `docs/api-contract.md`. Backend remains authoritative — this only drives
// UI hide/disable decisions.
const PERMISSIONS: Readonly<Record<PermissionAction, readonly Role[]>> = {
  // Vendors
  'vendor.read': ['ADMIN', 'APPROVER', 'VIEWER'],
  'vendor.create': ['ADMIN'],
  'vendor.update': ['ADMIN'],
  'vendor.delete': ['ADMIN'],
  // Bills
  'bill.read': ['ADMIN', 'APPROVER', 'VIEWER'],
  'bill.create': ['ADMIN'],
  'bill.update': ['ADMIN'],
  'bill.lineItem.write': ['ADMIN'],
  'bill.submitForApproval': ['ADMIN'],
  'bill.approve': ['ADMIN', 'APPROVER'],
  'bill.reject': ['ADMIN', 'APPROVER'],
  'bill.archive': ['ADMIN'],
  'bill.bulkApprove': ['ADMIN', 'APPROVER'],
  'bill.bulkArchive': ['ADMIN'],
  'bill.bulkEdit': ['ADMIN'],
  // Payments
  'payment.read': ['ADMIN', 'APPROVER', 'VIEWER'],
  'payment.schedule': ['ADMIN'],
  'payment.unschedule': ['ADMIN'],
  'payment.release': ['ADMIN'],
  'payment.markAsPaid': ['ADMIN'],
  'payment.cancel': ['ADMIN'],
  'payment.retry': ['ADMIN'],
  'payment.bulkRelease': ['ADMIN'],
  'payment.bulkMarkAsPaid': ['ADMIN'],
  'payment.bulkCancel': ['ADMIN'],
  // Activity + exports
  'activity.read': ['ADMIN', 'APPROVER', 'VIEWER'],
  'export.bills': ['ADMIN', 'APPROVER', 'VIEWER'],
} as const;

export function canRolePerform(role: Role, action: PermissionAction): boolean {
  return PERMISSIONS[action].includes(role);
}
