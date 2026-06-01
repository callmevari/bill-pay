import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { PaymentsBulkController } from './payments-bulk.controller';
import { PaymentsBulkService } from './payments-bulk.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ActivityModule],
  controllers: [PaymentsBulkController, PaymentsController],
  providers: [PaymentsService, PaymentsBulkService],
})
export class PaymentsModule {}
