import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  buildPaginationMeta,
  PaginationMetaDto,
} from '../common/dto/pagination-meta.dto';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import {
  VENDOR_SORT_FIELDS,
  VendorListQueryDto,
  VendorSortField,
} from './dto/vendor-list-query.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { toVendorResponse } from './vendors.mapper';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: VendorListQueryDto,
  ): Promise<{ data: VendorResponseDto[]; meta: PaginationMetaDto }> {
    const { page, pageSize, q } = query;
    const where: Prisma.VendorWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        orderBy: this.parseSort(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      data: rows.map(toVendorResponse),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async create(dto: CreateVendorDto): Promise<VendorResponseDto> {
    const vendor = await this.prisma.vendor.create({ data: dto });
    return toVendorResponse(vendor);
  }

  async findOne(id: string): Promise<VendorResponseDto> {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Vendor not found.',
      });
    }
    return toVendorResponse(vendor);
  }

  async update(id: string, dto: UpdateVendorDto): Promise<VendorResponseDto> {
    await this.ensureExists(id);
    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: dto,
    });
    return toVendorResponse(vendor);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    const billCount = await this.prisma.bill.count({ where: { vendorId: id } });
    if (billCount > 0) {
      throw new ConflictException({
        code: ErrorCode.VENDOR_HAS_BILLS,
        message: 'Cannot delete a vendor that still has bills.',
        details: { billCount },
      });
    }
    try {
      await this.prisma.vendor.delete({ where: { id } });
    } catch (error) {
      // Race: a bill may be created for this vendor between the count above
      // and the delete below. Translate the FK violation so the contract
      // still returns VENDOR_HAS_BILLS instead of FOREIGN_KEY_VIOLATION.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException({
          code: ErrorCode.VENDOR_HAS_BILLS,
          message: 'Cannot delete a vendor that still has bills.',
        });
      }
      throw error;
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Vendor not found.',
      });
    }
  }

  private parseSort(sort?: string): Prisma.VendorOrderByWithRelationInput {
    if (!sort) {
      return { name: 'asc' };
    }
    const desc = sort.startsWith('-');
    const field = (desc ? sort.slice(1) : sort) as VendorSortField;
    if (!VENDOR_SORT_FIELDS.includes(field)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid sort field "${field}". Allowed: ${VENDOR_SORT_FIELDS.join(', ')}.`,
      });
    }
    return { [field]: desc ? 'desc' : 'asc' };
  }
}
