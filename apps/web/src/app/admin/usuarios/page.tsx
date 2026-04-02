import Link from "next/link";

import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminProfileDetailHref,
  buildAdminResumeDetailHref,
  buildAdminUserDetailHref,
  buildAdminUserState,
  filterAdminUsers,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

type AdminUsersPageProps = {
  searchParams: Promise<{
    planType?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const { planType, query, status } = await searchParams;
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

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / usuarios"
          subtitle="Acompanhe contas, completude de perfil e disponibilidade de CV master sem sair do backoffice operacional."
          title="Usuarios"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_0.8fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="users-filter"
            name="query"
            placeholder="Buscar por nome, email ou id"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="users-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="perfil ausente">perfil ausente</option>
            <option value="perfil incompleto">perfil incompleto</option>
            <option value="sem cv master">sem cv master</option>
            <option value="completo">completo</option>
          </select>
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={planType ?? ""}
            form="users-filter"
            name="planType"
          >
            <option value="">Todos os planos</option>
            <option value="free">free</option>
          </select>
          <form className="contents" id="users-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {filteredUsers.length === 0 ? (
          <EmptyState
            description="Nenhuma conta corresponde aos filtros atuais. Ajuste a busca para revisar outro usuario."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredUsers.map((user) => {
              const profileState = buildAdminUserState(user);

              return (
                <Card className="space-y-4" key={user.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xl font-bold tracking-tight text-stone-950">
                        {user.name}
                      </p>
                      <p className="text-sm text-stone-600">{user.email}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                        {user.id}
                      </p>
                    </div>
                    <AdminStatusBadge status={user.completenessStatus} />
                  </div>

                  <div className="grid gap-2 rounded-[18px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600 md:grid-cols-2">
                    <p>Plano: {user.planType}</p>
                    <p>Status da conta: {user.status}</p>
                    <p>
                      Perfil:{" "}
                      {profileState.hasProfile
                        ? "completo"
                        : user.profile
                          ? "incompleto"
                          : "ausente"}
                    </p>
                    <p>CV adaptados: {user.adaptedResumeCount}</p>
                    <p className="md:col-span-2">
                      CV master: {user.masterResume?.title ?? "nao enviado"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      className={buttonVariants()}
                      href={buildAdminUserDetailHref(user.id)}
                    >
                      Abrir usuario
                    </Link>
                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={buildAdminProfileDetailHref(user.id)}
                    >
                      Ver perfil
                    </Link>
                    {user.masterResume ? (
                      <Link
                        className={buttonVariants({ variant: "outline" })}
                        href={buildAdminResumeDetailHref(user.masterResume.id)}
                      >
                        Ver CV master
                      </Link>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
