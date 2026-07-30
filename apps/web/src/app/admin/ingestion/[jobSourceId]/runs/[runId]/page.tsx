import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import {
  getIngestionRun,
  getJobSource,
  getRunEnrichmentSummary,
} from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { enrichJobNowAction } from "./actions";

export const metadata = buildAdminMetadata("Detalhe do run de ingestion");

type RunDetailPageProps = {
  params: Promise<{ jobSourceId: string; runId: string }>;
  searchParams: Promise<{ token?: string }>;
};

const ENRICHMENT_BADGE: Record<string, { className: string; emoji: string }> = {
  COMPLETED: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    emoji: "✅",
  },
  FAILED: { className: "border-red-200 bg-red-50 text-red-700", emoji: "❌" },
  PENDING: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    emoji: "⏳",
  },
  PROCESSING: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    emoji: "⏳",
  },
  SKIPPED: {
    className: "border-stone-200 bg-stone-100 text-stone-600",
    emoji: "⊘",
  },
};

function EnrichmentBadge({ status }: { status: string }) {
  const badge = ENRICHMENT_BADGE[status];
  if (!badge) {
    return (
      <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-400">
        —
      </span>
    );
  }

  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
    >
      {badge.emoji} {status}
    </span>
  );
}

export default async function IngestionRunDetailPage({
  params,
  searchParams,
}: RunDetailPageProps) {
  const { jobSourceId, runId } = await params;
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/ingestion/${jobSourceId}/runs/${runId}`,
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
    const [jobSource, run, enrichmentSummary] = await Promise.all([
      getJobSource(jobSourceId),
      getIngestionRun(jobSourceId, runId),
      getRunEnrichmentSummary(runId).catch(() => null),
    ]);
    return (
      <main className="min-h-screen bg-linear-to-b from-stone-50 to-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
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
              <p className="text-[11px] font-medium text-stone-400">status</p>
              <p className="text-sm font-medium text-stone-900">{run.status}</p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">novas</p>
              <p className="text-sm font-medium text-stone-900">
                {run.newCount}
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                atualizadas
              </p>
              <p className="text-sm font-medium text-stone-900">
                {run.updatedCount}
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">falhas</p>
              <p className="text-sm font-medium text-stone-900">
                {run.failedCount}
              </p>
            </Card>
          </div>

          {enrichmentSummary && enrichmentSummary.total > 0 ? (
            <Card className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                enriquecimento das vagas novas desta run
              </p>
              <p className="flex flex-wrap gap-4 text-sm font-medium text-stone-900">
                <span>✅ {enrichmentSummary.completed} enriquecidas</span>
                <span>⊘ {enrichmentSummary.skipped} descartadas</span>
                <span>⏳ {enrichmentSummary.pending} pendentes</span>
                <span>❌ {enrichmentSummary.failed} falharam</span>
              </p>
            </Card>
          ) : null}

          <Card className="space-y-4">
            <div>
              <p className="text-[11px] font-medium text-stone-400">janela</p>
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
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                          {item.action}
                        </span>
                        {item.enrichment !== undefined && (
                          <EnrichmentBadge
                            status={item.enrichment?.enrichmentStatus ?? "—"}
                          />
                        )}
                      </div>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-stone-500">
                      {item.canonicalKey}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      {item.message}
                    </p>

                    {item.enrichment?.enrichmentStatus === "COMPLETED" && (
                      <p className="mt-2 text-xs text-stone-600">
                        {item.enrichment.dominantArea ?? "—"}
                        {item.enrichment.careerFingerprint.length > 0
                          ? ` — ${item.enrichment.careerFingerprint.slice(0, 2).join(", ")}`
                          : ""}
                      </p>
                    )}
                    {item.enrichment?.enrichmentStatus === "SKIPPED" && (
                      <p className="mt-2 text-xs text-stone-600">
                        {item.enrichment.semanticFilterReason ?? "—"}
                      </p>
                    )}
                    {(item.enrichment?.enrichmentStatus === "PENDING" ||
                      item.enrichment?.enrichmentStatus === "FAILED") && (
                      <form action={enrichJobNowAction} className="mt-3">
                        <input
                          name="jobEnrichmentId"
                          type="hidden"
                          value={item.enrichment.id}
                        />
                        <input
                          name="jobSourceId"
                          type="hidden"
                          value={jobSourceId}
                        />
                        <input name="runId" type="hidden" value={runId} />
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          type="submit"
                        >
                          Enriquecer
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </main>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      `/admin/ingestion/${jobSourceId}/runs/${runId}`,
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
