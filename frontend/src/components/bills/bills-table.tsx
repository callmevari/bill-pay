'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { BillStatusBadge } from './bill-status-badge';
import { PaymentStatusBadge } from './payment-status-badge';
import { ColumnVisibility } from './column-visibility';
import { Loading } from '@/components/states/loading';
import { Empty } from '@/components/states/empty';
import { ErrorState } from '@/components/states/error-state';
import { Forbidden } from '@/components/states/forbidden';
import { ApiError, ErrorCode } from '@/lib/api';
import type { Bill } from '@/lib/api-types';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

// Server-driven sort keys. The backend whitelists these in
// `docs/api-contract.md`; sending anything else 400s.
const SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  'invoiceNumber',
  'vendor',
  'amount',
  'dueDate',
  'status',
  'createdAt',
]);

export type BillSortValue =
  | 'createdAt'
  | '-createdAt'
  | 'updatedAt'
  | '-updatedAt'
  | 'amount'
  | '-amount'
  | 'status'
  | '-status'
  | 'dueDate'
  | '-dueDate'
  | 'invoiceDate'
  | '-invoiceDate'
  | 'invoiceNumber'
  | '-invoiceNumber'
  | 'vendor'
  | '-vendor';

interface BillsTableProps {
  bills: Bill[];
  isPending: boolean;
  isFetching: boolean;
  error: ApiError | null;
  onRetry: () => void;
  vendorById: Map<string, string>;
  sort: string;
  onSortChange: (sort: string) => void;
  pageSize: number;
  storageKey: string;
}

function parseSort(sort: string): SortingState {
  if (!sort) return [];
  const desc = sort.startsWith('-');
  const id = desc ? sort.slice(1) : sort;
  if (!SORTABLE_COLUMNS.has(id)) return [];
  return [{ id, desc }];
}

function serializeSort(state: SortingState): string {
  const first = state[0];
  if (!first) return '';
  if (!SORTABLE_COLUMNS.has(first.id)) return '';
  return `${first.desc ? '-' : ''}${first.id}`;
}

export function BillsTable({
  bills,
  isPending,
  isFetching,
  error,
  onRetry,
  vendorById,
  sort,
  onSortChange,
  pageSize,
  storageKey,
}: BillsTableProps): React.JSX.Element {
  const router = useRouter();

  // Column visibility persists per `storageKey` (one bucket per page) so
  // toggling on the bills index doesn't bleed into vendors and vice versa.
  const [visibility, setVisibility] = useState<VisibilityState>(() => loadVisibility(storageKey));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(visibility));
    } catch {
      // localStorage may be unavailable (Safari private mode); ignoring
      // is correct — the table still works, the preference just doesn't
      // survive the reload.
    }
  }, [visibility, storageKey]);

  const columns = useMemo<ColumnDef<Bill>[]>(
    () => [
      {
        id: 'invoiceNumber',
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground">{row.original.invoiceNumber}</span>
        ),
        enableSorting: true,
        meta: { label: 'Invoice' },
      },
      {
        id: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => (
          <span className="text-sm">{vendorById.get(row.original.vendorId) ?? '—'}</span>
        ),
        enableSorting: true,
        meta: { label: 'Vendor' },
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatMoney(row.original.amount, row.original.currency)}
          </span>
        ),
        enableSorting: true,
        meta: { label: 'Amount' },
      },
      {
        id: 'dueDate',
        accessorKey: 'dueDate',
        header: 'Due date',
        cell: ({ row }) => <span className="text-sm">{formatDate(row.original.dueDate)}</span>,
        enableSorting: true,
        meta: { label: 'Due date' },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <BillStatusBadge status={row.original.status} />,
        enableSorting: true,
        meta: { label: 'Status' },
      },
      {
        id: 'paymentStatus',
        header: 'Payment',
        cell: ({ row }) => {
          const payment = row.original.payment;
          if (!payment) return <span className="text-xs text-muted-foreground">—</span>;
          return <PaymentStatusBadge status={payment.status} />;
        },
        enableSorting: false,
        meta: { label: 'Payment' },
      },
    ],
    [vendorById],
  );

  const sorting = parseSort(sort);

  const table = useReactTable({
    data: bills,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortChange(serializeSort(next));
    },
    onColumnVisibilityChange: setVisibility,
  });

  if (error) {
    if (error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      return <Forbidden />;
    }
    return <ErrorState error={error} title="Could not load bills" onRetry={onRetry} />;
  }

  if (isPending) {
    return <Loading rows={pageSize} />;
  }

  if (bills.length === 0) {
    return (
      <Empty
        title="No bills match these filters"
        description="Try clearing a filter or switching tabs to see what's there."
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', isFetching && 'opacity-70 transition-opacity')}>
      <div className="flex items-center justify-end">
        <ColumnVisibility table={table} />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const ariaSort =
                    sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none';
                  return (
                    <TableHead key={header.id} aria-sort={canSort ? ariaSort : undefined}>
                      {canSort ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2 h-7 px-2"
                          onClick={() => header.column.toggleSorting()}
                        >
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          <SortIcon dir={sortDir === false ? null : sortDir} />
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                role="link"
                tabIndex={0}
                aria-label={`Open bill ${row.original.invoiceNumber}`}
                onClick={() => router.push(`/bills/${row.original.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    router.push(`/bills/${row.original.id}`);
                  }
                }}
                className="cursor-pointer focus-visible:outline-none focus-visible:bg-muted/40"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }): React.JSX.Element {
  if (dir === 'asc') return <ArrowUp className="size-3" />;
  if (dir === 'desc') return <ArrowDown className="size-3" />;
  return <ArrowUpDown className="size-3 opacity-50" />;
}

function loadVisibility(key: string): VisibilityState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as VisibilityState;
    }
  } catch {
    // Treat unreadable storage as an empty preference; resetting beats
    // crashing the table.
  }
  return {};
}
