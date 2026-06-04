Re: [callmevari/bill-pay] feat(backend): MVP milestone — vendors, bills, payments, bulk, activity, exports (PR #8)

@Copilot commented on this pull request.

Pull request overview
Promotes the backend MVP milestone to main, consolidating the feature-complete NestJS/Prisma API (vendors, bills, approvals, payments), including bulk operations, activity reads, CSV export, and the supporting test harness + docs needed to run/deploy it standalone.

Changes:

Adds/updates backend modules for vendors/bills/payments plus shared DTOs, error handling, bulk runner, activity reads, and CSV export.
Establishes a two-layer test strategy (unit + isolated-schema e2e) with Jest setup helpers and extensive e2e coverage for key contract behaviors.
Adds operational/docs updates (Dockerfile, backend README, cadence/testing documentation, and archived external review drop-zone).
Reviewed changes
Copilot reviewed 130 out of 140 changed files in this pull request and generated 1 comment.

Show a summary per file
File	Description
README.md	Documents the repo-level unit/e2e testing approach and prerequisites.
pnpm-lock.yaml	Locks new dependencies needed for CSV + test env loading.
docs/backend.md	Expands backend decisions/testing strategy and Phase 7 rationale.
docs/backend-pr-reviews/README.md	Adds a structured drop zone for external PR review exports.
docs/backend-pr-reviews/pr-6-copilot-review.md	Archives prior Copilot review output for PR #6.
docs/backend-pr-reviews/pr-5-copilot-review.md	Archives prior Copilot review output for PR #5.
docs/backend-pr-reviews/pr-4-copilot-review.md	Archives prior Copilot review output for PR #4.
docs/backend-pr-reviews/pr-3-copilot-review.md	Archives prior Copilot review output for PR #3.
docs/backend-pr-reviews/pr-2-copilot-review.md	Archives prior Copilot review output for PR #2.
docs/backend-pr-reviews/pr-1-copilot-review.md	Archives prior Copilot review output for PR #1.
CLAUDE.md	Codifies testing contract and develop→main milestone cadence.
backend/tsconfig.json	Adjusts TS strictness to accommodate DTO classes populated by mappers.
backend/test/vendors.e2e-spec.ts	Adds vendor e2e coverage for persistence, guards, and role gating.
backend/test/setup-env.ts	Forces .env.test loading per Jest worker for e2e isolation.
backend/test/payments-bulk.e2e-spec.ts	Adds e2e coverage for payments bulk endpoints + partial failure behavior.
backend/test/jest-e2e.json	Wires e2e global setup/env setup and serializes workers.
backend/test/helpers/db.ts	Adds shared reset/seed helpers for deterministic e2e tests.
backend/test/helpers/app.ts	Centralizes Nest app bootstrap for e2e to match main.ts wiring.
backend/test/global-setup.ts	Applies migrations to the isolated e2e schema before tests run.
backend/test/exports.e2e-spec.ts	Adds e2e coverage for bills CSV export headers/content/escaping/filters.
backend/test/bills.e2e-spec.ts	Adds bills e2e coverage for persistence, list filters/sorts, FK translation, guards.
backend/test/app.e2e-spec.ts	Refactors health e2e test to use shared app bootstrap.
backend/test/activity.e2e-spec.ts	Adds e2e coverage for activity feeds (bill+payment aggregation and pagination).
backend/src/vendors/vendors.service.ts	Implements vendor CRUD, list query parsing, and delete guard/translation.
backend/src/vendors/vendors.service.spec.ts	Unit tests vendor delete-guard branching.
backend/src/vendors/vendors.module.ts	Registers Vendors module.
backend/src/vendors/vendors.mapper.ts	Maps Vendor rows to API DTO shape.
backend/src/vendors/vendors.controller.ts	Exposes vendor endpoints with role gating and Swagger metadata.
backend/src/vendors/dto/vendor-response.dto.ts	Defines vendor response DTO for Swagger/serialization.
backend/src/vendors/dto/vendor-list-query.dto.ts	Defines vendor list query DTO (pagination/search/sort).
backend/src/vendors/dto/update-vendor.dto.ts	Defines update DTO with null-rejection semantics for required fields.
backend/src/vendors/dto/paginated-vendors-response.dto.ts	Defines {data, meta} wrapper DTO for vendor lists.
backend/src/vendors/dto/create-vendor.dto.ts	Defines create DTO validation rules for vendor inputs.
backend/src/payments/payments.service.spec.ts	Unit coverage for payment lifecycle transition guards.
backend/src/payments/payments.module.ts	Registers payments + payments bulk controllers/services.
backend/src/payments/payments.mapper.ts	Maps Payment rows to API DTO shape.
backend/src/payments/payments.controller.ts	Exposes payment list/read, lifecycle actions, and payment activity endpoint.
backend/src/payments/payments-bulk.service.ts	Implements bulk operations by reusing single-item lifecycle methods.
backend/src/payments/payments-bulk.controller.ts	Exposes payments bulk endpoints under a non-colliding route prefix.
backend/src/payments/dto/schedule-payment.dto.ts	Validates schedule payload timestamp.
backend/src/payments/dto/payment-response.dto.ts	Defines payment response DTO for Swagger/serialization.
backend/src/payments/dto/payment-list-query.dto.ts	Defines payment list filters/sorts and validation.
backend/src/payments/dto/paginated-payments-response.dto.ts	Defines {data, meta} wrapper DTO for payment lists.
backend/src/payments/dto/bulk-payments.dto.ts	Defines bulk payment ids input + bulk response DTO types.
backend/src/exports/exports.service.ts	Builds bills CSV with proper escaping + formula-injection sanitization.
backend/src/exports/exports.service.spec.ts	Unit tests CSV header order, quoting, and sanitization behavior.
backend/src/exports/exports.module.ts	Registers exports module.
backend/src/exports/exports.controller.ts	Exposes /exports/bills.csv with correct headers and error behavior.
backend/src/common/filters/global-exception.filter.ts	Centralizes JSON error envelope behavior and Prisma error mapping.
backend/src/common/errors/error-codes.ts	Adds domain error codes and default status→code mapping helper.
backend/src/common/dto/pagination-query.dto.ts	Adds shared pagination query DTO and validation.
backend/src/common/dto/pagination-meta.dto.ts	Adds shared pagination meta DTO + builder.
backend/src/common/dto/decimal-string.ts	Adds shared Decimal(12,2)-bounded decimal-string validator.
backend/src/common/dto/currency.ts	Adds shared ISO-4217-ish currency code validator.
backend/src/common/dto/bulk-result.dto.ts	Defines standard bulk per-item result/error envelope DTOs.
backend/src/common/dto/activity-log-response.dto.ts	Defines activity log response DTO shape (incl. actorName join).
backend/src/common/bulk/bulk-runner.ts	Implements shared bulk runner + exception-to-envelope translation.
backend/src/common/bulk/bulk-runner.spec.ts	Unit tests bulk runner behavior and error translation.
backend/src/bills/dto/update-bill.dto.ts	Defines bill patch DTO with null/undefined boundary rules.
backend/src/bills/dto/update-bill-line-item.dto.ts	Defines line-item patch DTO with null-rejection semantics.
backend/src/bills/dto/reject-bill.dto.ts	Defines reject payload DTO with optional notes semantics.
backend/src/bills/dto/paginated-bills-response.dto.ts	Defines {data, meta} wrapper DTO for bills list.
backend/src/bills/dto/create-bill.dto.ts	Defines bill creation DTO validation (money, currency, timestamps, line items).
backend/src/bills/dto/create-bill-line-item.dto.ts	Defines line item creation DTO validation.
backend/src/bills/dto/bulk-bills.dto.ts	Defines bill bulk ids and bulk edit payload DTOs.
backend/src/bills/dto/bill-response.dto.ts	Defines bill response DTO including line items/approvals/payment snapshot.
backend/src/bills/dto/bill-payment-response.dto.ts	Defines nested payment snapshot DTO on bill responses.
backend/src/bills/dto/bill-list-query.dto.ts	Defines bill list filters/sorts and validation.
backend/src/bills/dto/bill-line-item-response.dto.ts	Defines line item response DTO.
backend/src/bills/dto/bill-approval-response.dto.ts	Defines approval response DTO nested under bill responses.
backend/src/bills/bills.module.ts	Registers bills + bills bulk controllers/services and exports BillsService.
backend/src/bills/bills.mapper.ts	Maps bill aggregate rows to response DTOs (decimals/dates serialized).
backend/src/bills/bills.controller.ts	Exposes bill CRUD, line-item subresource, lifecycle, and activity endpoints.
backend/src/bills/bills-bulk.service.ts	Implements bulk bill operations by reusing single-item service methods.
backend/src/bills/bills-bulk.controller.ts	Exposes bills bulk endpoints under a non-colliding route prefix.
backend/src/app.module.ts	Wires feature modules into the Nest application root.
backend/src/activity/dto/paginated-activity-response.dto.ts	Defines {data, meta} wrapper DTO for activity feeds.
backend/src/activity/dto/activity-query.dto.ts	Defines activity pagination query DTO (no sort exposure).
backend/src/activity/activity.service.ts	Implements activity read APIs including bill+linked-payment aggregation.
backend/src/activity/activity.module.ts	Provides/export ActivityService for injection into resource controllers.
backend/src/activity/activity.mapper.ts	Maps activity rows (incl. actor join) to response DTO.
backend/README.md	Provides backend-specific setup, scripts, auth model, testing, and Docker usage.
backend/prisma/seed.ts	Extends seed data to include FAILED/CANCELED payment end-states and logging.
backend/prisma/schema.prisma	Adds CANCELED to ApprovalStatus enum.
backend/prisma/migrations/20260531114234_approval_status_canceled/migration.sql	Migrates the ApprovalStatus enum to include CANCELED.
backend/prisma.config.ts	Moves Prisma seed configuration out of deprecated package.json block.
backend/package.json	Adds test:all, e2e deps, and moves prisma CLI to deps for runtime migrations.
backend/Dockerfile	Adds multi-stage backend image build with runtime prisma migrate deploy.
backend/bruno/vendors/update-vendor.bru	Adds vendor update request for manual API testing.
backend/bruno/vendors/list-vendors.bru	Adds vendor list request for manual API testing.
backend/bruno/vendors/get-vendor.bru	Adds vendor get request for manual API testing.
backend/bruno/vendors/delete-vendor.bru	Adds vendor delete request for manual API testing.
backend/bruno/vendors/create-vendor.bru	Adds vendor create request (+ id capture) for manual API testing.
backend/bruno/payments/list-payments.bru	Adds payments list request (+ id capture) for manual API testing.
backend/bruno/payments/lifecycle/unschedule.bru	Adds payment unschedule request for manual API testing.
backend/bruno/payments/lifecycle/schedule.bru	Adds payment schedule request for manual API testing.
backend/bruno/payments/lifecycle/retry.bru	Adds payment retry request for manual API testing.
backend/bruno/payments/lifecycle/release.bru	Adds payment release request for manual API testing.
backend/bruno/payments/lifecycle/mark-as-paid.bru	Adds payment mark-as-paid request for manual API testing.
backend/bruno/payments/lifecycle/cancel.bru	Adds payment cancel request for manual API testing.
backend/bruno/payments/get-payment.bru	Adds payment get request for manual API testing.
backend/bruno/payments/bulk/release.bru	Adds payment bulk release request for manual API testing.
backend/bruno/payments/bulk/mark-as-paid.bru	Adds payment bulk mark-as-paid request for manual API testing.
backend/bruno/payments/bulk/cancel.bru	Adds payment bulk cancel request for manual API testing.
backend/bruno/payments/activity/list-payment-activity.bru	Adds payment activity list request for manual API testing.
backend/bruno/exports/export-bills-csv.bru	Adds bills CSV export request for manual API testing.
backend/bruno/bills/update-line-item.bru	Adds line item update request for manual API testing.
backend/bruno/bills/update-bill.bru	Adds bill update request for manual API testing.
backend/bruno/bills/remove-line-item.bru	Adds line item delete request for manual API testing.
backend/bruno/bills/list-line-items.bru	Adds line item list request (+ id capture) for manual API testing.
backend/bruno/bills/list-bills.bru	Adds bills list request (+ id capture) for manual API testing.
backend/bruno/bills/lifecycle/submit-for-approval.bru	Adds bill submit-for-approval request for manual API testing.
backend/bruno/bills/lifecycle/reject.bru	Adds bill reject request for manual API testing.
backend/bruno/bills/lifecycle/archive.bru	Adds bill archive request for manual API testing.
backend/bruno/bills/lifecycle/approve.bru	Adds bill approve request (+ payment id capture) for manual API testing.
backend/bruno/bills/get-bill.bru	Adds bill get request for manual API testing.
backend/bruno/bills/create-bill.bru	Adds bill create request (+ id capture) for manual API testing.
backend/bruno/bills/bulk/edit.bru	Adds bill bulk edit request for manual API testing.
backend/bruno/bills/bulk/archive.bru	Adds bill bulk archive request for manual API testing.
backend/bruno/bills/bulk/approve.bru	Adds bill bulk approve request for manual API testing.
backend/bruno/bills/add-line-item.bru	Adds line item create request (+ id capture) for manual API testing.
backend/bruno/bills/activity/list-bill-activity.bru	Adds bill activity list request for manual API testing.
backend/.env.test	Defines isolated e2e DATABASE_URL targeting schema=test_e2e.
backend/.dockerignore	Ensures Docker context excludes dev/test artifacts and secrets.
.claude/agents/reviewer.md	Updates reviewer agent docs to point to new review drop-zone path.
Files not reviewed (1)
pnpm-lock.yaml: Language not supported
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/src/vendors/vendors.service.ts:

> +        throw new ConflictException({
+          code: ErrorCode.VENDOR_HAS_BILLS,
+          message: 'Cannot delete a vendor that still has bills.',
+        });
The FK-race translation for VENDOR_HAS_BILLS drops the documented details.billCount field, so clients may see two different error shapes for the same error code (pre-count path includes details, delete-time FK path does not). Recompute billCount in this branch and include it in the ConflictException payload to keep the contract stable.