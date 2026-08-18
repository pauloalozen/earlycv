"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";

type JobRow = {
  id: string;
  title: string;
  companyId: string;
  company: { name: string };
  jobSourceId: string;
  locationText: string;
  status: string;
  canonicalKey: string;
  descriptionClean: string | null;
  slug: string | null;
  enrichment: {
    dominantArea: string | null;
    enrichmentStatus: string;
  } | null;
};

type JobsResponse = {
  jobs: JobRow[];
  total: number;
  page: number;
  pageSize: number;
};

type SourceName = string;

type Props = {
  availableSourceNames: SourceName[];
  initialVagaQuery?: string;
  initialVagaSource?: string;
  initialVagaStatus?: string;
  initialPage?: number;
};

const DOMINANT_AREAS = [
  "DATA_AI",
  "SOFTWARE_ENGINEERING",
  "CLOUD_DEVOPS",
  "CYBERSECURITY",
  "PRODUCT",
  "DESIGN_UX",
  "QA_TEST",
  "PROJECT_AGILE",
  "ARCHITECTURE",
  "LEADERSHIP",
  "GROWTH_MARKETING",
  "BUSINESS_ANALYTICS",
  "CX_DIGITAL",
  "IT_SUPPORT",
  "ERP_FUNCTIONAL",
  "OTHER",
] as const;

// Espelha PUBLIC_JOB_INTEGRITY_WHERE (apps/api/src/jobs/jobs.service.ts) —
// motivo pelo qual uma vaga "active" não aparece no /radar.
function radarExclusionReason(job: JobRow): string | null {
  if (job.status !== "active") return null;
  if (!job.enrichment) return "sem enriquecimento";
  if (job.enrichment.enrichmentStatus !== "COMPLETED")
    return `enriquecimento ${job.enrichment.enrichmentStatus.toLowerCase()}`;
  if (job.enrichment.dominantArea === "OTHER") return "área OTHER";
  if (!job.descriptionClean) return "descrição vazia";
  if (!job.slug) return "sem slug";
  return null;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function VagasTabClient({
  availableSourceNames,
  initialVagaQuery = "",
  initialVagaSource = "",
  initialVagaStatus = "",
  initialPage = 1,
}: Props) {
  const [search, setSearch] = useState(initialVagaQuery);
  const [sourceQuery, setSourceQuery] = useState(initialVagaSource);
  const [statusFilter, setStatusFilter] = useState(initialVagaStatus);
  const [dominantAreaFilter, setDominantAreaFilter] = useState("");
  const [radarVisibilityFilter, setRadarVisibilityFilter] = useState("");
  const [page, setPage] = useState(initialPage);
  const [result, setResult] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedSourceQuery = useDebounce(sourceQuery, 300);

  const fetchJobs = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: "20" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (debouncedSourceQuery)
          params.set("sourceFilter", debouncedSourceQuery);
        if (statusFilter) params.set("statusFilter", statusFilter);
        if (dominantAreaFilter)
          params.set("dominantAreaFilter", dominantAreaFilter);
        if (radarVisibilityFilter)
          params.set("radarVisibilityFilter", radarVisibilityFilter);
        const res = await fetch(`/api/admin/ingestion/jobs?${params}`);
        if (res.ok) setResult(await res.json());
      } finally {
        setLoading(false);
      }
    },
    [
      debouncedSearch,
      debouncedSourceQuery,
      statusFilter,
      dominantAreaFilter,
      radarVisibilityFilter,
    ],
  );

  useEffect(() => {
    setPage(1);
    fetchJobs(1);
  }, [fetchJobs]);

  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  const handleToggleStatus = useCallback(
    async (job: JobRow) => {
      const nextStatus = job.status === "active" ? "inactive" : "active";
      setTogglingId(job.id);
      try {
        const res = await fetch(`/api/admin/ingestion/jobs/${job.id}`, {
          body: JSON.stringify({ status: nextStatus }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        });
        if (res.ok) await fetchJobs(page);
        else window.alert("Falha ao alterar o status da vaga.");
      } finally {
        setTogglingId(null);
      }
    },
    [fetchJobs, page],
  );

  const handleReclassify = useCallback(
    async (jobId: string, dominantArea: string) => {
      setReclassifyingId(jobId);
      try {
        const res = await fetch(
          `/api/admin/ingestion/jobs/${jobId}/reclassify`,
          {
            body: JSON.stringify({ dominantArea }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
        );
        if (res.ok) await fetchJobs(page);
        else window.alert("Falha ao reclassificar a vaga.");
      } finally {
        setReclassifyingId(null);
      }
    },
    [fetchJobs, page],
  );

  const total = result?.total ?? 0;
  const pageSize = result?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
            minWidth: 220,
          }}
          placeholder="Buscar por título, empresa ou local"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
            minWidth: 220,
          }}
          list="vagas-fontes-datalist"
          placeholder="Todas as fontes (buscar por texto)"
          value={sourceQuery}
          onChange={(e) => setSourceQuery(e.target.value)}
        />
        <datalist id="vagas-fontes-datalist">
          {availableSourceNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="removed">removed</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={dominantAreaFilter}
          onChange={(e) => setDominantAreaFilter(e.target.value)}
        >
          <option value="">Todas as áreas</option>
          <option value="sem-enriquecimento">Sem enriquecimento</option>
          {DOMINANT_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={radarVisibilityFilter}
          onChange={(e) => setRadarVisibilityFilter(e.target.value)}
          title="Só se aplica a vagas com status active"
        >
          <option value="">Radar: qualquer visibilidade</option>
          <option value="visivel">Radar: visível</option>
          <option value="oculta">
            Radar: oculta (active mas fora do radar)
          </option>
        </select>
      </div>

      {/* Contador */}
      <div
        style={{
          fontSize: 12,
          color: AT.muted,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        {loading
          ? "Carregando..."
          : total === 0
            ? "Nenhuma vaga encontrada."
            : `Mostrando ${start}–${end} de ${total}`}
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Título</AdminTh>
            <AdminTh w={220}>Empresa / Fonte</AdminTh>
            <AdminTh w={160}>Localização</AdminTh>
            <AdminTh w={100}>Status</AdminTh>
            <AdminTh w={110}>Área</AdminTh>
            <AdminTh w={160}>Radar</AdminTh>
            <AdminTh w={180}>Chave</AdminTh>
            <AdminTh w={100}>Ações</AdminTh>
          </tr>
        </thead>
        <tbody>
          {!loading && (!result || result.jobs.length === 0) && (
            <tr>
              <td
                colSpan={8}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: AT.muted,
                  fontSize: 13,
                }}
              >
                Nenhuma vaga encontrada.
              </td>
            </tr>
          )}
          {result?.jobs.map((job) => {
            const exclusionReason = radarExclusionReason(job);
            return (
              <tr key={job.id}>
                <AdminTd>{job.title}</AdminTd>
                <AdminTd muted>{job.company.name}</AdminTd>
                <AdminTd muted>{job.locationText || "—"}</AdminTd>
                <AdminTd>
                  <AdminPill
                    tone={
                      job.status === "active"
                        ? "ok"
                        : job.status === "inactive"
                          ? "neutral"
                          : "danger"
                    }
                    mono
                  >
                    {job.status}
                  </AdminPill>
                </AdminTd>
                <AdminTd>
                  {job.enrichment ? (
                    <select
                      className="h-7 rounded-md border px-1 text-[11.5px]"
                      style={{
                        borderColor: AT.border,
                        background: AT.card,
                        color: AT.ink2,
                        fontFamily: '"Geist Mono", monospace',
                      }}
                      value={job.enrichment.dominantArea ?? ""}
                      disabled={reclassifyingId === job.id}
                      onChange={(e) => handleReclassify(job.id, e.target.value)}
                    >
                      {!job.enrichment.dominantArea && (
                        <option value="">—</option>
                      )}
                      {DOMINANT_AREAS.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: AT.muted }}>—</span>
                  )}
                </AdminTd>
                <AdminTd>
                  {job.status !== "active" ? (
                    "—"
                  ) : exclusionReason ? (
                    <AdminPill tone="danger" mono>
                      {exclusionReason}
                    </AdminPill>
                  ) : (
                    <AdminPill tone="ok" mono>
                      visível
                    </AdminPill>
                  )}
                </AdminTd>
                <AdminTd mono muted>
                  {job.canonicalKey}
                </AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    disabled={togglingId === job.id}
                    onClick={() => handleToggleStatus(job)}
                  >
                    {job.status === "active" ? "Inativar" : "Ativar"}
                  </button>
                </AdminTd>
              </tr>
            );
          })}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`página ${page} de ${totalPages} · ${total} vagas`}
      >
        {page > 1 && (
          <button
            type="button"
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={() => setPage((p) => p - 1)}
          >
            ← anterior
          </button>
        )}
        {page < totalPages && (
          <button
            type="button"
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={() => setPage((p) => p + 1)}
          >
            próxima →
          </button>
        )}
      </AdminPagination>
    </div>
  );
}
