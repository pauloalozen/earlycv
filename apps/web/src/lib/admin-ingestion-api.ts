import "server-only";

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
  isActive: boolean;
  parserKey: string;
  sourceName: string;
  sourceType: "custom_api" | "custom_html";
  sourceUrl: string;
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
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
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

async function apiRequest<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function listJobSources(token: string) {
  return apiRequest<JobSourceRecord[]>("/job-sources", token);
}

export async function listCompanies(token: string) {
  return apiRequest<CompanyRecord[]>("/companies", token);
}

export async function listJobs(token: string) {
  return apiRequest<JobRecord[]>("/jobs", token);
}

export async function listAllIngestionRuns(token: string) {
  return apiRequest<IngestionRunSummary[]>("/runs", token);
}

export async function createCompany(
  token: string,
  payload: CreateCompanyPayload,
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
  token: string,
  payload: CreateJobSourcePayload,
) {
  return apiRequest<JobSourceRecord>("/job-sources", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function getJobSource(token: string, jobSourceId: string) {
  return apiRequest<JobSourceRecord>(`/job-sources/${jobSourceId}`, token);
}

export async function listIngestionRuns(token: string, jobSourceId: string) {
  return apiRequest<IngestionRunSummary[]>(
    `/job-sources/${jobSourceId}/runs`,
    token,
  );
}

export async function getIngestionRun(
  token: string,
  jobSourceId: string,
  runId: string,
) {
  return apiRequest<IngestionRunSummary>(
    `/job-sources/${jobSourceId}/runs/${runId}`,
    token,
  );
}

export async function getIngestionRunById(token: string, runId: string) {
  return apiRequest<IngestionRunSummary>(`/runs/${runId}`, token);
}

export async function runJobSource(token: string, jobSourceId: string) {
  return apiRequest<IngestionRunSummary>(
    `/job-sources/${jobSourceId}/run`,
    token,
    {
      method: "POST",
    },
  );
}
