import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type CrawlerDiscardFilterReason = "noise_signal" | "zona_cinza";

export type CrawlerDiscardRow = {
  canonicalKey: string;
  discardedAt: string;
  filterReason: string;
  filterVersion: string;
  id: string;
  sourceName: string;
  title: string;
  whitelistedAt: string | null;
};

export type CrawlerDiscardsResponse = {
  page: number;
  pageSize: number;
  rows: CrawlerDiscardRow[];
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

export async function listCrawlerDiscards(params: {
  filterReason?: CrawlerDiscardFilterReason;
  page?: number;
  pageSize?: number;
  search?: string;
  sourceId?: string;
}) {
  const qs = new URLSearchParams();
  if (params.filterReason) qs.set("filterReason", params.filterReason);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.search) qs.set("search", params.search);
  if (params.sourceId) qs.set("sourceId", params.sourceId);

  return apiRequest<CrawlerDiscardsResponse>(
    `/ingestion/crawler-discards?${qs.toString()}`,
  );
}

export async function getCrawlerDiscardsCount() {
  return apiRequest<number>("/ingestion/crawler-discards/count");
}

export async function whitelistCrawlerDiscard(id: string, term: string) {
  return apiRequest<{ id: string; version: string }>(
    `/ingestion/crawler-discards/${id}/whitelist`,
    { body: JSON.stringify({ term }), method: "POST" },
  );
}
