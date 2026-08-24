import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, EmptyState, Input } from "@/components/ui";
import {
  getGoogleIndexingBackfillStatus,
  type GoogleIndexingBackfillStatus,
  listJobSources,
  listJobs,
} from "@/lib/admin-ingestion-api";
import { buildSourceStatus, filterJobs } from "@/lib/admin-operations";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Vagas");

type JobsPageProps = {
  searchParams: Promise<{
    query?: string;
    sourceName?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminJobsPage({ searchParams }: JobsPageProps) {
  const { query, sourceName, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/vagas");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let jobs: Awaited<ReturnType<typeof listJobs>>;
  let sourceViews: Array<
    Awaited<ReturnType<typeof listJobSources>>[number] & {
      status: ReturnType<typeof buildSourceStatus>;
    }
  >;
  let indexingStatus: GoogleIndexingBackfillStatus | null = null;

  try {
    const [fetchedJobs, jobSources] = await Promise.all([
      listJobs(),
      listJobSources(),
    ]);
    jobs = fetchedJobs;
    sourceViews = jobSources.map((s) => ({
      ...s,
      status: buildSourceStatus(s),
    }));
    // Não bloqueia a página se o endpoint de status do Google Indexing
    // falhar — é um painel informativo, não crítico pra listagem de vagas.
    indexingStatus = await getGoogleIndexingBackfillStatus().catch(
      () => null,
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/vagas",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }
  const sourceMap = new Map(sourceViews.map((source) => [source.id, source]));
  const availableSourceNames = [
    ...new Set(sourceViews.map((source) => source.sourceName)),
  ].sort();
  const filteredJobs = filterJobs(
    jobs.map((job) => ({
      companyName:
        sourceMap.get(job.jobSourceId)?.company.name ?? job.companyId,
      id: job.id,
      locationText: job.locationText,
      sourceName: sourceMap.get(job.jobSourceId)?.sourceName ?? job.jobSourceId,
      status: job.status,
      title: job.title,
    })),
    { query, sourceName, status },
  );
  const filteredJobIds = new Set(filteredJobs.map((job) => job.id));
  const visibleJobs = jobs.filter((job) => filteredJobIds.has(job.id));

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / vagas"
          subtitle="Consulta operacional das vagas ja ingeridas no catalogo atual."
          title="Vagas"
        />

        {indexingStatus && (
          <Card
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            padding="sm"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Elegíveis
              </p>
              <p className="text-2xl font-bold text-stone-950">
                {indexingStatus.totalEligible}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Notificadas
              </p>
              <p className="text-2xl font-bold text-stone-950">
                {indexingStatus.notified}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Pendentes (passivo)
              </p>
              <p className="text-2xl font-bold text-stone-950">
                {indexingStatus.pending}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Cota diária
              </p>
              <p className="text-2xl font-bold text-stone-950">
                {indexingStatus.dailyLimit}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Dias restantes (estimado)
              </p>
              <p className="text-2xl font-bold text-stone-950">
                {indexingStatus.estimatedDaysRemaining}
              </p>
            </div>
          </Card>
        )}

        <Card
          className="grid gap-3 lg:grid-cols-[1.3fr_1fr_0.8fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="jobs-filter"
            name="query"
            placeholder="Buscar por titulo, empresa ou local"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={sourceName ?? ""}
            form="jobs-filter"
            name="sourceName"
          >
            <option value="">Todas as fontes</option>
            {availableSourceNames.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="jobs-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="removed">removed</option>
          </select>
          <form className="contents" id="jobs-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {filteredJobs.length === 0 ? (
          <EmptyState
            description="Nenhuma vaga corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4">
            {visibleJobs.map((job) => {
              const source = sourceMap.get(job.jobSourceId);

              return (
                <Card className="space-y-2" key={job.id}>
                  <h2 className="text-lg font-bold tracking-tight text-stone-950">
                    {job.title}
                  </h2>
                  <p className="text-sm text-stone-600">
                    {source?.company.name ?? job.companyId} -{" "}
                    {source?.sourceName ?? job.jobSourceId}
                  </p>
                  <p className="text-sm text-stone-600">
                    {job.locationText} - status {job.status}
                  </p>
                  <p className="font-mono text-[11px] text-stone-500">
                    {job.canonicalKey}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
