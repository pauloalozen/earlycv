import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { DatabaseModule } from "../database/database.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";

import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CvAdaptationController],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    CvAdaptationPdfService,
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
