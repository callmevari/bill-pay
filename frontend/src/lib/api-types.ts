// Wire-shape types mirroring `docs/api-contract.md`. Kept in one file so
// the consumers (hooks, table, detail page) share a single source of
// truth and a contract drift shows up as a TS error in a single place.

export type BillStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PAID'
  | 'REJECTED'
  | 'ARCHIVED';

export type PaymentStatus =
  | 'UNSCHEDULED'
  | 'SCHEDULED'
  | 'INITIATED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELED';

export type PaymentMethod = 'ACH' | 'WIRE' | 'CHECK' | 'CARD' | 'OFF_PLATFORM';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export type ActivityEntityType = 'BILL' | 'PAYMENT' | 'VENDOR' | 'APPROVAL';

export type Role = 'ADMIN' | 'APPROVER' | 'VIEWER';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  defaultPaymentMethod: PaymentMethod;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillLineItem {
  id: string;
  billId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillApproval {
  id: string;
  billId: string;
  approverId: string;
  approverName: string;
  status: ApprovalStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillPayment {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: string;
  currency: string;
  scheduledFor: string | null;
  initiatedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  invoiceNumber: string;
  status: BillStatus;
  vendorId: string;
  createdById: string;
  description: string | null;
  amount: string;
  currency: string;
  // Per-bill override of the vendor default. `null` means "fall back to
  // the vendor's defaultPaymentMethod". The resolved method is surfaced
  // on `payment.method` after approval.
  paymentMethod: PaymentMethod | null;
  invoiceDate: string;
  dueDate: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: BillLineItem[];
  approvals: BillApproval[];
  payment: BillPayment | null;
}

export interface ActivityLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  metadata: unknown;
  createdAt: string;
}
