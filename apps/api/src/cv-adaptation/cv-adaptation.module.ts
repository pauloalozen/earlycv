import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { DatabaseModule } from "../database/database.module";
import { ResumeTemplatesModule } from "../resume-templates/resume-templates.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";

@Module({
  imports: [DatabaseModule, ResumeTemplatesModule],
  controllers: [CvAdaptationController],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    CvAdaptationPdfService,
    CvAdaptationDocxService,
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
