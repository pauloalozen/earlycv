import "server-only";

import {
  type CompanyRecord,
  type IngestionRunSummary,
  type JobRecord,
  type JobSourceRecord,
  listAllIngestionRuns,
  listCompanies,
  listJobSources,
  listJobs,
} from "./admin-ingestion-api";
import {
  buildCompanyStatus,
  buildOverviewMetrics,
  buildPendingItems,
  buildSourceStatus,
  countJobs,
  countSuccessfulRuns,
  groupSourcesByCompany,
  sortRunsDescending,
} from "./admin-operations";

export type AdminCompanyView = CompanyRecord & {
  relatedSources: JobSourceRecord[];
  status: ReturnType<typeof buildCompanyStatus>;
};

export type AdminJobSourceView = JobSourceRecord & {
  status: ReturnType<typeof buildSourceStatus>;
};

export async function getPhaseOneAdminData(token: string) {
  const [companies, jobSources, jobs, runs] = await Promise.all([
    listCompanies(token),
    listJobSources(token),
    listJobs(token),
    listAllIngestionRuns(token),
  ]);
  const groupedSources = groupSourcesByCompany(jobSources);
  const companyViews = companies.map((company) => {
    const relatedSources = groupedSources.get(company.id) ?? [];

    return {
      ...company,
      relatedSources,
      status: buildCompanyStatus(company, relatedSources),
    } satisfies AdminCompanyView;
  });
  const sourceViews = jobSources.map((jobSource) => ({
    ...jobSource,
    status: buildSourceStatus(jobSource),
  })) satisfies AdminJobSourceView[];
  const pendingItems = buildPendingItems({
    companies,
    jobSources,
    token,
  });
  const orderedRuns = sortRunsDescending(runs);
  const overviewMetrics = buildOverviewMetrics({
    companies,
    jobsCount: countJobs(jobs),
    pendingCount: pendingItems.length,
    sourceCount: jobSources.length,
    successfulRunsCount: countSuccessfulRuns(runs),
  });

  return {
    companies,
    companyViews,
    jobs,
    orderedRuns,
    overviewMetrics,
    pendingItems,
    runs,
    sourceViews,
  };
}

export function buildCompanyDetailData(
  companyId: string,
  companies: CompanyRecord[],
  jobSources: AdminJobSourceView[],
) {
  const company = companies.find((item) => item.id === companyId) ?? null;

  if (!company) {
    return null;
  }

  const relatedSources = jobSources.filter(
    (item) => item.companyId === companyId,
  );

  return {
    ...company,
    relatedSources,
    status: buildCompanyStatus(company, relatedSources),
  } satisfies AdminCompanyView;
}

export function buildSourceRunViews(
  jobSourceId: string,
  runs: IngestionRunSummary[],
  jobSources: JobSourceRecord[],
) {
  const jobSource = jobSources.find((item) => item.id === jobSourceId) ?? null;

  if (!jobSource) {
    return null;
  }

  return {
    jobSource,
    runs: runs.filter((item) => item.jobSourceId === jobSourceId),
  };
}

export function buildJobsBySource(jobSourceId: string, jobs: JobRecord[]) {
  return jobs.filter((job) => job.jobSourceId === jobSourceId);
}
