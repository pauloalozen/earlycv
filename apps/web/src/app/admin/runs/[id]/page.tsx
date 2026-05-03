import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";
import { getIngestionRunById, getJobSource } from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminStatusBadge } from "../../_components/admin-status-badge";
import { AdminTokenState } from "../../_components/admin-token-state";

export const metadata = buildAdminMetadata("Detalhe do run");

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminRunDetailPage({
  params,
  searchParams,
}: RunDetailPageProps) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", `/admin/runs/${id}`);

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  try {
    const run = await getIngestionRunById(id);
    const source = await getJobSource(run.jobSourceId);

    return (
      <div className="px-6 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <AdminShellHeader
            actions={
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/runs`}
              >
                Voltar para runs
              </Link>
            }
            eyebrow="admin / runs / detalhe"
            subtitle={`${source.company.name} - ${source.sourceName}`}
            title="Detalhe do run"
          />

          <div className="grid gap-4 md:grid-cols-4">
            <Card padding="sm" variant="muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                status
              </p>
              <div className="mt-3">
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
              </div>
            </Card>
            <Card padding="sm" variant="muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                novas
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                {run.newCount}
              </p>
            </Card>
            <Card padding="sm" variant="muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                atualizadas
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                {run.updatedCount}
              </p>
            </Card>
            <Card padding="sm" variant="muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                falhas
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                {run.failedCount}
              </p>
            </Card>
          </div>

          <Card className="space-y-4" padding="lg">
            <p className="text-sm text-stone-600">
              Inicio {run.startedAt} - fim {run.finishedAt ?? "em andamento"}
            </p>
            <div className="grid gap-3">
              {run.previewItems.map((item) => (
                <Card
                  className="space-y-2"
                  key={`${item.canonicalKey}:${item.action}`}
                  padding="sm"
                  variant="ghost"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-950">
                      {item.title}
                    </p>
                    <AdminStatusBadge
                      status={{
                        label: item.action,
                        tone:
                          item.action === "failed"
                            ? "danger"
                            : item.action === "skipped"
                              ? "warning"
                              : "success",
                      }}
                    />
                  </div>
                  <p className="font-mono text-[11px] text-stone-500">
                    {item.canonicalKey}
                  </p>
                  <p className="text-sm leading-6 text-stone-600">
                    {item.message}
                  </p>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      `/admin/runs/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }
}
