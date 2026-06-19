import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import { Card, EmptyState, Input } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminProfileDetailHref,
  filterAdminUsers,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Perfis");

const PAGE_SIZE = 50;

type AdminProfilesPageProps = {
  searchParams: Promise<{
    page?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminProfilesPage({
  searchParams,
}: AdminProfilesPageProps) {
  const { page, query, status } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/perfis");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const usersDataResult = await getAdminUsersDataSafely();

  if (usersDataResult.kind !== "ok") {
    const state = buildAdminStateModel(usersDataResult.kind, "/admin/perfis");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews } = usersDataResult.data;

  const profileViews = filterAdminUsers(adminUserViews, { query })
    .map((user) => ({
      profileStatus: user.profileStatus,
      user,
    }))
    .filter((item) => !status || item.profileStatus.label === status);

  const totalPages = Math.max(1, Math.ceil(profileViews.length / PAGE_SIZE));
  const safePageNum = Math.min(pageNum, totalPages);
  const paginatedProfileViews = profileViews.slice(
    (safePageNum - 1) * PAGE_SIZE,
    safePageNum * PAGE_SIZE,
  );

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / perfis"
          subtitle="Revise o preenchimento de headline, cidade e pais para identificar perfis que ainda travam a experiencia do usuario."
          title="Perfis"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="profiles-filter"
            name="query"
            placeholder="Buscar por nome, email ou id"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="profiles-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="completo">completo</option>
            <option value="perfil incompleto">perfil incompleto</option>
            <option value="perfil ausente">perfil ausente</option>
          </select>
          <form className="contents" id="profiles-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {profileViews.length === 0 ? (
          <EmptyState
            description="Nenhum perfil corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {paginatedProfileViews.map(({ profileStatus, user }) => (
              <Card className="space-y-4" key={user.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xl font-bold tracking-tight text-stone-950">
                      {user.name}
                    </p>
                    <p className="text-sm text-stone-600">{user.email}</p>
                  </div>
                  <AdminStatusBadge status={profileStatus} />
                </div>

                <div className="grid gap-2 rounded-[18px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                  <p>Headline: {user.profile?.headline ?? "nao informado"}</p>
                  <p>Cidade: {user.profile?.city ?? "nao informado"}</p>
                  <p>Pais: {user.profile?.country ?? "nao informado"}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants()}
                    href={buildAdminProfileDetailHref(user.id)}
                  >
                    Abrir perfil
                  </Link>
                  <Link
                    className={buttonVariants({ variant: "outline" })}
                    href={`/admin/usuarios/${user.id}`}
                  >
                    Ver usuario
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}

        {totalPages > 1 && profileViews.length > 0 && (
          <div
            className="flex items-center justify-between text-sm"
            style={{ color: AT.muted }}
          >
            <span>
              Página {safePageNum} de {totalPages} · {profileViews.length}{" "}
              perfis
            </span>
            <div className="flex gap-2">
              {safePageNum > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({ page: safePageNum - 1, query, status })}
                >
                  ← Anterior
                </Link>
              )}
              {safePageNum < totalPages && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({ page: safePageNum + 1, query, status })}
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildPageHref(params: {
  page: number;
  query?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/perfis?${qs}`;
}
