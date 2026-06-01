Re: [callmevari/bill-pay] feat(backend): add bulk actions, activity reads, CSV export, and seed FAILED/CANCELED payments (PR #7)

@Copilot commented on this pull request.

Pull request overview
This PR completes Phase 7 backend roadmap work by adding bulk-action endpoints for bills/payments with per-item partial-failure envelopes, read endpoints for the polymorphic activity log, and a bills CSV export that reuses the same filters/sort semantics as GET /bills. It also adds supporting documentation, tests, Bruno requests, and a production-oriented backend Dockerfile.

Changes:

Added bulk controllers/services/DTOs plus a shared runBulk helper and response DTOs for consistent per-item error envelopes.
Added activity read endpoints (/bills/:id/activity, /payments/:id/activity) backed by a shared ActivityService with pagination and actor name joining.
Added bills CSV export (/exports/bills.csv) plus supporting service/module, docs, e2e/unit tests, and dependency updates.
Reviewed changes
Copilot reviewed 44 out of 45 changed files in this pull request and generated 12 comments.

Show a summary per file
File	Description
pnpm-lock.yaml	Adds csv-stringify / csv-parse lock entries used by export/tests.
docs/backend.md	Documents Phase 7 testing patterns and design rationale for bulk/activity/export.
docs/api-contract.md	Extends contract to include new bulk, activity, and export endpoints/shapes.
backend/test/payments-bulk.e2e-spec.ts	E2E coverage for payments bulk actions (success, partial failure, role gates).
backend/test/exports.e2e-spec.ts	E2E coverage for CSV export headers/content and query validation parity.
backend/test/bills-bulk.e2e-spec.ts	E2E coverage for bills bulk actions including persistence and activity rows.
backend/test/activity.e2e-spec.ts	E2E coverage for bill/payment activity feeds, ordering, pagination, and 404s.
backend/src/payments/payments.module.ts	Wires in bulk controller/service and ActivityModule.
backend/src/payments/payments.controller.ts	Adds GET /payments/:id/activity.
backend/src/payments/payments-bulk.service.ts	Implements bulk payment actions via runBulk + single-item service methods.
backend/src/payments/payments-bulk.controller.ts	Exposes /payments/bulk/* endpoints with role gates and response DTOs.
backend/src/payments/dto/bulk-payments.dto.ts	Adds bulk ids DTO and bulk response DTO typing for payments.
backend/src/exports/exports.service.ts	Builds bills CSV output from filtered bill rows.
backend/src/exports/exports.service.spec.ts	Unit tests for CSV header/order/escaping and filename formatting.
backend/src/exports/exports.module.ts	Adds Exports module wiring.
backend/src/exports/exports.controller.ts	Adds GET /exports/bills.csv endpoint and sets CSV headers.
backend/src/common/dto/bulk-result.dto.ts	Adds shared bulk result/summary DTOs and summary builder.
backend/src/common/dto/activity-log-response.dto.ts	Adds shared activity log response DTO shape (with actorName).
backend/src/common/bulk/bulk-runner.ts	Adds runBulk helper and exception-to-envelope translation.
backend/src/common/bulk/bulk-runner.spec.ts	Unit tests for bulk runner behavior and error translation.
backend/src/bills/dto/bulk-bills.dto.ts	Adds bulk bills DTOs (ids + bulk edit fields).
backend/src/bills/bills.service.ts	Adds findAllForExport for CSV export (unpaginated filtered list).
backend/src/bills/bills.module.ts	Wires in bulk controller/service, ActivityModule, and exports BillsService.
backend/src/bills/bills.controller.ts	Adds GET /bills/:id/activity.
backend/src/bills/bills-bulk.service.ts	Implements bulk bill actions via runBulk + single-item service methods.
backend/src/bills/bills-bulk.controller.ts	Exposes /bills/bulk/* endpoints with role gates and response DTOs.
backend/src/app.module.ts	Registers new ActivityModule and ExportsModule at app level.
backend/src/activity/dto/paginated-activity-response.dto.ts	Adds paginated activity response DTO.
backend/src/activity/dto/activity-query.dto.ts	Adds pagination-only query DTO for activity feeds.
backend/src/activity/activity.service.ts	Implements activity reads for bills/payments with pagination + actor join.
backend/src/activity/activity.module.ts	Provides/exports ActivityService for injection by other modules.
backend/src/activity/activity.mapper.ts	Maps Prisma activity rows (with actor) into response DTOs.
backend/README.md	Adds backend-specific setup, scripts, auth model, testing, Bruno, and prod image docs.
backend/package.json	Adds csv-stringify dependency and csv-parse devDependency.
backend/Dockerfile	Adds multi-stage Docker build and runtime prisma migrate deploy entrypoint.
backend/bruno/payments/bulk/release.bru	Bruno request for payments bulk release.
backend/bruno/payments/bulk/mark-as-paid.bru	Bruno request for payments bulk mark-as-paid.
backend/bruno/payments/bulk/cancel.bru	Bruno request for payments bulk cancel.
backend/bruno/payments/activity/list-payment-activity.bru	Bruno request for payment activity feed.
backend/bruno/exports/export-bills-csv.bru	Bruno request for bills CSV export.
backend/bruno/bills/bulk/edit.bru	Bruno request for bills bulk edit.
backend/bruno/bills/bulk/archive.bru	Bruno request for bills bulk archive.
backend/bruno/bills/bulk/approve.bru	Bruno request for bills bulk approve.
backend/bruno/bills/activity/list-bill-activity.bru	Bruno request for bill activity feed.
backend/.dockerignore	Adds backend docker ignore patterns.
Files not reviewed (1)
pnpm-lock.yaml: Language not supported
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/src/exports/exports.service.ts:

> +  async billsCsv(query: BillListQueryDto): Promise<string> {
+    const rows = await this.bills.findAllForExport(query);
+
+    const records = rows.map((row) => ({
+      id: row.id,
+      vendor: row.vendor.name,
+      status: row.status,
+      amount: row.amount.toFixed(2),
+      dueDate: row.dueDate.toISOString(),
+      paymentMethod: row.payment?.method ?? '',
+      invoiceNumber: row.invoiceNumber,
+      memo: row.description ?? '',
+      paymentStatus: row.payment?.status ?? '',
+      paymentScheduledFor: row.payment?.scheduledFor
+        ? row.payment.scheduledFor.toISOString()
+        : '',
+      paymentPaidAt: row.payment?.paidAt
+        ? row.payment.paidAt.toISOString()
+        : '',
+      createdAt: row.createdAt.toISOString(),
+    }));
+
+    return stringify(records, {
+      header: true,
+      columns: BILLS_CSV_COLUMNS.map((c) => ({ key: c, header: c })),
+    });
+  }
CSV export currently writes user-controlled string fields (e.g. vendor name, invoice number, description) directly into CSV cells. This enables spreadsheet/CSV formula injection (cells beginning with =, +, -, or @) when the file is opened in Excel/Sheets. Sanitize these cells (commonly by prefixing a leading apostrophe) before stringifying, as described in the PR summary.

In backend/src/exports/exports.service.spec.ts:

> +  it('emits the documented column header in the documented order on the first line', async () => {
+    bills.findAllForExport.mockResolvedValue([]);
+    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
+    const header = csv.split('\n')[0];
+    expect(header).toBe(
+      'id,vendor,status,amount,dueDate,paymentMethod,invoiceNumber,memo,paymentStatus,paymentScheduledFor,paymentPaidAt,createdAt',
+    );
+  });
There is no test coverage asserting CSV formula-injection sanitization (cells starting with =, +, -, @). Since the export is explicitly intended to protect against this class of issues, add a unit test that proves the leading-apostrophe prefix is applied.

In backend/src/common/bulk/bulk-runner.ts:

> +export function toBulkItemError(exception: unknown): BulkItemErrorDto {
+  if (exception instanceof HttpException) {
+    const response = exception.getResponse();
+    if (typeof response === 'string') {
+      return {
+        code: ErrorCode.INTERNAL_ERROR,
+        message: response,
+      };
+    }
+    const obj = response as {
+      code?: unknown;
+      message?: unknown;
+      details?: unknown;
+    };
+    const code =
+      typeof obj.code === 'string' ? obj.code : ErrorCode.INTERNAL_ERROR;
+    const message =
+      typeof obj.message === 'string' ? obj.message : exception.message;
+    const error: BulkItemErrorDto = { code, message };
+    if (obj.details !== undefined) {
+      error.details = obj.details;
+    }
+    return error;
+  }
+
+  return {
+    code: ErrorCode.INTERNAL_ERROR,
+    message:
+      exception instanceof Error
+        ? exception.message
+        : 'An unexpected error occurred.',
+  };
+}
toBulkItemError currently defaults code to INTERNAL_ERROR whenever an HttpException response doesn't explicitly include a code field (including standard BadRequestException('...')). This diverges from GlobalExceptionFilter, which maps status codes (400→VALIDATION_ERROR, 401→UNAUTHENTICATED, etc.). Bulk per-item errors should use the same default mapping so clients can reliably branch on error codes.

In backend/src/common/bulk/bulk-runner.spec.ts:

> +  it('passes through the structured envelope from an HttpException without an explicit code', () => {
+    const exception = new BadRequestException(
+      'amount must be a positive decimal',
+    );
+    const error = toBulkItemError(exception);
+    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
+    expect(error.message).toBe('amount must be a positive decimal');
+  });
This test asserts BadRequestException('...') maps to INTERNAL_ERROR, but the global exception filter maps 400s to VALIDATION_ERROR. After aligning toBulkItemError with the global filter, this expectation should be updated accordingly.

In docs/api-contract.md:

> +#### `POST /bills/bulk/edit` — Admin only
+
+Body: `{ ids: string[], fields: { dueDate?: ISO-8601, memo?: string | null } }`. `fields` must contain at least one of `dueDate` / `memo`; an empty object → `400 VALIDATION_ERROR`. `memo` maps to `Bill.description` (we surface the spec wording on the wire). `paymentMethod` is intentionally not bulk-editable — it lives on the linked `Payment`, not on the Bill. Terminal bills (`PAID`, `REJECTED`, `ARCHIVED`) fail per-item with `BILL_NOT_EDITABLE`.
+
PR description says the bulk-edit body + CSV surface were unified on description, but this contract still documents memo (and later says it maps to Bill.description). Please align the contract (and any affected DTOs/CSV headers) with the intended external field name so consumers don't have to support both.

In backend/Dockerfile:

> +# Multi-stage build for the Bill Pay API. The deps stage installs the
+# full workspace lockfile (Prisma needs to generate its client against
+# the schema before the source compiles), the build stage runs
+# `prisma generate` and `nest build`, and the runner stage ships only
+# `dist`, `prisma/`, the production node_modules, and the entrypoint.
+#
The Dockerfile comment says the runner stage ships only production node_modules, but the build copies backend/node_modules from an install that includes devDependencies (no --prod/prune step). This increases image size and attack surface; consider pruning to production deps in the runner stage (and, if needed, moving Prisma CLI to dependencies to keep prisma migrate deploy available).

In backend/src/exports/exports.service.ts:

> +  async billsCsv(query: BillListQueryDto): Promise<string> {
+    const rows = await this.bills.findAllForExport(query);
+
+    const records = rows.map((row) => ({
+      id: row.id,
+      vendor: row.vendor.name,
+      status: row.status,
+      amount: row.amount.toFixed(2),
+      dueDate: row.dueDate.toISOString(),
+      paymentMethod: row.payment?.method ?? '',
+      invoiceNumber: row.invoiceNumber,
+      memo: row.description ?? '',
+      paymentStatus: row.payment?.status ?? '',
+      paymentScheduledFor: row.payment?.scheduledFor
+        ? row.payment.scheduledFor.toISOString()
+        : '',
+      paymentPaidAt: row.payment?.paidAt
+        ? row.payment.paidAt.toISOString()
+        : '',
+      createdAt: row.createdAt.toISOString(),
+    }));
+
+    return stringify(records, {
+      header: true,
+      columns: BILLS_CSV_COLUMNS.map((c) => ({ key: c, header: c })),
+    });
+  }
CSV export currently writes user-controlled string fields (e.g. vendor name, invoice number, description) directly into CSV cells. This enables spreadsheet/CSV formula injection (cells beginning with =, +, -, or @) when the file is opened in Excel/Sheets. Sanitize these cells (commonly by prefixing a leading apostrophe) before stringifying, as described in the PR summary.

In backend/src/exports/exports.service.spec.ts:

> +  it('emits the documented column header in the documented order on the first line', async () => {
+    bills.findAllForExport.mockResolvedValue([]);
+    const csv = await service.billsCsv({ page: 1, pageSize: 25 });
+    const header = csv.split('\n')[0];
+    expect(header).toBe(
+      'id,vendor,status,amount,dueDate,paymentMethod,invoiceNumber,memo,paymentStatus,paymentScheduledFor,paymentPaidAt,createdAt',
+    );
+  });
There is no test coverage asserting CSV formula-injection sanitization (cells starting with =, +, -, @). Since the export is explicitly intended to protect against this class of issues, add a unit test that proves the leading-apostrophe prefix is applied.

In backend/src/common/bulk/bulk-runner.ts:

> +export function toBulkItemError(exception: unknown): BulkItemErrorDto {
+  if (exception instanceof HttpException) {
+    const response = exception.getResponse();
+    if (typeof response === 'string') {
+      return {
+        code: ErrorCode.INTERNAL_ERROR,
+        message: response,
+      };
+    }
+    const obj = response as {
+      code?: unknown;
+      message?: unknown;
+      details?: unknown;
+    };
+    const code =
+      typeof obj.code === 'string' ? obj.code : ErrorCode.INTERNAL_ERROR;
+    const message =
+      typeof obj.message === 'string' ? obj.message : exception.message;
+    const error: BulkItemErrorDto = { code, message };
+    if (obj.details !== undefined) {
+      error.details = obj.details;
+    }
+    return error;
+  }
+
+  return {
+    code: ErrorCode.INTERNAL_ERROR,
+    message:
+      exception instanceof Error
+        ? exception.message
+        : 'An unexpected error occurred.',
+  };
+}
toBulkItemError currently defaults code to INTERNAL_ERROR whenever an HttpException response doesn't explicitly include a code field (including standard BadRequestException('...')). This diverges from GlobalExceptionFilter, which maps status codes (400→VALIDATION_ERROR, 401→UNAUTHENTICATED, etc.). Bulk per-item errors should use the same default mapping so clients can reliably branch on error codes.

In backend/src/common/bulk/bulk-runner.spec.ts:

> +  it('passes through the structured envelope from an HttpException without an explicit code', () => {
+    const exception = new BadRequestException(
+      'amount must be a positive decimal',
+    );
+    const error = toBulkItemError(exception);
+    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
+    expect(error.message).toBe('amount must be a positive decimal');
+  });
This test asserts BadRequestException('...') maps to INTERNAL_ERROR, but the global exception filter maps 400s to VALIDATION_ERROR. After aligning toBulkItemError with the global filter, this expectation should be updated accordingly.

In docs/api-contract.md:

> +#### `POST /bills/bulk/edit` — Admin only
+
+Body: `{ ids: string[], fields: { dueDate?: ISO-8601, memo?: string | null } }`. `fields` must contain at least one of `dueDate` / `memo`; an empty object → `400 VALIDATION_ERROR`. `memo` maps to `Bill.description` (we surface the spec wording on the wire). `paymentMethod` is intentionally not bulk-editable — it lives on the linked `Payment`, not on the Bill. Terminal bills (`PAID`, `REJECTED`, `ARCHIVED`) fail per-item with `BILL_NOT_EDITABLE`.
+
PR description says the bulk-edit body + CSV surface were unified on description, but this contract still documents memo (and later says it maps to Bill.description). Please align the contract (and any affected DTOs/CSV headers) with the intended external field name so consumers don't have to support both.

In backend/Dockerfile:

> +# Multi-stage build for the Bill Pay API. The deps stage installs the
+# full workspace lockfile (Prisma needs to generate its client against
+# the schema before the source compiles), the build stage runs
+# `prisma generate` and `nest build`, and the runner stage ships only
+# `dist`, `prisma/`, the production node_modules, and the entrypoint.
+#
The Dockerfile comment says the runner stage ships only production node_modules, but the build copies backend/node_modules from an install that includes devDependencies (no --prod/prune step). This increases image size and attack surface; consider pruning to production deps in the runner stage (and, if needed, moving Prisma CLI to dependencies to keep prisma migrate deploy available).