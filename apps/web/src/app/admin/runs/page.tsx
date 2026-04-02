import Link from "next/link";

import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { filterRuns } from "@/lib/admin-operations";
import { getPhaseOneAdminDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

type RunsPageProps = {
  searchParams: Promise<{ query?: string; status?: string; token?: string }>;
};

export default async function AdminRunsPage({ searchParams }: RunsPageProps) {
  const { query, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/runs");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const runsDataResult = await getPhaseOneAdminDataSafely();

  if (runsDataResult.kind !== "ok") {
    const state = buildAdminStateModel(runsDataResult.kind, "/admin/runs");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { orderedRuns, sourceViews } = runsDataResult.data;
  const sourceMap = new Map(sourceViews.map((source) => [source.id, source]));
  const filteredRuns = filterRuns(
    orderedRuns.map((run) => ({
      companyName: sourceMap.get(run.jobSourceId)?.company.name ?? "",
      id: run.id,
      sourceName: sourceMap.get(run.jobSourceId)?.sourceName ?? run.jobSourceId,
      status: run.status,
    })),
    { query, status },
  );
  const filteredRunIds = new Set(filteredRuns.map((run) => run.id));
  const visibleRuns = orderedRuns.filter((run) => filteredRunIds.has(run.id));

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / runs"
          subtitle="Audite todas as execucoes de ingestao em um historico unico e navegue para a fonte correspondente."
          title="Runs de ingestao"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="runs-filter"
            name="query"
            placeholder="Buscar por empresa, fonte ou id"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="runs-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="running">running</option>
          </select>
          <form className="contents" id="runs-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {filteredRuns.length === 0 ? (
          <EmptyState
            description="Nenhum run corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4">
            {visibleRuns.map((run) => {
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
                      href={`/admin/runs/${run.id}`}
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
