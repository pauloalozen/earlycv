import type { Request } from "express";

export type AnalysisRequestContext = {
  requestId: string;
  correlationId: string;
  sessionPublicToken: string | null;
  sessionInternalId: string | null;
  userId: string | null;
  ip: string | null;
};

export const ANALYSIS_NOW = "ANALYSIS_NOW";
export const ANALYSIS_FETCH = "ANALYSIS_FETCH";

declare module "express-serve-static-core" {
  interface Request {
    analysisContext: AnalysisRequestContext;
  }
}

export type AnalysisRequest = Request & {
  analysisContext: AnalysisRequestContext;
};
