import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { IngestionService } from "./ingestion.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    AdminIngestionImportService,
    GlobalSchedulerConfigService,
    IngestionLockRepository,
    IngestionSchedulerService,
    CustomHtmlAdapter,
    CustomApiAdapter,
    GupyAdapter,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
