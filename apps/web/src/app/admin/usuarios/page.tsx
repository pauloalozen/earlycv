import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminResumeDetailHref,
  buildAdminUserDetailHref,
  filterAdminUsers,
} from "@/lib/admin-users-operations";

import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { UsersList } from "./_components/users-list";
import { deleteUserAction } from "./[id]/actions";

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

  const userRows = filteredUsers.map((user) => ({
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
          <UsersList deleteAction={deleteUserAction} users={userRows} />
        )}
      </div>
    </div>
  );
}
