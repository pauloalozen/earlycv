import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    CustomHtmlAdapter,
    CustomApiAdapter,
    GupyAdapter,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
