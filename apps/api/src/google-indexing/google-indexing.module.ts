import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GoogleIndexingAdminController } from "./google-indexing-admin.controller";
import { GoogleIndexingBackfillScheduler } from "./google-indexing-backfill.scheduler";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";
import { GoogleIndexingService } from "./google-indexing.service";

@Module({
  imports: [DatabaseModule],
  controllers: [GoogleIndexingAdminController],
  providers: [
    GoogleIndexingService,
    GoogleIndexingBackfillService,
    GoogleIndexingBackfillScheduler,
  ],
  exports: [GoogleIndexingService, GoogleIndexingBackfillService],
})
export class GoogleIndexingModule {}
