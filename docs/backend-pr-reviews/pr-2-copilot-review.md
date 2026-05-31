Re: [callmevari/bill-pay] feat(vendors): add CRUD with search, pagination, and delete guard (PR #2)

@Copilot commented on this pull request.

Pull request overview
Adds the first feature module for Vendors, exposing authenticated vendor CRUD APIs with Admin-only mutations, searchable/sortable pagination, delete protection for referenced vendors, API documentation, and Bruno request examples.

Changes:

Adds VendorsModule with controller, service, mapper, DTOs, and registration in AppModule.
Adds shared pagination DTO/meta helpers and VENDOR_HAS_BILLS error code.
Documents the Vendors API contract and adds Bruno requests for manual API exercise.
Reviewed changes
Copilot reviewed 20 out of 20 changed files in this pull request and generated 2 comments.

Show a summary per file
File	Description
backend/src/app.module.ts	Registers the new vendors module.
backend/src/common/dto/pagination-query.dto.ts	Adds reusable pagination query validation.
backend/src/common/dto/pagination-meta.dto.ts	Adds pagination metadata DTO and builder.
backend/src/common/errors/error-codes.ts	Adds the vendor delete-guard error code.
backend/src/vendors/vendors.module.ts	Defines the vendors feature module.
backend/src/vendors/vendors.controller.ts	Exposes vendor list/create/get/update/delete endpoints.
backend/src/vendors/vendors.service.ts	Implements vendor CRUD, search/sort/pagination, and delete guard.
backend/src/vendors/vendors.mapper.ts	Maps Prisma vendors to API response DTOs.
backend/src/vendors/dto/create-vendor.dto.ts	Adds create request validation/schema.
backend/src/vendors/dto/update-vendor.dto.ts	Adds update request DTO.
backend/src/vendors/dto/vendor-list-query.dto.ts	Adds list query DTO and allowed sort fields.
backend/src/vendors/dto/vendor-response.dto.ts	Defines vendor response shape.
backend/src/vendors/dto/paginated-vendors-response.dto.ts	Defines paginated vendor response shape.
backend/src/vendors/vendors.service.spec.ts	Adds service tests for delete guard behavior.
docs/api-contract.md	Documents auth, permissions, pagination, and vendor endpoints.
backend/bruno/vendors/create-vendor.bru	Adds Bruno request for vendor creation.
backend/bruno/vendors/list-vendors.bru	Adds Bruno request for listing vendors.
backend/bruno/vendors/get-vendor.bru	Adds Bruno request for fetching a vendor.
backend/bruno/vendors/update-vendor.bru	Adds Bruno request for updating a vendor.
backend/bruno/vendors/delete-vendor.bru	Adds Bruno request for deleting a vendor.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/src/vendors/dto/update-vendor.dto.ts:

> +import { PartialType } from '@nestjs/swagger';
+
+import { CreateVendorDto } from './create-vendor.dto';
+
+export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
PartialType(CreateVendorDto) makes name optional by adding @IsOptional(), and class-validator treats null as optional. As a result, PATCH /vendors/:id with { "name": null } can bypass validation and reach Prisma even though Vendor.name is non-nullable, producing an internal database error instead of the documented 400 validation response. Define the update DTO so name is skipped only when omitted, not when explicitly set to null.

In backend/src/vendors/vendors.service.ts:

> +      data: dto,
+    });
+    return toVendorResponse(vendor);
+  }
+
+  async remove(id: string): Promise<void> {
+    await this.ensureExists(id);
+    const billCount = await this.prisma.bill.count({ where: { vendorId: id } });
+    if (billCount > 0) {
+      throw new ConflictException({
+        code: ErrorCode.VENDOR_HAS_BILLS,
+        message: 'Cannot delete a vendor that still has bills.',
+        details: { billCount },
+      });
+    }
+    await this.prisma.vendor.delete({ where: { id } });
The pre-delete bill count is not atomic with the vendor.delete. If a bill is created for this vendor after the count returns 0 but before the delete runs, Prisma will raise a foreign-key error and the API will return FOREIGN_KEY_VIOLATION instead of the promised 409 VENDOR_HAS_BILLS shape. Catch the delete-time FK violation and translate it through the same vendor-specific conflict response.