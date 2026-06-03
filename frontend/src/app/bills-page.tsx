'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { RowSelectionState } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillsTable } from '@/components/bills/bills-table';
import { BulkToolbar } from '@/components/bills/bulk-toolbar';
import { ExportMenu } from '@/components/bills/export-menu';
import { EMPTY_FILTERS, FilterBar, type BillFiltersValue } from '@/components/bills/filter-bar';
import { BILL_TABS, DEFAULT_TAB, findTab, type BillTabId } from '@/lib/bill-tabs';
import { useBillsQuery } from '@/hooks/use-bills-query';
import { useAllVendorsQuery } from '@/hooks/use-vendors-query';
import { useCan } from '@/hooks/use-can';
import { useRoleHydrated } from '@/stores/role-store';
import type { Vendor } from '@/lib/api-types';

const STORAGE_TAB_KEY = 'bill-pay.bills.lastTab';
const STORAGE_COLUMNS_KEY = 'bill-pay.bills.columns';
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT = '-createdAt';

export function BillsPage(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useRoleHydrated();
  const canCreate = useCan('bill.create');

  // Tab persists in the URL when explicit, otherwise falls back to the
  // last-used tab from localStorage so a refresh keeps the user in place.
  const urlTab = params.get('tab') as BillTabId | null;
  const [persistedTab, setPersistedTab] = useState<BillTabId>(DEFAULT_TAB);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_TAB_KEY);
    if (raw) setPersistedTab(findTab(raw).id);
  }, []);

  const activeTab: BillTabId = urlTab ? findTab(urlTab).id : persistedTab;

  const filters = useMemo<BillFiltersValue>(
    () => ({
      q: params.get('q') ?? '',
      vendorId: params.get('vendorId') ?? '',
      minAmount: params.get('minAmount') ?? '',
      maxAmount: params.get('maxAmount') ?? '',
      dueDateFrom: params.get('dueDateFrom') ?? '',
      dueDateTo: params.get('dueDateTo') ?? '',
      paymentMethod: params.get('paymentMethod') ?? '',
    }),
    [params],
  );

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Number(params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );
  const sort = params.get('sort') ?? DEFAULT_SORT;

  const tabConfig = findTab(activeTab);

  const replaceParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') {
          search.delete(key);
        } else {
          search.set(key, value);
        }
      }
      const str = search.toString();
      router.replace(str ? `/?${str}` : '/', { scroll: false });
    },
    [params, router],
  );

  // Bulk-action selection lives at the page level so the toolbar can read
  // it without lifting state out of the table later. The selection is
  // cleared whenever the underlying dataset shifts — tab switch, filter
  // change, page change — because the row ids in the cache no longer
  // match what the user is looking at.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const onTabChange = (next: string): void => {
    const tab = findTab(next).id;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_TAB_KEY, tab);
    }
    setPersistedTab(tab);
    clearSelection();
    // Reset page on tab switch; clear sort/filters? we keep filters but
    // reset paging so the user lands on a meaningful first page.
    replaceParams({ tab, page: undefined });
  };

  const onFiltersChange = (next: BillFiltersValue): void => {
    clearSelection();
    replaceParams({
      q: next.q,
      vendorId: next.vendorId,
      minAmount: next.minAmount,
      maxAmount: next.maxAmount,
      dueDateFrom: next.dueDateFrom,
      dueDateTo: next.dueDateTo,
      paymentMethod: next.paymentMethod,
      page: undefined,
    });
  };

  const onSortChange = (next: string): void => {
    clearSelection();
    replaceParams({ sort: next === '' ? undefined : next, page: undefined });
  };

  const onPageChange = (next: number): void => {
    clearSelection();
    replaceParams({ page: next === 1 ? undefined : String(next) });
  };

  // Convert the form-shaped filter object into the wire query the hook
  // expects. The tab maps to the `status` filter directly.
  const billsQuery = useBillsQuery(
    {
      page,
      pageSize,
      sort,
      status: tabConfig.status?.join(','),
      vendorId: filters.vendorId || undefined,
      minAmount: filters.minAmount || undefined,
      maxAmount: filters.maxAmount || undefined,
      dueDateFrom: filters.dueDateFrom ? toIsoStart(filters.dueDateFrom) : undefined,
      dueDateTo: filters.dueDateTo ? toIsoEnd(filters.dueDateTo) : undefined,
      paymentMethod: filters.paymentMethod || undefined,
      q: filters.q || undefined,
    },
    { enabled: hydrated },
  );

  const vendorsQuery = useAllVendorsQuery({ enabled: hydrated });
  const vendors: Vendor[] = useMemo(
    () => vendorsQuery.data?.data ?? [],
    [vendorsQuery.data],
  );
  const vendorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vendors) map.set(v.id, v.name);
    return map;
  }, [vendors]);

  const bills = useMemo(
    () => billsQuery.data?.data ?? [],
    [billsQuery.data?.data],
  );
  const meta = billsQuery.data?.meta;
  const start = bills.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = bills.length === 0 ? 0 : start + bills.length - 1;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  // Drop selected ids that vanished from the current page so a stale row
  // id never sneaks into a bulk request. Cheap O(n) sync after each fetch
  // settles; runs only when the visible id set actually changes.
  const visibleIds = useMemo(() => bills.map((bill) => bill.id), [bills]);
  useEffect(() => {
    setRowSelection((prev) => {
      const visible = new Set(visibleIds);
      const kept: RowSelectionState = {};
      let changed = false;
      for (const [id, value] of Object.entries(prev)) {
        if (visible.has(id)) {
          kept[id] = value;
        } else {
          changed = true;
        }
      }
      return changed ? kept : prev;
    });
  }, [visibleIds]);

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  // Build the filter querystring once so both the table query and the CSV
  // export pin to the same view. Empty values are dropped — see the
  // existing convention in `useBillsQuery → buildQueryString`.
  const exportSearch = useMemo(() => {
    const search = new URLSearchParams();
    if (tabConfig.status) search.set('status', tabConfig.status.join(','));
    if (filters.vendorId) search.set('vendorId', filters.vendorId);
    if (filters.minAmount) search.set('minAmount', filters.minAmount);
    if (filters.maxAmount) search.set('maxAmount', filters.maxAmount);
    if (filters.dueDateFrom) search.set('dueDateFrom', toIsoStart(filters.dueDateFrom));
    if (filters.dueDateTo) search.set('dueDateTo', toIsoEnd(filters.dueDateTo));
    if (filters.paymentMethod) search.set('paymentMethod', filters.paymentMethod);
    if (filters.q) search.set('q', filters.q);
    if (sort) search.set('sort', sort);
    const str = search.toString();
    return str ? `?${str}` : '';
  }, [tabConfig.status, filters, sort]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground">
            Track invoices owed to vendors. Use the tabs to focus on a stage of the workflow.
          </p>
        </div>
        {canCreate ? (
          <Button asChild size="sm" aria-label="New bill">
            <Link href="/bills/new">
              <Plus className="size-4" />
              New bill
            </Link>
          </Button>
        ) : null}
      </header>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList aria-label="Bill status tabs">
          {BILL_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar
        value={filters}
        onChange={onFiltersChange}
        vendors={vendors}
        vendorsLoading={vendorsQuery.isPending}
      />

      <BillsTable
        bills={bills}
        isPending={!hydrated || billsQuery.isPending}
        isFetching={billsQuery.isFetching}
        error={billsQuery.error}
        onRetry={() => void billsQuery.refetch()}
        vendorById={vendorById}
        sort={sort}
        onSortChange={onSortChange}
        pageSize={pageSize}
        storageKey={STORAGE_COLUMNS_KEY}
        showPaymentActions={activeTab === 'for-payment' || activeTab === 'history'}
        selectionState={rowSelection}
        onSelectionStateChange={setRowSelection}
        toolbarLeading={<ExportMenu searchString={exportSearch} />}
        toolbarSlot={
          selectedIds.length > 0 ? (
            <BulkToolbar
              selectedIds={selectedIds}
              bills={bills}
              activeTab={activeTab}
              onClearSelection={clearSelection}
            />
          ) : null
        }
      />

      {meta && total > 0 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {start}-{end} of {total} bill{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

// `dueDateFrom` / `dueDateTo` come from `<input type="date">` as
// `YYYY-MM-DD`. The backend filter is inclusive on both ends, so we widen
// the bounds to the full UTC day to avoid surprising the user who picked
// "Jun 1" but doesn't see a bill with a `dueDate` of `2026-06-01T12:00`.
function toIsoStart(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}
function toIsoEnd(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59.999Z`;
}

export { EMPTY_FILTERS };
