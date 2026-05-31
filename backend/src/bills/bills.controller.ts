import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BillsService } from './bills.service';
import { BillListQueryDto } from './dto/bill-list-query.dto';
import { BillLineItemResponseDto } from './dto/bill-line-item-response.dto';
import { BillResponseDto } from './dto/bill-response.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreateBillLineItemDto } from './dto/create-bill-line-item.dto';
import { PaginatedBillsResponseDto } from './dto/paginated-bills-response.dto';
import { RejectBillDto } from './dto/reject-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { UpdateBillLineItemDto } from './dto/update-bill-line-item.dto';

@ApiTags('bills')
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  // ---- bills --------------------------------------------------------

  @Get()
  @ApiOperation({
    summary: 'List bills (paginated, filterable, sortable)',
  })
  @ApiOkResponse({ type: PaginatedBillsResponseDto })
  list(@Query() query: BillListQueryDto): Promise<PaginatedBillsResponseDto> {
    return this.bills.list(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a bill in DRAFT (Admin only)' })
  @ApiCreatedResponse({ type: BillResponseDto })
  create(
    @Body() dto: CreateBillDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.create(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bill by id (includes line items)' })
  @ApiOkResponse({ type: BillResponseDto })
  findOne(@Param('id') id: string): Promise<BillResponseDto> {
    return this.bills.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Update an editable bill (Admin only; 409 BILL_NOT_EDITABLE on PAID/REJECTED/ARCHIVED)',
  })
  @ApiOkResponse({ type: BillResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBillDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.update(id, dto, actor);
  }

  // ---- line items ---------------------------------------------------

  @Get(':id/line-items')
  @ApiOperation({ summary: 'List the line items of a bill' })
  @ApiOkResponse({ type: [BillLineItemResponseDto] })
  listLineItems(@Param('id') id: string): Promise<BillLineItemResponseDto[]> {
    return this.bills.listLineItems(id);
  }

  @Post(':id/line-items')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a line item to a bill (Admin only)' })
  @ApiCreatedResponse({ type: BillLineItemResponseDto })
  addLineItem(
    @Param('id') id: string,
    @Body() dto: CreateBillLineItemDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillLineItemResponseDto> {
    return this.bills.addLineItem(id, dto, actor);
  }

  @Patch(':id/line-items/:lineItemId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a line item (Admin only)' })
  @ApiOkResponse({ type: BillLineItemResponseDto })
  updateLineItem(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: UpdateBillLineItemDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillLineItemResponseDto> {
    return this.bills.updateLineItem(id, lineItemId, dto, actor);
  }

  @Delete(':id/line-items/:lineItemId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a line item (Admin only)' })
  @ApiNoContentResponse()
  removeLineItem(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.bills.removeLineItem(id, lineItemId, actor);
  }

  // ---- lifecycle ----------------------------------------------------

  @Post(':id/submit-for-approval')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit a DRAFT bill for approval (Admin only). 409 BILL_INVALID_TRANSITION otherwise.',
  })
  @ApiOkResponse({ type: BillResponseDto })
  submitForApproval(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.submitForApproval(id, actor);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.APPROVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve a PENDING_APPROVAL bill (Admin or Approver). Creates the linked Payment in UNSCHEDULED.',
  })
  @ApiOkResponse({ type: BillResponseDto })
  approve(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.approve(id, actor);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.APPROVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reject a PENDING_APPROVAL bill (Admin or Approver). Optional notes stored on the Approval.',
  })
  @ApiOkResponse({ type: BillResponseDto })
  reject(
    @Param('id') id: string,
    // Default to an empty DTO so a request with no body parses cleanly
    // without `@Body()` resolving to `undefined`. The service still
    // guards with `dto?.notes ?? null` belt-and-suspenders.
    @Body() dto: RejectBillDto = new RejectBillDto(),
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.reject(id, dto, actor);
  }

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Archive a non-PAID, non-ARCHIVED bill (Admin only). Terminal off-ramp.',
  })
  @ApiOkResponse({ type: BillResponseDto })
  archive(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillResponseDto> {
    return this.bills.archive(id, actor);
  }
}
