import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants, Card, EmptyState } from "@/components/ui";
import {
  buildCompanyDetailData,
  getPhaseOneAdminData,
} from "@/lib/admin-phase-one-data";

import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminStatusBadge } from "../../_components/admin-status-badge";
import { AdminTokenState } from "../../_components/admin-token-state";

type CompanyDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: CompanyDetailPageProps) {
  const [{ id }, { token }] = await Promise.all([params, searchParams]);

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="Entre com um token valido para abrir o detalhe operacional da empresa."
          title="Token ausente"
        />
      </div>
    );
  }

  const { companies, sourceViews } = await getPhaseOneAdminData(token);
  const company = buildCompanyDetailData(id, companies, sourceViews);

  if (!company) {
    notFound();
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/empresas?token=${encodeURIComponent(token)}`}
              >
                Voltar para empresas
              </Link>
              <Link
                className={buttonVariants()}
                href={`/admin/ingestion/new?token=${encodeURIComponent(token)}&step=job-source&companyId=${company.id}&companyName=${encodeURIComponent(company.name)}`}
              >
                Criar primeira fonte
              </Link>
            </>
          }
          eyebrow="admin / empresas / detalhe"
          subtitle="Veja o estado operacional da empresa e continue o onboarding de captura quando necessario."
          title={company.name}
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              status
            </p>
            <div className="mt-3">
              <AdminStatusBadge status={company.status} />
            </div>
          </Card>
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              fontes
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
              {company.relatedSources.length}
            </p>
          </Card>
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              website
            </p>
            <p className="mt-2 text-sm font-medium text-stone-900">
              {company.websiteUrl ?? "nao informado"}
            </p>
          </Card>
          <Card padding="sm" variant="muted">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              carreiras
            </p>
            <p className="mt-2 text-sm font-medium text-stone-900">
              {company.careersUrl ?? "nao informado"}
            </p>
          </Card>
        </div>

        {company.relatedSources.length === 0 ? (
          <EmptyState
            description="Esta empresa foi criada, mas ainda nao recebeu nenhuma fonte de vagas. Use o CTA acima para continuar o cadastro."
            title="Empresa sem fonte vinculada"
          />
        ) : (
          <Card className="space-y-4" padding="lg">
            <h2 className="text-xl font-bold tracking-tight text-stone-950">
              Fontes vinculadas
            </h2>
            <div className="grid gap-3">
              {company.relatedSources.map((source) => (
                <Card
                  className="flex items-center justify-between gap-3"
                  key={source.id}
                  padding="sm"
                  variant="ghost"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-stone-950">
                      {source.sourceName}
                    </p>
                    <p className="text-sm text-stone-600">{source.sourceUrl}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <AdminStatusBadge status={source.status} />
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/fontes/${source.id}?token=${encodeURIComponent(token)}`}
                    >
                      Abrir fonte
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
