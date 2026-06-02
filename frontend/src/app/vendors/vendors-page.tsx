'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { apiFetch, ApiError, ErrorCode } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VendorFormDialog } from '@/components/vendors/vendor-form-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loading } from '@/components/states/loading';
import { Empty } from '@/components/states/empty';
import { ErrorState } from '@/components/states/error-state';
import { Forbidden } from '@/components/states/forbidden';
import { PaymentMethodBadge } from '@/components/bills/payment-method-badge';
import { ColumnVisibility } from '@/components/bills/column-visibility';
import { useVendorsQuery } from '@/hooks/use-vendors-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCan } from '@/hooks/use-can';
import { useRoleHydrated, useRoleStore } from '@/stores/role-store';
import { formatDate } from '@/lib/format';
import type { ListEnvelope, Vendor } from '@/lib/api-types';

interface BillSummary {
  id: string;
  vendorId: string;
}

const STORAGE_COLUMNS_KEY = 'bill-pay.vendors.columns';
const DEFAULT_PAGE_SIZE = 25;

export function VendorsPage(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useRoleHydrated();
  const activeUserId = useRoleStore((state) => state.activeUser.id);
  const canCreate = useCan('vendor.create');
  const canUpdate = useCan('vendor.update');
  const [editorVendor, setEditorVendor] = useState<Vendor | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const openCreate = (): void => {
    setEditorVendor(undefined);
    setEditorOpen(true);
  };
  const openEdit = (vendor: Vendor): void => {
    setEditorVendor(vendor);
    setEditorOpen(true);
  };

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Number(params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );
  const urlQ = params.get('q') ?? '';

  const [localQ, setLocalQ] = useState(urlQ);
  useEffect(() => setLocalQ(urlQ), [urlQ]);
  const debouncedQ = useDebouncedValue(localQ, 300);

  const replaceParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') search.delete(key);
        else search.set(key, value);
      }
      const str = search.toString();
      router.replace(str ? `/vendors?${str}` : '/vendors', { scroll: false });
    },
    [params, router],
  );

  useEffect(() => {
    if (debouncedQ !== urlQ) {
      replaceParams({ q: debouncedQ, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const vendorsQuery = useVendorsQuery(
    { page, pageSize, q: urlQ || undefined, sort: 'name' },
    { enabled: hydrated },
  );

  // Cheap tally of bills per vendor: one extra call against the bills list
  // capped at the backend's max page size. The seed ships ~30-50 bills so
  // this comfortably fits in a single request and avoids an N+1 over the
  // visible vendors.
  const billCountsQuery = useQuery<ListEnvelope<BillSummary>, ApiError>({
    queryKey: ['vendors:bill-counts', activeUserId],
    queryFn: () => apiFetch<ListEnvelope<BillSummary>>('/bills?pageSize=100'),
    enabled: hydrated,
  });

  const billCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bill of billCountsQuery.data?.data ?? []) {
      counts.set(bill.vendorId, (counts.get(bill.vendorId) ?? 0) + 1);
    }
    return counts;
  }, [billCountsQuery.data]);

  const vendors = useMemo(() => vendorsQuery.data?.data ?? [], [vendorsQuery.data]);
  const meta = vendorsQuery.data?.meta;

  const [visibility, setVisibility] = useState<VisibilityState>(() => loadVisibility(STORAGE_COLUMNS_KEY));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(visibility));
    } catch {
      // localStorage unavailable; ignore.
    }
  }, [visibility]);

  const columns = useMemo<ColumnDef<Vendor>[]>(() => {
    const base: ColumnDef<Vendor>[] = [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.original.name}</span>
            {row.original.email ? (
              <span className="text-xs text-muted-foreground">{row.original.email}</span>
            ) : null}
          </div>
        ),
        meta: { label: 'Name' },
      },
      {
        id: 'method',
        header: 'Default method',
        cell: ({ row }) => {
          const method = row.original.defaultPaymentMethod;
          if (!method) return <span className="text-xs text-muted-foreground">—</span>;
          return <PaymentMethodBadge method={method} />;
        },
        meta: { label: 'Default method' },
      },
      {
        id: 'billCount',
        header: 'Bills',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {billCounts.get(row.original.id) ?? 0}
          </span>
        ),
        meta: { label: 'Bills' },
      },
      {
        id: 'createdAt',
        header: 'Created',
        cell: ({ row }) => <span className="text-sm">{formatDate(row.original.createdAt)}</span>,
        meta: { label: 'Created' },
      },
    ];
    if (canUpdate) {
      base.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`Actions for ${row.original.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openEdit(row.original)}>Edit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        meta: { label: 'Actions' },
      });
    }
    return base;
  }, [billCounts, canUpdate]);

  const table = useReactTable({
    data: vendors,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
    manualPagination: true,
  });

  const onPageChange = (next: number): void => {
    replaceParams({ page: next === 1 ? undefined : String(next) });
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Companies you owe. Bills reference a vendor and inherit the default payment method.
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" onClick={openCreate} aria-label="New vendor">
            <Plus className="size-4" />
            New vendor
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[260px] flex-1 flex-col gap-1">
            <label htmlFor="vendors-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="vendors-search"
                placeholder="Name or email"
                value={localQ}
                onChange={(event) => setLocalQ(event.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      <VendorsBody
        vendors={vendors}
        isPending={!hydrated || vendorsQuery.isPending}
        error={vendorsQuery.error}
        onRetry={() => void vendorsQuery.refetch()}
        table={table}
      />

      {meta && meta.total > 0 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * pageSize + 1}-{(page - 1) * pageSize + vendors.length} of {meta.total} vendor
            {meta.total === 1 ? '' : 's'}
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
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= meta.totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </footer>
      ) : null}

      <VendorFormDialog open={editorOpen} onOpenChange={setEditorOpen} vendor={editorVendor} />
    </div>
  );
}

interface VendorsBodyProps {
  vendors: Vendor[];
  isPending: boolean;
  error: ApiError | null;
  onRetry: () => void;
  table: ReturnType<typeof useReactTable<Vendor>>;
}

function VendorsBody({
  vendors,
  isPending,
  error,
  onRetry,
  table,
}: VendorsBodyProps): React.JSX.Element {
  if (error) {
    if (error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      return <Forbidden />;
    }
    return <ErrorState error={error} title="Could not load vendors" onRetry={onRetry} />;
  }
  if (isPending) {
    return <Loading rows={8} />;
  }
  if (vendors.length === 0) {
    return (
      <Empty
        title="No vendors yet"
        description="Vendor creation lands in the next workflow phase."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <ColumnVisibility table={table} />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function loadVisibility(key: string): VisibilityState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as VisibilityState;
  } catch {
    // Fall through; the table renders fine with default visibility.
  }
  return {};
}
