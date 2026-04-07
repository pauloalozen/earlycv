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
    // TODO: reativar chamada real à OpenAI após testes de pagamento
    if (process.env.SKIP_AI === "true") {
      const stubOutput = {
        summary: masterCvText.slice(0, 300),
        sections: [
          {
            sectionType: "other",
            title: "Conteúdo Original",
            items: [
              {
                heading: "CV enviado",
                bullets: masterCvText
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l) => l.length > 0)
                  .slice(0, 20),
              },
            ],
          },
        ],
        highlightedSkills: [],
        removedSections: [],
      };

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "awaiting_payment",
          adaptedContentJson: stubOutput as unknown as Prisma.InputJsonValue,
          previewText: masterCvText.slice(0, 200),
        },
      });
      return;
    }

    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const { adaptCv } = await import("@earlycv/ai");

      // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard between CJS/ESM resolutions
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
