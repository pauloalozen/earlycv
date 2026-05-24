import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { Card, Input } from "@/components/ui";
import {
  getGlobalSchedulerConfig,
  listAllIngestionRuns,
  listJobSources,
  listManualRuns,
} from "@/lib/admin-ingestion-api";
import { buildSourceStatus, filterSources } from "@/lib/admin-operations";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { cn } from "@/lib/cn";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { FontesTableClient } from "./_components/fontes-table-client";
import { IngestionDashboardCards } from "./_components/ingestion-dashboard-cards";
import { VagasTabClient } from "./_components/vagas-tab-client";
import {
  cancelManualRunAction,
  runGlobalSchedulerNowAction,
  startManualAdapterRunAction,
  updateGlobalSchedulerAction,
} from "./actions";

export const metadata = buildAdminMetadata("Ingestao");

type SearchParams = Promise<{
  tab?: "fontes" | "vagas" | "runs" | "scheduler";
  message?: string;
  status?: string;
  query?: string;
  sourceStatus?: string;
  type?: string;
  sourcesPage?: string;
  vagaQuery?: string;
  vagaSource?: string;
  vagaStatus?: string;
  manualPage?: string;
  globalPage?: string;
}>;

type AdminIngestionPageProps = {
  searchParams: SearchParams;
};

function StatusBanner({
  message,
  status,
}: {
  message?: string;
  status?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {message}
    </div>
  );
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    rows: rows.slice(start, start + pageSize),
    totalPages,
  };
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-stone-900 !text-white"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

function PaginationBar({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (p: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-stone-500">
      <span>
        Pagina {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100"
            href={buildHref(page - 1)}
          >
            ← Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link
            className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100"
            href={buildHref(page + 1)}
          >
            Proxima →
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function AdminIngestionPage({
  searchParams,
}: AdminIngestionPageProps) {
  const {
    globalPage,
    manualPage,
    message,
    query,
    sourceStatus,
    sourcesPage,
    status,
    tab,
    type,
    vagaQuery,
    vagaSource,
    vagaStatus,
  } = await searchParams;

  const token = await getBackofficeSessionToken();
  const activeTab = tab ?? "fontes";

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/ingestion");
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  try {
    const [sources, manualRuns, globalRuns, schedulerConfig] =
      await Promise.all([
        listJobSources(),
        listManualRuns(),
        listAllIngestionRuns(),
        getGlobalSchedulerConfig(),
      ]);

    const sourceViews = sources.map((source) => ({
      ...source,
      status: buildSourceStatus(source),
    }));

    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    // fontes tab
    const filteredSources = filterSources(sourceViews, {
      query,
      status: sourceStatus,
      type,
    });
    const pageSize = 10;
    const pagedSources = paginate(
      filteredSources,
      Number(sourcesPage ?? "1") || 1,
      pageSize,
    );

    const availableSourceNames = [
      ...new Set(sources.map((s) => s.sourceName)),
    ].sort();

    // runs tab
    const pagedManualRuns = paginate(
      manualRuns,
      Number(manualPage ?? "1") || 1,
      pageSize,
    );
    const pagedGlobalRuns = paginate(
      globalRuns,
      Number(globalPage ?? "1") || 1,
      pageSize,
    );

    const buildTabHref = (t: string, extra?: Record<string, string>) => {
      const params = new URLSearchParams({ tab: t, ...extra });
      return `/admin/ingestion?${params}`;
    };

    return (
      <AdminPageWrap maxWidth={1400}>
        <AdminShellHeader
          actions={
            <>
              <form action={startManualAdapterRunAction} className="flex gap-2">
                <input
                  name="redirectPath"
                  type="hidden"
                  value="/admin/ingestion?tab=runs"
                />
                <select
                  className="h-9 rounded-md border px-3 text-[12.5px]"
                  style={{
                    borderColor: "rgba(10,10,10,0.08)",
                    background: "#fafaf6",
                    color: "#2a2620",
                  }}
                  defaultValue="gupy"
                  name="adapterType"
                >
                  <option value="gupy">gupy</option>
                  <option value="custom_html">custom_html</option>
                  <option value="custom_api">custom_api</option>
                </select>
                <button
                  className={buttonVariants({ variant: "outline" })}
                  type="submit"
                >
                  Rodar adapter
                </button>
              </form>
              <Link className={buttonVariants()} href="/admin/ingestion/new">
                + Cadastrar empresa e fonte
              </Link>
            </>
          }
          eyebrow="admin · ingestão"
          subtitle="Fontes configuradas, catálogo de vagas, histórico de execuções e scheduler global."
          title="Ingestão."
        />

        <StatusBanner message={message} status={status} />

        <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
          <TabLink
            active={activeTab === "fontes"}
            href={buildTabHref("fontes")}
          >
            Fontes
          </TabLink>
          <TabLink active={activeTab === "vagas"} href={buildTabHref("vagas")}>
            Vagas
          </TabLink>
          <TabLink active={activeTab === "runs"} href={buildTabHref("runs")}>
            Runs
          </TabLink>
          <TabLink
            active={activeTab === "scheduler"}
            href={buildTabHref("scheduler")}
          >
            Scheduler
          </TabLink>
        </div>

        {/* ── FONTES ── */}
        {activeTab === "fontes" && (
          <div className="flex flex-col gap-4">
            <IngestionDashboardCards />

            <Card
              className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
              padding="sm"
              variant="ghost"
            >
              <Input
                defaultValue={query}
                form="fontes-filter"
                name="query"
                placeholder="Buscar fonte ou empresa"
              />
              <select
                className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
                defaultValue={sourceStatus ?? ""}
                form="fontes-filter"
                name="sourceStatus"
              >
                <option value="">Todos os status</option>
                <option value="aguardando primeiro run">
                  aguardando primeiro run
                </option>
                <option value="falha recente">falha recente</option>
                <option value="ativa">ativa</option>
              </select>
              <select
                className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
                defaultValue={type ?? ""}
                form="fontes-filter"
                name="type"
              >
                <option value="">Todos os tipos</option>
                <option value="custom_html">custom_html</option>
                <option value="custom_api">custom_api</option>
                <option value="gupy">gupy</option>
              </select>
              <form className="contents" id="fontes-filter" method="GET">
                <input name="tab" type="hidden" value="fontes" />
                <button
                  className={buttonVariants({ variant: "outline" })}
                  type="submit"
                >
                  Filtrar
                </button>
              </form>
            </Card>

            <FontesTableClient
              initialSources={pagedSources.rows}
              page={pagedSources.page}
              totalPages={pagedSources.totalPages}
              buildHref={(p) =>
                buildTabHref("fontes", { sourcesPage: String(p) })
              }
              query={query}
              sourceStatus={sourceStatus}
              type={type}
            />
          </div>
        )}

        {/* ── VAGAS ── */}
        {activeTab === "vagas" && (
          <VagasTabClient
            availableSourceNames={availableSourceNames}
            initialVagaQuery={vagaQuery}
            initialVagaSource={vagaSource}
            initialVagaStatus={vagaStatus}
          />
        )}

        {/* ── RUNS ── */}
        {activeTab === "runs" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-stone-900">
                Execucoes em lote
              </h2>
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50 text-left">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Inicio
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Escopo
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Progresso
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Atualizado
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Acoes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pagedManualRuns.rows.length === 0 && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-stone-400"
                          colSpan={6}
                        >
                          Nenhuma execucao em lote registrada.
                        </td>
                      </tr>
                    )}
                    {pagedManualRuns.rows.map((run) => (
                      <tr className="hover:bg-stone-50" key={run.id}>
                        <td className="px-4 py-3 text-stone-600">
                          {run.startedAt
                            ? new Date(run.startedAt).toLocaleString("pt-BR")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {run.scopeType} / {run.scopeValue}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {run.succeededCount +
                            run.failedCount +
                            run.skippedCount}
                          /{run.totalSources}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {run.status}
                        </td>
                        <td className="px-4 py-3 text-stone-500">
                          {new Date(run.updatedAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className={buttonVariants({
                                size: "sm",
                                variant: "outline",
                              })}
                              href={`/admin/ingestion/manual/${run.id}`}
                            >
                              Ver logs
                            </Link>
                            {(run.status === "queued" ||
                              run.status === "running" ||
                              run.status === "cancelling") && (
                              <form action={cancelManualRunAction}>
                                <input
                                  name="batchRunId"
                                  type="hidden"
                                  value={run.id}
                                />
                                <input
                                  name="redirectPath"
                                  type="hidden"
                                  value="/admin/ingestion?tab=runs"
                                />
                                <button
                                  className={buttonVariants({
                                    size: "sm",
                                    variant: "outline",
                                  })}
                                  type="submit"
                                >
                                  Cancelar
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                buildHref={(p) =>
                  buildTabHref("runs", { manualPage: String(p) })
                }
                page={pagedManualRuns.page}
                totalPages={pagedManualRuns.totalPages}
              />
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-stone-900">
                Execucoes de fonte
              </h2>
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50 text-left">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Inicio
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Empresa
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Fonte
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Novos / Atualizados / Falhas
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Acoes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pagedGlobalRuns.rows.length === 0 && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-stone-400"
                          colSpan={6}
                        >
                          Nenhuma execucao de fonte registrada.
                        </td>
                      </tr>
                    )}
                    {pagedGlobalRuns.rows.map((run) => {
                      const runSource = sourceMap.get(run.jobSourceId);
                      return (
                        <tr className="hover:bg-stone-50" key={run.id}>
                          <td className="px-4 py-3 text-stone-500">
                            {new Date(run.startedAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {runSource?.company.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {runSource?.sourceName ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {run.status}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            {run.newCount} / {run.updatedCount} /{" "}
                            {run.failedCount}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              className={buttonVariants({
                                size: "sm",
                                variant: "outline",
                              })}
                              href={`/admin/ingestion/${run.jobSourceId}/runs/${run.id}`}
                            >
                              Auditoria
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                buildHref={(p) =>
                  buildTabHref("runs", { globalPage: String(p) })
                }
                page={pagedGlobalRuns.page}
                totalPages={pagedGlobalRuns.totalPages}
              />
            </div>
          </div>
        )}

        {/* ── SCHEDULER ── */}
        {activeTab === "scheduler" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-4" padding="lg">
              <h2 className="text-base font-semibold text-stone-900">
                Scheduler global
              </h2>
              <form
                action={updateGlobalSchedulerAction}
                className="flex flex-col gap-3"
              >
                <input
                  name="redirectPath"
                  type="hidden"
                  value="/admin/ingestion?tab=scheduler"
                />
                <label className="flex items-center gap-3">
                  <input
                    className="size-4 accent-stone-700"
                    defaultChecked={schedulerConfig.enabled}
                    name="enabled"
                    type="checkbox"
                  />
                  <span className="text-sm font-medium text-stone-700">
                    Ativar cron global
                  </span>
                </label>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-stone-500">
                    Cron expression
                  </p>
                  <Input
                    defaultValue={schedulerConfig.globalCron ?? "*/30 * * * *"}
                    name="globalCron"
                    placeholder="*/30 * * * *"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-stone-500">
                      Delay normal (ms)
                    </p>
                    <Input
                      defaultValue={String(schedulerConfig.normalDelayMs)}
                      min={1000}
                      name="normalDelayMs"
                      type="number"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-stone-500">
                      Delay de erro (ms)
                    </p>
                    <Input
                      defaultValue={String(schedulerConfig.errorDelayMs)}
                      min={1000}
                      name="errorDelayMs"
                      type="number"
                    />
                  </div>
                </div>
                <button className={buttonVariants()} type="submit">
                  Salvar scheduler
                </button>
              </form>
              <form action={runGlobalSchedulerNowAction}>
                <input
                  name="redirectPath"
                  type="hidden"
                  value="/admin/ingestion?tab=scheduler"
                />
                <button
                  className={buttonVariants({ variant: "outline" })}
                  type="submit"
                >
                  Rodar global agora
                </button>
              </form>
            </Card>

            <Card className="space-y-4 p-4" padding="lg">
              <p className="text-sm text-stone-500">
                Importação de CSV disponível na aba Fontes.
              </p>
            </Card>
          </div>
        )}
      </AdminPageWrap>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/ingestion",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }
}
