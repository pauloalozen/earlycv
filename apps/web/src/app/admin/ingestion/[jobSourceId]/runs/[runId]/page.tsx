import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";
import { getIngestionRun, getJobSource } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

type RunDetailPageProps = {
  params: Promise<{ jobSourceId: string; runId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const metadata: Metadata = {
  title: "Detalhe do run",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function IngestionRunDetailPage({
  params,
  searchParams,
}: RunDetailPageProps) {
  const { jobSourceId, runId } = await params;
  await searchParams;
  const token = await getBackofficeSessionToken();

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

  const [jobSource, run] = await Promise.all([
    getJobSource(jobSourceId),
    getIngestionRun(jobSourceId, runId),
  ]);

  return (
    <main className="min-h-screen bg-linear-to-b from-stone-50 to-orange-50/30 px-6 py-10 text-stone-900 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
              {jobSource.company.name}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Detalhe do run
            </h1>
            <p className="text-sm text-stone-600">{jobSource.sourceName}</p>
          </div>

          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/admin/ingestion/${jobSourceId}`}
          >
            Voltar para auditoria
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              status
            </p>
            <p className="text-sm font-medium text-stone-900">{run.status}</p>
          </Card>
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              novas
            </p>
            <p className="text-sm font-medium text-stone-900">{run.newCount}</p>
          </Card>
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              atualizadas
            </p>
            <p className="text-sm font-medium text-stone-900">
              {run.updatedCount}
            </p>
          </Card>
          <Card className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              falhas
            </p>
            <p className="text-sm font-medium text-stone-900">
              {run.failedCount}
            </p>
          </Card>
        </div>

        <Card className="space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
              janela
            </p>
            <p className="mt-2 text-sm text-stone-700">
              inicio {run.startedAt} - fim {run.finishedAt ?? "em andamento"}
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              Preview processado
            </h2>
            <div className="grid gap-3">
              {run.previewItems.map((item) => (
                <div
                  className="rounded-[18px] border border-stone-200 bg-stone-50 px-4 py-4"
                  key={`${item.canonicalKey}:${item.action}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-900">
                      {item.title}
                    </p>
                    <span className="rounded-full bg-white px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-orange-800">
                      {item.action}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-stone-500">
                    {item.canonicalKey}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {item.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
