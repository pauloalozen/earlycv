import "server-only";

import {
  type CompanyRecord,
  type IngestionRunSummary,
  type JobRecord,
  type JobSourceRecord,
  listAllIngestionRuns,
  listCompanies,
  listJobSources,
} from "./admin-ingestion-api";
import {
  buildCompanyStatus,
  buildPendingItems,
  buildSourceStatus,
  groupSourcesByCompany,
  sortRunsDescending,
} from "./admin-operations";
import { getAdminDataErrorKind } from "./admin-token-errors";
import {
  type AdminUserRecord,
  type AssistedSessionRecord,
  listAdminUsers,
} from "./admin-users-api";
import {
  buildAdminUserState,
  buildUserCompletenessStatus,
  buildUserProfileStatus,
  countAdaptedResumes,
  getMasterResume,
} from "./admin-users-operations";

export type AdminCompanyView = CompanyRecord & {
  relatedSources: JobSourceRecord[];
  status: ReturnType<typeof buildCompanyStatus>;
};

export type AdminJobSourceView = JobSourceRecord & {
  status: ReturnType<typeof buildSourceStatus>;
};

export type AdminUserView = AdminUserRecord & {
  adaptedResumeCount: number;
  assistedSession?: AssistedSessionRecord | null;
  completenessStatus: ReturnType<typeof buildUserCompletenessStatus>;
  masterResume: ReturnType<typeof getMasterResume>;
  profileStatus: ReturnType<typeof buildUserProfileStatus>;
};

type AdminUserWithAssistedSession = AdminUserRecord & {
  assistedSession?: AssistedSessionRecord | null;
};

export async function getPhaseOneAdminData(token?: string) {
  const [adminUsersResult, companies, jobSources, runs] = await Promise.all([
    listAdminUsers(token),
    listCompanies(token),
    listJobSources(token),
    listAllIngestionRuns(token),
  ]);
  const adminUsers = adminUsersResult as AdminUserWithAssistedSession[];
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
  const adminUserViews = adminUsers.map((user) => {
    const userState = buildAdminUserState(user);

    return {
      ...user,
      adaptedResumeCount: countAdaptedResumes(user.resumes),
      completenessStatus: buildUserCompletenessStatus({
        hasAnyProfile: userState.hasAnyProfile,
        hasMasterResume: userState.hasMasterResume,
        hasProfile: userState.hasProfile,
      }),
      masterResume: getMasterResume(user.resumes),
      profileStatus: buildUserProfileStatus(userState),
    };
  }) satisfies AdminUserView[];
  const pendingItems = buildPendingItems({
    adminUsers,
    companies,
    jobSources,
  });
  const orderedRuns = sortRunsDescending(runs);

  return {
    adminUserViews,
    adminUsers,
    companies,
    companyViews,
    orderedRuns,
    pendingItems,
    runs,
    sourceViews,
  };
}

export async function getPhaseOneAdminDataSafely(token?: string) {
  try {
    return {
      data: await getPhaseOneAdminData(token),
      kind: "ok",
    } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}

export async function getAdminUsersData(token?: string) {
  const adminUsers = (await listAdminUsers(
    token,
  )) as AdminUserWithAssistedSession[];

  return {
    adminUsers,
    adminUserViews: adminUsers.map((user) => {
      const userState = buildAdminUserState(user);

      return {
        ...user,
        adaptedResumeCount: countAdaptedResumes(user.resumes),
        completenessStatus: buildUserCompletenessStatus({
          hasAnyProfile: userState.hasAnyProfile,
          hasMasterResume: userState.hasMasterResume,
          hasProfile: userState.hasProfile,
        }),
        masterResume: getMasterResume(user.resumes),
        profileStatus: buildUserProfileStatus(userState),
      };
    }) satisfies AdminUserView[],
  };
}

export async function getAdminUsersDataSafely(token?: string) {
  try {
    return {
      data: await getAdminUsersData(token),
      kind: "ok",
    } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
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

async function getPendingData(token?: string) {
  const [adminUsersResult, companies, jobSources] = await Promise.all([
    listAdminUsers(token),
    listCompanies(token),
    listJobSources(token),
  ]);
  const adminUsers = adminUsersResult as AdminUserWithAssistedSession[];
  const pendingItems = buildPendingItems({ adminUsers, companies, jobSources });
  return { pendingItems };
}

export async function getPendingDataSafely(token?: string) {
  try {
    return { data: await getPendingData(token), kind: "ok" } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}

async function getRunsData(token?: string) {
  const [runs, jobSources] = await Promise.all([
    listAllIngestionRuns(token),
    listJobSources(token),
  ]);
  const sourceViews = jobSources.map((jobSource) => ({
    ...jobSource,
    status: buildSourceStatus(jobSource),
  })) satisfies AdminJobSourceView[];
  return { orderedRuns: sortRunsDescending(runs), sourceViews };
}

export async function getRunsDataSafely(token?: string) {
  try {
    return { data: await getRunsData(token), kind: "ok" } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}
