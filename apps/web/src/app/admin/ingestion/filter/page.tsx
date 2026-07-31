import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
import { listJobSources } from "@/lib/admin-ingestion-api";
import {
  type EnrichmentStatusValue,
  getActiveSemanticFilterConfig,
  listEnrichmentJobs,
} from "@/lib/admin-semantic-filter-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { EnrichmentJobDetailButton } from "./_components/enrichment-job-detail-button";
import { EnrichmentWorkerControls } from "./_components/enrichment-worker-controls";
import { SemanticFilterConfigForm } from "./_components/semantic-filter-config-form";
import { SemanticFilterDashboardCards } from "./_components/semantic-filter-dashboard-cards";
import {
  enrichNowFormAction,
  forceEnrichFormAction,
  saveSemanticFilterConfigVersionAction,
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
  page?: string;
  search?: string;
  sourceId?: string;
  status?: EnrichmentStatusValue;
};

export default async function AdminSemanticFilterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = sp.page ? Number.parseInt(sp.page, 10) : 1;

  const [activeConfig, jobs, sources] = await Promise.all([
    getActiveSemanticFilterConfig(),
    listEnrichmentJobs({
      page,
      pageSize: 20,
      search: sp.search,
      sourceId: sp.sourceId,
      status: sp.status,
    }),
    listJobSources(),
  ]);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      page: String(page),
      search: sp.search,
      sourceId: sp.sourceId,
      status: sp.status,
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
                <AdminPill mono tone={STATUS_PILL_TONE[row.enrichmentStatus]}>
                  {row.enrichmentStatus}
                </AdminPill>
              </AdminTd>
              <AdminTd muted>
                {row.enrichmentStatus === "COMPLETED" &&
                  (row.dominantArea ?? row.careerFingerprint.length > 0) && (
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

      <AdminPagination summary={`pagina ${jobs.page} de ${jobs.totalPages}`}>
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
    </AdminPageWrap>
  );
}
