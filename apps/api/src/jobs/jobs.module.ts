import { Module } from "@nestjs/common";

import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { JobsController } from "./jobs.controller";
import { PublicJobsController } from "./public-jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [DatabaseModule, CompaniesModule, JobSourcesModule],
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService],
})
export class JobsModule {}
