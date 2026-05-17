import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type IngestionPreviewItem = {
  action: "created" | "updated" | "skipped" | "failed";
  canonicalKey: string;
  message: string;
  title: string;
};

export type CompanyRecord = {
  careersUrl: string | null;
  country: string | null;
  id: string;
  industry: string | null;
  isActive: boolean;
  linkedinUrl: string | null;
  name: string;
  normalizedName: string;
  websiteUrl: string | null;
};

export type JobRecord = {
  canonicalKey: string;
  companyId: string;
  id: string;
  jobSourceId: string;
  lastSeenAt: string;
  locationText: string;
  status: string;
  title: string;
};

export type CreateCompanyPayload = {
  careersUrl?: string;
  country?: string;
  industry?: string;
  linkedinUrl?: string;
  name: string;
  websiteUrl?: string;
};

export type CreateJobSourcePayload = {
  checkIntervalMinutes: number;
  companyId: string;
  crawlStrategy: "api" | "html";
  isFallbackAdapter?: boolean;
  isActive: boolean;
  parserKey: string;
  scheduleCron?: string;
  scheduleEnabled?: boolean;
  scheduleTimezone?: "America/Sao_Paulo";
  sourceName: string;
  sourceType: "custom_api" | "custom_html" | "gupy";
  sourceUrl: string;
};

export type GlobalSchedulerConfig = {
  enabled: boolean;
  errorDelayMs: number;
  globalCron: string | null;
  id: string;
  normalDelayMs: number;
  timezone: string;
};

export type CsvImportReport = {
  lines: Array<{
    companyAction?: "created" | "updated";
    companyName: string;
    inferredAdapter?: "custom_html" | "gupy";
    line: number;
    message: string;
    sourceAction?: "created" | "updated";
    status: "error" | "success";
  }>;
  summary: {
    companiesCreated: number;
    companiesUpdated: number;
    errorCount: number;
    sourcesCreated: number;
    sourcesUpdated: number;
    successCount: number;
    totalLines: number;
  };
};

export type IngestionRunSummary = {
  failedCount: number;
  finishedAt: string | null;
  id: string;
  jobSourceId: string;
  newCount: number;
  previewItems: IngestionPreviewItem[];
  skippedCount: number;
  startedAt: string;
  status: "running" | "completed" | "failed";
  updatedCount: number;
};

export type JobSourceRecord = {
  checkIntervalMinutes: number;
  company: {
    id: string;
    name: string;
    normalizedName: string;
  };
  companyId: string;
  id: string;
  ingestionRuns?: IngestionRunSummary[];
  isActive: boolean;
  lastCheckedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastSuccessAt: string | null;
  parserKey: string;
  scheduleCron?: string | null;
  scheduleEnabled?: boolean;
  scheduleTimezone?: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  isFallbackAdapter?: boolean;
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

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
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

export async function listJobSources(token?: string) {
  return apiRequest<JobSourceRecord[]>("/job-sources", token);
}

export async function listCompanies(token?: string) {
  return apiRequest<CompanyRecord[]>("/companies", token);
}

export async function listJobs(token?: string) {
  return apiRequest<JobRecord[]>("/jobs", token);
}

export async function listAllIngestionRuns(token?: string) {
  return apiRequest<IngestionRunSummary[]>("/runs", token);
}

export async function createCompany(
  payload: CreateCompanyPayload,
  token?: string,
) {
  return apiRequest<CompanyRecord>("/companies", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function createJobSource(
  payload: CreateJobSourcePayload,
  token?: string,
) {
  return apiRequest<JobSourceRecord>("/job-sources", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function getJobSource(jobSourceId: string, token?: string) {
  return apiRequest<JobSourceRecord>(`/job-sources/${jobSourceId}`, token);
}

export async function listIngestionRuns(jobSourceId: string, token?: string) {
  return apiRequest<IngestionRunSummary[]>(
    `/job-sources/${jobSourceId}/runs`,
    token,
  );
}

export async function getIngestionRun(
  jobSourceId: string,
  runId: string,
  token?: string,
) {
  return apiRequest<IngestionRunSummary>(
    `/job-sources/${jobSourceId}/runs/${runId}`,
    token,
  );
}

export async function getIngestionRunById(runId: string, token?: string) {
  return apiRequest<IngestionRunSummary>(`/runs/${runId}`, token);
}

export async function runJobSource(jobSourceId: string, token?: string) {
  return apiRequest<IngestionRunSummary>(
    `/job-sources/${jobSourceId}/run`,
    token,
    {
      method: "POST",
    },
  );
}

export async function importCompanySourcesCsv(
  payload: { dryRun: boolean; file: File },
  token?: string,
) {
  const bearerToken = await resolveToken(token);
  const formData = new FormData();
  formData.set("file", payload.file);

  const response = await fetch(
    `${getApiBaseUrl()}/runs/import-csv?dryRun=${payload.dryRun ? "true" : "false"}`,
    {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as CsvImportReport;
}

export async function getGlobalSchedulerConfig(token?: string) {
  return apiRequest<GlobalSchedulerConfig>("/runs/scheduler/global", token);
}

export async function updateGlobalSchedulerConfig(
  payload: {
    enabled: boolean;
    errorDelayMs: number;
    globalCron?: string;
    normalDelayMs: number;
    timezone?: "America/Sao_Paulo";
  },
  token?: string,
) {
  return apiRequest<GlobalSchedulerConfig>("/runs/scheduler/global", token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function runGlobalSchedulerNow(token?: string) {
  return apiRequest<{ failed?: number; skipped?: number; status: string; succeeded?: number }>(
    "/runs/scheduler/global/run",
    token,
    {
      method: "POST",
    },
  );
}

export async function deleteJobSource(jobSourceId: string, token?: string) {
  return apiRequest<{ ok: true }>(`/job-sources/${jobSourceId}`, token, {
    method: "DELETE",
  });
}

export async function deleteCompany(companyId: string, token?: string) {
  return apiRequest<{ ok: true }>(`/companies/${companyId}`, token, {
    method: "DELETE",
  });
}
