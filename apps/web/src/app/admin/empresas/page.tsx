import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, EmptyState, Input } from "@/components/ui";
import {
  type CompanyStatusLabel,
  listCompaniesPaginated,
} from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminStatusBadge } from "../_components/admin-status-badge";
import { AdminTokenState } from "../_components/admin-token-state";
import { FetchLogoButton } from "./_components/fetch-logo-button";

export const metadata = buildAdminMetadata("Empresas");

const PAGE_SIZE = 20;

const COMPANY_STATUS_VALUES: CompanyStatusLabel[] = [
  "incompleta",
  "aguardando primeiro run",
  "com falha recente",
  "completa",
];

type CompaniesPageProps = {
  searchParams: Promise<{
    page?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminCompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const { page, query, status } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const statusFilter = COMPANY_STATUS_VALUES.includes(
    status as CompanyStatusLabel,
  )
    ? (status as CompanyStatusLabel)
    : undefined;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/empresas");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  // Busca, filtro de status e paginação NO SERVIDOR: a API devolve só a
  // página pedida, já com fontes contadas e status calculado.
  const companiesDataResult = await listCompaniesPaginated(
    {
      page: pageNum,
      pageSize: PAGE_SIZE,
      search: query || undefined,
      status: statusFilter,
    },
    token,
  )
    .then((data) => ({ data, kind: "ok" }) as const)
    .catch((error: unknown) => ({ kind: getAdminDataErrorKind(error) }) as const);

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

  const {
    rows: filteredCompanies,
    total,
    totalPages,
  } = companiesDataResult.data;
  const safePageNum = Math.min(pageNum, totalPages);

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
                  <div className="flex items-start gap-3">
                    {company.logoUrl ? (
                      // biome-ignore lint/performance/noImgElement: logo de domínio externo, sem otimização do next/image
                      <img
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-[9px] object-contain"
                        src={company.logoUrl}
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#0a0a0a] font-mono text-sm font-bold text-[#fafaf6]"
                      >
                        {company.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xl font-bold tracking-tight text-stone-950">
                        {company.name}
                      </p>
                      <p className="text-sm text-stone-600">
                        {company.sourcesCount} fonte(s) conectada(s)
                      </p>
                    </div>
                  </div>
                  <AdminStatusBadge status={company.status} />
                </div>

                <div className="grid gap-2 rounded-[18px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                  <p>Website: {company.websiteUrl ?? "nao informado"}</p>
                  <p>Carreiras: {company.careersUrl ?? "nao informado"}</p>
                  <p>Pais: {company.country ?? "nao informado"}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    className={buttonVariants()}
                    href={`/admin/empresas/${company.id}`}
                  >
                    Abrir detalhe
                  </Link>
                  {company.sourcesCount === 0 ? (
                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={`/admin/empresas/${company.id}`}
                    >
                      Criar primeira fonte
                    </Link>
                  ) : null}
                  <FetchLogoButton companyId={company.id} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {totalPages > 1 && total > 0 && (
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>
              Página {safePageNum} de {totalPages} · {total} empresas
            </span>
            <div className="flex gap-2">
              {safePageNum > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum - 1,
                    query,
                    status: statusFilter,
                  })}
                >
                  ← Anterior
                </Link>
              )}
              {safePageNum < totalPages && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum + 1,
                    query,
                    status: statusFilter,
                  })}
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildPageHref(params: {
  page: number;
  query?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/empresas?${qs}`;
}
