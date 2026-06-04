import type { BillStatus } from './api-types';

// Canonical tab structure for the bills page. The Overview tab maps to
// "everything non-archived" — the index intentionally hides archived bills
// behind the History tab so the default workspace stays focused.
export type BillTabId = 'overview' | 'drafts' | 'for-approvals' | 'for-payment' | 'history';

export interface BillTabConfig {
  id: BillTabId;
  label: string;
  // Comma-separated `status` query param. `undefined` means "do not send
  // the filter" — the Overview tab is "all non-archived" which the backend
  // expresses as the union of every status except ARCHIVED.
  status: BillStatus[] | undefined;
}

const NON_ARCHIVED: BillStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'PAID',
  'REJECTED',
];

export const BILL_TABS: readonly BillTabConfig[] = [
  { id: 'overview', label: 'Overview', status: NON_ARCHIVED },
  { id: 'drafts', label: 'Drafts', status: ['DRAFT'] },
  { id: 'for-approvals', label: 'For approval', status: ['PENDING_APPROVAL'] },
  { id: 'for-payment', label: 'For payment', status: ['APPROVED', 'SCHEDULED'] },
  { id: 'history', label: 'History', status: ['PAID', 'REJECTED', 'ARCHIVED'] },
] as const;

export const DEFAULT_TAB: BillTabId = 'overview';

export function findTab(id: string | null | undefined): BillTabConfig {
  const match = BILL_TABS.find((t) => t.id === id);
  return match ?? BILL_TABS[0]!;
}
