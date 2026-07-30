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
import {
  getActiveSemanticFilterConfig,
  listSkippedEnrichments,
} from "@/lib/admin-semantic-filter-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { EnrichmentWorkerControls } from "./_components/enrichment-worker-controls";
import { SemanticFilterConfigForm } from "./_components/semantic-filter-config-form";
import { SemanticFilterDashboardCards } from "./_components/semantic-filter-dashboard-cards";
import {
  reenrichJobFormAction,
  saveSemanticFilterConfigVersionAction,
} from "./actions";

export const metadata = buildAdminMetadata("Filtro semantico");

const fieldClassName = "h-9 rounded-md border px-3 text-[12.5px]";
const fieldStyle = {
  borderColor: "rgba(10,10,10,0.08)",
  background: "#fafaf6",
  color: "#2a2620",
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
  from?: string;
  page?: string;
  reasonKind?: "zona_cinza" | "noise_signal" | "tech_signal";
  sourceName?: string;
  to?: string;
};

export default async function AdminSemanticFilterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = sp.page ? Number.parseInt(sp.page, 10) : 1;

  const [activeConfig, skipped] = await Promise.all([
    getActiveSemanticFilterConfig(),
    listSkippedEnrichments({
      from: sp.from,
      page,
      pageSize: 20,
      reasonKind: sp.reasonKind,
      sourceName: sp.sourceName,
      to: sp.to,
    }),
  ]);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      from: sp.from,
      page: String(page),
      reasonKind: sp.reasonKind,
      sourceName: sp.sourceName,
      to: sp.to,
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
        eyebrow="admin · ingestao · filtro"
        subtitle="Auditoria do filtro semantico pre-LLM: config ativa, vagas descartadas e status do enriquecimento."
        title="Filtro semantico."
      />

      <SemanticFilterDashboardCards />

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
        Vagas descartadas (SKIPPED)
      </h2>

      <form
        action="/admin/ingestion/filter"
        className="mb-4 flex flex-wrap gap-2"
        method="GET"
      >
        <select
          className={fieldClassName}
          defaultValue={sp.reasonKind ?? ""}
          name="reasonKind"
          style={fieldStyle}
        >
          <option value="">motivo: todos</option>
          <option value="zona_cinza">zona_cinza</option>
          <option value="noise_signal">noise_signal</option>
          <option value="tech_signal">tech_signal</option>
        </select>
        <input
          className={fieldClassName}
          defaultValue={sp.sourceName ?? ""}
          name="sourceName"
          placeholder="Fonte"
          style={fieldStyle}
        />
        <input
          className={fieldClassName}
          defaultValue={sp.from ?? ""}
          name="from"
          style={fieldStyle}
          type="date"
        />
        <input
          className={fieldClassName}
          defaultValue={sp.to ?? ""}
          name="to"
          style={fieldStyle}
          type="date"
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
            <AdminTh>Titulo normalizado</AdminTh>
            <AdminTh w={180}>Fonte</AdminTh>
            <AdminTh w={200}>Motivo</AdminTh>
            <AdminTh w={160}>Primeira vez visto</AdminTh>
            <AdminTh w={140} align="right">
              Acao
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {skipped.rows.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8a8580",
                  fontSize: 13,
                }}
              >
                Nenhuma vaga descartada encontrada.
              </td>
            </tr>
          )}
          {skipped.rows.map((row) => (
            <tr key={row.id}>
              <AdminTd>{row.normalizedTitle}</AdminTd>
              <AdminTd muted>{row.sourceName}</AdminTd>
              <AdminTd>
                <AdminPill tone="neutral" mono>
                  {row.semanticFilterReason ?? "—"}
                </AdminPill>
              </AdminTd>
              <AdminTd mono muted>
                {formatDate(row.firstSeenAt)}
              </AdminTd>
              <AdminTd align="right">
                <form action={reenrichJobFormAction}>
                  <input name="jobEnrichmentId" type="hidden" value={row.id} />
                  <button
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    type="submit"
                  >
                    Enriquecer mesmo assim
                  </button>
                </form>
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`pagina ${skipped.page} de ${skipped.totalPages}`}
      >
        {skipped.page > 1 && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(skipped.page - 1) })}
          >
            ← anterior
          </Link>
        )}
        {skipped.page < skipped.totalPages && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(skipped.page + 1) })}
          >
            proxima →
          </Link>
        )}
      </AdminPagination>
    </AdminPageWrap>
  );
}
