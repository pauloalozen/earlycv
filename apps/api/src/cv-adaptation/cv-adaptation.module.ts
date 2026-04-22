import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { AnalysisProtectionModule } from "../analysis-protection/analysis-protection.module";
import { DatabaseModule } from "../database/database.module";
import { ResumeTemplatesModule } from "../resume-templates/resume-templates.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";
import { CvAdaptationProtectedAnalyzeService } from "./cv-adaptation-protected-analyze.service";
import { CvAdaptationPublicController } from "./cv-adaptation-public.controller";

@Module({
  imports: [DatabaseModule, ResumeTemplatesModule, AnalysisProtectionModule],
  controllers: [CvAdaptationController, CvAdaptationPublicController],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    CvAdaptationPdfService,
    CvAdaptationDocxService,
    CvAdaptationProtectedAnalyzeService,
    {
      provide: "OPENAI_CLIENT",
      useFactory: () =>
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        }),
    },
  ],
})
export class CvAdaptationModule {}
