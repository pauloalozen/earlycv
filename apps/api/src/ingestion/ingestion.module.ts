import { Module } from "@nestjs/common";

import { createAiClientFromEnv } from "../common/ai-client-factory";
import { DatabaseModule } from "../database/database.module";
import {
  AshbyAdapter,
  CustomApiAdapter,
  CustomHtmlAdapter,
  GreenhouseAdapter,
  GupyAdapter,
  InHireAdapter,
  LeverAdapter,
  TeamtailorAdapter,
} from "./adapters";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { CrawlerDiscardController } from "./crawler-discard.controller";
import { CrawlerDiscardService } from "./crawler-discard.service";
import { EnrichmentConfigController } from "./enrichment-config.controller";
import { EnrichmentConfigService } from "./enrichment-config.service";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";
import { IngestionJobController } from "./ingestion-job.controller";
import { IngestionJobService } from "./ingestion-job.service";
import { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";
import { IngestionJobSchedulerService } from "./ingestion-job-scheduler.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionManualRunnerService } from "./ingestion-manual-runner.service";
import { IngestionRunEnrichmentController } from "./ingestion-run-enrichment.controller";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import {
  JOB_ENRICHMENT_AI_CLIENT,
  JobEnrichmentWorker,
} from "./job-enrichment.worker";
import { JobSourceExportController } from "./job-source-export.controller";
import { ManualIngestionService } from "./manual-ingestion.service";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";
import { SemanticFilterController } from "./semantic-filter.controller";
import { SemanticFilterService } from "./semantic-filter.service";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

@Module({
  imports: [DatabaseModule],
  controllers: [
    IngestionController,
    IngestionJobController,
    JobSourceExportController,
    SemanticFilterController,
    EnrichmentConfigController,
    IngestionRunEnrichmentController,
    CrawlerDiscardController,
  ],
  providers: [
    IngestionService,
    AdminIngestionImportService,
    CrawlerDiscardService,
    GlobalSchedulerConfigService,
    IngestionLockRepository,
    IngestionSchedulerService,
    IngestionJobService,
    IngestionJobSchedulerService,
    IngestionJobDispatchService,
    IngestionManualRunnerService,
    ManualIngestionBatchRepository,
    ManualIngestionService,
    SemanticFilterService,
    SemanticFilterAdminService,
    EnrichmentConfigService,
    JobEnrichmentWorker,
    {
      provide: JOB_ENRICHMENT_AI_CLIENT,
      useFactory: () => createAiClientFromEnv("JOB_ENRICHMENT"),
    },
    CustomHtmlAdapter,
    CustomApiAdapter,
    GupyAdapter,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
    InHireAdapter,
    TeamtailorAdapter,
  ],
  exports: [IngestionService, SemanticFilterService],
})
export class IngestionModule {}
