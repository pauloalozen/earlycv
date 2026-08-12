import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type EnrichmentSummary = {
  last24h: {
    enriched: number;
    skipped: number;
    failed: number;
    pending: number;
    approvalRate: number;
  };
  byArea: { area: string; count: number }[];
  crawlerDiscarded24h: number;
  portalByArea: {
    area: string;
    areaLabel: string;
    active: number;
    inactive: number;
    total: number;
  }[];
  pendingEnrichment: number;
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

export async function getEnrichmentSummary(): Promise<EnrichmentSummary> {
  return apiRequest<EnrichmentSummary>("/admin/dashboard/enrichment-summary");
}
