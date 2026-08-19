import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import {
  getManualRunById,
  getManualRunItemStatusCounts,
  listManualRunItems,
} from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { RefreshButton } from "../../_components/refresh-button";
import { cancelManualRunAction } from "../../actions";
import { ManualRunItemsTable } from "./_components/manual-run-items-table";

export const metadata = buildAdminMetadata("Logs manual ingestion");

type ManualRunDetailPageProps = {
  params: Promise<{ batchRunId: string }>;
};

export default async function ManualRunDetailPage({
  params,
}: ManualRunDetailPageProps) {
  const { batchRunId } = await params;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/ingestion/manual/${batchRunId}`,
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
            href={state.actionHref ?? "/admin/ingestion?tab=jobs"}
          >
            {state.actionLabel ?? "Voltar"}
          </Link>
        </Card>
      </main>
    );
  }

  try {
    const [run, items, counts] = await Promise.all([
      getManualRunById(batchRunId),
      listManualRunItems(batchRunId),
      getManualRunItemStatusCounts(batchRunId),
    ]);

    // Contadores vem do banco (groupBy, ver getManualRunItemStatusCounts) em
    // vez de recontados aqui em cima do array `items` inteiro — mesma fonte
    // da verdade (a tabela de items), so que sem precisar materializar cada
    // linha (com as relations de ingestionRun/discoveredCompany) so pra
    // somar 4 numeros.
    const totalCount = Object.values(counts.statusCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const succeededCount = counts.statusCounts.completed ?? 0;
    const failedCount = counts.statusCounts.failed ?? 0;
    const skippedCount =
      (counts.statusCounts.skipped ?? 0) + (counts.statusCounts.cancelled ?? 0);

    // Itens de runKind DISCOVERY_VALIDATE têm discoveredCompany preenchido —
    // "completed" aqui só diz que o probe rodou sem erro, não em qual status
    // o candidato ficou. Sem esse breakdown, um lote que validou 139
    // candidatos aparecia igual a um que não achou nada promovível.
    const discoveryStatusCounts = counts.discoveryStatusCounts;
    const isDiscoveryRun = Object.keys(discoveryStatusCounts).length > 0;
    const promotableCount =
      (discoveryStatusCounts.VALIDATED ?? 0) +
      (discoveryStatusCounts.NO_TECH_JOBS ?? 0) +
      (discoveryStatusCounts.NO_ACTIVE_JOBS ?? 0);
    const DISCOVERY_STATUS_LABELS: Record<string, string> = {
      IMPORTED: "Importada",
      INVALID: "Inválida",
      NO_ACTIVE_JOBS: "Sem vagas",
      NO_TECH_JOBS: "Sem vagas de tech",
      PENDING: "Pendente",
      VALIDATED: "Validada",
    };

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Execucao manual {run.id}
              </h1>
              <p className="text-sm text-stone-600">
                {run.scopeType} / {run.scopeValue} - status {run.status}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                className={buttonVariants({ variant: "outline" })}
                href="/admin/ingestion?tab=jobs"
              >
                Voltar
              </Link>
              <RefreshButton />
              {run.status === "queued" ||
              run.status === "running" ||
              run.status === "cancelling" ? (
                <form action={cancelManualRunAction}>
                  <input name="batchRunId" type="hidden" value={run.id} />
                  <input
                    name="redirectPath"
                    type="hidden"
                    value={`/admin/ingestion/manual/${run.id}`}
                  />
                  <button
                    className={buttonVariants({ variant: "outline" })}
                    type="submit"
                  >
                    Cancelar
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-4">
            <div className="text-sm">Total: {totalCount}</div>
            <div className="text-sm">Sucesso: {succeededCount}</div>
            <div className="text-sm">Falha: {failedCount}</div>
            <div className="text-sm">Skip: {skippedCount}</div>
            <div className="text-xs text-stone-500 md:col-span-4">
              Calculado a partir dos itens do lote.
            </div>
          </div>

          {isDiscoveryRun && (
            <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-900">
                Resultado da validação
              </h2>
              <div className="flex flex-wrap gap-3">
                {Object.entries(discoveryStatusCounts).map(([status, count]) => (
                  <div
                    className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    key={status}
                  >
                    {DISCOVERY_STATUS_LABELS[status] ?? status}:{" "}
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
              {promotableCount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <span>
                    {promotableCount}{" "}
                    {promotableCount === 1
                      ? "candidato pronto"
                      : "candidatos prontos"}{" "}
                    pra criar fonte.
                  </span>
                  <Link
                    className={buttonVariants({ size: "sm" })}
                    href="/admin/ingestion?tab=descoberta"
                  >
                    Ir pra fila
                  </Link>
                </div>
              )}
            </div>
          )}

          <ManualRunItemsTable items={items} />
        </div>
      </main>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      `/admin/ingestion/manual/${batchRunId}`,
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
            href={state.actionHref ?? "/admin/ingestion?tab=jobs"}
          >
            {state.actionLabel ?? "Voltar"}
          </Link>
        </Card>
      </main>
    );
  }
}
