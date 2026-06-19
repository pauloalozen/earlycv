import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { DatabaseModule } from "../database/database.module";
import { JobApplicationInterviewPrepService } from "./interview-prep.service";
import { InterviewPrepAiService } from "./interview-prep-ai.service";
import { JobApplicationsController } from "./job-applications.controller";
import { JobApplicationsService } from "./job-applications.service";

@Module({
  imports: [DatabaseModule, AnalysisObservabilityModule],
  controllers: [JobApplicationsController],
  providers: [
    JobApplicationsService,
    InterviewPrepAiService,
    JobApplicationInterviewPrepService,
    {
      provide: "OPENAI_CLIENT",
      useFactory: () =>
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        }),
    },
  ],
  exports: [JobApplicationsService],
})
export class JobApplicationsModule {}
