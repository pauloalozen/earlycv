import Link from "next/link";

import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import {
  buildAdminProfileDetailHref,
  filterAdminUsers,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

type AdminProfilesPageProps = {
  searchParams: Promise<{ query?: string; status?: string; token?: string }>;
};

export default async function AdminProfilesPage({
  searchParams,
}: AdminProfilesPageProps) {
  const { query, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="Entre com um token valido para revisar a completude dos perfis dos usuarios."
          title="Token ausente"
        />
      </div>
    );
  }

  const usersDataResult = await getAdminUsersDataSafely();

  if (usersDataResult.kind === "invalid-token") {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="O token informado e invalido ou expirou. Gere um novo access token para revisar os perfis dos usuarios."
          title="Token invalido"
        />
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
            {profileViews.map(({ profileStatus, user }) => (
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
      </div>
    </div>
  );
}
