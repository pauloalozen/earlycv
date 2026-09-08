import { Inject, Injectable } from "@nestjs/common";

import {
  AnalysisProtectionFacade,
  type ProtectedAnalysisResult,
} from "../analysis-protection/analysis-protection.facade";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import type { CanonicalCvProfileData } from "./cv-adaptation-ai.service";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";
import type {
  JobRequirementCoverage,
  StructuredJobRequirement,
} from "./dto/job-requirement.types";

type ProtectedAnalyzeInput<TPayload> = {
  canonicalJobJson: unknown;
  context: AnalysisRequestContext & { routeKey: string };
  existingRequirements?: StructuredJobRequirement[];
  existingKeywordRule?: {
    presentes: Array<{ kw: string; pontos: number }>;
    possiveis: Array<{ kw: string; pontos: number }>;
    ausentes: Array<{ kw: string; pontos: number }>;
  };
  jobDescriptionText: string;
  loadMasterCvText: () => Promise<string>;
  // Pipeline canônico: quando o chamador já tem um CvStructuredProfile
  // READY, passa o perfil estruturado aqui — a IA de análise recebe
  // canonicalCvProfile em vez do texto de loadMasterCvText() (nunca os
  // dois juntos). loadMasterCvText() continua sendo chamado de qualquer
  // forma: o texto ainda alimenta AnalysisCvSnapshot/AnalysisJob.masterCvText
  // (trilha de auditoria/histórico, fora de escopo desta correção — só o
  // que vai pro PROMPT da IA muda).
  canonicalCvProfile?: CanonicalCvProfileData;
  payload: TPayload;
  turnstileToken?: string | null;
  // Fase 2C (pipeline canônico): a análise passa a rodar num worker
  // separado, depois da resposta HTTP original — o turnstile já foi
  // verificado uma única vez no entrypoint (precheckTurnstile), então o
  // token (de uso único/curto) não pode ser reapresentado aqui. Mesmo
  // padrão já usado por executeProtectedBuildPaidCvOutputFromGuest.
  skipTurnstile?: boolean;
};

type ProtectedAnalyzeOutput = {
  adaptedContentJson: unknown;
  analysisModel: string;
  analysisPromptVersion: string;
  masterCvText: string;
  previewText: string;
  structuredRequirements: StructuredJobRequirement[];
};

type ProtectedAnalyzeAndPersistInput<TPayload> = {
  adaptation: {
    companyName?: string | null;
    id: string;
    jobDescriptionText: string;
    selectedMissingKeywords?: string[];
    jobTitle?: string | null;
  };
  context: AnalysisRequestContext & { routeKey: string };
  masterCvText: string;
  payload: TPayload;
  turnstileToken?: string | null;
};

// masterCvText/canonicalCvProfile mutuamente exclusivos — mesma garantia de
// ProtectedAnalyzeInput.canonicalCvProfile, aplicada à geração.
type ProtectedBuildPaidCvOutputInput<TPayload> = (
  | { masterCvText: string; canonicalCvProfile?: undefined }
  | { masterCvText?: undefined; canonicalCvProfile: CanonicalCvProfileData }
) & {
  companyName?: string;
  context: AnalysisRequestContext & { routeKey: string };
  jobDescriptionText: string;
  jobTitle?: string;
  requirementCoverage?: JobRequirementCoverage[];
  selectedMissingKeywords?: string[];
  ajustesConteudo?: Array<{
    id: string;
    titulo: string;
    categoria: "keywords_incluidas" | "texto_reescrito" | "ajuste_conteudo";
  }>;
  payload: TPayload;
};

@Injectable()
export class CvAdaptationProtectedAnalyzeService {
  constructor(
    @Inject(AnalysisProtectionFacade)
    private readonly analysisProtectionFacade: AnalysisProtectionFacade,
    @Inject(CvAdaptationAiService)
    private readonly aiService: CvAdaptationAiService,
  ) {}

  async precheckTurnstile(
    input: { turnstileToken?: string | null },
    context: AnalysisRequestContext & { routeKey?: string | null },
  ) {
    return this.analysisProtectionFacade.precheckTurnstile(
      { turnstileToken: input.turnstileToken },
      context,
    );
  }

  async executeProtectedAnalyze<TPayload>(
    input: ProtectedAnalyzeInput<TPayload>,
  ): Promise<ProtectedAnalysisResult<ProtectedAnalyzeOutput>> {
    return this.analysisProtectionFacade.executeProtectedAnalysis(
      {
        payload: input.payload,
        skipTurnstile: input.skipTurnstile ?? false,
        turnstileToken: input.turnstileToken,
      },
      input.context,
      async () => {
        const masterCvText = await input.loadMasterCvText();
        // canonicalCvProfile (quando presente) é o que vai pro PROMPT da
        // IA — masterCvText, carregado de qualquer forma acima, só alimenta
        // o retorno/trilha de auditoria (AnalysisCvSnapshot/AnalysisJob.
        // masterCvText), nunca os dois juntos no prompt.
        const cvSourceInput =
          input.canonicalCvProfile !== undefined
            ? { canonicalCvProfile: input.canonicalCvProfile }
            : { masterCvText };
        const result = await this.aiService.analyzeAndAdaptDirect({
          ...cvSourceInput,
          jobDescriptionText: input.jobDescriptionText,
          canonicalJobJson: input.canonicalJobJson,
          existingRequirements: input.existingRequirements,
          existingKeywordRule: input.existingKeywordRule,
        });

        return {
          ...result,
          masterCvText,
        };
      },
    );
  }

  async executeProtectedAnalyzeAndPersist<TPayload>(
    input: ProtectedAnalyzeAndPersistInput<TPayload>,
  ): Promise<ProtectedAnalysisResult<void>> {
    return this.analysisProtectionFacade.executeProtectedAnalysis(
      {
        payload: input.payload,
        turnstileToken: input.turnstileToken,
      },
      input.context,
      async () => {
        await this.aiService.analyzeAndAdapt(
          input.adaptation,
          input.masterCvText,
        );
      },
    );
  }

  async executeProtectedBuildPaidCvOutputFromGuest<TPayload>(
    input: ProtectedBuildPaidCvOutputInput<TPayload>,
  ): Promise<ProtectedAnalysisResult<CvAdaptationOutput>> {
    return this.analysisProtectionFacade.executeProtectedAnalysis(
      {
        payload: input.payload,
        skipTurnstile: true,
        turnstileToken: null,
      },
      input.context,
      async () => {
        const cvSourceInput =
          input.canonicalCvProfile !== undefined
            ? { canonicalCvProfile: input.canonicalCvProfile }
            : { masterCvText: input.masterCvText };
        return this.aiService.buildPaidCvOutputFromGuest({
          ...cvSourceInput,
          companyName: input.companyName,
          jobDescriptionText: input.jobDescriptionText,
          jobTitle: input.jobTitle,
          requirementCoverage: input.requirementCoverage,
          selectedMissingKeywords: input.selectedMissingKeywords,
          ajustesConteudo: input.ajustesConteudo,
        });
      },
    );
  }
}
