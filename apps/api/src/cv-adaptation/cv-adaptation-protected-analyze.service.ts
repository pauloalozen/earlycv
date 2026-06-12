import { Inject, Injectable } from "@nestjs/common";

import {
  AnalysisProtectionFacade,
  type ProtectedAnalysisResult,
} from "../analysis-protection/analysis-protection.facade";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
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
  payload: TPayload;
  turnstileToken?: string | null;
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

type ProtectedBuildPaidCvOutputInput<TPayload> = {
  companyName?: string;
  context: AnalysisRequestContext & { routeKey: string };
  jobDescriptionText: string;
  jobTitle?: string;
  masterCvText: string;
  requirementCoverage?: JobRequirementCoverage[];
  selectedMissingKeywords?: string[];
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

  async executeProtectedAnalyze<TPayload>(
    input: ProtectedAnalyzeInput<TPayload>,
  ): Promise<ProtectedAnalysisResult<ProtectedAnalyzeOutput>> {
    return this.analysisProtectionFacade.executeProtectedAnalysis(
      {
        payload: input.payload,
        turnstileToken: input.turnstileToken,
      },
      input.context,
      async () => {
        const masterCvText = await input.loadMasterCvText();
        const result = await this.aiService.analyzeAndAdaptDirect({
          masterCvText,
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
        return this.aiService.buildPaidCvOutputFromGuest({
          companyName: input.companyName,
          jobDescriptionText: input.jobDescriptionText,
          jobTitle: input.jobTitle,
          masterCvText: input.masterCvText,
          requirementCoverage: input.requirementCoverage,
          selectedMissingKeywords: input.selectedMissingKeywords,
        });
      },
    );
  }
}
