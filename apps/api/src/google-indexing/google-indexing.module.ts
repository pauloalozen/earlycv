import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { GoogleIndexingService } from "./google-indexing.service";
import { GoogleIndexingAdminController } from "./google-indexing-admin.controller";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";
import { GoogleIndexingQueueService } from "./google-indexing-queue.service";
import { GoogleIndexingQueueWorker } from "./google-indexing-queue.worker";

// Envio: GoogleIndexingQueueWorker (@Cron + lock) processa a fila
// GoogleIndexingQueueItem. Todo mundo que precisa notificar enfileira via
// GoogleIndexingQueueService.
//
// O disparo do backfill (agendado às 3h e manual) é feito pelo
// IngestionJobDispatchService/IngestionJobSchedulerService, via o
// IngestionJob jobType=GOOGLE_INDEXING_BACKFILL (seed em
// packages/database/prisma/migrations/20260824155333_seed_google_indexing_backfill_job) —
// aparece no histórico da aba "Jobs" de /admin/ingestion como qualquer
// outro job. O backfill não tem @Cron próprio: só enfileira.
@Module({
  imports: [DatabaseModule],
  controllers: [GoogleIndexingAdminController],
  providers: [
    GoogleIndexingService,
    GoogleIndexingBackfillService,
    GoogleIndexingQueueService,
    GoogleIndexingQueueWorker,
    IngestionLockRepository,
  ],
  exports: [
    GoogleIndexingService,
    GoogleIndexingBackfillService,
    GoogleIndexingQueueService,
  ],
})
export class GoogleIndexingModule {}
