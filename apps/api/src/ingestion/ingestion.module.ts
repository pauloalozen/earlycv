import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { CustomApiAdapter, CustomHtmlAdapter } from "./adapters";
import { IngestionService } from "./ingestion.service";

@Module({
  imports: [DatabaseModule],
  providers: [IngestionService, CustomHtmlAdapter, CustomApiAdapter],
  exports: [IngestionService],
})
export class IngestionModule {}
