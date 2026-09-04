import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { DatabaseModule } from "../database/database.module";
import { JobApplicationsModule } from "../job-applications/job-applications.module";
import { RadarModule } from "../radar/radar.module";
import { SavedJobsController } from "./saved-jobs.controller";
import { SavedJobsService } from "./saved-jobs.service";

@Module({
  imports: [
    DatabaseModule,
    RadarModule,
    JobApplicationsModule,
    AnalysisObservabilityModule,
  ],
  controllers: [SavedJobsController],
  providers: [SavedJobsService],
  exports: [SavedJobsService],
})
export class SavedJobsModule {}
