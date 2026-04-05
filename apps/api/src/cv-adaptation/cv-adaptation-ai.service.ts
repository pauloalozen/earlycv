import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class CvAdaptationAiService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
  ) {}

  async analyzeAndAdapt(
    adaptation: {
      id: string;
      jobDescriptionText: string;
      jobTitle?: string | null;
      companyName?: string | null;
    },
    masterCvText: string,
  ): Promise<void> {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const { adaptCv } = await import("@earlycv/ai");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { output, audit } = await adaptCv(this.aiClient as any, model, {
        masterCvText,
        jobDescriptionText: adaptation.jobDescriptionText,
        jobTitle: adaptation.jobTitle || undefined,
        companyName: adaptation.companyName || undefined,
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
