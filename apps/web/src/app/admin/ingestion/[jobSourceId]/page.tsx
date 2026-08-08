import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import { getJobSource, listIngestionRuns } from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { JobSourceScheduleForm } from "../_components/job-source-schedule-form";
import { humanScheduleLabel } from "../_components/job-source-schedule-format";
import { RunSourceSubmitButton } from "../_components/run-source-submit-button";
import {
  runJobSourceAction,
  updateJobSourceAction,
  updateJobSourceScheduleAction,
} from "../actions";

export const metadata = buildAdminMetadata("Detalhe da ingestion");

type JobSourcePageProps = {
  params: Promise<{ jobSourceId: string }>;
  searchParams: Promise<{ message?: string; status?: string; token?: string }>;
};

export default async function JobSourceAdminPage({
  params,
  searchParams,
}: JobSourcePageProps) {
  const { jobSourceId } = await params;
  const { message, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/ingestion/${jobSourceId}`,
    );

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">
            {state.description}
          </p>
          <Link
            className={buttonVariants()}
            href={state.actionHref ?? "/admin/ingestion"}
          >
            {state.actionLabel ?? "Voltar para o painel"}
          </Link>
        </Card>
      </main>
    );
  }

  try {
    const [source, runs] = await Promise.all([
      getJobSource(jobSourceId),
      listIngestionRuns(jobSourceId),
    ]);
    const redirectPath = `/admin/ingestion/${jobSourceId}`;
    const isScheduled = Boolean(source.scheduleEnabled && source.scheduleCron);

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                {source.company.name}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                {source.sourceName}
              </h1>
              <p className="text-sm text-stone-600">{source.sourceUrl}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <form action={runJobSourceAction}>
                <input name="jobSourceId" type="hidden" value={source.id} />
                <input name="redirectPath" type="hidden" value={redirectPath} />
                <RunSourceSubmitButton />
              </form>

              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/ingestion`}
              >
                Voltar
              </Link>
            </div>
          </div>

          {message ? (
            <div
              className={
                status === "success"
                  ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
                  : "rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-900"
              }
            >
              {message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                ultimo sucesso
              </p>
              <p className="text-sm font-medium text-stone-900">
                {source.lastSuccessAt ?? "-"}
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                ultimo erro
              </p>
              <p className="text-sm font-medium text-stone-900">
                {source.lastErrorMessage ?? "sem falhas registradas"}
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                frequencia alvo
              </p>
              <p className="text-sm font-medium text-stone-900">
                {source.checkIntervalMinutes} min
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                estado do circuit breaker
              </p>
              <p className="text-sm font-medium text-stone-900">
                403 seguidos: {source.consecutive403Count ?? 0}
              </p>
              <p className="text-xs text-stone-600">
                {source.pausedUntil
                  ? `Pausado ate ${new Date(source.pausedUntil).toLocaleString("pt-BR")} (${source.pauseReason ?? "sem motivo"})`
                  : "Sem pausa ativa"}
              </p>
            </Card>
          </div>

          <Card className="space-y-4" id="editar-fonte" padding="lg">
            <h2 className="text-lg font-bold tracking-tight">Editar fonte</h2>
            <p className="text-sm text-stone-600">
              Corrija nome, tipo de adaptador, URL ou frequencia quando a fonte
              foi cadastrada com o adapter ou site errado.
            </p>

            <form
              action={updateJobSourceAction}
              className="grid gap-4 md:grid-cols-2"
            >
              <input name="jobSourceId" type="hidden" value={source.id} />
              <input name="redirectPath" type="hidden" value={redirectPath} />

              <label
                className="space-y-2 md:col-span-2"
                htmlFor="edit-source-name"
              >
                <span className="text-sm font-semibold text-stone-800">
                  Nome da fonte
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-400"
                  defaultValue={source.sourceName}
                  id="edit-source-name"
                  name="sourceName"
                  required
                />
              </label>

              <label className="space-y-2" htmlFor="edit-source-type">
                <span className="text-sm font-semibold text-stone-800">
                  Tipo de fonte
                </span>
                <select
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-400"
                  defaultValue={source.sourceType}
                  id="edit-source-type"
                  name="sourceType"
                >
                  <option value="gupy">gupy</option>
                  <option value="custom_html">custom_html</option>
                  <option value="custom_api">custom_api</option>
                  <option value="greenhouse">greenhouse</option>
                  <option value="lever">lever</option>
                  <option value="ashby">ashby</option>
                  <option value="inhire">inhire</option>
                  <option value="teamtailor">teamtailor</option>
                  <option value="solides">solides (sem adapter)</option>
                  <option value="pandape">pandape (sem adapter)</option>
                </select>
              </label>

              <label className="space-y-2" htmlFor="edit-source-interval">
                <span className="text-sm font-semibold text-stone-800">
                  Escalonamento (minutos)
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-400"
                  defaultValue={source.checkIntervalMinutes}
                  id="edit-source-interval"
                  min={1}
                  name="checkIntervalMinutes"
                  type="number"
                />
              </label>

              <label
                className="space-y-2 md:col-span-2"
                htmlFor="edit-source-url"
              >
                <span className="text-sm font-semibold text-stone-800">
                  URL da fonte
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-400"
                  defaultValue={source.sourceUrl}
                  id="edit-source-url"
                  name="sourceUrl"
                  required
                  type="url"
                />
              </label>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  className="size-4 accent-stone-700"
                  defaultChecked={source.isActive}
                  name="isActive"
                  type="checkbox"
                />
                <span className="text-sm font-medium text-stone-700">
                  Fonte ativa para o painel
                </span>
              </label>

              <div className="md:col-span-2">
                <button
                  className={buttonVariants({ size: "sm" })}
                  type="submit"
                >
                  Salvar fonte
                </button>
              </div>
            </form>
          </Card>

          <Card className="space-y-4" padding="lg">
            <h2 className="text-lg font-bold tracking-tight">Agendamento</h2>
            <div className="grid gap-3 text-sm text-stone-700 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-stone-400">Status</p>
                <p className="font-medium text-stone-900">
                  {isScheduled ? "Escalonado" : "Desligado"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-stone-400">
                  Frequência
                </p>
                <p className="font-medium text-stone-900">
                  {humanScheduleLabel(source.scheduleCron ?? null)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-stone-400">Fuso</p>
                <p className="font-medium text-stone-900">
                  {source.scheduleTimezone ?? "America/Sao_Paulo"}
                </p>
              </div>
            </div>

            <JobSourceScheduleForm
              action={updateJobSourceScheduleAction}
              initialCron={source.scheduleCron ?? null}
              initialEnabled={Boolean(source.scheduleEnabled)}
              jobSourceId={source.id}
              redirectPath={redirectPath}
            />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-stone-200 px-6 py-4">
              <h2 className="text-lg font-bold tracking-tight">
                Historico de runs
              </h2>
            </div>
            <div className="divide-y divide-stone-200">
              {runs.length === 0 ? (
                <div className="px-6 py-8 text-sm text-stone-600">
                  Nenhum run executado ainda.
                </div>
              ) : (
                runs.map((run) => (
                  <div
                    className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                    key={run.id}
                  >
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-stone-400">
                        {run.startedAt}
                      </p>
                      <p className="text-sm font-medium text-stone-900">
                        status {run.status} - novas {run.newCount} - atualizadas{" "}
                        {run.updatedCount} - falhas {run.failedCount}
                      </p>
                    </div>

                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/ingestion/${source.id}/runs/${run.id}`}
                    >
                      Ver detalhes
                    </Link>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </main>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      `/admin/ingestion/${jobSourceId}`,
    );

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">
            {state.description}
          </p>
          <Link
            className={buttonVariants()}
            href={state.actionHref ?? "/admin/ingestion"}
          >
            {state.actionLabel ?? "Voltar para o painel"}
          </Link>
        </Card>
      </main>
    );
  }
}
