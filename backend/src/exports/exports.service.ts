import { Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';

import { BillsService } from '../bills/bills.service';
import { BillListQueryDto } from '../bills/dto/bill-list-query.dto';

// Columns in stable order. Empty cells render as the empty string
// (csv-stringify default). The vendor column carries the human-readable
// vendor name; the id column carries the bill cuid so reviewers can
// cross-reference back into the app.
const BILLS_CSV_COLUMNS = [
  'id',
  'vendor',
  'status',
  'amount',
  'dueDate',
  'paymentMethod',
  'invoiceNumber',
  'description',
  'paymentStatus',
  'paymentScheduledFor',
  'paymentPaidAt',
  'createdAt',
] as const;

// Prefix any cell whose first char would be interpreted by a spreadsheet
// (Excel / Sheets / LibreOffice) as a formula. RFC 4180 doesn't address
// this — the value is quoted correctly but still evaluated on open. The
// leading apostrophe is the documented spreadsheet escape and is
// stripped on display.
const FORMULA_INJECTION_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function sanitizeCsvCell(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_INJECTION_CHARS.has(value[0]) ? `'${value}` : value;
}

@Injectable()
export class ExportsService {
  constructor(private readonly bills: BillsService) {}

  // Builds the full CSV body as a string. The list is bounded in
  // practice (bills are at most low thousands), so building it in
  // memory keeps the controller simple — no streaming setup, easy to
  // test by string-comparing the response body. If the table ever
  // grows past in-memory, swap this for the `csv-stringify` streaming
  // API; the column projection stays the same.
  async billsCsv(query: BillListQueryDto): Promise<string> {
    const rows = await this.bills.findAllForExport(query);

    const records = rows.map((row) => ({
      id: row.id,
      vendor: sanitizeCsvCell(row.vendor.name),
      status: row.status,
      amount: row.amount.toFixed(2),
      dueDate: row.dueDate.toISOString(),
      paymentMethod: row.payment?.method ?? '',
      invoiceNumber: sanitizeCsvCell(row.invoiceNumber),
      description: sanitizeCsvCell(row.description ?? ''),
      paymentStatus: row.payment?.status ?? '',
      paymentScheduledFor: row.payment?.scheduledFor
        ? row.payment.scheduledFor.toISOString()
        : '',
      paymentPaidAt: row.payment?.paidAt
        ? row.payment.paidAt.toISOString()
        : '',
      createdAt: row.createdAt.toISOString(),
    }));

    return stringify(records, {
      header: true,
      columns: BILLS_CSV_COLUMNS.map((c) => ({ key: c, header: c })),
    });
  }

  // Filename uses the actor's *server-side* now in UTC (YYYY-MM-DD),
  // not the request timezone — predictable for re-runs and tests, and
  // matches how the activity log timestamps the export action.
  filenameForToday(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `bills-${yyyy}-${mm}-${dd}.csv`;
  }
}
