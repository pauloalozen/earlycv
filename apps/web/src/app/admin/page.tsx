import Link from "next/link";

import { buttonVariants, Card, EmptyState, StatCard } from "@/components/ui";
import { buildPendingTypeLabel } from "@/lib/admin-operations";
import { getPhaseOneAdminDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "./_components/admin-shell-header";
import { AdminStatusBadge } from "./_components/admin-status-badge";
import { AdminTokenState } from "./_components/admin-token-state";

type AdminOverviewPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminOverviewPage({
  searchParams,
}: AdminOverviewPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const overviewDataResult = await getPhaseOneAdminDataSafely();

  if (overviewDataResult.kind !== "ok") {
    const state = buildAdminStateModel(overviewDataResult.kind, "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const {
    companyViews,
    jobs,
    orderedRuns,
    overviewMetrics,
    pendingItems,
    sourceViews,
  } = overviewDataResult.data;

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <>
              <Link className={buttonVariants()} href={`/admin/empresas/nova`}>
                Adicionar empresa e fonte
              </Link>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/pendencias`}
              >
                Ver pendencias
              </Link>
            </>
          }
          eyebrow="admin / visao geral"
          subtitle="Acompanhe o estado operacional da captura e continue fluxos interrompidos sem sair do backoffice."
          title="Central operacional"
        />

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {overviewMetrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Pendencias priorizadas
              </h2>
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/pendencias`}
              >
                Abrir fila completa
              </Link>
            </div>

            {pendingItems.length === 0 ? (
              <EmptyState
                description="Nenhuma pendencia operacional aberta no momento."
                title="Tudo sob controle"
              />
            ) : (
              <div className="grid gap-3">
                {pendingItems.slice(0, 5).map((item) => (
                  <Card
                    className="space-y-3"
                    key={`${item.type}:${item.entityId}`}
                    padding="sm"
                    variant="ghost"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                          {buildPendingTypeLabel(item.type)} - prioridade{" "}
                          {item.priority}
                        </p>
                        <p className="text-sm font-semibold text-stone-950">
                          {item.title}
                        </p>
                        <p className="text-sm leading-6 text-stone-600">
                          {item.description}
                        </p>
                      </div>
                      <Link
                        className={buttonVariants({ size: "sm" })}
                        href={item.href}
                      >
                        {item.cta}
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Sinais rapidos
              </h2>
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/runs`}
              >
                Ver runs
              </Link>
            </div>
            <div className="grid gap-3">
              <Card padding="sm" variant="muted">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  empresas incompletas
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                  {
                    companyViews.filter(
                      (item) => item.status.label !== "completa",
                    ).length
                  }
                </p>
              </Card>
              <Card padding="sm" variant="muted">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  fontes aguardando run
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                  {
                    sourceViews.filter(
                      (item) => item.status.label === "aguardando primeiro run",
                    ).length
                  }
                </p>
              </Card>
              <Card padding="sm" variant="muted">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  runs com falha
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                  {
                    orderedRuns.filter((item) => item.status === "failed")
                      .length
                  }
                </p>
              </Card>
              <Card padding="sm" variant="muted">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  vagas catalogadas
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                  {jobs.length}
                </p>
              </Card>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Empresas em destaque
              </h2>
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/empresas`}
              >
                Ver empresas
              </Link>
            </div>
            <div className="grid gap-3">
              {companyViews.slice(0, 5).map((company) => (
                <Card
                  className="flex items-center justify-between gap-3"
                  key={company.id}
                  padding="sm"
                  variant="ghost"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-stone-950">
                      {company.name}
                    </p>
                    <p className="text-sm text-stone-600">
                      {company.relatedSources.length} fonte(s) vinculada(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <AdminStatusBadge status={company.status} />
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/empresas/${company.id}`}
                    >
                      Detalhe
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                Ultimos runs
              </h2>
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/admin/runs`}
              >
                Abrir historico
              </Link>
            </div>
            <div className="grid gap-3">
              {orderedRuns.slice(0, 5).map((run) => (
                <Card
                  className="flex items-center justify-between gap-3"
                  key={run.id}
                  padding="sm"
                  variant="ghost"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-stone-950">
                      Run {run.id}
                    </p>
                    <p className="text-sm text-stone-600">{run.startedAt}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <AdminStatusBadge
                      status={{
                        label: run.status,
                        tone:
                          run.status === "failed"
                            ? "danger"
                            : run.status === "running"
                              ? "warning"
                              : "success",
                      }}
                    />
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/runs/${run.id}`}
                    >
                      Detalhe
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
