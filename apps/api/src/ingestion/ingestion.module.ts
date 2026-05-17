import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionManualRunnerService } from "./ingestion-manual-runner.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { IngestionService } from "./ingestion.service";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";
import { ManualIngestionService } from "./manual-ingestion.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    AdminIngestionImportService,
    GlobalSchedulerConfigService,
    IngestionLockRepository,
    IngestionSchedulerService,
    IngestionManualRunnerService,
    ManualIngestionBatchRepository,
    ManualIngestionService,
    CustomHtmlAdapter,
    CustomApiAdapter,
    GupyAdapter,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
