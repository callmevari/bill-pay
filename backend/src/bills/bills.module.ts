import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { BillsBulkController } from './bills-bulk.controller';
import { BillsBulkService } from './bills-bulk.service';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [ActivityModule],
  controllers: [BillsBulkController, BillsController],
  providers: [BillsService, BillsBulkService],
  exports: [BillsService],
})
export class BillsModule {}
