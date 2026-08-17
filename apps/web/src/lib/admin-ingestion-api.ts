import "server-only";

import type { JobSourceTypeOption } from "./admin-ingestion-flow";
import { getBackofficeSessionToken } from "./backoffice-session.server";

// null = Job existe mas sem JobEnrichment (vaga antiga). undefined = campo
// nao calculado por esse endpoint (so getIngestionRun/getIngestionRunById
// preenchem).
export type IngestionPreviewItemEnrichment = {
  careerFingerprint: string[];
  dominantArea: string | null;
  enrichmentStatus:
    | "PENDING"
    | "PROCESSING"
    | "COMPLETED"
    | "SKIPPED"
    | "FAILED";
  id: string;
  semanticFilterReason: string | null;
} | null;

export type IngestionPreviewItem = {
  action: "created" | "updated" | "skipped" | "failed";
  canonicalKey: string;
  enrichment?: IngestionPreviewItemEnrichment;
  message: string;
  title: string;
};

export type RunEnrichmentSummary = {
  completed: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
};

export type CompanyRecord = {
  careersUrl: string | null;
  country: string | null;
  id: string;
  industry: string | null;
  isActive: boolean;
  linkedinUrl: string | null;
  logoFetchedAt: string | null;
  logoUrl: string | null;
  name: string;
  normalizedName: string;
  websiteUrl: string | null;
};

export type LogoFetchResult =
  | { status: "completed"; logoUrl: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; errorSummary: string };

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
  sourceType: JobSourceTypeOption;
  sourceUrl: string;
};

export type UpdateJobSourcePayload = {
  checkIntervalMinutes?: number;
  crawlStrategy?: "api" | "html";
  isActive?: boolean;
  isFallbackAdapter?: boolean;
  parserKey?: string;
  scheduleCron?: string | null;
  scheduleEnabled?: boolean;
  scheduleTimezone?: "America/Sao_Paulo";
  sourceName?: string;
  sourceType?: JobSourceTypeOption;
  sourceUrl?: string;
};

export type JobSourcePagedResult = {
  page: number;
  pageSize: number;
  rows: (JobSourceRecord & { activeJobsCount: number })[];
  total: number;
  totalPages: number;
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
  discardedByFilterCount?: number;
  errorSummary: string | null;
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

export type ManualAdapterType =
  | "gupy"
  | "custom_html"
  | "custom_api"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "inhire"
  | "teamtailor"
  | "talentbrew"
  | "workday"
  | "pandape";

export type ManualRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export type ManualRunScopeType = "adapter" | "source" | "global";

export type ManualRunItemStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type StartManualAdapterRunResponse = {
  batchRunId: string;
  status: ManualRunStatus;
};

export type ManualRunKind = "CRAWL" | "LOGO_FETCH" | "DISCOVERY_VALIDATE";

export type ManualRunRecord = {
  id: string;
  runKind?: ManualRunKind;
  scopeType: ManualRunScopeType;
  scopeValue: string;
  status: ManualRunStatus;
  requestedByUserId: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelRequestedAt: string | null;
  totalSources: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ManualRunItemRecord = {
  companyName: string;
  // Nulos pra itens de runKind DISCOVERY_VALIDATE (candidato de Descoberta
  // de Empresas, sem JobSource/Company de verdade ainda) — sourceName vira
  // a careersUrl resolvida e sourceType o adapter resolvido, quando houver.
  sourceName: string | null;
  sourceType: ManualAdapterType | null;
  id: string;
  batchRunId: string;
  jobSourceId: string | null;
  discoveredCompanyId?: string | null;
  discoveredCompany?: {
    id: string;
    status:
      | "PENDING"
      | "VALIDATED"
      | "NO_ACTIVE_JOBS"
      | "NO_TECH_JOBS"
      | "INVALID"
      | "IMPORTED"
      | "DISMISSED";
  } | null;
  status: ManualRunItemStatus;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  ingestionRun: {
    errorSummary: string | null;
    failedCount: number;
    newCount: number;
    skippedCount: number;
    updatedCount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type JobSourceRecord = {
  checkIntervalMinutes: number;
  company: {
    id: string;
    logoUrl: string | null;
    name: string;
    normalizedName: string;
  };
  companyId: string;
  consecutive403Count?: number;
  createdAt: string;
  id: string;
  ingestionRuns?: IngestionRunSummary[];
  isActive: boolean;
  lastCheckedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastSuccessAt: string | null;
  parserKey: string;
  pauseReason?: string | null;
  pausedUntil?: string | null;
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
    cache: "no-store" as const,
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

export type JobSourceSortBy =
  | "sourceName"
  | "company"
  | "sourceType"
  | "activeJobsCount"
  | "createdAt";

export async function listJobSourcesPaginated(
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    statusFilter?: string;
    typeFilter?: string;
    sortBy?: JobSourceSortBy;
    sortDir?: "asc" | "desc";
  },
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.search) qs.set("search", params.search);
  if (params.statusFilter) qs.set("statusFilter", params.statusFilter);
  if (params.typeFilter) qs.set("typeFilter", params.typeFilter);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  return apiRequest<JobSourcePagedResult>(
    `/job-sources/paginated?${qs}`,
    token,
  );
}

export async function listCompanies(token?: string) {
  return apiRequest<CompanyRecord[]>("/companies", token);
}

export async function getCompany(companyId: string, token?: string) {
  return apiRequest<CompanyRecord>(`/companies/${companyId}`, token);
}

// Disparo síncrono, uma empresa por vez — botão "Buscar logo" na
// listagem/detalhe de empresas. Disparo em lote (todos os adapters
// implementados, ou um específico) passa pelo fluxo de IngestionJob
// (jobType LOGO_FETCH, ver CreateJobModal em jobs-tab-client.tsx), não por
// aqui.
export async function fetchCompanyLogo(companyId: string, token?: string) {
  return apiRequest<LogoFetchResult>(
    `/companies/${companyId}/fetch-logo`,
    token,
    {
      method: "POST",
    },
  );
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

export async function getRunEnrichmentSummary(runId: string, token?: string) {
  return apiRequest<RunEnrichmentSummary>(
    `/ingestion/runs/${runId}/enrichment-summary`,
    token,
  );
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

// Fire-and-forget: so cria/reaproveita o IngestionJob MANUAL da fonte e
// enfileira o IngestionBatchRun — o crawl roda async via
// IngestionManualRunnerService, essa chamada retorna quase
// instantaneamente. Diferente de runJobSource() acima, que espera o
// crawl inteiro terminar antes de responder (usado por outros
// consumidores que ainda dependem do IngestionRunSummary sincrono).
export async function runJobSourceAdHoc(jobSourceId: string, token?: string) {
  return apiRequest<{ id: string; status: string }>(
    `/ingestion/jobs/run-source/${jobSourceId}`,
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

export type DiscoveredCompanyStatus =
  | "PENDING"
  | "VALIDATED"
  | "NO_ACTIVE_JOBS"
  | "NO_TECH_JOBS"
  | "INVALID"
  | "IMPORTED"
  | "DISMISSED";

export async function listDiscoveredCompanies(
  statuses?: DiscoveredCompanyStatus[],
  token?: string,
) {
  const qs = statuses?.length ? `?status=${statuses.join(",")}` : "";
  return apiRequest<{ id: string; status: DiscoveredCompanyStatus }[]>(
    `/admin/discovery${qs}`,
    token,
  );
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
  return apiRequest<{
    batchRunId: string;
    status: string;
    totalSources: number;
  }>("/runs/scheduler/global/run", token, {
    method: "POST",
  });
}

export async function startManualAdapterRun(
  adapterType: ManualAdapterType,
  token?: string,
) {
  return apiRequest<StartManualAdapterRunResponse>(
    `/runs/manual/adapter/${adapterType}`,
    token,
    {
      method: "POST",
    },
  );
}

export async function listManualRuns(
  filters?: {
    scopeType?: ManualRunScopeType;
    status?: ManualRunStatus;
  },
  token?: string,
) {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set("status", filters.status);
  }

  if (filters?.scopeType) {
    searchParams.set("scopeType", filters.scopeType);
  }

  const queryString = searchParams.toString();
  const path = queryString ? `/runs/manual?${queryString}` : "/runs/manual";

  return apiRequest<ManualRunRecord[]>(path, token);
}

export async function getManualRunById(batchRunId: string, token?: string) {
  return apiRequest<ManualRunRecord>(`/runs/manual/${batchRunId}`, token);
}

export async function listManualRunItems(
  batchRunId: string,
  filters?: {
    status?: ManualRunItemStatus;
  },
  token?: string,
) {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set("status", filters.status);
  }

  const queryString = searchParams.toString();
  const path = queryString
    ? `/runs/manual/${batchRunId}/items?${queryString}`
    : `/runs/manual/${batchRunId}/items`;

  return apiRequest<ManualRunItemRecord[]>(path, token);
}

export async function cancelManualRun(batchRunId: string, token?: string) {
  return apiRequest<ManualRunRecord>(
    `/runs/manual/${batchRunId}/cancel`,
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

export async function updateJobSource(
  jobSourceId: string,
  payload: UpdateJobSourcePayload,
  token?: string,
) {
  return apiRequest<JobSourceRecord>(`/job-sources/${jobSourceId}`, token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PUT",
  });
}

export async function bulkUpdateJobSourceSchedule(
  payload: { sourceType: string; scheduleEnabled: boolean },
  token?: string,
) {
  return apiRequest<{
    count: number;
    scheduleEnabled: boolean;
    sourceType: string;
  }>("/job-sources/bulk-schedule", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function bulkUpdateJobSourceActive(
  payload: { sourceType: string; isActive: boolean },
  token?: string,
) {
  return apiRequest<{
    count: number;
    isActive: boolean;
    sourceType: string;
  }>("/job-sources/bulk-active", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function deleteCompany(companyId: string, token?: string) {
  return apiRequest<{ ok: true }>(`/companies/${companyId}`, token, {
    method: "DELETE",
  });
}
