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
  listAdminResumes,
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
  // Nao busca listAllIngestionRuns aqui: nenhuma das paginas que chamam
  // essa funcao (/admin, /admin/empresas, /admin/empresas/[id]) usa o
  // historico de runs — so /admin/runs usa, via getRunsData abaixo. Essa
  // lista carrega previewJson de cada run (pode ser um blob grande) sem
  // paginacao, entao buscar sem necessidade pesava a tela toda.
  const [adminUsersResult, companies, jobSources] = await Promise.all([
    listAdminUsers({}, token),
    listCompanies(token),
    listJobSources(token),
  ]);
  const adminUsers =
    adminUsersResult.users as AdminUserWithAssistedSession[];
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

  return {
    adminUserViews,
    adminUsers,
    companies,
    companyViews,
    pendingItems,
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

function toAdminUserView(user: AdminUserWithAssistedSession) {
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
  } satisfies AdminUserView;
}

// Usada pelas paginas de detalhe por id (usuarios/perfis/curriculos/[id])
// e por qualquer lugar que precise olhar a base inteira de uma vez — sem
// page/limit explicitos, o backend mantem o comportamento antigo (devolve
// todo mundo). Pra listagem paginada de verdade, ver getAdminUsersListData
// abaixo.
export async function getAdminUsersData(token?: string) {
  const { users } = await listAdminUsers({}, token);
  const adminUsers = users as AdminUserWithAssistedSession[];

  return {
    adminUsers,
    adminUserViews: adminUsers.map(toAdminUserView),
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

export async function getAdminUsersListData(
  filters: {
    page: number;
    limit?: number;
    planType?: string;
    query?: string;
    status?: string;
  },
  token?: string,
) {
  const { limit, page, total, users } = await listAdminUsers(filters, token);
  const adminUsers = users as AdminUserWithAssistedSession[];

  return {
    adminUserViews: adminUsers.map(toAdminUserView),
    limit,
    page,
    total,
  };
}

export async function getAdminUsersListDataSafely(
  filters: {
    page: number;
    limit?: number;
    planType?: string;
    query?: string;
    status?: string;
  },
  token?: string,
) {
  try {
    return {
      data: await getAdminUsersListData(filters, token),
      kind: "ok",
    } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}

export async function getAdminResumesListData(
  filters: {
    page: number;
    limit?: number;
    kind?: "master" | "base" | "adapted";
    query?: string;
    status?: string;
  },
  token?: string,
) {
  return listAdminResumes(filters, token);
}

export async function getAdminResumesListDataSafely(
  filters: {
    page: number;
    limit?: number;
    kind?: "master" | "base" | "adapted";
    query?: string;
    status?: string;
  },
  token?: string,
) {
  try {
    return {
      data: await getAdminResumesListData(filters, token),
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
    listAdminUsers({}, token),
    listCompanies(token),
    listJobSources(token),
  ]);
  const adminUsers =
    adminUsersResult.users as AdminUserWithAssistedSession[];
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

async function getRunsData(
  filters: { page?: number; limit?: number; query?: string; status?: string },
  token?: string,
) {
  // companyName/sourceName ja vem no proprio IngestionRunSummary (o /runs
  // do backend faz o join com jobSource/company) — nao precisa buscar
  // listJobSources aqui so pra montar um Map de lookup.
  const { limit, page, runs, total } = await listAllIngestionRuns(
    filters,
    token,
  );
  return { limit, orderedRuns: sortRunsDescending(runs), page, total };
}

export async function getRunsDataSafely(
  filters: { page?: number; limit?: number; query?: string; status?: string },
  token?: string,
) {
  try {
    return { data: await getRunsData(filters, token), kind: "ok" } as const;
  } catch (error) {
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}
