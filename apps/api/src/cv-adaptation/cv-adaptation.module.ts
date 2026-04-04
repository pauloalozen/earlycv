import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import { DatabaseModule } from "../database/database.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";

import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CvAdaptationController],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    {
      provide: "OPENAI_CLIENT",
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>("OPENAI_API_KEY");
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY is required for CV adaptation");
        }
        return new OpenAI({ apiKey });
      },
    },
  ],
})
export class CvAdaptationModule {}
