import "server-only";

import { listAllIngestionRuns } from "./admin-ingestion-api";
import { sortRunsDescending } from "./admin-operations";
import {
  getAdminDataErrorKind,
  isApiNotFoundError,
} from "./admin-token-errors";
import {
  type AdminUserRecord,
  type AssistedSessionRecord,
  getAdminResume,
  getAdminUser,
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

// REGRA desta camada: nenhuma função aqui carrega uma base inteira. Listagens
// são paginadas NO SERVIDOR (a API recebe page/limit e filtros) e telas de
// detalhe consultam um registro por id. Números agregados vêm de COUNT/SUM
// (ver admin-overview-api.ts), nunca de somar listas no front.

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

// Detalhe de um usuário por id (GET /admin/users/:id) — telas
// usuarios/[id], perfis/[id] e o dono de curriculos/[id].
export async function getAdminUserViewData(userId: string, token?: string) {
  const user = (await getAdminUser(
    userId,
    token,
  )) as AdminUserWithAssistedSession;

  return toAdminUserView(user);
}

// Currículo por id + o usuário dono (duas consultas pontuais).
export async function getAdminResumeOwnerData(
  resumeId: string,
  token?: string,
) {
  const resume = await getAdminResume(resumeId, token);
  return getAdminUserViewData(resume.userId, token);
}

export async function getAdminUserViewDataSafely(
  userId: string,
  token?: string,
) {
  try {
    return {
      data: await getAdminUserViewData(userId, token),
      kind: "ok",
    } as const;
  } catch (error) {
    if (isApiNotFoundError(error)) return { kind: "not-found" } as const;
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}

export async function getAdminResumeOwnerDataSafely(
  resumeId: string,
  token?: string,
) {
  try {
    const owner = await getAdminResumeOwnerData(resumeId, token);
    const resume = owner.resumes.find((item) => item.id === resumeId) ?? null;
    if (!resume) return { kind: "not-found" } as const;
    return { data: { owner, resume }, kind: "ok" } as const;
  } catch (error) {
    if (isApiNotFoundError(error)) return { kind: "not-found" } as const;
    return { kind: getAdminDataErrorKind(error) } as const;
  }
}

export async function getAdminUsersListData(
  filters: {
    page: number;
    limit?: number;
    planType?: string;
    profileStatus?: string;
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
    profileStatus?: string;
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
