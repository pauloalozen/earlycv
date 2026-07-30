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

export type SkippedEnrichmentRow = {
  enrichmentStatus: string;
  firstSeenAt: string;
  id: string;
  normalizedTitle: string;
  semanticFilterReason: string | null;
  sourceName: string;
};

export type SkippedEnrichmentsResponse = {
  page: number;
  pageSize: number;
  rows: SkippedEnrichmentRow[];
  total: number;
  totalPages: number;
};

export type SemanticFilterDashboard = {
  approvalRatePct: number | null;
  completed24h: number;
  failed: number;
  pending: number;
  processing: number;
  skipped24h: number;
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

export async function listSkippedEnrichments(params: {
  from?: string;
  page?: number;
  pageSize?: number;
  reasonKind?: "zona_cinza" | "noise_signal" | "tech_signal";
  sourceName?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.reasonKind) qs.set("reasonKind", params.reasonKind);
  if (params.sourceName) qs.set("sourceName", params.sourceName);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);

  return apiRequest<SkippedEnrichmentsResponse>(
    `/semantic-filter/skipped?${qs.toString()}`,
  );
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
