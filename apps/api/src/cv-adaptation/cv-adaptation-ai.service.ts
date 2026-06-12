import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { DatabaseService } from "../database/database.service";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";
import type {
  JobRequirementCoverage,
  StructuredJobRequirement,
} from "./dto/job-requirement.types";

type AnalyzeJobFitInput = {
  masterCvText: string;
  jobDescriptionText: string;
  canonicalJobJson: unknown;
  existingRequirements?: StructuredJobRequirement[];
  existingKeywordRule?: {
    presentes: Array<{ kw: string; pontos: number }>;
    possiveis: Array<{ kw: string; pontos: number }>;
    ausentes: Array<{ kw: string; pontos: number }>;
  };
};

type AnalyzeJobFitResult = {
  adaptedContentJson: unknown;
  previewText: string;
  structuredRequirements: StructuredJobRequirement[];
  analysisModel: string;
  analysisPromptVersion: string;
};

@Injectable()
export class CvAdaptationAiService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
  ) {}

  async analyzeAndAdaptDirect(
    input: AnalyzeJobFitInput,
  ): Promise<AnalyzeJobFitResult> {
    if (process.env.SKIP_AI === "true") {
      const stubOutput = {
        vaga: {
          cargo: "Cargo não identificado (stub)",
          empresa: "Empresa não identificada (stub)",
        },
        requirements: [
          {
            requirementKey: "experiencia-analise-dados",
            requirementText:
              "Experiência com análise de dados aplicada ao contexto da vaga",
            importance: "high",
            coverageStatus: "partial",
            evidence: ["Resumo profissional com foco em análise de dados"],
            gapExplanation:
              "A experiência aparece, mas com pouca profundidade.",
            recommendation:
              "Destacar melhor entregas reais com análise de dados se isso for verdadeiro.",
            impactScore: 18,
          },
        ],
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
          antes: input.masterCvText.slice(0, 200),
          depois: input.masterCvText.slice(0, 200),
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
        structuredRequirements: stubOutput.requirements.map((requirement) => ({
          requirementKey: requirement.requirementKey,
          requirementText: requirement.requirementText,
          importance:
            requirement.importance as StructuredJobRequirement["importance"],
        })),
        analysisModel: "stub",
        analysisPromptVersion: "stub",
      };
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const { analyzeAndAdaptCv, CV_ANALYSIS_PROMPT_VERSION } = await import(
      "@earlycv/ai"
    );
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard between CJS/ESM resolutions
    const output = await analyzeAndAdaptCv(this.aiClient as any, model, {
      masterCvText: input.masterCvText,
      jobDescriptionText: input.jobDescriptionText,
      canonicalJobJson: input.canonicalJobJson,
      existingRequirements: input.existingRequirements,
      existingKeywordRule: input.existingKeywordRule,
    });

    return {
      adaptedContentJson: output,
      previewText: output.fit.headline,
      structuredRequirements: output.requirements.map((requirement) => ({
        requirementKey: requirement.requirementKey,
        requirementText: requirement.requirementText,
        importance: requirement.importance,
        dimension: requirement.dimension,
        gateLevel: requirement.gateLevel,
      })),
      analysisModel: model,
      analysisPromptVersion: CV_ANALYSIS_PROMPT_VERSION,
    };
  }

  async buildPaidCvOutputFromGuest(input: {
    masterCvText: string;
    jobDescriptionText: string;
    selectedMissingKeywords?: string[];
    jobTitle?: string;
    companyName?: string;
    requirementCoverage?: JobRequirementCoverage[];
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
        requirementAdaptationActions:
          input.requirementCoverage?.map((r) => ({
            requirementKey: r.requirementKey,
            action: "not_addressed" as const,
            whereChanged: [],
            reason: "SKIP_AI mode active — no real adaptation performed.",
            truthfulnessRisk: "low" as const,
          })) ?? [],
      };
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const { adaptCv } = await import("@earlycv/ai");
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard between CJS/ESM resolutions
    const { output } = await adaptCv(this.aiClient as any, model, {
      masterCvText: input.masterCvText,
      jobDescriptionText: input.jobDescriptionText,
      selectedKeywords: input.selectedMissingKeywords,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      requirementCoverage: input.requirementCoverage,
    });

    return output as CvAdaptationOutput;
  }

  async analyzeAndAdapt(
    adaptation: {
      id: string;
      jobDescriptionText: string;
      selectedMissingKeywords?: string[];
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
        selectedKeywords: adaptation.selectedMissingKeywords,
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
