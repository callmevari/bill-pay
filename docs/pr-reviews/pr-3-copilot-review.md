Re: [callmevari/bill-pay] feat(bills): add CRUD with line items, filters, sorts, and activity log (PR #3)

@Copilot commented on this pull request.

Pull request overview
Adds the first Bills API surface, including bill CRUD, line-item sub-resources, filtering/sorting, activity logging, and API/manual-test documentation.

Changes:

Adds BillsModule with controller, service, mapper, DTOs, and service tests.
Adds bill list filters/sorts, Admin-only mutations, terminal-status edit guard, and transactional activity logs.
Documents the Bills API and adds Bruno requests for manual coverage.
Reviewed changes
Copilot reviewed 25 out of 25 changed files in this pull request and generated 5 comments.

Show a summary per file
File	Description
backend/src/app.module.ts	Registers BillsModule.
backend/src/common/errors/error-codes.ts	Adds Bills-specific error codes.
backend/src/bills/bills.module.ts	Defines the Bills feature module.
backend/src/bills/bills.controller.ts	Exposes bill and line-item HTTP endpoints.
backend/src/bills/bills.service.ts	Implements list/read/write logic, guards, totals, and activity logs.
backend/src/bills/bills.mapper.ts	Maps Prisma bill records to response DTOs.
backend/src/bills/bills.service.spec.ts	Adds Bills service unit tests.
backend/src/bills/dto/*.ts	Adds request/response DTOs for bills and line items.
backend/bruno/bills/*.bru	Adds manual API requests for Bills workflows.
docs/api-contract.md	Documents Bills endpoints and permissions.
CLAUDE.md	Adds reviewer-pass expectations to quality guidance.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/src/bills/dto/create-bill.dto.ts:

> +  @IsString()
+  @MinLength(1)
+  vendorId: string;
+
+  @ApiPropertyOptional()
+  @IsOptional()
+  @IsString()
+  @MaxLength(2000)
+  description?: string;
+
+  @ApiProperty({
+    example: '12480.55',
+    description: 'Money as decimal string, up to 2 decimal digits.',
+  })
+  @IsString()
+  @IsDecimal({ decimal_digits: '0,2' })
@IsDecimal({ decimal_digits: '0,2' }) does not limit the number of integer digits, but Bill.amount is stored as Decimal(12,2). A value like 1234567890123.00 can pass request validation and then fail at the database layer instead of returning a validation error.

In backend/src/bills/dto/create-bill-line-item.dto.ts:

> +  @IsDecimal({ decimal_digits: '0,2' })
+  quantity: string;
+
+  @ApiProperty({
+    example: '8200.00',
+    description: 'Decimal string, up to 2 decimal digits.',
+  })
+  @IsString()
+  @IsDecimal({ decimal_digits: '0,2' })
These decimal validators allow arbitrarily large values even though quantity, unitPrice, and the computed total are persisted as Decimal(12,2). Validating only the decimal scale means oversized inputs can pass validation and surface as database errors when the line item is created.

In backend/src/bills/dto/update-bill.dto.ts:

> +// Omits `vendorId` and `invoiceNumber` (immutable post-create) and
+// `lineItems` (has its own sub-resource). Each remaining non-null field
+// uses `@ValidateIf(v !== undefined)` so `null` is rejected before it
+// reaches Prisma; nullable fields use `@IsOptional` (null is a valid
+// "clear the field" intent).
+export class UpdateBillDto {
+  @ApiPropertyOptional({ nullable: true })
+  @IsOptional()
+  @IsString()
+  @MaxLength(2000)
+  description?: string | null;
+
+  @ApiPropertyOptional({ example: '12480.55' })
+  @ValidateIf((_, value) => value !== undefined)
+  @IsString()
+  @IsDecimal({ decimal_digits: '0,2' })
The update path has the same unbounded decimal validation as create: values with more precision than the Decimal(12,2) column accepts can pass DTO validation and fail later as persistence errors rather than 400 VALIDATION_ERROR.

In backend/src/bills/dto/update-bill-line-item.dto.ts:

> +  @IsDecimal({ decimal_digits: '0,2' })
+  quantity?: string;
+
+  @ApiPropertyOptional({ example: '4000.00' })
+  @ValidateIf((_, value) => value !== undefined)
+  @IsString()
+  @IsDecimal({ decimal_digits: '0,2' })
The line-item update DTO also accepts decimal strings with unlimited integer digits, so an otherwise validated PATCH can overflow the Decimal(12,2) columns or computed total during persistence.

In docs/api-contract.md:

> +## Bills
+
+Invoices owed to a vendor. Created in `DRAFT` (lifecycle transitions land in a later module). Each bill has zero or more `BillLineItem` rows; the line-item `total` is stored and the service enforces `total = quantity * unitPrice` on every write. `Bill.amount` is the invoice total the user provides; it is not constrained to equal the sum of line items (real invoices include taxes, discounts, and bill-level adjustments).
+
+`BillStatus` ∈ `DRAFT | PENDING_APPROVAL | APPROVED | SCHEDULED | PAID | REJECTED | ARCHIVED`.
+
+### `GET /bills`
+
+Paginated list with filters and sorts.
+
+**Query**:
+
+- `page`, `pageSize` (shared pagination defaults).
+- `status` — comma-separated `BillStatus` values (e.g. `APPROVED,SCHEDULED`). Unknown values → `400 VALIDATION_ERROR`.
+- `vendorId` — CUID v2.
+- `minAmount`, `maxAmount` — decimal strings (`"0,2"` digits).
The phrase "0,2" digits exposes the validator option syntax rather than explaining the accepted API format, which makes this parameter description unclear for API consumers.