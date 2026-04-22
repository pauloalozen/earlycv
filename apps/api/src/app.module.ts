import { Module } from "@nestjs/common";

import { AdminProfilesModule } from "./admin-profiles/admin-profiles.module";
import { AdminResumesModule } from "./admin-resumes/admin-resumes.module";
import { AdminUsersModule } from "./admin-users/admin-users.module";
import { AnalysisObservabilityModule } from "./analysis-observability/analysis-observability.module";
import { AnalysisProtectionModule } from "./analysis-protection/analysis-protection.module";
import { AuthModule } from "./auth/auth.module";
import { CompaniesModule } from "./companies/companies.module";
import { EnvModule } from "./config/env.module";
import { CvAdaptationModule } from "./cv-adaptation/cv-adaptation.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { InfraModule } from "./infra/infra.module";
import { JobSourcesModule } from "./job-sources/job-sources.module";
import { JobsModule } from "./jobs/jobs.module";
import { PlansModule } from "./plans/plans.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { ResumeTemplatesModule } from "./resume-templates/resume-templates.module";
import { ResumesModule } from "./resumes/resumes.module";
import { StorageModule } from "./storage/storage.module";
import { SuperadminStaffModule } from "./superadmin-staff/superadmin-staff.module";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    InfraModule,
    StorageModule,
    HealthModule,
    AuthModule,
    AdminUsersModule,
    AdminProfilesModule,
    AdminResumesModule,
    ProfilesModule,
    ResumesModule,
    ResumeTemplatesModule,
    SuperadminStaffModule,
    CompaniesModule,
    JobSourcesModule,
    JobsModule,
    AnalysisProtectionModule,
    AnalysisObservabilityModule,
    CvAdaptationModule,
    PlansModule,
  ],
})
export class AppModule {}
