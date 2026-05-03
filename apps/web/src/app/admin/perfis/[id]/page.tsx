import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants, Card, EmptyState, InfoField } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminStatusBadge } from "../../_components/admin-status-badge";
import { AdminTokenState } from "../../_components/admin-token-state";

export const metadata = buildAdminMetadata("Detalhe do perfil");

type AdminProfileDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminProfileDetailPage({
  params,
  searchParams,
}: AdminProfileDetailPageProps) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", `/admin/perfis/${id}`);

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const usersDataResult = await getAdminUsersDataSafely();

  if (usersDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      usersDataResult.kind,
      `/admin/perfis/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews } = usersDataResult.data;

  const user = adminUserViews.find((item) => item.id === id) ?? null;

  if (!user) {
    notFound();
  }

  const profileStatus = user.profileStatus;

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/perfis`}
              >
                Voltar para perfis
              </Link>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/usuarios/${user.id}`}
              >
                Abrir usuario
              </Link>
            </>
          }
          eyebrow="admin / perfis / detalhe"
          subtitle="Use este painel para confirmar se o usuario ja forneceu as informacoes minimas para o CV master."
          title={user.name}
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              status do perfil
            </p>
            <div className="mt-3">
              <AdminStatusBadge status={profileStatus} />
            </div>
          </Card>
          <InfoField label="usuario" description={user.email} />
          <InfoField
            label="CV master"
            description={user.masterResume?.title ?? "nao enviado"}
          />
          <InfoField
            label="CV adaptados"
            description={String(user.adaptedResumeCount)}
          />
        </div>

        {user.profile ? (
          <div className="grid gap-4 md:grid-cols-3">
            <InfoField
              label="headline"
              description={user.profile.headline ?? "nao informado"}
            />
            <InfoField
              label="cidade"
              description={user.profile.city ?? "nao informado"}
            />
            <InfoField
              label="pais"
              description={user.profile.country ?? "nao informado"}
            />
          </div>
        ) : (
          <EmptyState
            description="Este usuario ainda nao concluiu o perfil. Sem headline, cidade e pais nao ha contexto suficiente para operar a camada de CVs."
            title="Perfil ainda ausente"
          />
        )}
        {user.profile && profileStatus.label === "perfil incompleto" ? (
          <EmptyState
            description="O perfil ja existe, mas ainda faltam campos obrigatorios para sustentar o CV master com contexto suficiente."
            title="Perfil incompleto"
          />
        ) : null}
      </div>
    </div>
  );
}
