import Link from "next/link";

import { buttonVariants, Card, Input } from "@/components/ui";
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

export const metadata = buildAdminMetadata("Ingestion");

type SearchParams = Promise<{
  globalPage?: string;
  manualPage?: string;
  message?: string;
  query?: string;
  sourcesPage?: string;
  status?: string;
  tab?: "sources" | "manual" | "global";
  type?: string;
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
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-stone-50 text-stone-900",
      )}
    >
      {message}
    </div>
  );
}

type PaginationResult<T> = {
  page: number;
  rows: T[];
  totalPages: number;
};

function paginate<T>(rows: T[], page: number, pageSize: number): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    rows: rows.slice(start, start + pageSize),
    totalPages,
  };
}

export default async function AdminIngestionPage({
  searchParams,
}: AdminIngestionPageProps) {
  const {
    globalPage,
    manualPage,
    message,
    query,
    sourcesPage,
    status,
    tab,
    type,
  } = await searchParams;
  const token = await getBackofficeSessionToken();
  const activeTab = tab ?? "sources";

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/ingestion");

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">{state.description}</p>
          <Link className={buttonVariants()} href={state.actionHref ?? "/admin/ingestion"}>
            {state.actionLabel ?? "Voltar para o painel"}
          </Link>
        </Card>
      </main>
    );
  }

  try {
    const [sources, manualRuns, globalRuns, schedulerConfig] = await Promise.all([
      listJobSources(),
      listManualRuns(),
      listAllIngestionRuns(),
      getGlobalSchedulerConfig(),
    ]);

    const sourceViews = sources.map((source) => ({
      ...source,
      status: buildSourceStatus(source),
    }));
    const filteredSources = filterSources(sourceViews, { query, status, type });

    const pageSize = 10;
    const pagedSources = paginate(filteredSources, Number(sourcesPage ?? "1") || 1, pageSize);
    const pagedManualRuns = paginate(manualRuns, Number(manualPage ?? "1") || 1, pageSize);
    const pagedGlobalRuns = paginate(globalRuns, Number(globalPage ?? "1") || 1, pageSize);

    return (
      <main className="min-h-screen bg-linear-to-b from-stone-50 via-stone-50 to-stone-100 px-6 py-10 text-stone-900 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="space-y-3">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-stone-700">
              admin / ingestion
            </p>
            <h1 className="text-4xl font-bold tracking-tight">Operacoes de ingestao</h1>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              Controle operacional com execucao manual em background, scheduler e auditoria.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/admin/ingestion/new">
              Cadastrar empresa e fonte
            </Link>
            <form action={startManualAdapterRunAction} className="flex gap-2">
              <input name="redirectPath" type="hidden" value="/admin/ingestion?tab=manual" />
              <select
                className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm"
                defaultValue="gupy"
                name="adapterType"
              >
                <option value="gupy">gupy</option>
                <option value="custom_html">custom_html</option>
                <option value="custom_api">custom_api</option>
              </select>
              <button className={buttonVariants({ variant: "outline" })} type="submit">
                Rodar adapter (background)
              </button>
            </form>
          </div>

          <StatusBanner message={message} status={status} />

          <div className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 lg:grid-cols-2">
            <form action={importCompanySourcesCsvAction} className="space-y-3 rounded-xl border border-stone-200 p-4">
              <input name="redirectPath" type="hidden" value="/admin/ingestion" />
              <p className="font-semibold text-stone-900">Importar empresas por CSV</p>
              <Input name="file" required type="file" />
              <div className="flex gap-3">
                <button className={buttonVariants({ variant: "outline" })} name="dryRun" type="submit" value="true">
                  Validar
                </button>
                <button className={buttonVariants()} name="dryRun" type="submit" value="false">
                  Importar
                </button>
              </div>
            </form>

            <div className="space-y-3 rounded-xl border border-stone-200 p-4">
              <p className="font-semibold text-stone-900">Scheduler global</p>
              <form action={updateGlobalSchedulerAction} className="grid gap-3">
                <input name="redirectPath" type="hidden" value="/admin/ingestion" />
                <label className="flex items-center gap-3">
                  <input className="size-4 accent-stone-700" defaultChecked={schedulerConfig.enabled} name="enabled" type="checkbox" />
                  <span className="text-sm font-medium text-stone-700">Ativar cron global</span>
                </label>
                <Input defaultValue={schedulerConfig.globalCron ?? "*/30 * * * *"} name="globalCron" placeholder="*/30 * * * *" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input defaultValue={String(schedulerConfig.normalDelayMs)} min={1000} name="normalDelayMs" type="number" />
                  <Input defaultValue={String(schedulerConfig.errorDelayMs)} min={1000} name="errorDelayMs" type="number" />
                </div>
                <button className={buttonVariants()} type="submit">Salvar scheduler</button>
              </form>
              <form action={runGlobalSchedulerNowAction}>
                <input name="redirectPath" type="hidden" value="/admin/ingestion" />
                <button className={buttonVariants({ variant: "outline" })} type="submit">Rodar global agora</button>
              </form>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
            <Link className={buttonVariants({ size: "sm", variant: activeTab === "sources" ? "default" : "outline" })} href="/admin/ingestion?tab=sources">Fontes</Link>
            <Link className={buttonVariants({ size: "sm", variant: activeTab === "manual" ? "default" : "outline" })} href="/admin/ingestion?tab=manual">Execucoes manuais</Link>
            <Link className={buttonVariants({ size: "sm", variant: activeTab === "global" ? "default" : "outline" })} href="/admin/ingestion?tab=global">Execucoes globais</Link>
          </div>

          {activeTab === "sources" ? (
            <>
              <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
                <Input defaultValue={query} form="sources-filter" name="query" placeholder="Buscar fonte ou empresa" />
                <select className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900" defaultValue={status ?? ""} form="sources-filter" name="status">
                  <option value="">Todos os status</option>
                  <option value="aguardando primeiro run">aguardando primeiro run</option>
                  <option value="falha recente">falha recente</option>
                  <option value="ativa">ativa</option>
                </select>
                <select className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900" defaultValue={type ?? ""} form="sources-filter" name="type">
                  <option value="">Todos os tipos</option>
                  <option value="custom_html">custom_html</option>
                  <option value="custom_api">custom_api</option>
                  <option value="gupy">gupy</option>
                </select>
                <form className="contents" id="sources-filter" method="GET">
                  <input name="tab" type="hidden" value="sources" />
                  <button className={buttonVariants({ variant: "outline" })} type="submit">Filtrar</button>
                </form>
              </div>

              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                    <tr>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Fonte</th>
                      <th className="px-4 py-3">Adapter</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Ultimo run</th>
                      <th className="px-4 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSources.rows.map((source) => {
                      const latestRun = source.ingestionRuns?.[0] ?? null;
                      const redirectPath = "/admin/ingestion?tab=sources";
                      return (
                        <tr className="border-t border-stone-200" key={source.id}>
                          <td className="px-4 py-3">{source.company.name}</td>
                          <td className="px-4 py-3">{source.sourceName}</td>
                          <td className="px-4 py-3">{source.sourceType}</td>
                          <td className="px-4 py-3">{source.status}</td>
                          <td className="px-4 py-3">{latestRun?.status ?? "nao executado"}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <form action={runJobSourceAction}>
                                <input name="jobSourceId" type="hidden" value={source.id} />
                                <input name="redirectPath" type="hidden" value={redirectPath} />
                                <RunSourceSubmitButton />
                              </form>
                              <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/ingestion/${source.id}`}>Ver detalhe</Link>
                              <form action={deleteJobSourceAction}>
                                <input name="jobSourceId" type="hidden" value={source.id} />
                                <input name="redirectPath" type="hidden" value={redirectPath} />
                                <button className={buttonVariants({ size: "sm", variant: "outline" })} type="submit">Excluir</button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {activeTab === "manual" ? (
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-4 py-3">Inicio</th>
                    <th className="px-4 py-3">Escopo</th>
                    <th className="px-4 py-3">Progresso</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Atualizado</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedManualRuns.rows.map((run) => (
                    <tr className="border-t border-stone-200" key={run.id}>
                      <td className="px-4 py-3">{run.startedAt ? new Date(run.startedAt).toLocaleString("pt-BR") : "-"}</td>
                      <td className="px-4 py-3">{run.scopeType} / {run.scopeValue}</td>
                      <td className="px-4 py-3">{run.succeededCount + run.failedCount + run.skippedCount}/{run.totalSources}</td>
                      <td className="px-4 py-3">{run.status}</td>
                      <td className="px-4 py-3">{new Date(run.updatedAt).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/ingestion/manual/${run.id}`}>
                            Ver logs
                          </Link>
                          {run.status === "queued" || run.status === "running" || run.status === "cancelling" ? (
                            <form action={cancelManualRunAction}>
                              <input name="batchRunId" type="hidden" value={run.id} />
                              <input name="redirectPath" type="hidden" value="/admin/ingestion?tab=manual" />
                              <button className={buttonVariants({ size: "sm", variant: "outline" })} type="submit">Cancelar</button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab === "global" ? (
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-4 py-3">Inicio</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Fonte</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Novos/Atualizados/Falhas</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGlobalRuns.rows.map((run) => (
                    <tr className="border-t border-stone-200" key={run.id}>
                      <td className="px-4 py-3">{new Date(run.startedAt).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">{run.companyName ?? "-"}</td>
                      <td className="px-4 py-3">{run.sourceName ?? "-"}</td>
                      <td className="px-4 py-3">{run.status}</td>
                      <td className="px-4 py-3">{run.newCount}/{run.updatedCount}/{run.failedCount}</td>
                      <td className="px-4 py-3">
                        <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/ingestion/${run.jobSourceId}/runs/${run.id}`}>
                          Ver auditoria
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </main>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/ingestion",
    );

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-3xl space-y-4" padding="lg">
          <h1 className="text-3xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">{state.description}</p>
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ variant: "outline" })} href={state.actionHref ?? "/admin/ingestion"}>
              {state.actionLabel ?? "Voltar ao login do painel"}
            </Link>
          </div>
        </Card>
      </main>
    );
  }
}
