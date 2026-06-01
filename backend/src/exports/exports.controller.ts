import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { BillListQueryDto } from '../bills/dto/bill-list-query.dto';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  // Bills export respects the same filters and sort as `GET /bills`.
  // The query DTO is identical so the table and the export cannot
  // drift on what `?status=APPROVED,SCHEDULED&sort=-dueDate` means. No
  // pagination — the contract is "all rows that match the active
  // filters", and the table size is bounded in practice.
  //
  // Headers are set *after* the CSV body resolves rather than via the
  // `@Header(...)` decorator: validation errors thrown by the bills
  // query parser need to flow through the global exception filter as
  // JSON, but the decorator would lock the response to `text/csv` and
  // pollute the error envelope. The Res-pass-through pattern leaves
  // the error path entirely on the filter.
  @Get('bills.csv')
  @ApiOperation({
    summary:
      'Export bills as CSV (all roles). Respects the same query as GET /bills; no pagination.',
  })
  @ApiOkResponse({
    description:
      'CSV body. Columns: id, vendor, status, amount, dueDate, paymentMethod, invoiceNumber, memo, paymentStatus, paymentScheduledFor, paymentPaidAt, createdAt.',
  })
  async billsCsv(
    @Query() query: BillListQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.exports.billsCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.exports.filenameForToday()}"`,
    );
    res.send(csv);
  }
}
