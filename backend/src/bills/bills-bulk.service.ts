import { BadRequestException, Injectable } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { runBulk } from '../common/bulk/bulk-runner';
import { ErrorCode } from '../common/errors/error-codes';
import { BillsService } from './bills.service';
import { BillResponseDto } from './dto/bill-response.dto';
import { RejectBillDto } from './dto/reject-bill.dto';
import {
  BulkBillIdsDto,
  BulkBillsResponseDto,
  BulkEditBillsDto,
  BulkRejectBillsDto,
} from './dto/bulk-bills.dto';

@Injectable()
export class BillsBulkService {
  constructor(private readonly bills: BillsService) {}

  approve(dto: BulkBillIdsDto, actor: AuthUser): Promise<BulkBillsResponseDto> {
    return runBulk<BillResponseDto>(dto.ids, (id) =>
      this.bills.approve(id, actor),
    );
  }

  archive(dto: BulkBillIdsDto, actor: AuthUser): Promise<BulkBillsResponseDto> {
    return runBulk<BillResponseDto>(dto.ids, (id) =>
      this.bills.archive(id, actor),
    );
  }

  submitForApproval(
    dto: BulkBillIdsDto,
    actor: AuthUser,
  ): Promise<BulkBillsResponseDto> {
    return runBulk<BillResponseDto>(dto.ids, (id) =>
      this.bills.submitForApproval(id, actor),
    );
  }

  reject(
    dto: BulkRejectBillsDto,
    actor: AuthUser,
  ): Promise<BulkBillsResponseDto> {
    // Build a single shared payload once and pass it to every item; the
    // single-item service treats an undefined `dto` (empty body) and a
    // dto with no notes identically.
    const perItem: RejectBillDto =
      dto.notes !== undefined ? { notes: dto.notes } : {};
    return runBulk<BillResponseDto>(dto.ids, (id) =>
      this.bills.reject(id, perItem, actor),
    );
  }

  edit(dto: BulkEditBillsDto, actor: AuthUser): Promise<BulkBillsResponseDto> {
    // Forward only the value-bearing keys. class-transformer materializes
    // optional class properties as own keys set to `undefined`, so a
    // naive `hasOwnProperty` check would treat an empty `{}` as having
    // present-but-undefined fields. Send `description: null` to clear
    // the description; omit the key to leave it alone. An empty
    // `fields` payload (no value-bearing keys) is rejected with 400 so
    // the per-item loop never sees a no-op.
    const translated: {
      description?: string | null;
      dueDate?: string;
      invoiceDate?: string;
    } = {};
    if (dto.fields.description !== undefined) {
      translated.description = dto.fields.description;
    }
    if (dto.fields.dueDate !== undefined) {
      translated.dueDate = dto.fields.dueDate;
    }
    if (dto.fields.invoiceDate !== undefined) {
      translated.invoiceDate = dto.fields.invoiceDate;
    }
    if (Object.keys(translated).length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'fields must contain at least one of: dueDate, invoiceDate, description.',
      });
    }
    return runBulk<BillResponseDto>(dto.ids, (id) =>
      this.bills.update(id, translated, actor),
    );
  }
}
