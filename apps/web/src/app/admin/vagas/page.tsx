import { Card, EmptyState } from "@/components/ui";
import { getPhaseOneAdminData } from "@/lib/admin-phase-one-data";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

type JobsPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminJobsPage({ searchParams }: JobsPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="Entre com um token valido para revisar as vagas ingeridas."
          title="Token ausente"
        />
      </div>
    );
  }

  const { jobs, sourceViews } = await getPhaseOneAdminData(token);
  const sourceMap = new Map(sourceViews.map((source) => [source.id, source]));

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / vagas"
          subtitle="Consulta operacional das vagas ja ingeridas no catalogo atual."
          title="Vagas"
        />

        {jobs.length === 0 ? (
          <EmptyState
            description="Ainda nao existem vagas ingeridas para listar."
            title="Sem vagas"
          />
        ) : (
          <div className="grid gap-4">
            {jobs.map((job) => {
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
