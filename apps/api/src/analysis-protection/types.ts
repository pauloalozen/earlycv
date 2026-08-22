import type { Request } from "express";

export type AnalysisRequestContext = {
  requestId: string;
  correlationId: string;
  sessionPublicToken: string | null;
  sessionInternalId: string | null;
  posthogSessionId?: string | null;
  // UUID de jornada do frontend (sessionStorage: journey_session_internal_id),
  // recebido via header x-session-internal-id. Conceito DISTINTO de
  // sessionInternalId acima (que tem FK pra AnalysisSession) — nunca escrever
  // este valor na coluna sessionInternalId de BusinessFunnelEvent, sempre em
  // metadata.sessionInternalId. Ver docs/runbook/events.md seção 2.
  journeySessionInternalId?: string | null;
  // visitor_id: identificador pseudônimo persistente de navegador (Fase C),
  // recebido via header x-visitor-id. Conceito independente de
  // sessionInternalId/journeySessionInternalId (jornada funcional) e de
  // userId (conta autenticada) — representa o navegador/storage, nunca uma
  // pessoa. Ver docs/runbook/events.md, seção "Identity model".
  visitorId?: string | null;
  userId: string | null;
  ip: string | null;
  routePath: string | null;
  userAgentHash: string | null;
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
