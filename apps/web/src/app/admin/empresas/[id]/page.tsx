import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants, Card, EmptyState } from "@/components/ui";
import {
  buildCompanyDetailData,
  getPhaseOneAdminDataSafely,
} from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { cn } from "@/lib/cn";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminStatusBadge } from "../../_components/admin-status-badge";
import { AdminTokenState } from "../../_components/admin-token-state";
import { deleteCompanyAction } from "./actions";

export const metadata = buildAdminMetadata("Detalhe da empresa");

type CompanyDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; status?: string; token?: string }>;
};

function StatusBanner({
  message,
  status,
}: {
  message?: string;
  status?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-stone-50 text-stone-900",
      )}
    >
      {message}
    </div>
  );
}

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: CompanyDetailPageProps) {
  const [{ id }, { message, status }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/empresas/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const companyDataResult = await getPhaseOneAdminDataSafely();

  if (companyDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      companyDataResult.kind,
      `/admin/empresas/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { companies, sourceViews } = companyDataResult.data;
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
                href={`/admin/empresas`}
              >
                Voltar para empresas
              </Link>
              <Link
                className={buttonVariants()}
                href={`/admin/ingestion/new?step=job-source&companyId=${company.id}&companyName=${encodeURIComponent(company.name)}`}
              >
                Criar primeira fonte
              </Link>
              <form action={deleteCompanyAction}>
                <input name="companyId" type="hidden" value={company.id} />
                <button
                  className={buttonVariants({ variant: "outline" })}
                  type="submit"
                >
                  Excluir empresa
                </button>
              </form>
            </>
          }
          eyebrow="admin / empresas / detalhe"
          subtitle="Veja o estado operacional da empresa e continue o onboarding de captura quando necessario."
          title={company.name}
        />

        <StatusBanner message={message} status={status} />

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
                      href={`/admin/fontes/${source.id}`}
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
