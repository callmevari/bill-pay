import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityEntityType, Role } from '@prisma/client';

export class ActivityLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  actorId: string;

  @ApiProperty({
    description:
      'Display name of the actor at read time (resolved via User join).',
  })
  actorName: string;

  @ApiProperty({ enum: Role })
  actorRole: Role;

  @ApiProperty({
    enum: ActivityEntityType,
    description:
      'Which entity the row references. Polymorphic via (entityType, entityId).',
  })
  entityType: ActivityEntityType;

  @ApiProperty()
  entityId: string;

  @ApiProperty({
    description:
      'Stable action verb (e.g. `bill.created`, `payment.scheduled`). See docs/api-contract.md for the full list.',
  })
  action: string;

  @ApiPropertyOptional({ nullable: true })
  fromStatus: string | null;

  @ApiPropertyOptional({ nullable: true })
  toStatus: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Free-form per-action JSON. Schema varies by action.',
  })
  metadata: unknown;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
