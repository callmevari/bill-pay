'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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
import { PaymentRowMenu } from './payment-row-menu';
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
  // Trailing actions column for the For Payment / History tabs only; off
  // by default so the Drafts and For Approval tabs stay compact.
  showPaymentActions?: boolean;
  // Selection ownership lives on the parent page so the bulk toolbar can
  // read and act on it without lifting state out of the table later. The
  // table is purely the renderer of the checkboxes. `null` selectionState
  // hides the selection column entirely (e.g. on tabs where bulk actions
  // are not offered, like History).
  selectionState?: RowSelectionState;
  onSelectionStateChange?: (next: RowSelectionState) => void;
  // Toolbar slot — rendered above the table, between the column-visibility
  // row and the rendered grid. The parent owns the toolbar so it can read
  // the selection state and dispatch bulk actions; the table just hosts it
  // in the consistent visual slot.
  toolbarSlot?: React.ReactNode;
  // Optional content rendered on the toolbar row at the same height as
  // the column-visibility menu (e.g. the CSV export menu). Sits to the
  // left of `ColumnVisibility` so the menus group together visually.
  toolbarLeading?: React.ReactNode;
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
  showPaymentActions = false,
  selectionState,
  onSelectionStateChange,
  toolbarSlot,
  toolbarLeading,
}: BillsTableProps): React.JSX.Element {
  const selectionEnabled = selectionState !== undefined && onSelectionStateChange !== undefined;
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

  const columns = useMemo<ColumnDef<Bill>[]>(() => {
    const base: ColumnDef<Bill>[] = [];
    if (selectionEnabled) {
      base.push({
        id: 'select',
        // Leading checkbox column. The header toggles every row on the
        // current page (selection lives at the page level, not the global
        // result set — selecting "all" across pages would surprise users
        // and the underlying bulk endpoints cap at 100 ids).
        header: ({ table }) => {
          const allSelected = table.getIsAllPageRowsSelected();
          const some = table.getIsSomePageRowsSelected();
          return (
            <Checkbox
              aria-label="Select all on this page"
              checked={allSelected ? true : some ? 'indeterminate' : false}
              onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
            />
          );
        },
        cell: ({ row }) => (
          // Stop propagation so clicking the checkbox does NOT navigate
          // to the bill detail. The row click handler reads the same
          // event and would otherwise win the race.
          <div onClick={(event) => event.stopPropagation()}>
            <Checkbox
              aria-label={`Select bill ${row.original.invoiceNumber}`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(checked)}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { label: 'Select' },
      });
    }
    base.push(
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
    );
    if (showPaymentActions) {
      base.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const payment = row.original.payment;
          if (!payment) return null;
          // `PaymentRowMenu` already stops propagation on its trigger
          // and content (so clicks on the actual dropdown surface don't
          // open the detail page). Clicks on the surrounding cell
          // padding intentionally fall through to the row handler and
          // open the detail — same as clicking any other cell.
          return (
            <div className="flex justify-end">
              <PaymentRowMenu payment={payment} />
            </div>
          );
        },
        enableSorting: false,
        meta: { label: 'Actions' },
      });
    }
    return base;
  }, [vendorById, showPaymentActions, selectionEnabled]);

  const sorting = parseSort(sort);
  // Keep an inline empty selection map when the parent doesn't drive
  // selection — TanStack Table requires the controlled state object even
  // when row selection is unused.
  const rowSelection = selectionState ?? {};

  const table = useReactTable({
    data: bills,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    // Use each row's bill id as the row id so the controlled
    // `rowSelection` map keys directly to the documented `Bill.id`
    // values — that way the parent can pass `Object.keys(selection)`
    // straight to the bulk endpoints without a row-index translation.
    getRowId: (row) => row.id,
    enableRowSelection: selectionEnabled,
    state: { sorting, columnVisibility: visibility, rowSelection },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortChange(serializeSort(next));
    },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: (updater) => {
      if (!onSelectionStateChange) return;
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectionStateChange(next);
    },
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
      <div className="flex items-center justify-end gap-2">
        {toolbarLeading}
        <ColumnVisibility table={table} />
      </div>
      {toolbarSlot}
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
