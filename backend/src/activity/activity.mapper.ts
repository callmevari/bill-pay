import { ActivityLog, User } from '@prisma/client';

import { ActivityLogResponseDto } from '../common/dto/activity-log-response.dto';

export type ActivityLogWithActor = ActivityLog & {
  actor: Pick<User, 'name'>;
};

export function toActivityLogResponse(
  entry: ActivityLogWithActor,
): ActivityLogResponseDto {
  return {
    id: entry.id,
    actorId: entry.actorId,
    actorName: entry.actor.name,
    actorRole: entry.actorRole,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
  };
}
