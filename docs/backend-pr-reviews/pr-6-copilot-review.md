Re: [callmevari/bill-pay] feat(payments): add Payments module with full lifecycle and bill cascade (PR #6)

@Copilot commented on this pull request.

Pull request overview
Adds the Payments module to take a bill from APPROVED through the full payment lifecycle (schedule/unschedule/release/mark-as-paid/cancel/retry), with CAS-atomic Payment transitions and propagation to the linked Bill within the same transaction. Also wires bills.archive() to cascade-cancel any in-flight Payment (Phase 5 deferral) and adds two new error codes plus comprehensive API contract docs and Bruno requests.

Changes:

New PaymentsModule (controller, service, DTOs, mapper) exposing GET /payments, GET /payments/:id, and six Admin-only lifecycle endpoints, each CAS-atomic with bill propagation and activity logging.
BillsService.archive() cancels an in-flight Payment via CAS, records metadata.cancelledPayment, and writes a sibling payment.canceled activity entry.
New PAYMENT_NOT_FOUND / PAYMENT_INVALID_TRANSITION error codes; api-contract.md, Bruno collection, unit specs, and e2e specs updated for the new surface.
Reviewed changes
Copilot reviewed 23 out of 23 changed files in this pull request and generated 1 comment.

Show a summary per file
File	Description
docs/api-contract.md	Documents the Payments surface, permissions, activity-log additions, and cancel-on-archive note.
backend/src/payments/payments.service.ts	Implements list/findOne plus six lifecycle methods with CAS-on-Payment and CAS-on-Bill helpers and shared activity logging.
backend/src/payments/payments.controller.ts	NestJS controller wiring six Admin-only lifecycle endpoints (HttpCode 200) plus list/read.
backend/src/payments/payments.module.ts	Registers the new module.
backend/src/payments/payments.mapper.ts	Maps Payment rows to PaymentResponseDto with ISO-8601 / decimal-string serialization.
backend/src/payments/dto/*.ts	List query, schedule body, response, and paginated-response DTOs with class-validator + Swagger metadata.
backend/src/payments/payments.service.spec.ts	Unit specs covering illegal transitions per lifecycle action.
backend/src/bills/bills.service.ts	Archive now CAS-cancels in-flight Payment and records cancelledPayment metadata + sibling activity log.
backend/src/app.module.ts	Imports PaymentsModule.
backend/src/common/errors/error-codes.ts	Adds PAYMENT_NOT_FOUND and PAYMENT_INVALID_TRANSITION.
backend/test/payments-lifecycle.e2e-spec.ts	End-to-end coverage for full chain, individual transitions, illegal transitions, archive cascade, role gating, and list filters.
backend/test/bills-lifecycle.e2e-spec.ts	Updates existing archive test to assert the new Payment cascade behavior.
backend/bruno/payments/*.bru	Bruno requests for list/get + 6 lifecycle actions, chained via paymentId/billId.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In docs/api-contract.md:

> +| `mark-as-paid` | `SCHEDULED | INITIATED → PAID` | none | Set `paidAt`; Bill `SCHEDULED → PAID` |
+| `cancel` | `SCHEDULED | INITIATED | FAILED → CANCELED` | none | Set `canceledAt`; Bill `SCHEDULED → APPROVED` |
The unescaped | characters inside the code spans (SCHEDULED | INITIATED → PAID and SCHEDULED | INITIATED | FAILED → CANCELED) are interpreted as Markdown table column separators by GitHub's renderer (even inside backticks), which will break the row layout in the rendered docs. Escape each in-cell pipe with \|.