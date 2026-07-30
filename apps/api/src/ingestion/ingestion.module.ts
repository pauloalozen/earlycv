import { Module } from "@nestjs/common";

import { createAiClientFromEnv } from "../common/ai-client-factory";
import { DatabaseModule } from "../database/database.module";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionManualRunnerService } from "./ingestion-manual-runner.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import {
  JOB_ENRICHMENT_AI_CLIENT,
  JobEnrichmentWorker,
} from "./job-enrichment.worker";
import { ManualIngestionService } from "./manual-ingestion.service";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";
import { SemanticFilterController } from "./semantic-filter.controller";
import { SemanticFilterService } from "./semantic-filter.service";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController, SemanticFilterController],
  providers: [
    IngestionService,
    AdminIngestionImportService,
    GlobalSchedulerConfigService,
    IngestionLockRepository,
    IngestionSchedulerService,
    IngestionManualRunnerService,
    ManualIngestionBatchRepository,
    ManualIngestionService,
    SemanticFilterService,
    SemanticFilterAdminService,
    JobEnrichmentWorker,
    {
      provide: JOB_ENRICHMENT_AI_CLIENT,
      useFactory: () => createAiClientFromEnv("JOB_ENRICHMENT"),
    },
    CustomHtmlAdapter,
    CustomApiAdapter,
    GupyAdapter,
  ],
  exports: [IngestionService, SemanticFilterService],
})
export class IngestionModule {}
