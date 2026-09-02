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
  | "SKIPPED";
export type MonitorDigestEventType =
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "COMPLAINED";
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
  digests: Record<MonitorDigestStatus, number>;
  digestsSentLast24h: number;
  digestEventsLast24h: Record<MonitorDigestEventType, number>;
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
  failedDigests: {
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
    digests: number;
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
