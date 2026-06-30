import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPageWrap, AT } from "@/app/admin/_components/admin-primitives";
import { EmptyState } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminResumeDetailHref,
  buildAdminUserDetailHref,
  filterAdminUsers,
} from "@/lib/admin-users-operations";

import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { UsersList } from "./_components/users-list";
import { deleteUserAction } from "./[id]/actions";

export const metadata = buildAdminMetadata("Usuarios");

const PAGE_SIZE = 50;

type AdminUsersPageProps = {
  searchParams: Promise<{
    page?: string;
    planType?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const { page, planType, query, status } = await searchParams;
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

  const usersDataResult = await getAdminUsersDataSafely();

  if (usersDataResult.kind !== "ok") {
    const state = buildAdminStateModel(usersDataResult.kind, "/admin/usuarios");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews } = usersDataResult.data;

  const filteredUsers = filterAdminUsers(adminUserViews, {
    planType,
    query,
    status,
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePageNum = Math.min(pageNum, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (safePageNum - 1) * PAGE_SIZE,
    safePageNum * PAGE_SIZE,
  );

  const userRows = paginatedUsers.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    planType: user.planType,
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
        <button className={buttonVariants()} type="submit">
          Filtrar
        </button>
      </form>

      {filteredUsers.length === 0 ? (
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
                Página {safePageNum} de {totalPages} · {filteredUsers.length}{" "}
                usuários
              </span>
              <div className="flex gap-2">
                {safePageNum > 1 && (
                  <Link
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={buildPageHref({
                      page: safePageNum - 1,
                      planType,
                      query,
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
                      page: safePageNum + 1,
                      planType,
                      query,
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
  page: number;
  planType?: string;
  query?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.planType) qs.set("planType", params.planType);
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/usuarios?${qs}`;
}
