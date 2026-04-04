import { adaptCv } from "@earlycv/ai";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class CvAdaptationAiService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async analyzeAndAdapt(
    adaptation: {
      id: string;
      jobDescriptionText: string;
      jobTitle?: string;
      companyName?: string;
    },
    masterCvText: string,
  ): Promise<void> {
    try {
      const model = this.config.get<string>("OPENAI_MODEL") || "gpt-4-mini";

      const { output, audit } = await adaptCv(this.aiClient, model, {
        masterCvText,
        jobDescriptionText: adaptation.jobDescriptionText,
        jobTitle: adaptation.jobTitle,
        companyName: adaptation.companyName,
      });

      const previewText = output.summary.slice(0, 200);

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "awaiting_payment",
          adaptedContentJson: output as unknown as Prisma.InputJsonValue,
          previewText,
          aiAuditJson: audit as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Unknown AI error";

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "failed",
          failureReason,
        },
      });
    }
  }
}
