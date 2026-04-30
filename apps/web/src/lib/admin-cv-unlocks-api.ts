import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type CvUnlockListItem = {
  id: string;
  unlockedAt: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  cvAdaptationId: string;
  jobTitle: string | null;
  companyName: string | null;
  score: number | null;
  creditsConsumed: number;
  source: "CREDIT" | "ADMIN" | "PLAN_ENTITLEMENT" | "LEGACY";
  status: "UNLOCKED" | "REVOKED";
};

export type CvUnlockListResponse = {
  items: CvUnlockListItem[];
  total: number;
  page: number;
  limit: number;
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

export async function listAdminCvUnlocks(params: {
  email?: string;
  userId?: string;
  cvAdaptationId?: string;
  source?: "CREDIT" | "ADMIN" | "PLAN_ENTITLEMENT" | "LEGACY";
  status?: "UNLOCKED" | "REVOKED";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}): Promise<CvUnlockListResponse> {
  const qs = new URLSearchParams();
  if (params.email) qs.set("email", params.email);
  if (params.userId) qs.set("userId", params.userId);
  if (params.cvAdaptationId) qs.set("cvAdaptationId", params.cvAdaptationId);
  if (params.source) qs.set("source", params.source);
  if (params.status) qs.set("status", params.status);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  return apiRequest<CvUnlockListResponse>(`/cv-unlocks/admin/list?${qs}`);
}
