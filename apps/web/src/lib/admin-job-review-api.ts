import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

// Vagas em revisão (JobStatus.pending_review): hoje, vagas só "Remote" de
// board global, sem como saber se são do Brasil.
export type PendingReviewJob = {
  id: string;
  slug: string | null;
  title: string;
  companyName: string;
  locationText: string;
  country: string | null;
  state: string | null;
  city: string | null;
  sourceUrl: string | null;
  firstSeenAt: string;
};

export type PendingReviewJobsPage = {
  jobs: PendingReviewJob[];
  total: number;
  page: number;
  pageSize: number;
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
  return (await response.json()) as T;
}

export function listPendingReviewJobs(page: number, pageSize = 20) {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<PendingReviewJobsPage>(`/admin/job-review/jobs?${qs}`);
}

export function approvePendingReviewJob(jobId: string) {
  return apiRequest<{ ok: true }>(
    `/admin/job-review/jobs/${encodeURIComponent(jobId)}/approve`,
    { method: "POST" },
  );
}

export function rejectPendingReviewJob(jobId: string) {
  return apiRequest<{ ok: true }>(
    `/admin/job-review/jobs/${encodeURIComponent(jobId)}/reject`,
    { method: "POST" },
  );
}
