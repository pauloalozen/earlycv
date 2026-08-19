import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, EmptyState, Input } from "@/components/ui";
import { getRunsDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Runs");

type RunsPageProps = {
  searchParams: Promise<{
    page?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminRunsPage({ searchParams }: RunsPageProps) {
  const { page, query, status } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/runs");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const runsDataResult = await getRunsDataSafely({
    page: pageNum,
    query,
    status,
  });

  if (runsDataResult.kind !== "ok") {
    const state = buildAdminStateModel(runsDataResult.kind, "/admin/runs");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { limit, orderedRuns: visibleRuns, total } = runsDataResult.data;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePageNum = Math.min(pageNum, totalPages);

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

        {total === 0 ? (
          <EmptyState
            description="Nenhum run corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <>
            <div className="grid gap-4">
              {visibleRuns.map((run) => (
                <Card
                  className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                  key={run.id}
                >
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-stone-400">
                      {run.startedAt}
                    </p>
                    <h2 className="text-lg font-bold tracking-tight text-stone-950">
                      {run.sourceName ?? run.jobSourceId}
                    </h2>
                    <p className="text-sm text-stone-600">
                      {run.companyName ?? "Fonte desconhecida"} - novas{" "}
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
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-stone-500">
                <span>
                  Página {safePageNum} de {totalPages} · {total} runs
                </span>
                <div className="flex gap-2">
                  {safePageNum > 1 && (
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={buildRunsPageHref({
                        page: safePageNum - 1,
                        query,
                        status,
                      })}
                    >
                      ← Anterior
                    </Link>
                  )}
                  {safePageNum < totalPages && (
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={buildRunsPageHref({
                        page: safePageNum + 1,
                        query,
                        status,
                      })}
                    >
                      Próxima →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function buildRunsPageHref(params: {
  page: number;
  query?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/runs?${qs}`;
}
