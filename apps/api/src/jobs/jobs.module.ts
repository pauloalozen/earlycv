import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { JobApplicationsModule } from "../job-applications/job-applications.module";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { RadarModule } from "../radar/radar.module";
import { SavedJobsModule } from "../saved-jobs/saved-jobs.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { PublicJobsController } from "./public-jobs.controller";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    CompaniesModule,
    JobApplicationsModule,
    JobSourcesModule,
    RadarModule,
    SavedJobsModule,
  ],
  controllers: [JobsController, PublicJobsController],
  providers: [
    JobsService,
    JwtAuthGuard,
    RolesGuard,
    PublicJobsGhostModeGuard,
    OptionalJwtAuthGuard,
  ],
})
export class JobsModule {}
