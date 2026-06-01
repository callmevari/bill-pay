import { Module } from '@nestjs/common';

import { ActivityService } from './activity.service';

// Owns the read service for the polymorphic ActivityLog. The
// controllers live in the entity modules (`BillsModule`, `PaymentsModule`)
// so URLs nest naturally under their parent — `GET /bills/:id/activity`
// and `GET /payments/:id/activity` — and stay grouped in Swagger under
// the same tag as the rest of that resource. Exporting the service
// lets those modules inject it without depending on the controller.
@Module({
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
