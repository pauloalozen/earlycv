import Link from "next/link";

import { buttonVariants, Card, StatCard } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { listStaffUsers } from "@/lib/superadmin-api";
import { getSuperadminDataErrorKind } from "@/lib/superadmin-errors";

import { SuperadminShellHeader } from "./_components/superadmin-shell-header";
import { SuperadminState } from "./_components/superadmin-state";

type SuperadminOverviewPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminOverviewPage({
  searchParams,
}: SuperadminOverviewPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState currentPath="/superadmin" kind="missing-token" />
      </div>
    );
  }

  try {
    const staffUsers = await listStaffUsers();
    const superadminCount = staffUsers.filter(
      (user) => user.internalRole === "superadmin",
    ).length;
    const adminCount = staffUsers.filter(
      (user) => user.internalRole === "admin",
    ).length;
    const activeCount = staffUsers.filter(
      (user) => user.status === "active",
    ).length;

    return (
      <div className="px-6 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <SuperadminShellHeader
            actions={
              <>
                <Link
                  className={buttonVariants({ variant: "dark" })}
                  href={`/superadmin/equipe`}
                >
                  Abrir equipe
                </Link>
                <Link
                  className={buttonVariants({ variant: "outline" })}
                  href={`/superadmin/configuracoes`}
                >
                  Ver configuracoes
                </Link>
              </>
            }
            eyebrow="superadmin / visao geral"
            subtitle="Acompanhe acessos internos, ownership de frentes sensiveis e a base inicial do painel institucional."
            title="Console institucional"
          />

          <Card
            className="overflow-hidden border-slate-200 bg-linear-to-r from-slate-950 via-slate-900 to-teal-900 text-white"
            padding="lg"
          >
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-teal-100/80">
                  governanca inicial
                </p>
                <h2 className="text-3xl font-bold tracking-tight">
                  Superadmin separado do backoffice operacional.
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-slate-200">
                  Esta area concentra equipe interna, templates e frentes de
                  acompanhamento que pedem mais controle institucional que o
                  shell de admin.
                </p>
              </div>
              <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/8 p-5 text-sm text-slate-100">
                <p>Equipe interna ativa: {activeCount}</p>
                <p>Responsaveis com escopo superadmin: {superadminCount}</p>
                <p>Operadores administrativos: {adminCount}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="membros internos" value={staffUsers.length} />
            <StatCard
              label="superadmins"
              tone="success"
              value={superadminCount}
            />
            <StatCard label="contas ativas" value={activeCount} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="space-y-4" padding="lg">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Frentes abertas nesta fase
              </h2>
              <div className="grid gap-3">
                {[
                  {
                    description:
                      "Listagem inicial da equipe interna e detalhe por pessoa para revisar papel, status e atividade.",
                    href: `/superadmin/equipe`,
                    title: "Equipe interna",
                  },
                  {
                    description:
                      "Base visual para configuracoes institucionais e futuros templates administrados por superadmin.",
                    href: `/superadmin/configuracoes`,
                    title: "Configuracoes e templates",
                  },
                  {
                    description:
                      "Area reservada para correcoes guiadas e revisoes delicadas sem misturar com o fluxo operacional.",
                    href: `/superadmin/correcoes`,
                    title: "Correcoes guiadas",
                  },
                ].map((item) => (
                  <Card
                    className="space-y-3"
                    key={item.href}
                    padding="sm"
                    variant="ghost"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-stone-950">
                        {item.title}
                      </p>
                      <p className="text-sm leading-6 text-stone-600">
                        {item.description}
                      </p>
                    </div>
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={item.href}
                    >
                      Abrir modulo
                    </Link>
                  </Card>
                ))}
              </div>
            </Card>

            <Card className="space-y-4" padding="lg">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Equipe em destaque
              </h2>
              <div className="grid gap-3">
                {staffUsers.slice(0, 4).map((user) => (
                  <Card
                    className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                    key={user.id}
                    padding="sm"
                    variant="ghost"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-stone-950">
                        {user.name}
                      </p>
                      <p className="text-sm text-stone-600">{user.email}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {user.internalRole}
                      </p>
                    </div>
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/superadmin/equipe/${user.id}`}
                    >
                      Abrir perfil
                    </Link>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin"
          kind={getSuperadminDataErrorKind(error)}
        />
      </div>
    );
  }
}
