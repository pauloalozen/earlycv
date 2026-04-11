import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { DatabaseService } from "../database/database.service";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";

@Injectable()
export class CvAdaptationAiService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
  ) {}

  async analyzeAndAdaptDirect(
    masterCvText: string,
    jobDescriptionText: string,
  ): Promise<{ adaptedContentJson: unknown; previewText: string }> {
    if (process.env.SKIP_AI === "true") {
      const stubOutput = {
        vaga: {
          cargo: "Cargo não identificado (stub)",
          empresa: "Empresa não identificada (stub)",
        },
        fit: {
          score: 72,
          categoria: "medio",
          headline: "CV não está posicionado para esta vaga (stub)",
          subheadline: "Modo stub ativo — integração com IA desativada.",
        },
        comparacao: {
          antes: "CV genérico sem foco na vaga",
          depois: "CV adaptado com palavras-chave da vaga",
        },
        pontos_fortes: ["CV enviado com sucesso (stub)"],
        lacunas: ["Integração real com IA desativada (SKIP_AI=true)"],
        melhorias_aplicadas: ["Nenhuma melhoria aplicada no modo stub"],
        ats_keywords: { presentes: [], ausentes: [] },
        preview: {
          antes: masterCvText.slice(0, 200),
          depois: masterCvText.slice(0, 200),
        },
        projecao_melhoria: {
          score_atual: 72,
          score_pos_otimizacao: 85,
          explicacao_curta: "Stub: melhoria simulada após otimização.",
        },
        mensagem_venda: {
          titulo: "Seu CV já está otimizado para esta vaga",
          subtexto: "Desbloqueie para aumentar suas chances de entrevista",
        },
      };
      return {
        adaptedContentJson: stubOutput,
        previewText: stubOutput.fit.headline,
      };
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const { analyzeAndAdaptCv } = await import("@earlycv/ai");
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard between CJS/ESM resolutions
    const output = await analyzeAndAdaptCv(this.aiClient as any, model, {
      masterCvText,
      jobDescriptionText,
    });

    return {
      adaptedContentJson: output,
      previewText: output.fit.headline,
    };
  }

  async buildPaidCvOutputFromGuest(input: {
    masterCvText: string;
    jobDescriptionText: string;
    jobTitle?: string;
    companyName?: string;
  }): Promise<CvAdaptationOutput> {
    if (process.env.SKIP_AI === "true") {
      return {
        summary: input.masterCvText.slice(0, 300),
        sections: [
          {
            sectionType: "other",
            title: "Conteúdo Original",
            items: [
              {
                heading: "CV enviado",
                bullets: input.masterCvText
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .slice(0, 20),
              },
            ],
          },
        ],
        highlightedSkills: [],
        removedSections: [],
      };
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const { adaptCv } = await import("@earlycv/ai");
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard between CJS/ESM resolutions
    const { output } = await adaptCv(this.aiClient as any, model, {
      masterCvText: input.masterCvText,
      jobDescriptionText: input.jobDescriptionText,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
    });

    return output as CvAdaptationOutput;
  }

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
