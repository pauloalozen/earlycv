import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants, Card, EmptyState, InfoField } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminProfileDetailHref,
  buildAdminResumeDetailHref,
  buildAssistedSessionState,
  getResumeDisplayKind,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminStatusBadge } from "../../_components/admin-status-badge";
import { AdminTokenState } from "../../_components/admin-token-state";
import { setUserCreditsAction } from "./actions";
import { SetCreditsForm } from "./set-credits-form";

type AdminUserDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    banner?: string;
    mode?: string;
    operatorUserId?: string;
    reason?: string;
    targetUserId?: string;
    token?: string;
  }>;
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: AdminUserDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/usuarios/${id}`,
    );

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
      `/admin/usuarios/${id}`,
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

  const assistedSession = buildAssistedSessionState(
    user.assistedSession,
    query,
    user.id,
  );

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/usuarios`}
              >
                Voltar para usuarios
              </Link>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={buildAdminProfileDetailHref(user.id)}
              >
                Abrir perfil
              </Link>
            </>
          }
          eyebrow="admin / usuarios / detalhe"
          subtitle="Revise os principais sinais da conta, confirme completude e navegue para o perfil ou curriculos vinculados."
          title={user.name}
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              completude
            </p>
            <div className="mt-3">
              <AdminStatusBadge status={user.completenessStatus} />
            </div>
          </Card>
          <InfoField label="email" description={user.email} />
          <InfoField label="plano" description={user.planType} />
          <InfoField
            label="creditos"
            description={String(user.creditsRemaining)}
          />
          <InfoField label="status da conta" description={user.status} />
        </div>

        <Card className="space-y-3" padding="lg">
          <h2 className="text-xl font-bold tracking-tight text-stone-950">
            Ajustar creditos
          </h2>
          <p className="text-sm text-stone-600">
            Defina a quantidade exata de creditos disponiveis para este usuario.
          </p>
          <SetCreditsForm
            currentCredits={user.creditsRemaining}
            setCreditsAction={setUserCreditsAction.bind(null, user.id)}
          />
        </Card>

        {assistedSession?.mode === "assisted" ? (
          <Card className="border-orange-200 bg-orange-50/80" padding="lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange-700">
                  sessao assistida ativa
                </p>
                <h2 className="text-xl font-bold tracking-tight text-stone-950">
                  {assistedSession.banner}
                </h2>
                <p className="text-sm leading-6 text-stone-700">
                  {assistedSession.reason}
                </p>
              </div>
              <div className="min-w-0 md:max-w-sm">
                <AdminStatusBadge
                  status={{ label: "acompanhamento manual", tone: "warning" }}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <InfoField label="modo" description={assistedSession.mode} />
              <InfoField
                label="operador"
                description={assistedSession.operatorUserId}
              />
              <InfoField
                label="conta alvo"
                description={assistedSession.targetUserId}
              />
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoField label="id do usuario" description={user.id} />
          <InfoField
            label="email verificado"
            description={user.emailVerifiedAt ?? "nao verificado"}
          />
          <InfoField
            label="ultimo login"
            description={user.lastLoginAt ?? "ainda sem login"}
          />
          <InfoField
            label="curriculos"
            description={`${user.resumes.length} total / ${user.adaptedResumeCount} adaptado(s)`}
          />
        </div>

        <Card className="space-y-4" padding="lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              Perfil associado
            </h2>
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={buildAdminProfileDetailHref(user.id)}
            >
              Ver detalhe do perfil
            </Link>
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
              description="Esta conta ainda nao possui perfil completo para alimentar o processo de adaptacao de CV."
              title="Perfil ausente"
            />
          )}
          {user.profileStatus.label === "perfil incompleto" ? (
            <EmptyState
              description="O perfil ja foi iniciado, mas ainda faltam campos obrigatorios antes de tratar a conta como pronta para o fluxo completo de CV."
              title="Perfil incompleto"
            />
          ) : null}
        </Card>

        {user.resumes.length === 0 ? (
          <EmptyState
            description="Nenhum curriculo foi enviado ate agora para esta conta."
            title="Sem curriculos"
          />
        ) : (
          <Card className="space-y-4" padding="lg">
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              Curriculos enviados
            </h2>
            <div className="grid gap-3">
              {user.resumes.map((resume) => (
                <Card
                  className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                  key={resume.id}
                  padding="sm"
                  variant="ghost"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-stone-950">
                      {resume.title}
                    </p>
                    <p className="text-sm text-stone-600">
                      {getResumeDisplayKind(resume) === "master"
                        ? "CV master"
                        : getResumeDisplayKind(resume) === "base"
                          ? "CV base"
                          : "CV adaptado"}{" "}
                      - {resume.status}
                    </p>
                  </div>
                  <Link
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    href={buildAdminResumeDetailHref(resume.id)}
                  >
                    Abrir curriculo
                  </Link>
                </Card>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
