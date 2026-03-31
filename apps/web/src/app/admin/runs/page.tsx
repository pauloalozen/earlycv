import Link from "next/link";

import { buttonVariants, Card, EmptyState } from "@/components/ui";
import { getPhaseOneAdminData } from "@/lib/admin-phase-one-data";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

type RunsPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminRunsPage({ searchParams }: RunsPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="Entre com um token valido para revisar o historico global de runs."
          title="Token ausente"
        />
      </div>
    );
  }

  const { orderedRuns, sourceViews } = await getPhaseOneAdminData(token);
  const sourceMap = new Map(sourceViews.map((source) => [source.id, source]));

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / runs"
          subtitle="Audite todas as execucoes de ingestao em um historico unico e navegue para a fonte correspondente."
          title="Runs de ingestao"
        />

        {orderedRuns.length === 0 ? (
          <EmptyState
            description="Nenhum run foi executado ainda. Rode a primeira fonte para iniciar o historico."
            title="Sem runs"
          />
        ) : (
          <div className="grid gap-4">
            {orderedRuns.map((run) => {
              const source = sourceMap.get(run.jobSourceId);

              return (
                <Card
                  className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                  key={run.id}
                >
                  <div className="space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                      {run.startedAt}
                    </p>
                    <h2 className="text-lg font-bold tracking-tight text-stone-950">
                      {source?.sourceName ?? run.jobSourceId}
                    </h2>
                    <p className="text-sm text-stone-600">
                      {source?.company.name ?? "Fonte desconhecida"} - novas{" "}
                      {run.newCount} - atualizadas {run.updatedCount} - falhas{" "}
                      {run.failedCount}
                    </p>
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
                      href={`/admin/runs/${run.id}?token=${encodeURIComponent(token)}`}
                    >
                      Ver detalhe
                    </Link>
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
