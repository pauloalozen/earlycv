import { Module } from "@nestjs/common";
import { AnalysisProtectionModule } from "../analysis-protection/analysis-protection.module";
import { createAiClientFromEnv } from "../common/ai-client-factory";
import { DatabaseModule } from "../database/database.module";
import { JobApplicationsModule } from "../job-applications/job-applications.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { ResumeTemplatesModule } from "../resume-templates/resume-templates.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";
import { CvAdaptationProtectedAnalyzeService } from "./cv-adaptation-protected-analyze.service";
import { CvAdaptationPublicController } from "./cv-adaptation-public.controller";
import { CvAdaptationSnapshotCleanupScheduler } from "./cv-adaptation-snapshot-cleanup.scheduler";
import { JobCanonicalizationService } from "./job-canonicalization.service";
import { JobRequirementSetsService } from "./job-requirement-sets.service";

@Module({
  imports: [
    DatabaseModule,
    ResumeTemplatesModule,
    AnalysisProtectionModule,
    JobApplicationsModule,
    ProfilesModule,
  ],
  controllers: [CvAdaptationController, CvAdaptationPublicController],
  exports: [CvAdaptationService, CvAdaptationAiService],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    CvAdaptationPdfService,
    CvAdaptationDocxService,
    CvAdaptationProtectedAnalyzeService,
    CvAdaptationSnapshotCleanupScheduler,
    JobCanonicalizationService,
    JobRequirementSetsService,
    {
      provide: "CV_ANALYSIS_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("ANALYSIS"),
    },
    {
      provide: "CV_GENERATION_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("CV_GENERATION"),
    },
    {
      provide: "JOB_CANONICALIZATION_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("JOB_CANONICALIZATION"),
    },
  ],
})
export class CvAdaptationModule {}
