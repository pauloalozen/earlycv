import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import {
  listDiscoveredCompanies,
  listJobSources,
  listJobSourcesPaginated,
} from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { cn } from "@/lib/cn";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";
import { AuditTabClient } from "./_components/audit-tab-client";
import { DiscoveryTabClient } from "./_components/discovery-tab-client";
import { EnrichmentTabContent } from "./_components/enrichment-tab-content";
import { FontesTableClient } from "./_components/fontes-table-client";
import { IngestionDashboardCards } from "./_components/ingestion-dashboard-cards";
import { JobsTabClient } from "./_components/jobs-tab-client";
import { VagasTabClient } from "./_components/vagas-tab-client";

export const metadata = buildAdminMetadata("Ingestao");

type SearchParams = Promise<{
  tab?: "fontes" | "vagas" | "jobs" | "enrichment" | "descoberta" | "audit";
  message?: string;
  status?: string;
  vagaQuery?: string;
  vagaSource?: string;
  vagaStatus?: string;
  createSourceId?: string;
  createSourceName?: string;
  discardReason?: string;
  discardSourceId?: string;
  discardTitle?: string;
  enrichPage?: string;
  enrichTab?: string;
  enrichStatus?: string;
  search?: string;
  sourceId?: string;
  sourceType?: string;
}>;

type AdminIngestionPageProps = {
  searchParams: SearchParams;
};

function StatusBanner({
  message,
  status,
}: {
  message?: string;
  status?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {message}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
  badgeCount,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  badgeCount?: number;
}) {
  return (
    <Link
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-stone-900 !text-white"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
      )}
      href={href}
    >
      {children}
      {!!badgeCount && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs font-bold",
            active
              ? "bg-white/20 text-white"
              : "bg-emerald-100 text-emerald-800",
          )}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

export default async function AdminIngestionPage({
  searchParams,
}: AdminIngestionPageProps) {
  const {
    createSourceId,
    createSourceName,
    discardReason,
    discardSourceId,
    discardTitle,
    enrichPage,
    enrichTab,
    enrichStatus,
    message,
    search,
    sourceId,
    sourceType,
    status,
    tab,
    vagaQuery,
    vagaSource,
    vagaStatus,
  } = await searchParams;

  const token = await getBackofficeSessionToken();
  // Valida o valor de tab: links antigos/externos podem apontar pra abas
  // que nao existem mais (ex: ?tab=manual, de antes da reorganizacao da
  // Sprint 3) — sem essa checagem a pagina renderiza so o cabecalho e as
  // tabs, sem nenhum bloco de conteudo.
  const VALID_TABS = [
    "fontes",
    "jobs",
    "vagas",
    "enrichment",
    "descoberta",
    "audit",
  ] as const;
  const activeTab = VALID_TABS.includes(tab as (typeof VALID_TABS)[number])
    ? (tab as (typeof VALID_TABS)[number])
    : "fontes";

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/ingestion");
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  try {
    const [sourcesResult, sourcesFirstPageResult, promotableDiscoveries] =
      await Promise.all([
        listJobSources().catch((e: unknown) => e),
        listJobSourcesPaginated({
          pageSize: 50,
          typeFilter: sourceType,
        }).catch((e: unknown) => e),
        listDiscoveredCompanies([
          "VALIDATED",
          "NO_TECH_JOBS",
          "NO_ACTIVE_JOBS",
        ]).catch(() => []),
      ]);
    const promotableDiscoveriesCount = promotableDiscoveries.length;

    const sources =
      sourcesResult instanceof Error
        ? []
        : (sourcesResult as Awaited<ReturnType<typeof listJobSources>>);
    const sourcesFirstPage =
      sourcesFirstPageResult instanceof Error
        ? null
        : (sourcesFirstPageResult as Awaited<
            ReturnType<typeof listJobSourcesPaginated>
          >);

    const sourcesError =
      sourcesResult instanceof Error ? sourcesResult.message : null;
    const sourcesPageError =
      sourcesFirstPageResult instanceof Error
        ? sourcesFirstPageResult.message
        : null;

    if (sourcesError) {
      console.error("[admin/ingestion] listJobSources falhou:", sourcesError);
    }
    if (sourcesPageError) {
      console.error(
        "[admin/ingestion] listJobSourcesPaginated falhou:",
        sourcesPageError,
      );
    }

    const availableSourceNames = [
      ...new Set(sources.map((s) => s.sourceName)),
    ].sort();

    const jobSourceOptions = sources.map((s) => ({
      id: s.id,
      label: `${s.company.name} · ${s.sourceName}`,
    }));

    const buildTabHref = (t: string, extra?: Record<string, string>) => {
      const params = new URLSearchParams({ tab: t, ...extra });
      return `/admin/ingestion?${params}`;
    };

    return (
      <AdminPageWrap maxWidth={1400}>
        <AdminShellHeader
          actions={
            <Link className={buttonVariants()} href="/admin/ingestion/new">
              + Cadastrar empresa e fonte
            </Link>
          }
          eyebrow="admin · ingestão"
          subtitle="Fontes configuradas, catálogo de vagas e jobs de ingestão/enriquecimento."
          title="Ingestão."
        />

        <StatusBanner message={message} status={status} />

        <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
          <TabLink
            active={activeTab === "fontes"}
            href={buildTabHref("fontes")}
          >
            Fontes
          </TabLink>
          <TabLink
            active={activeTab === "descoberta"}
            badgeCount={promotableDiscoveriesCount}
            href={buildTabHref("descoberta")}
          >
            Descoberta ATS
          </TabLink>
          <TabLink
            active={activeTab === "enrichment"}
            href={buildTabHref("enrichment")}
          >
            Enriquecimento de vagas
          </TabLink>
          <TabLink active={activeTab === "vagas"} href={buildTabHref("vagas")}>
            Vagas
          </TabLink>
          <TabLink active={activeTab === "jobs"} href={buildTabHref("jobs")}>
            Jobs
          </TabLink>
          <TabLink active={activeTab === "audit"} href={buildTabHref("audit")}>
            Audit de Fontes
          </TabLink>
        </div>

        {/* ── FONTES ── */}
        {activeTab === "fontes" && (
          <div className="flex flex-col gap-4">
            {sourcesError && (
              <StatusBanner
                message={`Fontes indisponíveis: ${sourcesError}`}
                status="error"
              />
            )}
            {sourcesPageError && (
              <StatusBanner
                message={`Tabela de fontes indisponível: ${sourcesPageError}`}
                status="error"
              />
            )}
            <IngestionDashboardCards />
            {sourcesFirstPage && (
              <FontesTableClient
                initialData={sourcesFirstPage}
                initialTypeFilter={sourceType}
              />
            )}
          </div>
        )}

        {/* ── VAGAS ── */}
        {activeTab === "vagas" && (
          <VagasTabClient
            availableSourceNames={availableSourceNames}
            initialVagaQuery={vagaQuery}
            initialVagaSource={vagaSource}
            initialVagaStatus={vagaStatus}
          />
        )}

        {/* ── JOBS ── */}
        {activeTab === "jobs" && (
          <JobsTabClient
            initialCreateSourceId={createSourceId}
            initialCreateSourceName={createSourceName}
            sources={jobSourceOptions}
          />
        )}

        {/* ── DESCOBERTA ── */}
        {activeTab === "descoberta" && <DiscoveryTabClient />}

        {/* ── AUDIT DE FONTES ── */}
        {activeTab === "audit" && <AuditTabClient />}

        {/* ── ENRIQUECIMENTO ── */}
        {activeTab === "enrichment" && (
          <EnrichmentTabContent
            searchParams={{
              discardReason,
              discardSourceId,
              discardTitle,
              enrichPage,
              enrichStatus,
              enrichTab,
              search,
              sourceId,
            }}
          />
        )}
      </AdminPageWrap>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/ingestion",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }
}
