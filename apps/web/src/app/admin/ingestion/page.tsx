import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, Input } from "@/components/ui";
import {
  getGlobalSchedulerConfig,
  listAllIngestionRuns,
  listJobSources,
  listJobs,
  listManualRuns,
} from "@/lib/admin-ingestion-api";
import {
  buildSourceStatus,
  filterJobs,
  filterSources,
} from "@/lib/admin-operations";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { cn } from "@/lib/cn";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { RunSourceSubmitButton } from "./_components/run-source-submit-button";
import {
  cancelManualRunAction,
  deleteJobSourceAction,
  importCompanySourcesCsvAction,
  runGlobalSchedulerNowAction,
  runJobSourceAction,
  startManualAdapterRunAction,
  updateGlobalSchedulerAction,
} from "./actions";

export const metadata = buildAdminMetadata("Ingestao");

type SearchParams = Promise<{
  // aba ativa
  tab?: "fontes" | "vagas" | "runs" | "scheduler";
  // banner de retorno de acao
  message?: string;
  status?: string;
  // filtros da aba fontes
  query?: string;
  sourceStatus?: string;
  type?: string;
  sourcesPage?: string;
  // filtros da aba vagas
  vagaQuery?: string;
  vagaSource?: string;
  vagaStatus?: string;
  vagasPage?: string;
  // paginacao da aba runs
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
    vagasPage,
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
    const [sources, manualRuns, globalRuns, schedulerConfig, jobs] =
      await Promise.all([
        listJobSources(),
        listManualRuns(),
        listAllIngestionRuns(),
        getGlobalSchedulerConfig(),
        listJobs(),
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

    // vagas tab
    const availableSourceNames = [
      ...new Set(sources.map((s) => s.sourceName)),
    ].sort();
    const filteredJobs = filterJobs(
      jobs.map((job) => ({
        companyName:
          sourceMap.get(job.jobSourceId)?.company.name ?? job.companyId,
        id: job.id,
        locationText: job.locationText,
        sourceName:
          sourceMap.get(job.jobSourceId)?.sourceName ?? job.jobSourceId,
        status: job.status,
        title: job.title,
      })),
      { query: vagaQuery, sourceName: vagaSource, status: vagaStatus },
    );
    const filteredJobIds = new Set(filteredJobs.map((j) => j.id));
    const visibleJobs = jobs.filter((j) => filteredJobIds.has(j.id));
    const pagedJobs = paginate(
      visibleJobs,
      Number(vagasPage ?? "1") || 1,
      pageSize,
    );

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
      <div className="px-6 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <AdminShellHeader
            actions={
              <>
                <Link className={buttonVariants()} href="/admin/ingestion/new">
                  Cadastrar empresa e fonte
                </Link>
                <form
                  action={startManualAdapterRunAction}
                  className="flex gap-2"
                >
                  <input
                    name="redirectPath"
                    type="hidden"
                    value="/admin/ingestion?tab=runs"
                  />
                  <select
                    className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900"
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
              </>
            }
            eyebrow="admin / ingestao"
            subtitle="Fontes configuradas, catalogo de vagas, historico de execucoes e scheduler global."
            title="Ingestao"
          />

          <StatusBanner message={message} status={status} />

          <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
            <TabLink
              active={activeTab === "fontes"}
              href={buildTabHref("fontes")}
            >
              Fontes
            </TabLink>
            <TabLink
              active={activeTab === "vagas"}
              href={buildTabHref("vagas")}
            >
              Vagas ({jobs.length})
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

              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50 text-left">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Empresa
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Fonte
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Adapter
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Ultimo run
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Acoes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pagedSources.rows.length === 0 && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-stone-400"
                          colSpan={6}
                        >
                          Nenhuma fonte encontrada.
                        </td>
                      </tr>
                    )}
                    {pagedSources.rows.map((source) => {
                      const latestRun = source.ingestionRuns?.[0] ?? null;
                      const redirectPath = "/admin/ingestion?tab=fontes";
                      return (
                        <tr className="hover:bg-stone-50" key={source.id}>
                          <td className="px-4 py-3 font-medium text-stone-900">
                            {source.company.name}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {source.sourceName}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            {source.sourceType}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {source.status.label}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            {latestRun?.status ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <form action={runJobSourceAction}>
                                <input
                                  name="jobSourceId"
                                  type="hidden"
                                  value={source.id}
                                />
                                <input
                                  name="redirectPath"
                                  type="hidden"
                                  value={redirectPath}
                                />
                                <RunSourceSubmitButton />
                              </form>
                              <Link
                                className={buttonVariants({
                                  size: "sm",
                                  variant: "outline",
                                })}
                                href={`/admin/ingestion/${source.id}`}
                              >
                                Detalhe
                              </Link>
                              <form action={deleteJobSourceAction}>
                                <input
                                  name="jobSourceId"
                                  type="hidden"
                                  value={source.id}
                                />
                                <input
                                  name="redirectPath"
                                  type="hidden"
                                  value={redirectPath}
                                />
                                <button
                                  className={buttonVariants({
                                    size: "sm",
                                    variant: "outline",
                                  })}
                                  type="submit"
                                >
                                  Excluir
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <PaginationBar
                buildHref={(p) =>
                  buildTabHref("fontes", { sourcesPage: String(p) })
                }
                page={pagedSources.page}
                totalPages={pagedSources.totalPages}
              />
            </div>
          )}

          {/* ── VAGAS ── */}
          {activeTab === "vagas" && (
            <div className="flex flex-col gap-4">
              <Card
                className="grid gap-3 lg:grid-cols-[1.3fr_1fr_0.8fr_auto]"
                padding="sm"
                variant="ghost"
              >
                <Input
                  defaultValue={vagaQuery}
                  form="vagas-filter"
                  name="vagaQuery"
                  placeholder="Buscar por titulo, empresa ou local"
                />
                <select
                  className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
                  defaultValue={vagaSource ?? ""}
                  form="vagas-filter"
                  name="vagaSource"
                >
                  <option value="">Todas as fontes</option>
                  {availableSourceNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
                  defaultValue={vagaStatus ?? ""}
                  form="vagas-filter"
                  name="vagaStatus"
                >
                  <option value="">Todos os status</option>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="removed">removed</option>
                </select>
                <form className="contents" id="vagas-filter" method="GET">
                  <input name="tab" type="hidden" value="vagas" />
                  <button
                    className={buttonVariants({ variant: "outline" })}
                    type="submit"
                  >
                    Filtrar
                  </button>
                </form>
              </Card>

              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50 text-left">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Titulo
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Empresa / Fonte
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Localizacao
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                        Chave
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pagedJobs.rows.length === 0 && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-stone-400"
                          colSpan={5}
                        >
                          Nenhuma vaga encontrada.
                        </td>
                      </tr>
                    )}
                    {pagedJobs.rows.map((job) => {
                      const source = sourceMap.get(job.jobSourceId);
                      return (
                        <tr className="hover:bg-stone-50" key={job.id}>
                          <td className="px-4 py-3 font-medium text-stone-900">
                            {job.title}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {source?.company.name ?? job.companyId}
                            <span className="text-stone-400"> · </span>
                            {source?.sourceName ?? job.jobSourceId}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            {job.locationText || "—"}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            {job.status}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-stone-400">
                            {job.canonicalKey}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <PaginationBar
                buildHref={(p) =>
                  buildTabHref("vagas", { vagasPage: String(p) })
                }
                page={pagedJobs.page}
                totalPages={pagedJobs.totalPages}
              />
            </div>
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
                      defaultValue={
                        schedulerConfig.globalCron ?? "*/30 * * * *"
                      }
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

              <Card className="space-y-4" padding="lg">
                <h2 className="text-base font-semibold text-stone-900">
                  Importar empresas por CSV
                </h2>
                <form
                  action={importCompanySourcesCsvAction}
                  className="flex flex-col gap-3"
                >
                  <input
                    name="redirectPath"
                    type="hidden"
                    value="/admin/ingestion?tab=scheduler"
                  />
                  <Input accept=".csv" name="file" required type="file" />
                  <div className="flex gap-3">
                    <button
                      className={buttonVariants({ variant: "outline" })}
                      name="dryRun"
                      type="submit"
                      value="true"
                    >
                      Validar (dry-run)
                    </button>
                    <button
                      className={buttonVariants()}
                      name="dryRun"
                      type="submit"
                      value="false"
                    >
                      Importar
                    </button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      </div>
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
