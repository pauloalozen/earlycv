import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";
import { getJobSource, listIngestionRuns } from "@/lib/admin-ingestion-api";

import { runJobSourceAction } from "../actions";

type JobSourcePageProps = {
  params: Promise<{ jobSourceId: string }>;
  searchParams: Promise<{ message?: string; status?: string; token?: string }>;
};

export const metadata: Metadata = {
  title: "Auditoria da fonte",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function JobSourceAdminPage({
  params,
  searchParams,
}: JobSourcePageProps) {
  const { jobSourceId } = await params;
  const { message, status, token } = await searchParams;

  if (!token) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">Token ausente</h1>
          <Link className={buttonVariants()} href="/admin/ingestion">
            Voltar para o painel
          </Link>
        </Card>
      </main>
    );
  }

  const [source, runs] = await Promise.all([
    getJobSource(token, jobSourceId),
    listIngestionRuns(token, jobSourceId),
  ]);
  const redirectPath = `/admin/ingestion/${jobSourceId}?token=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
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
              <input name="token" type="hidden" value={token} />
              <button className={buttonVariants()} type="submit">
                Rodar agora
              </button>
            </form>

            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/admin/ingestion?token=${encodeURIComponent(token)}`}
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
                : "rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-900"
            }
          >
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              ultimo sucesso
            </p>
            <p className="text-sm font-medium text-stone-900">
              {source.lastSuccessAt ?? "-"}
            </p>
          </Card>
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              ultimo erro
            </p>
            <p className="text-sm font-medium text-stone-900">
              {source.lastErrorMessage ?? "sem falhas registradas"}
            </p>
          </Card>
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              frequencia alvo
            </p>
            <p className="text-sm font-medium text-stone-900">
              {source.checkIntervalMinutes} min
            </p>
          </Card>
        </div>

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
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
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
                    href={`/admin/ingestion/${source.id}/runs/${run.id}?token=${encodeURIComponent(token)}`}
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
}
