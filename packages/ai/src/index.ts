import OpenAI from "openai";

import type { OpenAIClientConfig } from "./types.js";

export const aiProviders = ["openai"] as const;
export const defaultAIProvider = aiProviders[0];

export function createOpenAIClient(config: OpenAIClientConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
    project: config.project,
    timeout: config.timeout,
  });
}

export type {
  CvAdaptationInput,
  CvAdaptationOutput,
  CvAnalysisOutput,
  CvSection,
  CvSectionItem,
  JobRequirementCoverage,
  JobRequirementDimension,
  JobRequirementGateLevel,
  JobRequirementImportance,
  RequirementAdaptationAction,
  RequirementCoverageStatus,
  StructuredJobRequirement,
} from "./cv-adaptation.js";
export {
  adaptCv,
  analyzeAndAdaptCv,
  CV_ANALYSIS_PROMPT_VERSION,
} from "./cv-adaptation.js";
export type { CanonicalJobJson } from "./job-canonicalization.js";
export {
  canonicalizeJobDescription,
  JOB_CANONICALIZATION_PROMPT_VERSION,
} from "./job-canonicalization.js";
export {
  type CanonicalProfile,
  type ExtractionCoverage,
  extractMasterCvCanonicalProfile,
  type FieldStatus,
  type MasterCvCanonicalExtractionInput,
  type MasterCvCanonicalExtractionOutput,
} from "./master-cv-canonical-extraction.js";
export {
  extractTextFromPdf,
  NotACvError,
  PasswordProtectedPdfError,
  ScannedPdfError,
} from "./pdf-parser.js";
export type {
  AIAuditRecord,
  AIGenerationRequest,
  AIGenerationResult,
  AIProvider,
  OpenAIClientConfig,
} from "./types.js";
