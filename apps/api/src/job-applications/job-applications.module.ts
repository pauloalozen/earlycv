import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { DatabaseModule } from "../database/database.module";
import { InterviewPrepAiService } from "./interview-prep-ai.service";
import { JobApplicationInterviewPrepService } from "./interview-prep.service";
import { JobApplicationsController } from "./job-applications.controller";
import { JobApplicationsService } from "./job-applications.service";

@Module({
  imports: [DatabaseModule],
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
