import { Module } from "@nestjs/common";

import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { JobSourcesController } from "./job-sources.controller";
import { JobSourcesService } from "./job-sources.service";

@Module({
  imports: [DatabaseModule, CompaniesModule],
  controllers: [JobSourcesController],
  providers: [JobSourcesService],
  exports: [JobSourcesService],
})
export class JobSourcesModule {}
