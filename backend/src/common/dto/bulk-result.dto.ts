import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Per-item shape returned by every bulk endpoint. `ok: true` carries
// the updated entity in `data`; `ok: false` carries the same error
// envelope the single-item endpoint would have returned (so the
// frontend can branch on the same `code`s without a special path).
export class BulkItemErrorDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  details?: unknown;
}

export class BulkItemResultDto<T = unknown> {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional({ description: 'Present when `ok: true`.' })
  data?: T;

  @ApiPropertyOptional({
    type: BulkItemErrorDto,
    description: 'Present when `ok: false`.',
  })
  error?: BulkItemErrorDto;
}

export class BulkSummaryDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  succeeded: number;

  @ApiProperty()
  failed: number;
}

export class BulkResponseDto<T = unknown> {
  @ApiProperty({ type: [BulkItemResultDto] })
  results: BulkItemResultDto<T>[];

  @ApiProperty({ type: BulkSummaryDto })
  summary: BulkSummaryDto;
}

export function buildBulkSummary(results: BulkItemResultDto[]): BulkSummaryDto {
  const succeeded = results.filter((r) => r.ok).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  };
}
