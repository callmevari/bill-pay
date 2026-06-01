import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BillsBulkService } from './bills-bulk.service';
import {
  BulkBillIdsDto,
  BulkBillsResponseDto,
  BulkEditBillsDto,
} from './dto/bulk-bills.dto';

// Mounted under a separate route prefix so the literal `bulk` segment
// can never collide with the `:id` parameter on the main controller's
// `POST /bills/:id/...` lifecycle endpoints. Each action returns 200
// with a per-item result envelope; partial failures don't bubble up to
// the HTTP status. See `docs/api-contract.md → Bulk operations` for the
// per-item shape.
@ApiTags('bills')
@Controller('bills/bulk')
export class BillsBulkController {
  constructor(private readonly bulk: BillsBulkService) {}

  @Post('approve')
  @Roles(Role.ADMIN, Role.APPROVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve a batch of PENDING_APPROVAL bills (Admin or Approver). Per-item result.',
  })
  @ApiOkResponse({ type: BulkBillsResponseDto })
  approve(
    @Body() dto: BulkBillIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkBillsResponseDto> {
    return this.bulk.approve(dto, actor);
  }

  @Post('archive')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Archive a batch of bills (Admin only). Per-item result; PAID/ARCHIVED items fail with BILL_INVALID_TRANSITION.',
  })
  @ApiOkResponse({ type: BulkBillsResponseDto })
  archive(
    @Body() dto: BulkBillIdsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkBillsResponseDto> {
    return this.bulk.archive(dto, actor);
  }

  @Post('edit')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply the same field updates to a batch of editable bills (Admin only). Fields: dueDate, memo.',
  })
  @ApiOkResponse({ type: BulkBillsResponseDto })
  edit(
    @Body() dto: BulkEditBillsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BulkBillsResponseDto> {
    return this.bulk.edit(dto, actor);
  }
}
