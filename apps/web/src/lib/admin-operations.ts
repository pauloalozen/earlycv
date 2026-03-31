import type {
  CompanyRecord,
  IngestionRunSummary,
  JobRecord,
  JobSourceRecord,
} from "./admin-ingestion-api";

export type AdminStatus = {
  label: string;
  tone: "danger" | "neutral" | "success" | "warning";
};

export type PendingItem = {
  cta: string;
  description: string;
  entityId: string;
  href: string;
  priority: "alta" | "media";
  title: string;
  type:
    | "company-missing-source"
    | "run-failed"
    | "source-failed-recent-run"
    | "source-missing-first-run";
};

type BuildPendingItemsInput = {
  companies: Array<Pick<CompanyRecord, "id" | "name">>;
  jobSources: Array<
    Pick<
      JobSourceRecord,
      | "company"
      | "companyId"
      | "id"
      | "ingestionRuns"
      | "lastErrorMessage"
      | "sourceName"
    >
  >;
  token: string;
};

type BuildOverviewMetricsInput = {
  companies: Array<Pick<CompanyRecord, "id">>;
  jobsCount: number;
  pendingCount: number;
  sourceCount: number;
  successfulRunsCount: number;
};

export type OverviewMetric = {
  label: string;
  value: number;
};

type SearchableCompany = {
  careersUrl?: string | null;
  country?: string | null;
  id: string;
  name: string;
  relatedSources: Array<{ id: string }>;
  status: AdminStatus;
  websiteUrl?: string | null;
};

type SearchableSource = {
  company: { name: string };
  id: string;
  ingestionRuns?: IngestionRunSummary[];
  parserKey?: string;
  sourceName: string;
  sourceType: string;
  sourceUrl?: string;
  status: AdminStatus;
};

type SearchableRun = {
  companyName: string;
  id: string;
  sourceName: string;
  status: string;
};

type SearchableJob = {
  companyName: string;
  id: string;
  locationText: string;
  sourceName: string;
  status: string;
  title: string;
};

type SearchablePendingItem = Pick<
  PendingItem,
  "cta" | "description" | "entityId" | "href" | "priority" | "title" | "type"
>;

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(haystacks: Array<string | undefined>, query?: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(query);

  return haystacks.some((value) =>
    normalizeSearchValue(value ?? "").includes(normalizedQuery),
  );
}

export function buildSourceDetailHref(jobSourceId: string, token: string) {
  return `/admin/fontes/${jobSourceId}?token=${encodeURIComponent(token)}`;
}

export function buildCompanyDetailHref(companyId: string, token: string) {
  return `/admin/empresas/${companyId}?token=${encodeURIComponent(token)}`;
}

export function buildCompanyStatus(
  _company: Pick<CompanyRecord, "id">,
  relatedSources: Array<
    Pick<JobSourceRecord, "id" | "ingestionRuns" | "lastErrorMessage">
  >,
): AdminStatus {
  if (relatedSources.length === 0) {
    return { label: "incompleta", tone: "warning" };
  }

  if (
    relatedSources.some(
      (source) =>
        (source.ingestionRuns?.length ?? 0) === 0 && !source.lastErrorMessage,
    )
  ) {
    return { label: "aguardando primeiro run", tone: "warning" };
  }

  if (
    relatedSources.some(
      (source) =>
        source.lastErrorMessage ||
        source.ingestionRuns?.[0]?.status === "failed",
    )
  ) {
    return { label: "com falha recente", tone: "danger" };
  }

  return { label: "completa", tone: "success" };
}

export function buildSourceStatus(
  source: Pick<
    JobSourceRecord,
    "ingestionRuns" | "lastErrorMessage" | "sourceName"
  >,
): AdminStatus {
  const latestRun = source.ingestionRuns?.[0] ?? null;

  if (!latestRun) {
    return { label: "aguardando primeiro run", tone: "warning" };
  }

  if (latestRun.status === "failed" || source.lastErrorMessage) {
    return { label: "falha recente", tone: "danger" };
  }

  return { label: "ativa", tone: "success" };
}

export function buildPendingItems({
  companies,
  jobSources,
  token,
}: BuildPendingItemsInput): PendingItem[] {
  const items: PendingItem[] = [];

  for (const company of companies) {
    const companySources = jobSources.filter(
      (jobSource) => jobSource.companyId === company.id,
    );

    if (companySources.length === 0) {
      items.push({
        cta: "Criar primeira fonte",
        description: "Empresa criada sem nenhuma fonte de vagas conectada.",
        entityId: company.id,
        href: buildCompanyDetailHref(company.id, token),
        priority: "alta",
        title: company.name,
        type: "company-missing-source",
      });
    }
  }

  for (const source of jobSources) {
    const latestRun = source.ingestionRuns?.[0] ?? null;

    if (!latestRun) {
      items.push({
        cta: "Rodar agora",
        description:
          "A fonte foi cadastrada, mas ainda nao executou a primeira ingestao.",
        entityId: source.id,
        href: buildSourceDetailHref(source.id, token),
        priority: "alta",
        title: source.sourceName,
        type: "source-missing-first-run",
      });
      continue;
    }

    if (latestRun.status === "failed" || source.lastErrorMessage) {
      items.push({
        cta: "Revisar falha",
        description:
          source.lastErrorMessage ??
          "O ultimo run da fonte terminou com falha.",
        entityId: source.id,
        href: buildSourceDetailHref(source.id, token),
        priority: "alta",
        title: source.sourceName,
        type: "source-failed-recent-run",
      });
    }
  }

  return items;
}

export function buildOverviewMetrics({
  companies,
  jobsCount,
  pendingCount,
  sourceCount,
  successfulRunsCount,
}: BuildOverviewMetricsInput): OverviewMetric[] {
  return [
    { label: "empresas", value: companies.length },
    { label: "fontes", value: sourceCount },
    { label: "vagas", value: jobsCount },
    { label: "pendencias", value: pendingCount },
    { label: "runs ok", value: successfulRunsCount },
  ];
}

export function filterCompanies(
  companies: SearchableCompany[],
  filters: { query?: string; status?: string },
) {
  return companies.filter(
    (company) =>
      matchesQuery([company.name], filters.query) &&
      (!filters.status || company.status.label === filters.status),
  );
}

export function filterSources(
  sources: SearchableSource[],
  filters: { query?: string; status?: string; type?: string },
) {
  return sources.filter(
    (source) =>
      matchesQuery([source.sourceName, source.company.name], filters.query) &&
      (!filters.status || source.status.label === filters.status) &&
      (!filters.type || source.sourceType === filters.type),
  );
}

export function filterRuns(
  runs: SearchableRun[],
  filters: { query?: string; status?: string },
) {
  return runs.filter(
    (run) =>
      matchesQuery([run.companyName, run.sourceName, run.id], filters.query) &&
      (!filters.status || run.status === filters.status),
  );
}

export function filterJobs(
  jobs: SearchableJob[],
  filters: { query?: string; sourceName?: string; status?: string },
) {
  return jobs.filter(
    (job) =>
      matchesQuery(
        [job.title, job.companyName, job.locationText, job.sourceName],
        filters.query,
      ) &&
      (!filters.sourceName || job.sourceName === filters.sourceName) &&
      (!filters.status || job.status === filters.status),
  );
}

export function filterPendingItems(
  pendingItems: SearchablePendingItem[],
  filters: { query?: string; type?: string },
) {
  return pendingItems.filter(
    (item) =>
      matchesQuery(
        [item.title, item.description, item.entityId],
        filters.query,
      ) &&
      (!filters.type || item.type === filters.type),
  );
}

export function groupSourcesByCompany(jobSources: JobSourceRecord[]) {
  return new Map(
    jobSources.reduce<Array<[string, JobSourceRecord[]]>>((acc, source) => {
      const bucket = acc.find(([companyId]) => companyId === source.companyId);

      if (bucket) {
        bucket[1].push(source);
      } else {
        acc.push([source.companyId, [source]]);
      }

      return acc;
    }, []),
  );
}

export function sortRunsDescending(runs: IngestionRunSummary[]) {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

export function countSuccessfulRuns(runs: IngestionRunSummary[]) {
  return runs.filter((run) => run.status === "completed").length;
}

export function countJobs(jobs: JobRecord[]) {
  return jobs.length;
}
