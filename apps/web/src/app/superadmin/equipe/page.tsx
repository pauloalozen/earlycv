import Link from "next/link";

import { buttonVariants, Card, EmptyState, StatCard } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { listStaffUsers } from "@/lib/superadmin-api";
import { getSuperadminDataErrorKind } from "@/lib/superadmin-errors";

import { SuperadminShellHeader } from "../_components/superadmin-shell-header";
import { SuperadminState } from "../_components/superadmin-state";

type SuperadminTeamPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminTeamPage({
  searchParams,
}: SuperadminTeamPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/equipe"
          kind="missing-token"
        />
      </div>
    );
  }

  try {
    const staffUsers = await listStaffUsers();
    const superadminCount = staffUsers.filter(
      (user) => user.internalRole === "superadmin",
    ).length;

    return (
      <div className="px-6 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <SuperadminShellHeader
            eyebrow="superadmin / equipe"
            subtitle="Lista inicial da equipe interna com foco em papel, estado da conta e navegacao para detalhe individual."
            title="Equipe interna"
          />

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="total interno" value={staffUsers.length} />
            <StatCard
              label="superadmins"
              tone="success"
              value={superadminCount}
            />
            <StatCard
              label="admins"
              value={
                staffUsers.filter((user) => user.internalRole === "admin")
                  .length
              }
            />
          </div>

          {staffUsers.length === 0 ? (
            <EmptyState
              description="Nenhuma conta interna foi retornada pela API de superadmin."
              title="Equipe vazia"
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {staffUsers.map((user) => (
                <Card className="space-y-4" key={user.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xl font-bold tracking-tight text-stone-950">
                        {user.name}
                      </p>
                      <p className="text-sm text-stone-600">{user.email}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {user.id}
                      </p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">
                      {user.internalRole}
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                    <p>Status: {user.status}</p>
                    <p>Plano: {user.planType}</p>
                    <p>
                      Email verificado: {user.emailVerifiedAt ? "sim" : "nao"}
                    </p>
                    <p>Ultimo login: {user.lastLoginAt ?? "ainda sem login"}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      className={buttonVariants({ variant: "dark" })}
                      href={`/superadmin/equipe/${user.id}`}
                    >
                      Abrir detalhe
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/equipe"
          kind={getSuperadminDataErrorKind(error)}
        />
      </div>
    );
  }
}
