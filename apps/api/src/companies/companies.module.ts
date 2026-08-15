import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [DatabaseModule, IngestionModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
