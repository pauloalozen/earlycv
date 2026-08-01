import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import {
  type CrawlerDiscardFilterReason,
  getCrawlerDiscardsCount,
  listCrawlerDiscards,
} from "@/lib/admin-crawler-discards-api";
import { listJobSources } from "@/lib/admin-ingestion-api";
import {
  type EnrichmentStatusValue,
  getActiveSemanticFilterConfig,
  listEnrichmentJobs,
} from "@/lib/admin-semantic-filter-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { CrawlerDiscardsTable } from "./_components/crawler-discards-table";
import { EnrichmentJobDetailButton } from "./_components/enrichment-job-detail-button";
import { EnrichmentWorkerControls } from "./_components/enrichment-worker-controls";
import { SemanticFilterConfigForm } from "./_components/semantic-filter-config-form";
import { SemanticFilterDashboardCards } from "./_components/semantic-filter-dashboard-cards";
import {
  enrichNowFormAction,
  forceEnrichFormAction,
  saveSemanticFilterConfigVersionAction,
  whitelistCrawlerDiscardAction,
} from "./actions";

export const metadata = buildAdminMetadata("Enriquecimento de Vagas");

const fieldClassName = "h-9 rounded-md border px-3 text-[12.5px]";
const fieldStyle = {
  borderColor: "rgba(10,10,10,0.08)",
  background: "#fafaf6",
  color: "#2a2620",
};

const STATUS_OPTIONS: EnrichmentStatusValue[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "SKIPPED",
  "FAILED",
];

const STATUS_PILL_TONE: Record<
  EnrichmentStatusValue,
  "neutral" | "warn" | "ok" | "danger"
> = {
  COMPLETED: "ok",
  FAILED: "danger",
  PENDING: "neutral",
  PROCESSING: "warn",
  SKIPPED: "neutral",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SearchParams = {
  discardReason?: CrawlerDiscardFilterReason;
  discardSourceId?: string;
  discardTitle?: string;
  page?: string;
  search?: string;
  sourceId?: string;
  status?: EnrichmentStatusValue;
  tab?: "enrichment" | "discards";
};

export default async function AdminSemanticFilterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = sp.page ? Number.parseInt(sp.page, 10) : 1;
  const tab = sp.tab === "discards" ? "discards" : "enrichment";

  const [activeConfig, jobs, sources, discardsCount] = await Promise.all([
    getActiveSemanticFilterConfig(),
    listEnrichmentJobs({
      page: tab === "enrichment" ? page : 1,
      pageSize: 20,
      search: sp.search,
      sourceId: sp.sourceId,
      status: sp.status,
    }),
    listJobSources(),
    getCrawlerDiscardsCount(),
  ]);

  const discards =
    tab === "discards"
      ? await listCrawlerDiscards({
          filterReason: sp.discardReason,
          page,
          pageSize: 20,
          search: sp.discardTitle,
          sourceId: sp.discardSourceId,
        })
      : null;

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      page: String(page),
      search: sp.search,
      sourceId: sp.sourceId,
      status: sp.status,
      tab,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/ingestion/filter?${params}`;
  };

  const buildDiscardUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      discardReason: sp.discardReason,
      discardSourceId: sp.discardSourceId,
      discardTitle: sp.discardTitle,
      page: String(page),
      tab: "discards",
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/ingestion/filter?${params}`;
  };

  return (
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/ingestion"
          >
            ← Voltar pra ingestao
          </Link>
        }
        eyebrow="admin · ingestao · enriquecimento de vagas"
        subtitle="Auditoria do filtro semantico pre-LLM: config ativa, status do enriquecimento e vagas por status."
        title="Enriquecimento de Vagas."
      />

      <SemanticFilterDashboardCards
        activeStatus={sp.status}
        search={sp.search}
        sourceId={sp.sourceId}
      />

      <Link
        href={buildDiscardUrl({ page: "1" })}
        style={{
          background: AT.card,
          border: `1px solid ${tab === "discards" ? AT.ink : AT.border}`,
          borderRadius: 10,
          display: "block",
          marginBottom: 20,
          padding: "16px 18px",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            color: AT.muted2,
            fontFamily: '"Geist Mono", monospace',
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 1.1,
            textTransform: "uppercase",
          }}
        >
          Descartados no crawler
        </div>
        <div
          style={{
            color: AT.ink2,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -1.2,
            lineHeight: 1,
            marginTop: 8,
          }}
        >
          {discardsCount}
        </div>
      </Link>

      <EnrichmentWorkerControls />

      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-stone-900">
          Config ativa
        </h2>
        <SemanticFilterConfigForm
          activeConfig={
            activeConfig
              ? {
                  createdAt: activeConfig.createdAt,
                  description: activeConfig.description,
                  noiseSignals: activeConfig.noiseSignals,
                  techSignals: activeConfig.techSignals,
                  version: activeConfig.version,
                }
              : null
          }
          saveAction={saveSemanticFilterConfigVersionAction}
        />
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          className={buttonVariants({
            size: "sm",
            variant: tab === "enrichment" ? "default" : "outline",
          })}
          href={buildUrl({ tab: "enrichment" })}
        >
          Enriquecimento
        </Link>
        <Link
          className={buttonVariants({
            size: "sm",
            variant: tab === "discards" ? "default" : "outline",
          })}
          href={buildDiscardUrl({ page: "1" })}
        >
          Descartados no crawler
        </Link>
      </div>

      {tab === "enrichment" && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-stone-900">
            Vagas por status de enriquecimento
          </h2>

          <form
            action="/admin/ingestion/filter"
            className="mb-4 flex flex-wrap gap-2"
            method="GET"
          >
            <select
              className={fieldClassName}
              defaultValue={sp.status ?? ""}
              name="status"
              style={fieldStyle}
            >
              <option value="">status: todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className={fieldClassName}
              defaultValue={sp.sourceId ?? ""}
              name="sourceId"
              style={fieldStyle}
            >
              <option value="">fonte: todas</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.company.name} · {source.sourceName}
                </option>
              ))}
            </select>
            <input
              className={fieldClassName}
              defaultValue={sp.search ?? ""}
              name="search"
              placeholder="Buscar por titulo ou empresa"
              style={fieldStyle}
            />
            <button className={buttonVariants()} type="submit">
              Filtrar
            </button>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin/ingestion/filter"
            >
              Limpar
            </Link>
          </form>

          <AdminTable>
            <thead>
              <tr>
                <AdminTh>Vaga</AdminTh>
                <AdminTh w={200}>Empresa</AdminTh>
                <AdminTh w={110}>Status</AdminTh>
                <AdminTh>Detalhe</AdminTh>
                <AdminTh w={160}>Data</AdminTh>
                <AdminTh w={140} align="right">
                  Acao
                </AdminTh>
              </tr>
            </thead>
            <tbody>
              {jobs.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "#8a8580",
                      fontSize: 13,
                    }}
                  >
                    Nenhuma vaga encontrada.
                  </td>
                </tr>
              )}
              {jobs.rows.map((row) => (
                <tr key={row.id}>
                  <AdminTd>{row.jobTitle}</AdminTd>
                  <AdminTd muted>{row.companyName}</AdminTd>
                  <AdminTd>
                    <AdminPill
                      mono
                      tone={STATUS_PILL_TONE[row.enrichmentStatus]}
                    >
                      {row.enrichmentStatus}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd muted>
                    {row.enrichmentStatus === "COMPLETED" &&
                      (row.dominantArea ??
                        row.careerFingerprint.length > 0) && (
                        <span>
                          {row.dominantArea ?? "—"}
                          {row.careerFingerprint.length > 0
                            ? ` — ${row.careerFingerprint.join(", ")}`
                            : ""}
                        </span>
                      )}
                    {row.enrichmentStatus === "SKIPPED" &&
                      (row.semanticFilterReason ?? "—")}
                    {row.enrichmentStatus === "FAILED" &&
                      (row.enrichmentError ?? "—")}
                    {(row.enrichmentStatus === "PENDING" ||
                      row.enrichmentStatus === "PROCESSING") &&
                      "—"}
                  </AdminTd>
                  <AdminTd mono muted>
                    {formatDate(row.enrichedAt ?? row.createdAt)}
                  </AdminTd>
                  <AdminTd align="right">
                    <div className="flex flex-col items-end gap-1.5">
                      <a
                        className={buttonVariants({
                          size: "sm",
                          variant: "outline",
                        })}
                        href={row.sourceJobUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Ver vaga
                      </a>
                      {(row.enrichmentStatus === "PENDING" ||
                        row.enrichmentStatus === "FAILED") && (
                        <form action={enrichNowFormAction}>
                          <input
                            name="jobEnrichmentId"
                            type="hidden"
                            value={row.id}
                          />
                          <button
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                            type="submit"
                          >
                            Enriquecer agora
                          </button>
                        </form>
                      )}
                      {row.enrichmentStatus === "SKIPPED" && (
                        <form action={forceEnrichFormAction}>
                          <input
                            name="jobEnrichmentId"
                            type="hidden"
                            value={row.id}
                          />
                          <button
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                            type="submit"
                          >
                            Forçar LLM
                          </button>
                        </form>
                      )}
                      {row.enrichmentStatus === "COMPLETED" && (
                        <EnrichmentJobDetailButton jobEnrichmentId={row.id} />
                      )}
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>

          <AdminPagination
            summary={`pagina ${jobs.page} de ${jobs.totalPages}`}
          >
            {jobs.page > 1 && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={buildUrl({ page: String(jobs.page - 1) })}
              >
                ← anterior
              </Link>
            )}
            {jobs.page < jobs.totalPages && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={buildUrl({ page: String(jobs.page + 1) })}
              >
                proxima →
              </Link>
            )}
          </AdminPagination>
        </>
      )}

      {tab === "discards" && discards && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-stone-900">
            Vagas descartadas no crawler antes do detail-fetch
          </h2>

          <form
            action="/admin/ingestion/filter"
            className="mb-4 flex flex-wrap gap-2"
            method="GET"
          >
            <input name="tab" type="hidden" value="discards" />
            <select
              className={fieldClassName}
              defaultValue={sp.discardReason ?? ""}
              name="discardReason"
              style={fieldStyle}
            >
              <option value="">motivo: todos</option>
              <option value="noise_signal">noise_signal</option>
              <option value="zona_cinza">zona_cinza</option>
            </select>
            <select
              className={fieldClassName}
              defaultValue={sp.discardSourceId ?? ""}
              name="discardSourceId"
              style={fieldStyle}
            >
              <option value="">fonte: todas</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.company.name} · {source.sourceName}
                </option>
              ))}
            </select>
            <input
              className={fieldClassName}
              defaultValue={sp.discardTitle ?? ""}
              name="discardTitle"
              placeholder="Buscar por titulo"
              style={fieldStyle}
            />
            <button className={buttonVariants()} type="submit">
              Filtrar
            </button>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={buildDiscardUrl({
                discardReason: undefined,
                discardSourceId: undefined,
                discardTitle: undefined,
                page: "1",
              })}
            >
              Limpar
            </Link>
          </form>

          <CrawlerDiscardsTable
            rows={discards.rows}
            whitelistAction={whitelistCrawlerDiscardAction}
          />

          <AdminPagination
            summary={`pagina ${discards.page} de ${discards.totalPages}`}
          >
            {discards.page > 1 && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={buildDiscardUrl({ page: String(discards.page - 1) })}
              >
                ← anterior
              </Link>
            )}
            {discards.page < discards.totalPages && (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={buildDiscardUrl({ page: String(discards.page + 1) })}
              >
                proxima →
              </Link>
            )}
          </AdminPagination>
        </>
      )}
    </AdminPageWrap>
  );
}
