import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

// Body for `POST /bills/:id/reject`. The notes are stored on the
// Approval row (`Approval.notes`) and surfaced in the activity log
// metadata so the audit trail explains the rejection.
//
// `notes` is semantically "add a note", not "clear a note", so `null`
// is rejected (the convention documented in `update-bill.dto.ts` for
// non-nullable required fields applies to optional-but-meaningful
// fields too — null is never meaningful here). Omitting the field
// entirely is fine; the service stores `null` on the Approval.
export class RejectBillDto {
  @ApiPropertyOptional({
    example: 'Vendor billed for the wrong period.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
