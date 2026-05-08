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
} from "./cv-adaptation.js";
export { adaptCv, analyzeAndAdaptCv } from "./cv-adaptation.js";
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
