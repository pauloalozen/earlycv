import { Module } from "@nestjs/common";
import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { createAiClientFromEnv } from "../common/ai-client-factory";
import { DatabaseModule } from "../database/database.module";
import { JobApplicationCoverLetterService } from "./cover-letter.service";
import { CoverLetterAiService } from "./cover-letter-ai.service";
import { CoverLetterDocxService } from "./cover-letter-docx.service";
import { CoverLetterPdfService } from "./cover-letter-pdf.service";
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
    CoverLetterAiService,
    JobApplicationCoverLetterService,
    CoverLetterPdfService,
    CoverLetterDocxService,
    {
      provide: "INTERVIEW_PREP_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("INTERVIEW_PREP"),
    },
    {
      provide: "COVER_LETTER_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("COVER_LETTER"),
    },
  ],
  exports: [JobApplicationsService],
})
export class JobApplicationsModule {}
