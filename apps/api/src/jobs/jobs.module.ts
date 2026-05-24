import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { PublicJobsController } from "./public-jobs.controller";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

@Module({
  imports: [AuthModule, DatabaseModule, CompaniesModule, JobSourcesModule],
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService, JwtAuthGuard, RolesGuard, PublicJobsGhostModeGuard],
})
export class JobsModule {}
