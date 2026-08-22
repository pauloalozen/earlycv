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
  companyId?: string;
  companyName?: string;
  discardedByFilterCount?: number;
  errorSummary: string | null;
  failedCount: number;
  finishedAt: string | null;
  id: string;
  jobSourceId: string;
  newCount: number;
  previewItems: IngestionPreviewItem[];
  skippedCount: number;
  sourceName?: string;
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

export async function listAllIngestionRuns(
  filters: {
    page?: number;
    limit?: number;
    query?: string;
    status?: string;
  } = {},
  token?: string,
) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();

  return apiRequest<{
    limit: number;
    page: number;
    runs: IngestionRunSummary[];
    total: number;
  }>(`/runs${qs ? `?${qs}` : ""}`, token);
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

export type ManualRunItemsPage = {
  items: ManualRunItemRecord[];
  limit: number;
  page: number;
  total: number;
};

// A API sempre devolve o envelope paginado ({items, limit, page, total}),
// mesmo quando nenhum page/limit é passado (ver
// ManualIngestionBatchRepository.listRunItems no backend — só o skip/take
// da query é condicional, o shape do retorno não é).
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

  return apiRequest<ManualRunItemsPage>(path, token);
}

export type ManualRunItemStatusCounts = {
  discoveryStatusCounts: Record<string, number>;
  statusCounts: Record<string, number>;
};

// Contadores agregados calculados no banco (groupBy), em vez de recontar
// em cima do array inteiro de listManualRunItems — usado pelos cards de
// resumo, que nao precisam de cada item individual pra mostrar so 4 numeros
// mais o detalhamento de descoberta.
export async function getManualRunItemStatusCounts(
  batchRunId: string,
  token?: string,
) {
  return apiRequest<ManualRunItemStatusCounts>(
    `/runs/manual/${batchRunId}/items/counts`,
    token,
  );
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

export async function deleteJobSource(
  jobSourceId: string,
  removeJobs?: boolean,
  token?: string,
) {
  const qs = removeJobs ? "?removeJobs=true" : "";
  return apiRequest<{ ok: true }>(`/job-sources/${jobSourceId}${qs}`, token, {
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

// Botão "desativar/ativar todas as vagas da fonte" — pra quando a fonte
// inteira foi cadastrada errada e o volume de vagas já ingeridas torna
// corrigir uma a uma inviável (ver isForeignLocation em geo-normalizer.ts).
export async function bulkSetJobsStatusByJobSource(
  jobSourceId: string,
  status: "active" | "inactive" | "removed",
  token?: string,
) {
  return apiRequest<{ count: number; status: string }>(
    `/jobs/by-source/${jobSourceId}`,
    token,
    {
      body: JSON.stringify({ status }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );
}

export type DuplicateJobSourceGroup = {
  count: number;
  sourceType: string;
  sourceUrl: string;
  sources: {
    companyId: string;
    companyName: string;
    createdAt: string;
    id: string;
    isActive: boolean;
    jobCount: number;
    sourceName: string;
  }[];
};

export async function listDuplicateJobSources(token?: string) {
  return apiRequest<DuplicateJobSourceGroup[]>(
    "/job-sources/duplicates",
    token,
  );
}

export type CheckJobSourceUrlResult =
  | { taken: false }
  | { companyName: string; sourceName: string; taken: true };

export async function checkJobSourceUrlAvailable(url: string, token?: string) {
  return apiRequest<CheckJobSourceUrlResult>(
    `/job-sources/check-url?url=${encodeURIComponent(url)}`,
    token,
  );
}

export async function bulkDeleteJobSources(
  ids: string[],
  removeJobs?: boolean,
  token?: string,
) {
  return apiRequest<{ count: number }>("/job-sources/bulk", token, {
    body: JSON.stringify({ ids, removeJobs }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "DELETE",
  });
}

export async function deleteCompany(companyId: string, token?: string) {
  return apiRequest<{ ok: true }>(`/companies/${companyId}`, token, {
    method: "DELETE",
  });
}

// ─── Audit de Fontes (saneamento de Company/JobSource com URL errada) ───

export type CompanySourceAuditTier = "confirmed" | "high" | "review";
export type CompanySourceAuditStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied";

export type CompanySourceAuditFinding = {
  id: string;
  companyId: string;
  company: { id: string; name: string };
  jobSourceId: string | null;
  field: "websiteUrl" | "careersUrl" | "sourceUrl";
  currentUrl: string;
  tier: CompanySourceAuditTier;
  confidence: number;
  suspectedOwnerId: string | null;
  suspectedOwner: { id: string; name: string } | null;
  suspectedOwnerName: string | null;
  status: CompanySourceAuditStatus;
  reviewNote: string | null;
  detectedAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
};

export type CompanySourceAuditCounts = Record<CompanySourceAuditStatus, number>;

export async function listCompanySourceAudits(
  params: {
    status?: CompanySourceAuditStatus;
    tier?: CompanySourceAuditTier;
    search?: string;
  },
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.tier) qs.set("tier", params.tier);
  if (params.search) qs.set("search", params.search);
  return apiRequest<{
    findings: CompanySourceAuditFinding[];
    counts: CompanySourceAuditCounts;
  }>(`/admin/company-source-audit?${qs}`, token);
}

export async function runCompanySourceAudit(token?: string) {
  return apiRequest<{
    found: number;
    created: number;
    updated: number;
    skippedReviewed: number;
  }>("/admin/company-source-audit/run", token, { method: "POST" });
}

export async function decideCompanySourceAudit(
  id: string,
  status: "approved" | "rejected",
  note: string | undefined,
  token?: string,
) {
  return apiRequest<CompanySourceAuditFinding>(
    `/admin/company-source-audit/${id}/decide`,
    token,
    {
      body: JSON.stringify({ status, note }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export type CompanySourceAuditApplySummary = {
  dryRun: boolean;
  processed: number;
  jobSourcesDisabled: number;
  jobSourcesCreated: number;
  companiesCreated: number;
  companyFieldsCleared: number;
  jobsReassigned: number;
  jobsRemoved: number;
};

export async function applyCompanySourceAudit(dryRun: boolean, token?: string) {
  return apiRequest<CompanySourceAuditApplySummary>(
    "/admin/company-source-audit/apply",
    token,
    {
      body: JSON.stringify({ dryRun }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

// Rascunhos: Company que o apply cria (isActive=false) quando o dono real
// de um achado nao existia no nosso banco — ver "Rascunhos" na aba
// "Audit de Fontes".
export type CompanySourceAuditDraftSource = {
  id: string;
  sourceUrl: string;
  sourceName: string;
  sourceType: string;
  isActive: boolean;
};

export type CompanySourceAuditDraft = {
  id: string;
  name: string;
  careersUrl: string | null;
  createdAt: string;
  sources: CompanySourceAuditDraftSource[];
  jobCounts: { active: number; inactive: number; removed: number };
};

export async function listCompanySourceAuditDrafts(token?: string) {
  return apiRequest<CompanySourceAuditDraft[]>(
    "/admin/company-source-audit/drafts",
    token,
  );
}

export async function renameCompanySourceAuditDraft(
  companyId: string,
  name: string,
  token?: string,
) {
  return apiRequest<CompanySourceAuditDraft>(
    `/admin/company-source-audit/drafts/${companyId}/rename`,
    token,
    {
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export async function activateCompanySourceAuditDraft(
  companyId: string,
  token?: string,
) {
  return apiRequest<{ ok: true }>(
    `/admin/company-source-audit/drafts/${companyId}/activate`,
    token,
    { method: "POST" },
  );
}

export async function discardCompanySourceAuditDraft(
  companyId: string,
  token?: string,
) {
  return apiRequest<{ ok: true }>(
    `/admin/company-source-audit/drafts/${companyId}/discard`,
    token,
    { method: "POST" },
  );
}
