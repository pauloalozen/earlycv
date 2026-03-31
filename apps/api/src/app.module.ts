import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { CompaniesModule } from "./companies/companies.module";
import { EnvModule } from "./config/env.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { InfraModule } from "./infra/infra.module";
import { JobSourcesModule } from "./job-sources/job-sources.module";
import { JobsModule } from "./jobs/jobs.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { ResumesModule } from "./resumes/resumes.module";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    InfraModule,
    HealthModule,
    AuthModule,
    ProfilesModule,
    ResumesModule,
    CompaniesModule,
    JobSourcesModule,
    JobsModule,
  ],
})
export class AppModule {}
