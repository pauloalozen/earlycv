import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import {
  getManualRunById,
  listManualRunItems,
} from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { cancelManualRunAction } from "../../actions";

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
            href={state.actionHref ?? "/admin/ingestion?tab=manual"}
          >
            {state.actionLabel ?? "Voltar"}
          </Link>
        </Card>
      </main>
    );
  }

  try {
    const [run, items] = await Promise.all([
      getManualRunById(batchRunId),
      listManualRunItems(batchRunId),
    ]);

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
                href="/admin/ingestion?tab=manual"
              >
                Voltar
              </Link>
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
            <div className="text-sm">Total: {run.totalSources}</div>
            <div className="text-sm">Sucesso: {run.succeededCount}</div>
            <div className="text-sm">Falha: {run.failedCount}</div>
            <div className="text-sm">Skip: {run.skippedCount}</div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Fonte</th>
                  <th className="px-4 py-3">Adapter</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Inicio</th>
                  <th className="px-4 py-3">Fim</th>
                  <th className="px-4 py-3">Erro</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr className="border-t border-stone-200" key={item.id}>
                    <td className="px-4 py-3">{item.companyName}</td>
                    <td className="px-4 py-3">{item.sourceName}</td>
                    <td className="px-4 py-3">{item.sourceType}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">
                      {item.startedAt
                        ? new Date(item.startedAt).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {item.finishedAt
                        ? new Date(item.finishedAt).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{item.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            href={state.actionHref ?? "/admin/ingestion?tab=manual"}
          >
            {state.actionLabel ?? "Voltar"}
          </Link>
        </Card>
      </main>
    );
  }
}
