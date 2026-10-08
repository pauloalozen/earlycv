import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPageWrap, AT } from "@/app/admin/_components/admin-primitives";
import { EmptyState } from "@/components/ui";
import {
  adminPeriodSubLabel,
  getAdminPeriodSince,
  isAdminPeriod,
} from "@/lib/admin-period";
import { getAdminUsersListDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminResumeDetailHref,
  buildAdminUserDetailHref,
} from "@/lib/admin-users-operations";

import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { UsersList } from "./_components/users-list";
import { deleteUserAction } from "./[id]/actions";

export const metadata = buildAdminMetadata("Usuarios");

const SORT_OPTIONS = [
  { value: "created_desc", label: "cadastro: mais recentes" },
  { value: "created_asc", label: "cadastro: mais antigos" },
  { value: "name_asc", label: "nome: A → Z" },
  { value: "name_desc", label: "nome: Z → A" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function resolveSort(raw?: string): SortValue {
  return SORT_OPTIONS.some((option) => option.value === raw)
    ? (raw as SortValue)
    : "created_desc";
}

type AdminUsersPageProps = {
  searchParams: Promise<{
    createdPeriod?: string;
    loginPeriod?: string;
    page?: string;
    planType?: string;
    query?: string;
    sort?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const {
    createdPeriod: rawCreatedPeriod,
    loginPeriod: rawLoginPeriod,
    page,
    planType,
    query,
    sort: rawSort,
    status,
  } = await searchParams;
  const sort = resolveSort(rawSort);
  const loginPeriod = isAdminPeriod(rawLoginPeriod)
    ? rawLoginPeriod
    : undefined;
  const createdPeriod = isAdminPeriod(rawCreatedPeriod)
    ? rawCreatedPeriod
    : undefined;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/usuarios");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const usersDataResult = await getAdminUsersListDataSafely({
    createdSince: createdPeriod
      ? getAdminPeriodSince(createdPeriod).toISOString()
      : undefined,
    loggedInSince: loginPeriod
      ? getAdminPeriodSince(loginPeriod).toISOString()
      : undefined,
    page: pageNum,
    planType,
    query,
    sort,
    status,
  });

  if (usersDataResult.kind !== "ok") {
    const state = buildAdminStateModel(usersDataResult.kind, "/admin/usuarios");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews, limit, total } = usersDataResult.data;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePageNum = Math.min(pageNum, totalPages);

  const userRows = adminUserViews.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    planType: user.planType,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    completenessStatus: user.completenessStatus,
    detailHref: buildAdminUserDetailHref(user.id),
    masterResumeHref: user.masterResume
      ? buildAdminResumeDetailHref(user.masterResume.id)
      : null,
  }));

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="admin · usuários"
        subtitle="Acompanhe contas, completude de perfil e disponibilidade de CV master sem sair do backoffice operacional."
        title="Usuários."
      />

      <form
        className="mb-4 flex flex-wrap gap-2"
        id="users-filter"
        method="GET"
      >
        {loginPeriod ? (
          <input name="loginPeriod" type="hidden" value={loginPeriod} />
        ) : null}
        {createdPeriod ? (
          <input name="createdPeriod" type="hidden" value={createdPeriod} />
        ) : null}
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
            minWidth: 240,
          }}
          defaultValue={query}
          name="query"
          placeholder="Buscar por nome, email ou ID"
        />
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={status ?? ""}
          name="status"
        >
          <option value="">status: todos</option>
          <option value="perfil ausente">perfil ausente</option>
          <option value="perfil incompleto">perfil incompleto</option>
          <option value="sem cv master">sem cv master</option>
          <option value="completo">completo</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={planType ?? ""}
          name="planType"
        >
          <option value="">plano: todos</option>
          <option value="free">free</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sort}
          name="sort"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              ordem: {option.label}
            </option>
          ))}
        </select>
        <button className={buttonVariants()} type="submit">
          Filtrar
        </button>
      </form>

      {loginPeriod || createdPeriod ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]"
          style={{ color: AT.muted }}
        >
          <span>
            Mostrando{" "}
            {[
              createdPeriod
                ? `cadastros · ${adminPeriodSubLabel(createdPeriod)}`
                : null,
              loginPeriod
                ? `usuários logados · ${adminPeriodSubLabel(loginPeriod)}`
                : null,
            ]
              .filter(Boolean)
              .join(" + ")}{" "}
            · {total} {total === 1 ? "usuário" : "usuários"}
          </span>
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={buildPageHref({ page: 1, planType, query, sort, status })}
          >
            Limpar filtro de período
          </Link>
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          description="Nenhuma conta corresponde aos filtros atuais. Ajuste a busca para revisar outro usuário."
          title="Nenhum resultado"
        />
      ) : (
        <>
          <UsersList deleteAction={deleteUserAction} users={userRows} />
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between text-sm"
              style={{ color: AT.muted, marginTop: 8 }}
            >
              <span>
                Página {safePageNum} de {totalPages} · {total} usuários
              </span>
              <div className="flex gap-2">
                {safePageNum > 1 && (
                  <Link
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={buildPageHref({
                      createdPeriod,
                      loginPeriod,
                      page: safePageNum - 1,
                      planType,
                      query,
                      sort,
                      status,
                    })}
                  >
                    ← Anterior
                  </Link>
                )}
                {safePageNum < totalPages && (
                  <Link
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={buildPageHref({
                      createdPeriod,
                      loginPeriod,
                      page: safePageNum + 1,
                      planType,
                      query,
                      sort,
                      status,
                    })}
                  >
                    Próxima →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </AdminPageWrap>
  );
}

function buildPageHref(params: {
  createdPeriod?: string;
  loginPeriod?: string;
  page: number;
  planType?: string;
  query?: string;
  sort?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.createdPeriod) qs.set("createdPeriod", params.createdPeriod);
  if (params.loginPeriod) qs.set("loginPeriod", params.loginPeriod);
  if (params.sort && params.sort !== "created_desc")
    qs.set("sort", params.sort);
  if (params.planType) qs.set("planType", params.planType);
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/usuarios?${qs}`;
}
