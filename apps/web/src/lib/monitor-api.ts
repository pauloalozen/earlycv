"use server";

import { apiRequest } from "./api-request";
import type { PublicJob } from "./public-jobs-api";

export type MonitorProfileStatus = "INITIALIZING" | "ACTIVE" | "REFRESHING";

// Espelha UserRadarProfile (packages/database/prisma/schema.prisma) — o
// Meu Monitor sempre opera sobre esse model, nunca cria um perfil próprio.
// GET/PUT /monitor/profile são aliases finos sobre RadarController/
// UserRadarProfileService, mas o PUT aqui (diferente de /radar/profile)
// também dispara o rematch do Monitor — por isso este client NUNCA deve
// ser trocado por getMyRadarProfile/updateMyRadarProfile de radar-api.ts.
export type MonitorProfile = {
  id: string;
  userId: string;
  areas: string[];
  seniority: string;
  skills: string[];
  technologies: string[];
  languages: string[];
  certifications: string[];
  preferredWorkModels: string[];
  preferredContractTypes: string[];
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  sourceResumeId: string | null;
  generatedAt: string;
  updatedAt: string;
  monitorStatus: MonitorProfileStatus;
  lastMatchedAt: string | null;
};

export type MonitorRecommendationFeedback = "POSITIVE" | "NEGATIVE";
export type MonitorRecommendationFeedbackReason =
  | "TITLE_MISMATCH"
  | "AREA_MISMATCH"
  | "SENIORITY_MISMATCH"
  | "LOCATION_MISMATCH"
  | "COMPANY_MISMATCH"
  | "OTHER";

export type MonitorRecommendationItem = {
  recommendationId: string;
  score: number;
  opportunityLevel: number;
  recommendedAt: string;
  viewedAt: string | null;
  dismissedAt: string | null;
  isNew: boolean;
  feedback: MonitorRecommendationFeedback | null;
  feedbackReason: MonitorRecommendationFeedbackReason | null;
  job: PublicJob;
};

export type MonitorFeed = {
  items: MonitorRecommendationItem[];
  total: number;
  page: number;
  limit: number;
  monitorStatus: MonitorProfileStatus;
};

// Histórico de notificações ("Alerta de Vaga Certa" na UI) — um grupo por
// e-mail efetivamente enviado (MonitorDigest com status SENT), mais
// recente primeiro. `frequency` só existe no payload/analytics, nunca é
// exibido no header do grupo (ver monitor-notification-group.tsx).
export type MonitorNotificationGroup = {
  digestId: string;
  sentAt: string;
  frequency: MonitorAlertFrequency;
  items: MonitorRecommendationItem[];
  total: number;
};

export type MonitorNotificationsFeed = {
  pending: { items: MonitorRecommendationItem[]; total: number; hasMore: boolean } | null;
  groups: MonitorNotificationGroup[];
  page: number;
  limit: number;
  totalGroups: number;
  hasMore: boolean;
  nextPage: number | null;
  monitorStatus: MonitorProfileStatus;
};

export type MonitorCount = {
  count: number;
  monitorStatus: MonitorProfileStatus;
};

const EMPTY_FEED: MonitorFeed = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  monitorStatus: "INITIALIZING",
};

// Único ponto que o frontend deve consultar pra saber se o usuário tem
// acesso ao Meu Monitor — NENHUM outro componente deve inspecionar
// plano/assinatura diretamente. Hoje a política de lançamento sempre
// libera (allowed=true); "reason" existe desde já pra permitir, no
// futuro, diferenciar gratuito/trial/assinante/promocional/bloqueado sem
// mudar o contrato — ver MonitorEntitlementService no backend.
export type MonitorAccessReason =
  | "launch_access"
  | "manual_override"
  | "trial"
  | "active_subscription"
  | "none";

export type MonitorAccess = {
  allowed: boolean;
  reason: MonitorAccessReason;
};

export async function getMonitorAccess(): Promise<MonitorAccess> {
  try {
    const response = await apiRequest("GET", "/monitor/access");
    if (!response.ok) return { allowed: false, reason: "none" };
    return (await response.json()) as MonitorAccess;
  } catch {
    return { allowed: false, reason: "none" };
  }
}

export async function getMonitorProfile(): Promise<MonitorProfile | null> {
  try {
    const response = await apiRequest("GET", "/monitor/profile");
    if (!response.ok) return null;
    const body = (await response.json()) as MonitorProfile | null;
    return body ?? null;
  } catch {
    return null;
  }
}

export async function updateMonitorProfile(input: {
  areas?: string[];
  seniority?: string;
  preferredWorkModels?: string[];
  preferredContractTypes?: string[];
}): Promise<MonitorProfile | null> {
  try {
    const response = await apiRequest("PUT", "/monitor/profile", input);
    if (!response.ok) return null;
    return (await response.json()) as MonitorProfile;
  } catch {
    return null;
  }
}

export type MonitorSort = "score" | "recent";

// GET /monitor exclusivamente — nunca completa com /public/jobs. Ausência
// de resultado (items: []) com monitorStatus ACTIVE é um estado válido do
// produto, não um erro/fallback. `level` filtra por nível de oportunidade
// (0-5) — usado pela paginação por seção da UI (MonitorLevelSection).
export async function listMonitorRecommendations(
  page = 1,
  limit = 20,
  includeDismissed = false,
  level?: number,
  sort: MonitorSort = "score",
  excludeAnalyzed = false,
): Promise<MonitorFeed> {
  try {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    });
    if (includeDismissed) qs.set("includeDismissed", "true");
    if (level !== undefined) qs.set("level", String(level));
    if (excludeAnalyzed) qs.set("excludeAnalyzed", "true");
    const response = await apiRequest("GET", `/monitor?${qs}`);
    if (!response.ok) return { ...EMPTY_FEED, page, limit };
    return (await response.json()) as MonitorFeed;
  } catch {
    return { ...EMPTY_FEED, page, limit };
  }
}

const EMPTY_NOTIFICATIONS_FEED: MonitorNotificationsFeed = {
  pending: null,
  groups: [],
  page: 1,
  limit: 10,
  totalGroups: 0,
  hasMore: false,
  nextPage: null,
  monitorStatus: "INITIALIZING",
};

// GET /monitor/notifications — histórico agrupado por envio. Página 1
// também traz o bucket "novas vagas encontradas" (pending); páginas
// seguintes só trazem mais grupos enviados (pending vem null).
export async function listMonitorNotifications(
  page = 1,
  limit = 10,
  pendingLimit?: number,
): Promise<MonitorNotificationsFeed> {
  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (pendingLimit !== undefined) qs.set("pendingLimit", String(pendingLimit));
    const response = await apiRequest("GET", `/monitor/notifications?${qs}`);
    if (!response.ok) return { ...EMPTY_NOTIFICATIONS_FEED, page, limit };
    return (await response.json()) as MonitorNotificationsFeed;
  } catch {
    return { ...EMPTY_NOTIFICATIONS_FEED, page, limit };
  }
}

export async function getMonitorCount(): Promise<MonitorCount> {
  try {
    const response = await apiRequest("GET", "/monitor/count");
    if (!response.ok) {
      return { count: 0, monitorStatus: "INITIALIZING" };
    }
    return (await response.json()) as MonitorCount;
  } catch {
    return { count: 0, monitorStatus: "INITIALIZING" };
  }
}

export async function markRecommendationViewed(
  recommendationId: string,
): Promise<boolean> {
  try {
    const response = await apiRequest(
      "PATCH",
      `/monitor/${recommendationId}/viewed`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function dismissRecommendation(
  recommendationId: string,
): Promise<boolean> {
  try {
    const response = await apiRequest(
      "PATCH",
      `/monitor/${recommendationId}/dismiss`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function submitRecommendationFeedback(
  recommendationId: string,
  feedback: MonitorRecommendationFeedback,
  feedbackReason?: MonitorRecommendationFeedbackReason,
): Promise<boolean> {
  try {
    const response = await apiRequest(
      "PATCH",
      `/monitor/${recommendationId}/feedback`,
      { feedback, ...(feedbackReason ? { feedbackReason } : {}) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Seção "Alertas" do Meu Monitor — preferência de e-mail, conceito
// distinto do perfil de matching (GET/PUT /monitor/profile acima).
export type MonitorAlertFrequency = "DAILY" | "WEEKLY" | "OFF";

export type MonitorAlertPreference = {
  userId: string;
  emailEnabled: boolean;
  frequency: MonitorAlertFrequency;
  unsubscribedAt: string | null;
};

export async function getMonitorAlertPreferences(): Promise<MonitorAlertPreference | null> {
  try {
    const response = await apiRequest("GET", "/monitor/alert-preferences");
    if (!response.ok) return null;
    return (await response.json()) as MonitorAlertPreference;
  } catch {
    return null;
  }
}

export async function updateMonitorAlertPreferences(input: {
  emailEnabled?: boolean;
  frequency?: MonitorAlertFrequency;
}): Promise<MonitorAlertPreference | null> {
  try {
    const response = await apiRequest(
      "PUT",
      "/monitor/alert-preferences",
      input,
    );
    if (!response.ok) return null;
    return (await response.json()) as MonitorAlertPreference;
  } catch {
    return null;
  }
}
