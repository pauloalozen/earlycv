import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type MonitorEntitlementReason =
  | "internal_access"
  | "manual_override"
  | "trial"
  | "active_subscription"
  | "none";

export type MonitorEntitlement = {
  allowed: boolean;
  reason: MonitorEntitlementReason;
};

export type MonitorMatchJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";
export type MonitorDigestStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "SKIPPED"
  | "OUTCOME_UNKNOWN";
export type MonitorDigestEventType =
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "COMPLAINED"
  | "REJECTED";
export type EmailProviderName = "RESEND" | "SES";
export type MonitorProfileStatus = "INITIALIZING" | "ACTIVE" | "REFRESHING";

export type AdminMonitorOverview = {
  usersWithMonitorConfigured: number;
  usersInitializing: number;
  usersActive: number;
  usersRefreshing: number;
  usersWithEntitlement: number;
  recommendations: {
    active: number;
    new: number;
    superseded: number;
    dismissed: number;
  };
  matchJobs: Record<MonitorMatchJobStatus, number>;
  profileMatchJobs: Record<MonitorMatchJobStatus, number>;
};

export type AdminMonitorUserSummary = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  radarProfile: {
    monitorStatus: MonitorProfileStatus;
    lastMatchedAt: string | null;
  } | null;
};

export type AdminMonitorUserDiagnostic = {
  user: { id: string; email: string; name: string; createdAt: string };
  entitlement: MonitorEntitlement;
  monitor: {
    monitorStatus: MonitorProfileStatus;
    lastMatchedAt: string | null;
    matchFingerprint: string | null;
    generatedAt: string;
    updatedAt: string;
    sourceResumeId: string | null;
  } | null;
  profile: {
    fingerprint: {
      areas: string[];
      seniority: string;
      skills: string[];
      technologies: string[];
      languages: string[];
      preferredWorkModels: string[];
    };
    informational: {
      certifications: string[];
      preferredContractTypes: string[];
      openToRelocation: boolean;
      salaryExpectationMin: number | null;
      careerFingerprint: string[];
    };
  } | null;
  profileMatchJob: {
    id: string;
    status: MonitorMatchJobStatus;
    attempts: number;
    lastError: string | null;
    matchedCount: number | null;
    processedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  alertPreference: {
    emailEnabled: boolean;
    frequency: "DAILY" | "WEEKLY" | "OFF";
    unsubscribedAt: string | null;
  } | null;
};

export type AdminMonitorRecommendationItem = {
  id: string;
  userId: string;
  jobId: string;
  score: number;
  opportunityLevel: number;
  recommendedAt: string;
  viewedAt: string | null;
  dismissedAt: string | null;
  supersededAt: string | null;
  feedback: string | null;
  feedbackReason: string | null;
  job: {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    company: { id: string; name: string };
  };
  isSaved: boolean;
  applicationStatus: string | null;
};

export type AdminMonitorRecommendationDetail = {
  recommendation: {
    id: string;
    userId: string;
    user: { id: string; email: string; name: string };
    jobId: string;
    job: { id: string; title: string; slug: string | null; company: string };
    viewedAt: string | null;
    dismissedAt: string | null;
    supersededAt: string | null;
    feedback: string | null;
    feedbackReason: string | null;
  };
  scoreAtRecommendationTime: {
    score: number;
    opportunityLevel: number;
    recommendedAt: string;
    breakdownAvailable: false;
  };
  currentRecalculatedScore: {
    score: number;
    opportunityLevel: number;
    breakdown: Record<string, number>;
    matchedSkills: string[];
    missingSkills: string[];
    matchDetails: unknown;
  } | null;
  recalculationSkippedReason: string | null;
};

export type AdminMonitorJobSummary = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  firstSeenAt: string;
  company: { name: string };
  enrichment: { enrichmentStatus: string; dominantArea: string | null } | null;
};

export type AdminMonitorJobDiagnostic = {
  job: {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    firstSeenAt: string;
    publishedAtSource: string | null;
    company: { id: string; name: string };
  };
  enrichment: Record<string, unknown> | null;
  matchJob: {
    status: MonitorMatchJobStatus;
    attempts: number;
    lastError: string | null;
    matchedCount: number | null;
    processedAt: string | null;
  } | null;
  recommendationStats: {
    total: number;
    byOpportunityLevel: Record<"0" | "1" | "2" | "3" | "4" | "5", number>;
    level3Plus: number;
    viewed: number;
    dismissed: number;
    saved: number;
    applicationsStarted: number;
  };
};

export type AdminMonitorFailures = {
  failedMatchJobs: {
    id: string;
    jobId: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
    job: { id: string; title: string };
  }[];
  failedProfileMatchJobs: {
    id: string;
    userId: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
    user: { id: string; email: string; name: string };
  }[];
  stuckProcessingCounts: {
    matchJobs: number;
    profileMatchJobs: number;
  };
  staleProcessingThresholdMs: number;
  stuckProfiles: {
    userId: string;
    monitorStatus: MonitorProfileStatus;
    updatedAt: string;
    user: { email: string; name: string };
  }[];
  staleMonitorStatusThresholdMs: number;
};

export type AdminMonitorDigest = {
  id: string;
  frequency: "DAILY" | "WEEKLY" | "OFF";
  status: MonitorDigestStatus;
  scheduledFor: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  createdAt: string;
  recommendations: {
    recommendationId: string;
    recommendation: {
      id: string;
      job: { title: string; company: { name: string } };
    };
  }[];
  events: {
    type: MonitorDigestEventType;
    occurredAt: string;
    providerMessageId: string;
  }[];
};

export type AdminMonitorAttributionEvent = {
  eventName: string;
  createdAt: string;
  metadataJson: Record<string, unknown> | null;
};

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

async function resolveToken(token?: string) {
  const sessionToken = token ?? (await getBackofficeSessionToken());
  if (!sessionToken) {
    throw new Error("Missing backoffice session token.");
  }
  return sessionToken;
}

async function apiRequest<T>(path: string, token?: string, init?: RequestInit) {
  const bearerToken = await resolveToken(token);
  const isRead = !init?.method || init.method === "GET";

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    ...(isRead
      ? { cache: "no-store" as const }
      : { cache: "no-store" as const }),
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export function getAdminMonitorOverview(token?: string) {
  return apiRequest<AdminMonitorOverview>("/admin/monitor/overview", token);
}

export function getAdminMonitorFailures(token?: string) {
  return apiRequest<AdminMonitorFailures>("/admin/monitor/failures", token);
}

export function searchAdminMonitorUsers(
  params: { page?: number; limit?: number; query?: string } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.query) qs.set("query", params.query);
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    users: AdminMonitorUserSummary[];
  }>(`/admin/monitor/users${suffix ? `?${suffix}` : ""}`, token);
}

export function getAdminMonitorUserDiagnostic(userId: string, token?: string) {
  return apiRequest<AdminMonitorUserDiagnostic>(
    `/admin/monitor/users/${userId}`,
    token,
  );
}

export function listAdminMonitorUserRecommendations(
  userId: string,
  params: {
    page?: number;
    limit?: number;
    status?: string;
    opportunityLevel?: number;
  } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  if (params.opportunityLevel !== undefined)
    qs.set("opportunityLevel", String(params.opportunityLevel));
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    items: AdminMonitorRecommendationItem[];
  }>(
    `/admin/monitor/users/${userId}/recommendations${suffix ? `?${suffix}` : ""}`,
    token,
  );
}

export function listAdminMonitorUserDigests(
  userId: string,
  params: { page?: number; limit?: number } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    digests: AdminMonitorDigest[];
  }>(
    `/admin/monitor/users/${userId}/digests${suffix ? `?${suffix}` : ""}`,
    token,
  );
}

export function getAdminMonitorUserAttribution(userId: string, token?: string) {
  return apiRequest<{ events: AdminMonitorAttributionEvent[]; caveat: string }>(
    `/admin/monitor/users/${userId}/attribution`,
    token,
  );
}

export function getAdminMonitorRecommendationDetail(
  id: string,
  token?: string,
) {
  return apiRequest<AdminMonitorRecommendationDetail>(
    `/admin/monitor/recommendations/${id}`,
    token,
  );
}

export function searchAdminMonitorJobs(
  params: { page?: number; limit?: number; query?: string } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.query) qs.set("query", params.query);
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    jobs: AdminMonitorJobSummary[];
  }>(`/admin/monitor/jobs${suffix ? `?${suffix}` : ""}`, token);
}

export function getAdminMonitorJobDiagnostic(jobId: string, token?: string) {
  return apiRequest<AdminMonitorJobDiagnostic>(
    `/admin/monitor/jobs/${jobId}`,
    token,
  );
}

export function requeueAdminMonitorMatchJob(id: string, token?: string) {
  return apiRequest<{ requeued: boolean }>(
    `/admin/monitor/match-jobs/${id}/requeue`,
    token,
    {
      method: "POST",
    },
  );
}

export function requeueAdminMonitorProfileMatchJob(id: string, token?: string) {
  return apiRequest<{ requeued: boolean }>(
    `/admin/monitor/profile-match-jobs/${id}/requeue`,
    token,
    { method: "POST" },
  );
}

export function forceAdminMonitorUserRematch(userId: string, token?: string) {
  return apiRequest<{ enqueued: boolean; reason?: string }>(
    `/admin/monitor/users/${userId}/force-rematch`,
    token,
    { method: "POST" },
  );
}

export function resendAdminMonitorDigest(id: string, token?: string) {
  return apiRequest<{ requeued: boolean; reason?: string }>(
    `/admin/monitor/digests/${id}/resend`,
    token,
    { method: "POST" },
  );
}

// ─── Alerta de Vagas (/admin/alerta-vagas) ─────────────────────────────
// Ver docs/specs/2026-09-04-admin-alerta-vagas-tab.md

export type TrackedAlertUser = {
  id: string;
  email: string;
  name: string;
  internalRole: "none" | "admin" | "superadmin";
  entitledToday: boolean;
  emailEnabled: boolean;
};

export type SendDigestNowResult = {
  sent: boolean;
  digestId?: string;
  recommendationCount?: number;
  skippedReason: string | null;
};

export type DigestHistorySource = "SCHEDULER" | "ADMIN_MANUAL";

// Cadência dos digests — global agora (MonitorDigestScheduleConfig), não
// mais escolha por usuário. Sem OFF: um MonitorDigest só existe pra
// cadências ativas (ver MonitorDigestFrequency no schema).
export type DigestFrequency =
  | "DAILY"
  | "EVERY_2_DAYS"
  | "EVERY_3_DAYS"
  | "EVERY_4_DAYS"
  | "WEEKLY";

export type DigestHistoryLastEvent = {
  type: MonitorDigestEventType;
  provider: EmailProviderName;
  occurredAt: string;
};

export type DigestHistoryItem = {
  id: string;
  frequency: DigestFrequency;
  status: MonitorDigestStatus;
  scheduledFor: string;
  sentAt: string | null;
  createdAt: string;
  source: DigestHistorySource;
  provider: EmailProviderName;
  outcomeUnknownAt: string | null;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  recommendationCount: number;
  subject: string | null;
  lastEvent: DigestHistoryLastEvent | null;
  triggeredByAdmin: { id: string; name: string; email: string } | null;
  user: { id: string; email: string; name: string };
};

// Modo operacional do envio em massa do digest (JOB_ALERT) — separado da
// cadência acima. LEGACY_RESEND (default) preserva o comportamento atual
// de produção (Resend, todo mundo elegível); SES_ROLLOUT restringe a
// `sesRolloutSegment`; SES_LIVE libera todo mundo via SES; PAUSED não
// envia nada. Ver MonitorDigestScheduleConfig.sesMode no schema da API.
export type EmailBulkSendMode =
  | "LEGACY_RESEND"
  | "SES_ROLLOUT"
  | "SES_LIVE"
  | "PAUSED";

// Coorte do rollout SES — só relevante quando sesMode=SES_ROLLOUT. Tipo
// próprio (não reaproveita AlertRolloutSegment, que é ALL|PAID e serve a
// um conceito diferente: quem GANHA MonitorAlertPreference) porque este
// campo já suporta INTERNAL (User.internalRole IN admin, superadmin).
export type SesRolloutSegment = "ALL" | "PAID" | "INTERNAL";

export type DigestSchedule = {
  frequency: DigestFrequency;
  dailyHour: number;
  dailyMinute: number;
  weeklyDayOfWeek: number;
  intervalAnchorDate: string | null;
  timezone: string;
  sesMode: EmailBulkSendMode;
  sesRolloutSegment: SesRolloutSegment | null;
};

export type DigestContent = {
  subject: string;
  introText: string;
};

export type DigestEmailStatsRates = {
  // null quando o denominador é 0 (nunca NaN/Infinity) — UI deve mostrar
  // "—" nesse caso, não "0%".
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
};

export type DigestEmailStatsSummary = {
  processed: number;
  accepted: number;
  delivered: number;
  failed: number;
  outcomeUnknown: number;
  bounced: number;
  complained: number;
  rejected: number;
  openedUnique: number;
  clickedUnique: number;
  unsubscribed: number;
  rates: DigestEmailStatsRates;
};

export type DigestFailedItem = {
  id: string;
  userId: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  user: { id: string; email: string; name: string };
};

export type DigestEmailStats = {
  // Janela do bloco `summary` — default 1 (24h) quando omitida no request.
  periodDays: number;
  provider: EmailProviderName | null;
  summary: DigestEmailStatsSummary;
  // Globais (todo o histórico), independentes do filtro de período.
  byStatus: Record<MonitorDigestStatus, number>;
  byProvider: Record<EmailProviderName, number>;
  sentLast24h: number;
  eventsLast24h: Record<MonitorDigestEventType, number>;
  stuckProcessing: number;
  staleProcessingThresholdMs: number;
  failedDigests: DigestFailedItem[];
  outcomeUnknownDigests: DigestFailedItem[];
  outcomeUnknownReconciliationWindowMs: number;
};

export type DigestTimelineEvent = {
  id: string;
  type: MonitorDigestEventType;
  label: string;
  provider: EmailProviderName;
  providerEventId: string | null;
  occurredAt: string;
  summary: string | null;
};

export type DigestTimeline = {
  digest: {
    id: string;
    status: MonitorDigestStatus;
    provider: EmailProviderName;
    providerMessageId: string | null;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    sentAt: string | null;
    outcomeUnknownAt: string | null;
    source: DigestHistorySource;
    user: { id: string; email: string; name: string };
  };
  events: DigestTimelineEvent[];
};

export function listTrackedAlertUsers(
  params: { page?: number; limit?: number; query?: string } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.query) qs.set("query", params.query);
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    users: TrackedAlertUser[];
  }>(
    `/admin/monitor/alert-preference/tracked${suffix ? `?${suffix}` : ""}`,
    token,
  );
}

export function trackAlertUser(userId: string, token?: string) {
  return apiRequest<{ tracked: boolean; emailEnabled: boolean }>(
    "/admin/monitor/alert-preference/track",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    },
  );
}

export function setAlertPreference(
  userId: string,
  emailEnabled: boolean,
  token?: string,
) {
  return apiRequest<{ userId: string; emailEnabled: boolean }>(
    "/admin/monitor/alert-preference/set",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, emailEnabled }),
    },
  );
}

export function sendMonitorDigestNow(userId: string, token?: string) {
  return apiRequest<SendDigestNowResult>(
    "/admin/monitor/digest/send-now",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    },
  );
}

export function getMonitorDigestHistory(
  params: {
    page?: number;
    limit?: number;
    userQuery?: string;
    source?: "MANUAL" | "AUTOMATIC";
    provider?: EmailProviderName;
    status?: MonitorDigestStatus;
    from?: string;
    to?: string;
  } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.userQuery) qs.set("userQuery", params.userQuery);
  if (params.source) qs.set("source", params.source);
  if (params.provider) qs.set("provider", params.provider);
  if (params.status) qs.set("status", params.status);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const suffix = qs.toString();
  return apiRequest<{
    page: number;
    limit: number;
    total: number;
    items: DigestHistoryItem[];
  }>(`/admin/monitor/digest/history${suffix ? `?${suffix}` : ""}`, token);
}

export function getMonitorDigestStats(
  params: { periodDays?: number; provider?: EmailProviderName } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.periodDays) qs.set("periodDays", String(params.periodDays));
  if (params.provider) qs.set("provider", params.provider);
  const suffix = qs.toString();
  return apiRequest<DigestEmailStats>(
    `/admin/monitor/digest/stats${suffix ? `?${suffix}` : ""}`,
    token,
  );
}

export function getMonitorDigestTimeline(digestId: string, token?: string) {
  return apiRequest<DigestTimeline>(
    `/admin/monitor/digests/${digestId}/timeline`,
    token,
  );
}

export function getMonitorDigestSchedule(token?: string) {
  return apiRequest<DigestSchedule>("/admin/monitor/digest/schedule", token);
}

export function updateMonitorDigestSchedule(
  dto: {
    frequency: DigestFrequency;
    dailyHour: number;
    dailyMinute: number;
    weeklyDayOfWeek: number;
    // Omitido = não muda (semântica de update da API); sesRolloutSegment
    // enviado como null desliga a coorte de propósito.
    sesMode?: EmailBulkSendMode;
    sesRolloutSegment?: SesRolloutSegment | null;
  },
  token?: string,
) {
  return apiRequest<DigestSchedule>("/admin/monitor/digest/schedule", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
}

export function getMonitorDigestContent(token?: string) {
  return apiRequest<DigestContent>("/admin/monitor/digest/content", token);
}

export function updateMonitorDigestContent(dto: DigestContent, token?: string) {
  return apiRequest<DigestContent>("/admin/monitor/digest/content", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
}

export type AlertRolloutSegment = "ALL" | "PAID";

export type AlertRolloutPreview = {
  segment: AlertRolloutSegment;
  matchingCount: number;
  willChangeCount: number;
  skippedUnsubscribedCount: number;
};

export type AlertRolloutApplyResult = {
  segment: AlertRolloutSegment;
  enable: boolean;
  matchingCount: number;
  changedCount: number;
};

export type AlertRolloutPolicy = {
  id: string;
  active: boolean;
  segment: AlertRolloutSegment;
  cutoffAt: string | null;
  lastAppliedAt: string | null;
};

export function previewAlertRollout(
  segment: AlertRolloutSegment,
  enable: boolean,
  token?: string,
) {
  const qs = new URLSearchParams({ segment, enable: String(enable) });
  return apiRequest<AlertRolloutPreview>(
    `/admin/monitor/alert-rollout/preview?${qs.toString()}`,
    token,
  );
}

export function applyAlertRollout(
  segment: AlertRolloutSegment,
  enable: boolean,
  token?: string,
) {
  return apiRequest<AlertRolloutApplyResult>(
    "/admin/monitor/alert-rollout/apply",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment, enable }),
    },
  );
}

export function getAlertRolloutPolicy(token?: string) {
  return apiRequest<AlertRolloutPolicy>(
    "/admin/monitor/alert-rollout/policy",
    token,
  );
}

export function updateAlertRolloutPolicy(
  dto: {
    active: boolean;
    segment: AlertRolloutSegment;
    cutoffAt: string | null;
  },
  token?: string,
) {
  return apiRequest<AlertRolloutPolicy>(
    "/admin/monitor/alert-rollout/policy",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    },
  );
}
