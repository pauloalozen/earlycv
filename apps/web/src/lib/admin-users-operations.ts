import type { AdminStatus, PendingItem } from "./admin-operations";
import type {
  AdminUserProfileRecord,
  AdminUserRecord,
  AdminUserResumeRecord,
  AssistedSessionRecord,
} from "./admin-users-api";

type BuildUserPendingItemsInput = {
  users: Pick<AdminUserRecord, "id" | "name" | "profile" | "resumes">[];
};

export type BackofficeNavItem = {
  href: string;
  label: string;
  phase?: string;
};

const adminNavItems: BackofficeNavItem[] = [
  { href: "/admin", label: "Visao geral" },
  { href: "/admin/pagamentos", label: "Pagamentos" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/fontes", label: "Fontes de vagas" },
  { href: "/admin/runs", label: "Runs de ingestao" },
  { href: "/admin/vagas", label: "Vagas" },
  { href: "/admin/pendencias", label: "Pendencias" },
  { href: "/admin/usuarios", label: "Usuarios", phase: "fase 3" },
  { href: "/admin/perfis", label: "Perfis", phase: "fase 3" },
  { href: "/admin/curriculos", label: "Curriculos", phase: "fase 3" },
  { href: "/admin/templates", label: "Templates de CV" },
  { href: "/admin/configuracoes", label: "Configuracoes", phase: "fase 4" },
  {
    href: "/admin/eventos-e-logs",
    label: "Eventos e logs",
    phase: "fase 4",
  },
];

const superadminNavItems: BackofficeNavItem[] = [
  { href: "/superadmin", label: "Visao geral" },
  { href: "/superadmin/equipe", label: "Equipe" },
  { href: "/superadmin/configuracoes", label: "Configuracoes" },
  { href: "/superadmin/correcoes", label: "Correcoes" },
  { href: "/superadmin/suporte", label: "Suporte" },
];

type SearchableAdminUser = Pick<
  AdminUserRecord,
  "email" | "id" | "name" | "planType" | "status"
> & {
  completenessStatus: AdminStatus;
};

type UserCompletenessInput = {
  hasAnyProfile?: boolean;
  hasMasterResume: boolean;
  hasProfile: boolean;
};

type AssistedSessionSearchParams = {
  banner?: string;
  mode?: string;
  operatorUserId?: string;
  reason?: string;
  targetUserId?: string;
};

export type AdminResumeDisplayKind = "master" | "base" | "adapted";

function hasValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasCompleteProfile(profile: AdminUserProfileRecord | null) {
  if (!profile) {
    return false;
  }

  return [profile.headline, profile.city, profile.country].every(hasValue);
}

function hasAnyProfileContent(profile: AdminUserProfileRecord | null) {
  if (!profile) {
    return false;
  }

  return [profile.headline, profile.city, profile.country].some(hasValue);
}

export function buildAdminUserState(
  user: Pick<AdminUserRecord, "profile" | "resumes">,
) {
  const hasCompleteUserProfile = hasCompleteProfile(user.profile);
  const hasAnyProfile = hasAnyProfileContent(user.profile);

  return {
    hasAnyProfile,
    hasCompleteProfile: hasCompleteUserProfile,
    hasMasterResume: getMasterResume(user.resumes) !== null,
    hasProfile: hasCompleteUserProfile,
  };
}

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

export function buildBackofficeHref(baseHref: string) {
  return baseHref;
}

export function getAdminNavItems() {
  return [...adminNavItems];
}

export function getSuperadminNavItems() {
  return [...superadminNavItems];
}

export function buildAdminUserDetailHref(userId: string) {
  return `/admin/usuarios/${userId}`;
}

export function buildAdminProfileDetailHref(userId: string) {
  return `/admin/perfis/${userId}`;
}

export function buildAdminResumeDetailHref(resumeId: string) {
  return `/admin/curriculos/${resumeId}`;
}

export function buildAssistedSessionState(
  assistedSession: AssistedSessionRecord | null | undefined,
  searchParams: AssistedSessionSearchParams,
  userId: string,
) {
  if (assistedSession?.mode === "assisted") {
    return assistedSession;
  }

  if (
    searchParams.mode !== "assisted" ||
    searchParams.targetUserId !== userId ||
    !searchParams.operatorUserId ||
    !searchParams.reason ||
    !searchParams.banner
  ) {
    return null;
  }

  return {
    banner: searchParams.banner,
    mode: "assisted",
    operatorUserId: searchParams.operatorUserId,
    reason: searchParams.reason,
    targetUserId: searchParams.targetUserId,
  } satisfies AssistedSessionRecord;
}

export function getMasterResume(
  resumes: Pick<
    AdminUserResumeRecord,
    "id" | "isMaster" | "kind" | "status" | "title"
  >[],
) {
  return resumes.find((resume) => resume.isMaster) ?? null;
}

export function getResumeDisplayKind(
  resume: Pick<AdminUserResumeRecord, "isMaster" | "kind">,
): AdminResumeDisplayKind {
  if (resume.isMaster) {
    return "master";
  }

  return resume.kind === "adapted" ? "adapted" : "base";
}

export function countAdaptedResumes(
  resumes: Pick<AdminUserResumeRecord, "isMaster" | "kind">[],
) {
  return resumes.filter(
    (resume) => !resume.isMaster && resume.kind === "adapted",
  ).length;
}

export function buildUserCompletenessStatus(
  input: UserCompletenessInput,
): AdminStatus {
  if (!input.hasProfile) {
    return input.hasAnyProfile
      ? { label: "perfil incompleto", tone: "warning" }
      : { label: "perfil ausente", tone: "warning" };
  }

  if (!input.hasMasterResume) {
    return { label: "sem cv master", tone: "warning" };
  }

  return { label: "completo", tone: "success" };
}

export function buildUserProfileStatus(
  input: Pick<UserCompletenessInput, "hasAnyProfile" | "hasProfile">,
): AdminStatus {
  if (!input.hasAnyProfile) {
    return { label: "perfil ausente", tone: "warning" };
  }

  if (!input.hasProfile) {
    return { label: "perfil incompleto", tone: "warning" };
  }

  return { label: "completo", tone: "success" };
}

export function buildUserPendingItems({
  users,
}: BuildUserPendingItemsInput): PendingItem[] {
  const items: PendingItem[] = [];

  for (const user of users) {
    const userState = buildAdminUserState(user);

    if (!userState.hasAnyProfile) {
      items.push({
        cta: "Iniciar perfil",
        description:
          "Usuario sem perfil preenchido para alimentar o fluxo de adaptacao.",
        entityId: user.id,
        href: buildAdminUserDetailHref(user.id),
        priority: "alta",
        title: user.name,
        type: "user-missing-profile",
      });
      continue;
    }

    if (!userState.hasProfile) {
      items.push({
        cta: "Completar perfil",
        description:
          "Perfil iniciado, mas ainda sem todos os campos obrigatorios para seguir no fluxo.",
        entityId: user.id,
        href: buildAdminUserDetailHref(user.id),
        priority: "alta",
        title: user.name,
        type: "user-incomplete-profile",
      });
      continue;
    }

    if (!userState.hasMasterResume) {
      items.push({
        cta: "Enviar CV master",
        description:
          "Usuario com perfil pronto, mas ainda sem um CV master para adaptar vagas.",
        entityId: user.id,
        href: buildAdminUserDetailHref(user.id),
        priority: "alta",
        title: user.name,
        type: "user-missing-master-resume",
      });
    }
  }

  return items;
}

export function filterAdminUsers<T extends SearchableAdminUser>(
  users: T[],
  filters: { planType?: string; query?: string; status?: string },
) {
  return users.filter(
    (user) =>
      matchesQuery([user.name, user.email, user.id], filters.query) &&
      (!filters.planType || user.planType === filters.planType) &&
      (!filters.status || user.completenessStatus.label === filters.status),
  );
}
