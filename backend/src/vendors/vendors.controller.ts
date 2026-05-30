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

import { Roles } from '../auth/roles.decorator';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { PaginatedVendorsResponseDto } from './dto/paginated-vendors-response.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorListQueryDto } from './dto/vendor-list-query.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { VendorsService } from './vendors.service';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @ApiOperation({ summary: 'List vendors (paginated, searchable, sortable)' })
  @ApiOkResponse({ type: PaginatedVendorsResponseDto })
  list(
    @Query() query: VendorListQueryDto,
  ): Promise<PaginatedVendorsResponseDto> {
    return this.vendors.list(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a vendor (Admin only)' })
  @ApiCreatedResponse({ type: VendorResponseDto })
  create(@Body() dto: CreateVendorDto): Promise<VendorResponseDto> {
    return this.vendors.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a vendor by id' })
  @ApiOkResponse({ type: VendorResponseDto })
  findOne(@Param('id') id: string): Promise<VendorResponseDto> {
    return this.vendors.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a vendor (Admin only)' })
  @ApiOkResponse({ type: VendorResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ): Promise<VendorResponseDto> {
    return this.vendors.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a vendor (Admin only; 409 VENDOR_HAS_BILLS if referenced)',
  })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.vendors.remove(id);
  }
}
