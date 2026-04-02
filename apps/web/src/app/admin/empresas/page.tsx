import Link from "next/link";

import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { filterCompanies } from "@/lib/admin-operations";
import { getPhaseOneAdminDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";

type CompaniesPageProps = {
  searchParams: Promise<{ query?: string; status?: string; token?: string }>;
};

export default async function AdminCompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const { query, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/empresas");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const companiesDataResult = await getPhaseOneAdminDataSafely();

  if (companiesDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      companiesDataResult.kind,
      "/admin/empresas",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { companyViews } = companiesDataResult.data;
  const filteredCompanies = filterCompanies(companyViews, { query, status });

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <Link className={buttonVariants()} href={`/admin/empresas/nova`}>
              Nova empresa e fonte
            </Link>
          }
          eyebrow="admin / empresas"
          subtitle="Gerencie o catalogo de empresas e conclua o onboarding operacional quando ainda faltar fonte ou primeiro run."
          title="Empresas"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="companies-filter"
            name="query"
            placeholder="Buscar empresa"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="companies-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="incompleta">incompleta</option>
            <option value="aguardando primeiro run">
              aguardando primeiro run
            </option>
            <option value="com falha recente">com falha recente</option>
            <option value="completa">completa</option>
          </select>
          <form className="contents" id="companies-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {filteredCompanies.length === 0 ? (
          <EmptyState
            description="Nenhuma empresa corresponde aos filtros atuais. Ajuste a busca ou crie uma nova empresa com sua fonte inicial."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredCompanies.map((company) => (
              <Card className="space-y-4" key={company.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xl font-bold tracking-tight text-stone-950">
                      {company.name}
                    </p>
                    <p className="text-sm text-stone-600">
                      {company.relatedSources.length} fonte(s) conectada(s)
                    </p>
                  </div>
                  <AdminStatusBadge status={company.status} />
                </div>

                <div className="grid gap-2 rounded-[18px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                  <p>Website: {company.websiteUrl ?? "nao informado"}</p>
                  <p>Carreiras: {company.careersUrl ?? "nao informado"}</p>
                  <p>Pais: {company.country ?? "nao informado"}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants()}
                    href={`/admin/empresas/${company.id}`}
                  >
                    Abrir detalhe
                  </Link>
                  {company.relatedSources.length === 0 ? (
                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={`/admin/empresas/${company.id}`}
                    >
                      Criar primeira fonte
                    </Link>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
