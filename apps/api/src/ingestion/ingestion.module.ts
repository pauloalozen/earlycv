import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionManualRunnerService } from "./ingestion-manual-runner.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { ManualIngestionService } from "./manual-ingestion.service";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

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
