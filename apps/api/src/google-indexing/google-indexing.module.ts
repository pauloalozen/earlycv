import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GoogleIndexingService } from "./google-indexing.service";
import { GoogleIndexingAdminController } from "./google-indexing-admin.controller";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

// O disparo do backfill (agendado às 3h e manual) é feito pelo
// IngestionJobDispatchService/IngestionJobSchedulerService, via o
// IngestionJob jobType=GOOGLE_INDEXING_BACKFILL (seed em
// packages/database/prisma/migrations/20260824155333_seed_google_indexing_backfill_job) —
// aparece no histórico da aba "Jobs" de /admin/ingestion como qualquer
// outro job. Não há mais um @Cron próprio aqui.
@Module({
  imports: [DatabaseModule],
  controllers: [GoogleIndexingAdminController],
  providers: [GoogleIndexingService, GoogleIndexingBackfillService],
  exports: [GoogleIndexingService, GoogleIndexingBackfillService],
})
export class GoogleIndexingModule {}
