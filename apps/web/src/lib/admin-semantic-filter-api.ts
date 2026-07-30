import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type SemanticFilterConfig = {
  createdAt: string;
  description: string | null;
  id: string;
  isActive: boolean;
  noiseSignals: string[];
  techSignals: string[];
  version: string;
};

export type SemanticFilterDashboard = {
  approvalRatePct: number | null;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  skipped: number;
};

export type EnrichmentStatusValue =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED";

export type EnrichmentJobRow = {
  careerFingerprint: string[];
  companyName: string;
  createdAt: string;
  dominantArea: string | null;
  enrichedAt: string | null;
  enrichmentError: string | null;
  enrichmentStatus: EnrichmentStatusValue;
  id: string;
  jobTitle: string;
  semanticFilterReason: string | null;
};

export type EnrichmentJobsResponse = {
  page: number;
  pageSize: number;
  rows: EnrichmentJobRow[];
  total: number;
  totalPages: number;
};

function getApiBaseUrl() {
  const url =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return url.endsWith("/api") ? url : `${url}/api`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getBackofficeSessionToken();
  if (!token) throw new Error("Missing backoffice session token.");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function getActiveSemanticFilterConfig() {
  return apiRequest<SemanticFilterConfig | null>("/semantic-filter/config");
}

export async function createSemanticFilterConfigVersion(input: {
  description?: string;
  noiseSignals: string[];
  techSignals: string[];
}) {
  return apiRequest<SemanticFilterConfig>("/semantic-filter/config", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function reenrichJob(jobEnrichmentId: string) {
  return apiRequest<{ id: string }>(
    `/semantic-filter/skipped/${jobEnrichmentId}/reenrich`,
    { method: "POST" },
  );
}

export async function getSemanticFilterDashboard() {
  return apiRequest<SemanticFilterDashboard>("/semantic-filter/dashboard");
}

export async function listEnrichmentJobs(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  sourceId?: string;
  status?: EnrichmentStatusValue;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.search) qs.set("search", params.search);
  if (params.sourceId) qs.set("sourceId", params.sourceId);
  if (params.status) qs.set("status", params.status);

  return apiRequest<EnrichmentJobsResponse>(
    `/ingestion/enrichment/jobs?${qs.toString()}`,
  );
}

export async function runEnrichmentNow() {
  return apiRequest<{ processed: number }>("/ingestion/enrichment/run-now", {
    method: "POST",
  });
}
