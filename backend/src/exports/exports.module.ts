import { Module } from '@nestjs/common';

import { BillsModule } from '../bills/bills.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [BillsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
