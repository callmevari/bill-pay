import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';

// Snapshot of an Approval row surfaced inline on a Bill response so
// consumers can read the decision + notes + actor without a second
// round-trip. The MVP keeps it to a single-step approval per bill, but
// the response uses an array to track the underlying `Bill.approvals`
// relation (so future multi-step chains don't change the shape).
export class BillApprovalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  billId: string;

  @ApiProperty({
    description:
      'User id of the assigned approver at submit, overwritten with the acting user at approve/reject time.',
  })
  approverId: string;

  @ApiProperty({
    description:
      'Display name of the approver joined at read time, so renames flow through without rewriting historical Approval rows.',
  })
  approverName: string;

  @ApiProperty({ enum: ApprovalStatus })
  status: ApprovalStatus;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
