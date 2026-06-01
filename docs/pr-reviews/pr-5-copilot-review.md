Re: [callmevari/bill-pay] feat(bills): add lifecycle endpoints (submit/approve/reject/archive) (PR #5)

@Copilot commented on this pull request.

Pull request overview
Adds bill lifecycle action endpoints to drive bills through the documented state machine, including creating a linked Payment on approval and returning it inline on bill responses. This fits into the Bills module by formalizing status transitions with transactional side effects (Approval/Payment + ActivityLog) and extending the Bill read contract to include payment data.

Changes:

Adds lifecycle endpoints: POST /bills/:id/submit-for-approval, /approve, /reject, /archive with role gating.
Implements service-layer state machine transitions with Prisma $transaction, activity logging, and 409 BILL_INVALID_TRANSITION details payload.
Extends Bill responses to include an inline payment snapshot DTO; updates docs, Bruno requests, and unit/e2e coverage.
Reviewed changes
Copilot reviewed 15 out of 15 changed files in this pull request and generated 6 comments.

Show a summary per file
File	Description
docs/api-contract.md	Documents lifecycle endpoints, transition rules, error code, and activity log actions.
CLAUDE.md	Adds documented develop → main milestone merge cadence guidance.
backend/test/bills-lifecycle.e2e-spec.ts	New end-to-end coverage for legal/illegal transitions and role gating.
backend/src/common/errors/error-codes.ts	Adds BILL_INVALID_TRANSITION error code constant.
backend/src/bills/dto/reject-bill.dto.ts	Adds DTO + validation rules for optional rejection notes (rejects null).
backend/src/bills/dto/bill-response.dto.ts	Adds payment field to bill response contract.
backend/src/bills/dto/bill-payment-response.dto.ts	Introduces nested payment snapshot DTO surfaced on bill responses.
backend/src/bills/bills.service.ts	Implements lifecycle transitions with transactional side effects and logging; includes payment in bill reads.
backend/src/bills/bills.service.spec.ts	Adds unit tests for transition guard behavior and error detail payloads.
backend/src/bills/bills.mapper.ts	Maps optional payment relation into the new response DTO shape.
backend/src/bills/bills.controller.ts	Adds lifecycle endpoints with role gating + Swagger annotations.
backend/bruno/bills/lifecycle/submit-for-approval.bru	Bruno request for submit-for-approval endpoint.
backend/bruno/bills/lifecycle/approve.bru	Bruno request for approve endpoint.
backend/bruno/bills/lifecycle/reject.bru	Bruno request for reject endpoint.
backend/bruno/bills/lifecycle/archive.bru	Bruno request for archive endpoint.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In docs/api-contract.md:

> @@ -203,12 +205,39 @@ Partial update. `quantity`, `unitPrice`, and `description` are non-null; `null`
 
 ### `DELETE /bills/:id/line-items/:lineItemId` — Admin only
 
-**204** on success. **404 BILL_LINE_ITEM_NOT_FOUND** if missing/mismatched. **409 BILL_NOT_EDITABLE** for terminal bills.
+**204** on success. **404 BILL_LINE_ITEM_NOT_FOUND** if missing/mismatched. **409 BILL_NOT_EDITABLE` for terminal bills.
Markdown formatting typo: the BILL_NOT_EDITABLE code is missing the closing ** marker (and has a stray backtick), which breaks the docs rendering.

In backend/src/bills/bills.service.ts:

> +      const result = await tx.bill.update({
+        where: { id },
+        data: { status: BillStatus.PENDING_APPROVAL },
+        include: billInclude,
+      });
The status pre-check happens before opening the transaction, but the in-transaction bill.update does not constrain the current status. Under concurrent requests this can overwrite a newer status and/or create duplicate Approval rows. Make the transition atomic by updating with a status predicate (e.g. updateMany where { id, status: { in: [...] } }) and throw BILL_INVALID_TRANSITION if no row was updated.

In backend/src/bills/bills.service.ts:

> +      const result = await tx.bill.update({
+        where: { id },
+        data: { status: BillStatus.APPROVED },
+        include: billInclude,
+      });
Same atomicity issue as submitForApproval: the transition is validated outside the transaction, but the bill.update inside the transaction does not require the current status to still be PENDING_APPROVAL. Under concurrent calls this can incorrectly approve a bill that has already moved to another status. Use a conditional updateMany on { id, status: { in: [PENDING_APPROVAL] } } and throw BILL_INVALID_TRANSITION when no rows are updated.

In backend/src/bills/bills.service.ts:

> +      const result = await tx.bill.update({
+        where: { id },
+        data: { status: BillStatus.REJECTED },
+        include: billInclude,
+      });
Same atomicity issue as the other lifecycle transitions: the transaction updates the bill status without constraining the current status, so a concurrent request can cause an unintended transition. Make the update conditional on the expected current status and throw BILL_INVALID_TRANSITION when no row is updated.

In backend/src/bills/bills.service.ts:

> +      const result = await tx.bill.update({
+        where: { id },
+        data: { status: BillStatus.ARCHIVED, archivedAt: new Date() },
+        include: billInclude,
+      });
Same atomicity issue as the other lifecycle transitions: bill.update does not constrain the current status, so concurrent requests can incorrectly archive a bill that has become PAID/ARCHIVED (or otherwise changed) between the pre-check and the transaction. Use a conditional updateMany against the allowed-from set and throw BILL_INVALID_TRANSITION if it updates 0 rows.

In backend/src/bills/bills.controller.ts:

> +  reject(
+    @Param('id') id: string,
+    @Body() dto: RejectBillDto,
+    @CurrentUser() actor: AuthUser,
The API contract describes the reject body as optional, but @Body() dto: RejectBillDto can be undefined when the request has no body, which would cause BillsService.reject to throw at dto.notes. Provide a default DTO instance (or make the parameter optional) so POST /reject truly supports an omitted body.