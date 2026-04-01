import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants, Card, InfoField } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { listStaffUsers, type StaffUserRecord } from "@/lib/superadmin-api";
import {
  getSuperadminDataErrorKind,
  isNextNotFoundError,
} from "@/lib/superadmin-errors";

import { SuperadminShellHeader } from "../../_components/superadmin-shell-header";
import { SuperadminState } from "../../_components/superadmin-state";

type SuperadminTeamDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminTeamDetailPage({
  params,
  searchParams,
}: SuperadminTeamDetailPageProps) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath={`/superadmin/equipe/${id}`}
          kind="missing-token"
        />
      </div>
    );
  }

  let staffUsers: StaffUserRecord[];

  try {
    staffUsers = await listStaffUsers();
  } catch (error) {
    if (isNextNotFoundError(error)) {
      throw error;
    }

    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath={`/superadmin/equipe/${id}`}
          kind={getSuperadminDataErrorKind(error)}
        />
      </div>
    );
  }

  const user = staffUsers.find((item) => item.id === id) ?? null;

  if (!user) {
    notFound();
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <SuperadminShellHeader
          actions={
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/superadmin/equipe`}
            >
              Voltar para equipe
            </Link>
          }
          eyebrow="superadmin / equipe / detalhe"
          subtitle="Visao inicial de papel, status e atividade recente para contas internas."
          title={user.name}
        />

        <Card
          className="grid gap-4 border-slate-200 bg-slate-50/80 md:grid-cols-4"
          padding="lg"
        >
          <InfoField label="papel interno" description={user.internalRole} />
          <InfoField label="status da conta" description={user.status} />
          <InfoField label="plano" description={user.planType} />
          <InfoField
            label="ultimo login"
            description={user.lastLoginAt ?? "ainda sem login"}
          />
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoField label="id do usuario" description={user.id} />
          <InfoField label="email" description={user.email} />
          <InfoField
            label="email verificado"
            description={user.emailVerifiedAt ?? "nao verificado"}
          />
          <InfoField label="criado em" description={user.createdAt} />
        </div>

        <Card className="space-y-4 border-slate-200 bg-slate-50" padding="lg">
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
              leitura institucional
            </p>
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              Escopo inicial do perfil interno
            </h2>
          </div>
          <p className="text-sm leading-7 text-slate-700">
            Este detalhe inicial ajuda a confirmar ownership da conta e
            disponibilidade recente de acesso. Edicao, hardening de sessao e
            trilha de auditoria seguem em fases posteriores.
          </p>
        </Card>
      </div>
    </div>
  );
}
