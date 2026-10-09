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
import { InternalJobsController } from "./internal-jobs.controller";
import { JobLifecycleModule } from "./job-lifecycle.module";
import { JobReviewService } from "./job-review.service";
import { JobReviewAdminController } from "./job-review-admin.controller";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { PublicJobsController } from "./public-jobs.controller";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";
import { RadarLandingsService } from "./radar-landings.service";

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    CompaniesModule,
    JobApplicationsModule,
    JobLifecycleModule,
    JobSourcesModule,
    RadarModule,
    SavedJobsModule,
  ],
  controllers: [
    JobsController,
    PublicJobsController,
    InternalJobsController,
    JobReviewAdminController,
  ],
  providers: [
    JobsService,
    JobReviewService,
    RadarLandingsService,
    JwtAuthGuard,
    RolesGuard,
    PublicJobsGhostModeGuard,
    OptionalJwtAuthGuard,
  ],
})
export class JobsModule {}
